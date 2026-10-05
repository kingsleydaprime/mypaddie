-- Applications: jobs, scholarships, programmes… with a deadline (in its own
-- time zone), a target date before it, a requirements checklist (each item
-- becomes a task), a pipeline status, and their own reminder ladder.

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  org text,
  kind text not null default 'other'
    check (kind in ('job', 'internship', 'scholarship', 'fellowship', 'grant', 'admission', 'program', 'other')),
  link text,
  description text,
  status text not null default 'researching'
    check (status in ('researching', 'preparing', 'submitted', 'interview', 'offer', 'rejected', 'withdrawn')),
  -- The exact moment it closes; null = rolling ("open until filled").
  deadline_at timestamptz,
  -- The zone the deadline was published in (e.g. America/New_York), for showing it as written.
  deadline_tz text,
  -- Aim to submit this many days early: portals crash, references are late.
  target_days_before integer not null default 3 check (target_days_before between 0 and 60),
  results_expected date,
  submitted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint deadline_tz_with_deadline check (deadline_tz is null or deadline_at is not null)
);
create index applications_user_deadline_idx on public.applications (user_id, deadline_at);

create table public.application_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  done boolean not null default false,
  -- The task that gets this done; completing it ticks the requirement.
  task_id uuid,
  position integer not null default 0,
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade,
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);
create index application_requirements_app_idx on public.application_requirements (application_id, user_id);
create index application_requirements_task_idx on public.application_requirements (task_id, user_id);

do $$
declare t text;
begin
  foreach t in array array['applications', 'application_requirements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "owner can read" on public.%I for select to authenticated using ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)$p$, t);
  end loop;
end;
$$;

-- ─── Reminders ──────────────────────────────────────────────────────────────
alter table private.nudges add column application_id uuid references public.applications (id) on delete cascade;
alter table private.nudges drop constraint nudges_kind_check;
alter table private.nudges add constraint nudges_kind_check
  check (kind in ('nudge', 'checkin', 'brief', 'headsup', 'reminder', 'event', 'application'));
create unique index nudges_application_level_day on private.nudges (application_id, level, occurs_on) where application_id is not null;
create index nudges_application_idx on private.nudges (application_id);

-- Its own collector, beside collect_nudges (left untouched). Levels:
--   1–5  14 / 7 / 3 / 1 / 0 days before the *target* date (from his morning time)
--   6    rolling deadline, still preparing: a gentle "apply soon" on Mondays
--   7    submitted, results expected today: "check"
-- Same per-user quiet hours; each level once per application (per Monday for 6).
create function private.collect_application_nudges(p_now timestamptz default now())
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
      private.setting_time(s.value, 'morningAt', '09:00') as morning_at
    from auth.users u
    left join public.settings s on s.user_id = u.id and s.key = 'schedule'
  ),
  apps as (
    select a.*,
      ((a.deadline_at at time zone 'Africa/Lagos')::date - a.target_days_before) as target_day
    from public.applications a
  ),
  candidates as (
    select a.user_id, a.id as application_id, r.level::smallint as level,
           case when r.level = 6 then today else coalesce(a.target_day, today) end as occurs_on
    from apps a
    join sched sc on sc.user_id = a.user_id
    cross join lateral (values
      (1, a.status in ('researching', 'preparing') and a.target_day - today = 14),
      (2, a.status in ('researching', 'preparing') and a.target_day - today = 7),
      (3, a.status in ('researching', 'preparing') and a.target_day - today = 3),
      (4, a.status in ('researching', 'preparing') and a.target_day - today = 1),
      (5, a.status in ('researching', 'preparing') and a.target_day = today),
      (6, a.status in ('researching', 'preparing') and a.deadline_at is null and extract(isodow from today) = 1),
      (7, a.status in ('submitted', 'interview') and a.results_expected = today)
    ) as r(level, due_now)
    where r.due_now
      and local_time >= sc.morning_at
      and not private.is_quiet(local_time, sc.quiet_start, sc.quiet_end)
      and not exists (
        select 1 from private.nudges n
        where n.application_id = a.id and n.level = r.level
          and n.occurs_on = case when r.level = 6 then today else coalesce(a.target_day, today) end
      )
  ),
  recorded as (
    insert into private.nudges (user_id, application_id, kind, level, day, occurs_on, sent_at)
    select user_id, application_id, 'application', level, today, occurs_on, p_now from candidates
    on conflict do nothing
    returning user_id, application_id, level
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'application', 'level', r.level, 'applicationId', r.application_id,
      'title', a.title,
      'days', case when a.deadline_at is not null then ((a.deadline_at at time zone 'Africa/Lagos')::date - a.target_days_before) - today end,
      -- The real deadline, in his time, so he sees exactly when it closes.
      'due', case when a.deadline_at is not null then to_char(a.deadline_at at time zone 'Africa/Lagos', 'Dy DD Mon HH24:MI') end,
      'items', (select coalesce(jsonb_agg(q.title order by q.position), '[]'::jsonb)
                from public.application_requirements q where q.application_id = a.id and not q.done)
    )), '[]'::jsonb)
  into sent
  from recorded r
  join public.applications a on a.id = r.application_id
  join public.push_subscriptions s on s.user_id = r.user_id;

  return sent;
end;
$$;

-- send_nudges: as before, with application reminders in the same batch.
create or replace function private.send_nudges()
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
  perform private.prune_dead_subscriptions();
  perform private.spawn_today();
  if url is null or secret is null then
    return;
  end if;
  payload := private.collect_nudges() || private.collect_application_nudges();
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

revoke all on function private.collect_application_nudges(timestamptz) from public;
revoke all on function private.send_nudges() from public;
