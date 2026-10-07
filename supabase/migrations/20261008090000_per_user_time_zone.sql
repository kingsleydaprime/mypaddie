-- Each user's days run in their own time zone (settings key 'profile',
-- field timeZone; see src/features/profile/profile.ts). Until now the nudge
-- job and the morning habit rows assumed Africa/Lagos for everyone.
--
-- Every function that decided "today", "now, locally" or a local clock time
-- now does it per user. No zone saved yet = Lagos (the original default, and
-- what existing accounts already run on); an invalid one = UTC, the middle of
-- the world's zones. Either way one bad setting can never break the job.

-- ─── Helpers ────────────────────────────────────────────────────────────────
create function private.valid_tz(p_tz text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_tz is null or p_tz = '' then
    return 'Africa/Lagos';
  end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end;
$$;

-- One row per user: their zone, local clock and local date at p_now, and their schedule.
create function private.user_clock(p_now timestamptz)
returns table (
  user_id uuid, tz text, local_time time, today date,
  quiet_start time, quiet_end time, brief_at time, evening_at time, morning_at time,
  close_days integer, fun_at time, fun_every_days integer
)
language sql
stable
set search_path = ''
as $$
  select u.id,
    z.tz,
    (p_now at time zone z.tz)::time,
    (p_now at time zone z.tz)::date,
    private.setting_time(s.value, 'quietStart', '22:00'),
    private.setting_time(s.value, 'quietEnd', '07:00'),
    private.setting_time(s.value, 'briefAt', '08:00'),
    private.setting_time(s.value, 'eveningAt', '20:00'),
    private.setting_time(s.value, 'morningAt', '09:00'),
    private.setting_int(s.value, 'eventCloseDays', 7),
    private.setting_time(s.value, 'funAt', '17:00'),
    private.setting_int(s.value, 'funEveryDays', 7)
  from auth.users u
  left join public.settings s on s.user_id = u.id and s.key = 'schedule'
  left join public.settings p on p.user_id = u.id and p.key = 'profile'
  cross join lateral (select private.valid_tz(p.value->>'timeZone') as tz) z
$$;

-- The next occurrence of an event, in a given zone (yearly ones repeat on their local date).
create function private.event_occurrence(p_starts timestamptz, p_yearly boolean, p_today date, p_tz text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  local_start timestamp := p_starts at time zone p_tz;
  d date := local_start::date;
  y integer := extract(year from p_today)::integer;
  occ date;
begin
  if not p_yearly or d >= p_today then
    return p_starts;
  end if;
  for attempt in 0..1 loop
    begin
      occ := make_date(y + attempt, extract(month from d)::integer, extract(day from d)::integer);
    exception when datetime_field_overflow then
      occ := make_date(y + attempt, 2, 28);
    end;
    if occ >= p_today then
      return (occ + local_start::time) at time zone p_tz;
    end if;
  end loop;
  return null;
end;
$$;

-- The three-argument version stays (Lagos), for anything still calling it.
create or replace function private.event_occurrence(p_starts timestamptz, p_yearly boolean, p_today date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select private.event_occurrence(p_starts, p_yearly, p_today, 'Africa/Lagos') $$;

-- ─── collect_nudges, v6: per-user zone ──────────────────────────────────────
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

-- ─── Applications ───────────────────────────────────────────────────────────
create or replace function private.collect_application_nudges(p_now timestamptz default now())
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
  apps as (
    select a.*, sc.today, sc.tz, sc.local_time, sc.morning_at, sc.quiet_start, sc.quiet_end,
      ((a.deadline_at at time zone sc.tz)::date - a.target_days_before) as target_day
    from public.applications a
    join sched sc on sc.user_id = a.user_id
  ),
  candidates as (
    select a.user_id, a.id as application_id, r.level::smallint as level, a.today,
           case when r.level = 6 then a.today else coalesce(a.target_day, a.today) end as occurs_on
    from apps a
    cross join lateral (values
      (1, a.status in ('researching', 'preparing') and a.target_day - a.today = 14),
      (2, a.status in ('researching', 'preparing') and a.target_day - a.today = 7),
      (3, a.status in ('researching', 'preparing') and a.target_day - a.today = 3),
      (4, a.status in ('researching', 'preparing') and a.target_day - a.today = 1),
      (5, a.status in ('researching', 'preparing') and a.target_day = a.today),
      (6, a.status in ('researching', 'preparing') and a.deadline_at is null and extract(isodow from a.today) = 1),
      (7, a.status in ('submitted', 'interview') and a.results_expected = a.today)
    ) as r(level, due_now)
    where r.due_now
      and a.local_time >= a.morning_at
      and not private.is_quiet(a.local_time, a.quiet_start, a.quiet_end)
      and not exists (
        select 1 from private.nudges n
        where n.application_id = a.id and n.level = r.level
          and n.occurs_on = case when r.level = 6 then a.today else coalesce(a.target_day, a.today) end
      )
  ),
  recorded as (
    insert into private.nudges (user_id, application_id, kind, level, day, occurs_on, sent_at)
    select user_id, application_id, 'application', level, today, occurs_on, p_now from candidates
    on conflict do nothing
    returning user_id, application_id, level, day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'application', 'level', r.level, 'applicationId', r.application_id,
      'title', a.title,
      'days', case when a.deadline_at is not null then ((a.deadline_at at time zone sc.tz)::date - a.target_days_before) - r.day end,
      -- The real deadline, in their time.
      'due', case when a.deadline_at is not null then to_char(a.deadline_at at time zone sc.tz, 'Dy DD Mon HH24:MI') end,
      'items', (select coalesce(jsonb_agg(q.title order by q.position), '[]'::jsonb)
                from public.application_requirements q where q.application_id = a.id and not q.done)
    )), '[]'::jsonb)
  into sent
  from recorded r
  join sched sc on sc.user_id = r.user_id
  join public.applications a on a.id = r.application_id
  join public.push_subscriptions s on s.user_id = r.user_id;

  return sent;
end;
$$;

-- ─── Fun ────────────────────────────────────────────────────────────────────
create or replace function private.collect_fun_nudges(p_now timestamptz default now())
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
  fun as (
    select f.user_id,
      (coalesce(max(f.last_done_at), min(f.created_at)) at time zone min(sc.tz))::date as since
    from public.fun_activities f
    join sched sc on sc.user_id = f.user_id
    group by f.user_id
    having bool_or(f.active)
  ),
  candidates as (
    select f.user_id, sc.today, sc.today - f.since as days
    from fun f
    join sched sc on sc.user_id = f.user_id
    where sc.fun_every_days > 0
      and sc.today - f.since >= sc.fun_every_days
      and sc.local_time >= sc.fun_at
      and not private.is_quiet(sc.local_time, sc.quiet_start, sc.quiet_end)
      and not exists (
        select 1 from private.nudges n
        where n.user_id = f.user_id and n.kind = 'fun' and n.day > sc.today - 3
      )
  ),
  recorded as (
    insert into private.nudges (user_id, kind, level, day, occurs_on, sent_at)
    select user_id, 'fun', 1, today, today, p_now from candidates
    on conflict do nothing
    returning user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'fun', 'level', 1, 'title', null,
      'days', c.days,
      'items', (select coalesce(jsonb_agg(x.title), '[]'::jsonb) from (
                 select a.title from public.fun_activities a
                 where a.user_id = r.user_id and a.active
                 order by a.last_done_at asc nulls first, a.cost asc, a.title
                 limit 3) x)
    )), '[]'::jsonb)
  into sent
  from recorded r
  join candidates c on c.user_id = r.user_id
  join public.push_subscriptions s on s.user_id = r.user_id;

  return sent;
end;
$$;

-- ─── Today's habit rows, on each user's own today ───────────────────────────
create or replace function private.spawn_today(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  spawned integer := 0;
begin
  for s in
    select distinct on (t.series_id) t.series_id, t.occurs_on, t.due_at, t.recurrence, sc.tz, sc.today
    from public.tasks t
    join private.user_clock(p_now) sc on sc.user_id = t.user_id
    where t.series_id is not null
    order by t.series_id, t.occurs_on desc
  loop
    if s.occurs_on < s.today and private.recurs_on(s.recurrence, s.today) then
      if public.spawn_occurrence(
        s.series_id,
        s.today,
        case when s.due_at is null then null
             else (s.today + (s.due_at at time zone s.tz)::time) at time zone s.tz end
      ) is not null then
        spawned := spawned + 1;
      end if;
    end if;
  end loop;
  return spawned;
end;
$$;

revoke all on function private.valid_tz(text) from public;
revoke all on function private.user_clock(timestamptz) from public;
revoke all on function private.event_occurrence(timestamptz, boolean, date, text) from public;
revoke all on function private.event_occurrence(timestamptz, boolean, date) from public;
revoke all on function private.collect_nudges(timestamptz) from public;
revoke all on function private.collect_application_nudges(timestamptz) from public;
revoke all on function private.collect_fun_nudges(timestamptz) from public;
revoke all on function private.spawn_today(timestamptz) from public;
