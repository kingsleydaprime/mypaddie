-- Custom reminder messages: a note on a task or event becomes the body of its
-- notifications ("Bring the signed form"). The title still says when.
alter table public.tasks add column reminder_note text check (length(reminder_note) <= 200);
alter table public.events add column reminder_note text check (length(reminder_note) <= 200);

-- collect_nudges, v6: identical to v5 except the payload carries `note`.
create or replace function private.collect_nudges(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_time time := (p_now at time zone 'Africa/Lagos')::time;
  today date := (p_now at time zone 'Africa/Lagos')::date;
  sent jsonb;
begin
  with sched as (
    select u.id as user_id,
      private.setting_time(s.value, 'quietStart', '22:00') as quiet_start,
      private.setting_time(s.value, 'quietEnd', '07:00') as quiet_end,
      private.setting_time(s.value, 'briefAt', '08:00') as brief_at,
      private.setting_time(s.value, 'eveningAt', '20:00') as evening_at,
      private.setting_time(s.value, 'morningAt', '09:00') as morning_at,
      private.setting_int(s.value, 'eventCloseDays', 7) as close_days
    from auth.users u
    left join public.settings s on s.user_id = u.id and s.key = 'schedule'
  ),
  open_tasks as (
    select t.*,
      (t.is_non_negotiable or (t.must_from is not null and t.must_from <= p_now)) as must,
      (t.due_at at time zone 'Africa/Lagos')::date as due_day,
      coalesce(t.reminders, case when t.series_id is not null then array['10'] else array['eve', 'morning', '30', '10'] end) as ladder
    from public.tasks t
    where t.status = 'pending'
  ),
  escalations as (
    select t.user_id, t.id as task_id, null::uuid as event_id, 'nudge'::text as kind,
           (coalesce(max(n.level), 0) + 1)::smallint as level, null::date as occurs_on
    from open_tasks t
    left join private.nudges n on n.task_id = t.id and n.kind = 'nudge' and n.day = today
    where t.must
      and ((t.due_at <= p_now and t.due_day = today)
           or (t.must_from <= p_now and (t.due_at is null or t.due_day >= today)))
    group by t.user_id, t.id
    having coalesce(max(n.level), 0) < 4
       and (max(n.sent_at) is null or max(n.sent_at) <= p_now - interval '60 minutes')
  ),
  checkins as (
    select t.user_id, t.id, null::uuid, 'checkin'::text, 1::smallint, null::date
    from open_tasks t
    where not t.must and t.due_at <= p_now and t.due_day = today
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'checkin')
  ),
  reminders as (
    select t.user_id, t.id, null::uuid, 'reminder'::text, r.level, null::date
    from open_tasks t
    join sched sc on sc.user_id = t.user_id
    cross join lateral (values
      (1::smallint, 'eve',     local_time >= sc.evening_at and t.due_day = today + 1),
      (2::smallint, 'morning', local_time >= sc.morning_at and t.due_day = today and t.due_at - p_now > interval '45 minutes'),
      (3::smallint, '30',      t.due_at > p_now and t.due_at - p_now <= interval '30 minutes' and t.due_at - p_now > interval '10 minutes'),
      (4::smallint, '10',      t.due_at > p_now and t.due_at - p_now <= interval '10 minutes')
    ) as r(level, name, due_now)
    where t.due_at is not null
      and r.due_now
      and r.name = any (t.ladder)
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'reminder' and n.level = r.level)
  ),
  event_days as (
    select e.*, o.occ_at, (o.occ_at at time zone 'Africa/Lagos')::date as occ_day
    from public.events e
    cross join lateral (select private.event_occurrence(e.starts_at, e.yearly, today) as occ_at) o
    where e.status = 'upcoming'
  ),
  event_reminders as (
    select e.user_id, null::uuid, e.id, 'event'::text, r.level, e.occ_day
    from event_days e
    join sched sc on sc.user_id = e.user_id
    cross join lateral (values
      (1::smallint, e.important and local_time >= sc.morning_at and e.occ_day - today between 2 and sc.close_days),
      (2::smallint, local_time >= sc.evening_at and e.occ_day = today + 1),
      (3::smallint, (e.important or e.yearly) and local_time >= sc.morning_at and e.occ_day = today
                    and (e.all_day or e.occ_at - p_now > interval '45 minutes')),
      (4::smallint, not e.all_day and e.occ_at > p_now and e.occ_at - p_now <= interval '30 minutes')
    ) as r(level, due_now)
    where r.due_now
      and not exists (select 1 from private.nudges n where n.event_id = e.id and n.level = r.level and n.occurs_on = e.occ_day)
  ),
  briefs as (
    select u.user_id, null::uuid, null::uuid, 'brief'::text, 1::smallint, null::date
    from (select distinct user_id from public.push_subscriptions) u
    join sched sc on sc.user_id = u.user_id
    where local_time >= sc.brief_at
      and not exists (select 1 from private.nudges n where n.user_id = u.user_id and n.kind = 'brief' and n.day = today)
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
    -- Each user's own quiet hours: nothing is recorded, so it sends when they end.
    where not private.is_quiet(local_time, sc.quiet_start, sc.quiet_end)
  ),
  recorded as (
    insert into private.nudges (user_id, task_id, event_id, kind, level, day, occurs_on, sent_at)
    select user_id, task_id, event_id, kind, level, today, occurs_on, p_now from candidates
    on conflict do nothing
    returning user_id, task_id, event_id, kind, level, occurs_on
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', r.kind, 'level', r.level, 'taskId', r.task_id, 'eventId', r.event_id,
      'title', coalesce(t.title, ev.title),
      'due', case
        when t.id is not null then to_char(t.due_at at time zone 'Africa/Lagos', 'HH24:MI')
        when ev.id is not null and not ev.all_day then
          to_char(private.event_occurrence(ev.starts_at, ev.yearly, today) at time zone 'Africa/Lagos', 'HH24:MI')
      end,
      -- His own words for this one, if he gave any.
      'note', coalesce(t.reminder_note, ev.reminder_note),
      'eventKind', ev.kind,
      'person', ev.person,
      'days', case when r.occurs_on is not null then r.occurs_on - today end,
      'items', case when r.kind = 'brief' then (
        select coalesce(jsonb_agg(x.title), '[]'::jsonb) from (
          select title from public.tasks
          where user_id = r.user_id and status = 'pending'
            and (due_at is null or (due_at at time zone 'Africa/Lagos')::date = today)
          order by (is_non_negotiable or coalesce(must_from <= p_now, false)) desc, due_at nulls last
          limit 3
        ) x) end
    )), '[]'::jsonb)
  into sent
  from recorded r
  join public.push_subscriptions s on s.user_id = r.user_id
  left join public.tasks t on t.id = r.task_id
  left join public.events ev on ev.id = r.event_id;

  return sent;
end;
$$;

revoke all on function private.collect_nudges(timestamptz) from public;
