-- 1. Run every minute instead of every 10, so nudges land at the due time.
-- 2. Heads-ups: one "coming up" notification 15 minutes before any timed task.
-- Each rule now only counts nudges of its own kind — otherwise a heads-up
-- would suppress the later check-in and restart the escalation clock.

alter table private.nudges drop constraint nudges_kind_check;
alter table private.nudges add constraint nudges_kind_check check (kind in ('nudge', 'checkin', 'brief', 'headsup'));

-- Heads-ups use level 0, so the (task_id, level) unique index still allows
-- one of each per task: heads-up 0, then escalations 1–4 or a check-in 1.
-- (A check-in and a first escalation never both happen: a task is either a
-- non-negotiable or not.)

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

  with due_today as (
    select t.* from public.tasks t
    where t.status = 'pending'
      and t.due_at is not null
      and t.due_at <= p_now
      and (t.due_at at time zone 'Africa/Lagos')::date = today
  ),
  escalations as (
    select t.user_id, t.id as task_id, t.title, 'nudge'::text as kind,
           (coalesce(max(n.level), 0) + 1)::smallint as level
    from due_today t
    left join private.nudges n on n.task_id = t.id and n.kind = 'nudge'
    where t.is_non_negotiable
    group by t.user_id, t.id, t.title
    having coalesce(max(n.level), 0) < 4
       and (max(n.sent_at) is null or max(n.sent_at) <= p_now - interval '60 minutes')
  ),
  checkins as (
    select t.user_id, t.id, t.title, 'checkin'::text, 1::smallint
    from due_today t
    where not t.is_non_negotiable
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'checkin')
  ),
  headsups as (
    -- Any pending task with a time, starting within the next 15 minutes.
    select t.user_id, t.id, t.title, 'headsup'::text, 0::smallint
    from public.tasks t
    where t.status = 'pending'
      and t.due_at > p_now
      and t.due_at <= p_now + interval '15 minutes'
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'headsup')
  ),
  briefs as (
    select u.user_id, null::uuid, null::text, 'brief'::text, 1::smallint
    from (select distinct user_id from public.push_subscriptions) u
    where local_time >= '08:00'
      and not exists (select 1 from private.nudges n where n.user_id = u.user_id and n.kind = 'brief' and n.day = today)
  ),
  candidates as (
    select * from escalations
    union all select * from checkins
    union all select * from headsups
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
          order by is_non_negotiable desc, due_at nulls last
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

-- Same job name → pg_cron updates the existing job's schedule.
select cron.schedule('mypaddie-nudges', '* * * * *', 'select private.send_nudges()');
