-- When any-time must-dos start escalating is their setting (schedule
-- `anyTimeNudgeFrom`), not a fixed 15:00 — still 15:00 if they never set it.
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
    select c.*, private.setting_time(st.value, 'anyTimeNudgeFrom', '15:00') as any_time_from
    from private.user_clock(p_now) c
    left join public.settings st on st.user_id = c.user_id and st.key = 'schedule'
  ),
  open_tasks as (
    select t.*, sc.today, sc.local_time, sc.any_time_from,
      (t.is_non_negotiable or (t.must_from is not null and t.must_from <= p_now)) as must,
      (t.due_at at time zone sc.tz)::date as due_day,
      -- The day of an any-time task: no time on a habit's day, or the 23:59 marker.
      case when t.due_at is null then t.occurs_on
           when to_char(t.due_at at time zone sc.tz, 'HH24:MI') = '23:59' then (t.due_at at time zone sc.tz)::date
      end as any_time_day,
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
           or (t.must_from <= p_now and (t.due_at is null or t.due_day >= t.today))
           -- Any time today: from their "nudge any-time must-dos from" time.
           or (t.any_time_day = t.today and t.local_time >= t.any_time_from))
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
          order by (is_non_negotiable or coalesce(must_from <= p_now, false)) desc,
                   case priority when 'high' then 0 when 'normal' then 1 else 2 end,
                   due_at nulls last
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
