-- Time blocks, a reminder ladder, and tasks that become non-negotiable later.

-- ─── Tasks: duration, reminder choice, escalation time ──────────────────────
alter table public.tasks
  -- With a time, a task becomes a block [due_at, due_at + duration).
  -- Also what counts against daily capacity (30 minutes when unknown).
  add column duration_minutes integer check (duration_minutes between 1 and 1440),
  -- Which reminders to send; null = the default for its kind (see below).
  add column reminders text[] check (reminders <@ array['eve', 'morning', '30', '10']::text[]),
  -- From this moment the task is treated as non-negotiable.
  add column must_from timestamptz;

-- ─── Nudge bookkeeping ─────────────────────────────────────────────────────
alter table private.nudges drop constraint nudges_kind_check;
alter table private.nudges add constraint nudges_kind_check
  check (kind in ('nudge', 'checkin', 'brief', 'headsup', 'reminder'));

-- Escalation now resets daily (a task that turns must-do on Thursday and is
-- due Friday is escalated on both days), so the key includes the day.
drop index private.nudges_task_level;
create unique index nudges_task_kind_level_day on private.nudges (task_id, kind, level, day) where task_id is not null;

-- ─── collect_nudges, v3 ─────────────────────────────────────────────────────
-- Reminder ladder (kind 'reminder', level = which one):
--   1 'eve'     the evening before, from 20:00
--   2 'morning' the day itself, from 09:00, if it's more than 45 min away
--   3 '30'      30 minutes before
--   4 '10'      10 minutes before
-- Default: one-off tasks get all four; recurring habits only '10'.
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
  if local_time >= '22:00' or local_time < '07:00' then
    return '[]'::jsonb;
  end if;

  with open_tasks as (
    select t.*,
      (t.is_non_negotiable or (t.must_from is not null and t.must_from <= p_now)) as must,
      (t.due_at at time zone 'Africa/Lagos')::date as due_day,
      coalesce(t.reminders, case when t.series_id is not null then array['10'] else array['eve', 'morning', '30', '10'] end) as ladder
    from public.tasks t
    where t.status = 'pending'
  ),
  escalations as (
    -- Must-dos that are overdue today, or became must-do and are still ahead.
    select t.user_id, t.id as task_id, 'nudge'::text as kind,
           (coalesce(max(n.level), 0) + 1)::smallint as level
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
    select t.user_id, t.id, 'checkin'::text, 1::smallint
    from open_tasks t
    where not t.must and t.due_at <= p_now and t.due_day = today
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'checkin')
  ),
  reminders as (
    select t.user_id, t.id, 'reminder'::text, r.level
    from open_tasks t
    cross join lateral (values
      (1::smallint, 'eve',     local_time >= '20:00' and t.due_day = today + 1),
      (2::smallint, 'morning', local_time >= '09:00' and t.due_day = today and t.due_at - p_now > interval '45 minutes'),
      (3::smallint, '30',      t.due_at > p_now and t.due_at - p_now <= interval '30 minutes' and t.due_at - p_now > interval '10 minutes'),
      (4::smallint, '10',      t.due_at > p_now and t.due_at - p_now <= interval '10 minutes')
    ) as r(level, name, due_now)
    where t.due_at is not null
      and r.due_now
      and r.name = any (t.ladder)
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'reminder' and n.level = r.level)
  ),
  briefs as (
    select u.user_id, null::uuid, 'brief'::text, 1::smallint
    from (select distinct user_id from public.push_subscriptions) u
    where local_time >= '08:00'
      and not exists (select 1 from private.nudges n where n.user_id = u.user_id and n.kind = 'brief' and n.day = today)
  ),
  candidates as (
    select * from escalations
    union all select * from checkins
    union all select * from reminders
    union all select * from briefs
  ),
  recorded as (
    insert into private.nudges (user_id, task_id, kind, level, day, sent_at)
    select user_id, task_id, kind, level, today, p_now from candidates
    on conflict do nothing
    returning user_id, task_id, kind, level
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', r.kind, 'level', r.level, 'taskId', r.task_id,
      'title', t.title,
      'due', to_char(t.due_at at time zone 'Africa/Lagos', 'HH24:MI'),
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
  left join public.tasks t on t.id = r.task_id;

  return sent;
end;
$$;

revoke all on function private.collect_nudges(timestamptz) from public;
