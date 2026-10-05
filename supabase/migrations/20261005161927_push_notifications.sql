-- Push notifications, decided in the database (no admin key in the app).
--
-- Every 10 minutes pg_cron:
--   1. creates today's rows for recurring habits (so there's something to
--      nudge about even if the app wasn't opened today),
--   2. works out which nudges are due and records them so none repeat,
--   3. POSTs them to the app's /api/push route, which only adds Paddie's
--      wording and sends them.
-- The route's URL and shared secret live in Supabase Vault, never in this
-- (public) repo. See docs/PUSH-SETUP.md.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ─── Where to send: one row per device that turned nudges on ────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy "owner can read" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can insert" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner can update" on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner can delete" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ─── What's been sent (private: no client ever reads or writes this) ────────
create table private.nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  kind text not null check (kind in ('nudge', 'checkin', 'brief')),
  level smallint not null default 1,
  day date not null,
  sent_at timestamptz not null
);
-- Never the same level twice for a task; one morning brief per user per day.
create unique index nudges_task_level on private.nudges (task_id, level) where task_id is not null;
create unique index nudges_brief_per_day on private.nudges (user_id, day) where kind = 'brief';
create index nudges_task_idx on private.nudges (task_id);
alter table private.nudges enable row level security; -- no policies: invisible to clients

-- ─── 1. Today's habit rows ──────────────────────────────────────────────────
-- SQL copy of occursOn() in src/features/tasks/recurrence.ts. Only the two
-- forms that function accepts (FREQ=DAILY, FREQ=WEEKLY;BYDAY=…) exist in the
-- table, because add_task validates the rule before saving.
create function private.recurs_on(p_rule text, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(p_rule) like '%FREQ=DAILY%' then true
    when upper(p_rule) like '%FREQ=WEEKLY%' then
      left(to_char(p_day, 'DY'), 2) = any (
        string_to_array(substring(upper(p_rule) from 'BYDAY=([A-Z,]+)'), ',')
      )
    else false
  end;
$$;

create function private.spawn_today(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (p_now at time zone 'Africa/Lagos')::date;
  s record;
  spawned integer := 0;
begin
  for s in
    select distinct on (series_id) series_id, occurs_on, due_at, recurrence
    from public.tasks
    where series_id is not null
    order by series_id, occurs_on desc
  loop
    if s.occurs_on < today and private.recurs_on(s.recurrence, today) then
      if public.spawn_occurrence(
        s.series_id,
        today,
        case when s.due_at is null then null
             else (today + (s.due_at at time zone 'Africa/Lagos')::time) at time zone 'Africa/Lagos' end
      ) is not null then
        spawned := spawned + 1;
      end if;
    end if;
  end loop;
  return spawned;
end;
$$;

-- ─── 2. Which nudges are due right now ──────────────────────────────────────
-- Quiet hours 22:00–07:00 Lagos. Morning brief from 08:00, once a day.
-- Non-negotiables escalate: up to 4 nudges, at least an hour apart, until done.
-- Ordinary tasks get one "did you do it?" after their time passes.
create function private.collect_nudges(p_now timestamptz default now())
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
    left join private.nudges n on n.task_id = t.id
    where t.is_non_negotiable
    group by t.user_id, t.id, t.title
    having coalesce(max(n.level), 0) < 4
       and (max(n.sent_at) is null or max(n.sent_at) <= p_now - interval '60 minutes')
  ),
  checkins as (
    select t.user_id, t.id, t.title, 'checkin'::text, 1::smallint
    from due_today t
    where not t.is_non_negotiable
      and not exists (select 1 from private.nudges n where n.task_id = t.id)
  ),
  briefs as (
    select u.user_id, null::uuid, null::text, 'brief'::text, 1::smallint
    from (select distinct user_id from public.push_subscriptions) u
    where local_time >= '08:00'
      and not exists (select 1 from private.nudges n where n.user_id = u.user_id and n.kind = 'brief' and n.day = today)
  ),
  candidates as (
    select * from escalations union all select * from checkins union all select * from briefs
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
      'title', (select title from public.tasks where id = r.task_id),
      -- The brief lists today's top three open tasks, non-negotiables first.
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
  join public.push_subscriptions s on s.user_id = r.user_id;

  return sent;
end;
$$;

-- ─── 3. The job: spawn, collect, send ───────────────────────────────────────
create function private.send_nudges()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'mypaddie_push_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'mypaddie_push_secret');
  payload jsonb;
begin
  perform private.spawn_today();
  -- Not configured yet (see docs/PUSH-SETUP.md): record nothing, send nothing.
  if url is null or secret is null then
    return;
  end if;
  payload := private.collect_nudges();
  if jsonb_array_length(payload) > 0 then
    perform net.http_post(
      url := url,
      body := jsonb_build_object('nudges', payload),
      headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
      timeout_milliseconds := 10000
    );
  end if;
end;
$$;

-- These are internal: only the scheduler (running as postgres) calls them.
revoke all on function private.recurs_on(text, date) from public;
revoke all on function private.spawn_today(timestamptz) from public;
revoke all on function private.collect_nudges(timestamptz) from public;
revoke all on function private.send_nudges() from public;

select cron.schedule('mypaddie-nudges', '*/10 * * * *', 'select private.send_nudges()');
