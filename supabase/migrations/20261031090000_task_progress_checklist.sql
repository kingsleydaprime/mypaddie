-- Tasks can be in progress and can carry a checklist.
--
-- In progress is a start time, not a new status: every capacity, reminder and
-- overdue rule already reads "pending", and a started task is still pending.
-- Starting one quiets its own reminders (other must-dos still nudge); done_at
-- minus started_at is how long it really took.
--
-- A checklist is the steps inside one task: [{ "text": "...", "done": false }].
-- XP stays on the task as a whole. A habit's new day starts with every step unticked.

alter table public.tasks
  add column started_at timestamptz,
  add column checklist jsonb check (
    checklist is null or (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) between 1 and 30)
  );

-- A habit's new day copies the checklist with every step unticked, and is never started.
create or replace function public.spawn_occurrence(p_series_id uuid, p_occurs_on date, p_due_at timestamptz)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  template public.tasks%rowtype;
  new_id uuid;
begin
  select * into template from public.tasks where series_id = p_series_id order by occurs_on desc limit 1;
  if not found then
    return null;
  end if;
  insert into public.tasks (
    user_id, item_id, title, base_xp, due_at, recurrence, is_non_negotiable,
    series_id, occurs_on, duration_minutes, reminders, skill_id, reminder_note,
    fun_activity_id, topic, commitment_id, course_id, location, routine_id, routine_step, is_class, details,
    is_self_care, checklist
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on,
    template.duration_minutes, template.reminders, template.skill_id, template.reminder_note,
    template.fun_activity_id, template.topic, template.commitment_id, template.course_id, template.location,
    template.routine_id, template.routine_step, template.is_class, template.details,
    template.is_self_care,
    (select jsonb_agg(jsonb_set(step, '{done}', 'false'::jsonb) order by n) from jsonb_array_elements(template.checklist) with ordinality as s(step, n))
  )
  on conflict (series_id, occurs_on) do nothing
  returning id into new_id;
  if new_id is not null then
    insert into public.task_pillars (task_id, user_id, pillar, weight)
      select new_id, user_id, pillar, weight from public.task_pillars where task_id = template.id;
  end if;
  return new_id;
end;
$$;

-- Reminders skip a task while it's in progress: you're already doing it.
create or replace function private.collect_nudges(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent jsonb;
begin
  with sched as (
    select * from private.user_clock(p_now)
  ),
  open_tasks as (
    select t.*, sc.today, sc.local_time,
      (t.is_non_negotiable or (t.must_from is not null and t.must_from <= p_now)) as must,
      (t.due_at at time zone sc.tz)::date as due_day,
      coalesce(t.reminders, case when t.series_id is not null then array['10'] else array['eve', 'morning', '30', '10'] end) as ladder
    from public.tasks t
    join sched sc on sc.user_id = t.user_id
    where t.status = 'pending'
      and t.started_at is null
  ),
  escalations as (
    select t.user_id, t.id as task_id, null::uuid as event_id, 'nudge'::text as kind,
           (coalesce(max(n.level), 0) + 1)::smallint as level, null::date as occurs_on, t.today as day
    from open_tasks t
    left join private.nudges n on n.task_id = t.id and n.kind = 'nudge' and n.day = t.today
    where t.must
      and ((t.due_at <= p_now and t.due_day = t.today)
           or (t.must_from <= p_now and (t.due_at is null or t.due_day >= t.today)))
    group by t.user_id, t.id, t.today
    having coalesce(max(n.level), 0) < 4
       and (max(n.sent_at) is null or max(n.sent_at) <= p_now - interval '60 minutes')
  ),
  checkins as (
    select t.user_id, t.id, null::uuid, 'checkin'::text, 1::smallint, null::date, t.today
    from open_tasks t
    where not t.must and t.due_at <= p_now and t.due_day = t.today
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'checkin')
  ),
  reminders as (
    select t.user_id, t.id, null::uuid, 'reminder'::text, r.level, null::date, t.today
    from open_tasks t
    join sched sc on sc.user_id = t.user_id
    cross join lateral (values
      (1::smallint, 'eve',     sc.local_time >= sc.evening_at and t.due_day = sc.today + 1),
      (2::smallint, 'morning', sc.local_time >= sc.morning_at and t.due_day = sc.today and t.due_at - p_now > interval '45 minutes'),
      (3::smallint, '30',      t.due_at > p_now and t.due_at - p_now <= interval '30 minutes' and t.due_at - p_now > interval '10 minutes'),
      (4::smallint, '10',      t.due_at > p_now and t.due_at - p_now <= interval '10 minutes')
    ) as r(level, name, due_now)
    where t.due_at is not null
      and r.due_now
      and r.name = any (t.ladder)
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'reminder' and n.level = r.level)
  ),
  event_days as (
    select e.*, sc.today, sc.local_time, sc.morning_at, sc.evening_at, sc.close_days, o.occ_at, (o.occ_at at time zone sc.tz)::date as occ_day
    from public.events e
    join sched sc on sc.user_id = e.user_id
    cross join lateral (select private.event_occurrence(e.starts_at, e.yearly, sc.today, sc.tz) as occ_at) o
    where e.status = 'upcoming'
  ),
  event_reminders as (
    select e.user_id, null::uuid, e.id, 'event'::text, r.level, e.occ_day, e.today
    from event_days e
    cross join lateral (values
      (1::smallint, e.important and e.local_time >= e.morning_at and e.occ_day - e.today between 2 and e.close_days),
      (2::smallint, e.local_time >= e.evening_at and e.occ_day = e.today + 1),
      (3::smallint, (e.important or e.yearly) and e.local_time >= e.morning_at and e.occ_day = e.today
                    and (e.all_day or e.occ_at - p_now > interval '45 minutes')),
      (4::smallint, not e.all_day and e.occ_at > p_now and e.occ_at - p_now <= interval '30 minutes')
    ) as r(level, due_now)
    where r.due_now
      and not exists (select 1 from private.nudges n where n.event_id = e.id and n.level = r.level and n.occurs_on = e.occ_day)
  ),
  briefs as (
    select u.user_id, null::uuid, null::uuid, 'brief'::text, 1::smallint, null::date, sc.today
    from (select distinct user_id from public.push_subscriptions) u
    join sched sc on sc.user_id = u.user_id
    where sc.local_time >= sc.brief_at
      and not exists (select 1 from private.nudges n where n.user_id = u.user_id and n.kind = 'brief' and n.day = sc.today)
  ),
  candidates as (
    select c.* from (
      select * from escalations
      union all select * from checkins
      union all select * from reminders
      union all select * from event_reminders
      union all select * from briefs
    ) c
    join sched sc on sc.user_id = c.user_id
    -- Each user's own quiet hours, on their own clock.
    where not private.is_quiet(sc.local_time, sc.quiet_start, sc.quiet_end)
  ),
  recorded as (
    insert into private.nudges (user_id, task_id, event_id, kind, level, day, occurs_on, sent_at)
    select user_id, task_id, event_id, kind, level, day, occurs_on, p_now from candidates
    on conflict do nothing
    returning user_id, task_id, event_id, kind, level, occurs_on, day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', r.kind, 'level', r.level, 'taskId', r.task_id, 'eventId', r.event_id,
      'title', coalesce(t.title, ev.title),
      'due', case
        when t.id is not null then to_char(t.due_at at time zone sc.tz, 'HH24:MI')
        when ev.id is not null and not ev.all_day then
          to_char(private.event_occurrence(ev.starts_at, ev.yearly, r.day, sc.tz) at time zone sc.tz, 'HH24:MI')
      end,
      'note', coalesce(t.reminder_note, ev.reminder_note),
      'eventKind', ev.kind,
      'person', ev.person,
      'days', case when r.occurs_on is not null then r.occurs_on - r.day end,
      'items', case when r.kind = 'brief' then (
        select coalesce(jsonb_agg(x.title), '[]'::jsonb) from (
          select title from public.tasks
          where user_id = r.user_id and status = 'pending'
            and (due_at is null or (due_at at time zone sc.tz)::date = r.day)
          order by (is_non_negotiable or coalesce(must_from <= p_now, false)) desc, due_at nulls last
          limit 3
        ) x) end
    )), '[]'::jsonb)
  into sent
  from recorded r
  join sched sc on sc.user_id = r.user_id
  join public.push_subscriptions s on s.user_id = r.user_id
  left join public.tasks t on t.id = r.task_id
  left join public.events ev on ev.id = r.event_id;

  return sent;
end;
$$;
revoke all on function private.collect_nudges(timestamptz) from public;
