-- Themes (year / quarter / month), reviews (week / month / quarter / year),
-- achievements, routines, and a decision log.

-- ─── Themes: "Year of Discipline", "Month of Mercies" ───────────────────────
create table public.themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period text not null check (period in ('year', 'quarter', 'month')),
  -- First day of the period it covers.
  starts_on date not null,
  title text not null check (length(trim(title)) between 1 and 100),
  focus text[] not null default '{}',
  -- What this season says no to — Paddie pushes back when these come up.
  not_now text[] not null default '{}',
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, period, starts_on)
);

-- ─── Reviews ────────────────────────────────────────────────────────────────
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period text not null check (period in ('week', 'month', 'quarter', 'year')),
  starts_on date not null,
  ends_on date not null,
  -- Their answers to the reflection questions, by question key.
  answers jsonb not null default '{}',
  -- Paddie's report, written from what actually happened.
  summary text check (length(summary) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period, starts_on),
  constraint review_in_order check (ends_on >= starts_on)
);

-- ─── Achievements ───────────────────────────────────────────────────────────
-- Which achievement (key from src/features/achievements/achievements.ts) and when.
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (length(key) between 1 and 60),
  earned_at timestamptz not null default now(),
  -- What earned it, e.g. the habit behind a streak.
  detail text check (length(detail) <= 200),
  unique (user_id, key)
);

-- ─── Routines: several habits, one unit ─────────────────────────────────────
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index routines_title_per_user on public.routines (user_id, lower(title));
alter table public.tasks add column routine_id uuid, add column routine_step smallint;
alter table public.tasks add foreign key (routine_id, user_id) references public.routines (id, user_id) on delete set null (routine_id);
create index tasks_routine_user_idx on public.tasks (routine_id, user_id);

-- ─── Decisions ──────────────────────────────────────────────────────────────
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  decision text not null check (length(trim(decision)) between 1 and 300),
  why text check (length(why) <= 2000),
  expected text check (length(expected) <= 1000),
  decided_on date not null default current_date,
  review_on date,
  -- After the review: did it work?
  verdict text check (verdict in ('worked', 'partly', 'didnt')),
  outcome text check (length(outcome) <= 2000),
  reviewed_at timestamptz,
  task_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);
create index decisions_task_user_idx on public.decisions (task_id, user_id);

do $$
declare t text;
begin
  foreach t in array array['themes', 'reviews', 'achievements', 'routines', 'decisions'] loop
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

-- A habit's next day stays in its routine (and keeps everything else, as before).
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
    fun_activity_id, topic, commitment_id, course_id, location, routine_id, routine_step
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on,
    template.duration_minutes, template.reminders, template.skill_id, template.reminder_note,
    template.fun_activity_id, template.topic, template.commitment_id, template.course_id, template.location,
    template.routine_id, template.routine_step
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
revoke all on function public.spawn_occurrence(uuid, date, timestamptz) from public, anon;
grant execute on function public.spawn_occurrence(uuid, date, timestamptz) to authenticated;

-- ─── Review reminders ───────────────────────────────────────────────────────
-- Sunday evening: the week. Last day of a month: the month — or the quarter, or
-- the year, when they end too (the biggest one wins). Only if that review isn't
-- written yet; once per day; their evening time and quiet hours.
alter table private.nudges drop constraint nudges_kind_check;
alter table private.nudges add constraint nudges_kind_check
  check (kind in ('nudge', 'checkin', 'brief', 'headsup', 'reminder', 'event', 'application', 'fun', 'review'));
create unique index nudges_review_per_day on private.nudges (user_id, day) where kind = 'review';

create function private.collect_review_nudges(p_now timestamptz default now())
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
  due as (
    select sc.user_id, sc.today,
      case
        when sc.today = (date_trunc('year', sc.today) + interval '1 year - 1 day')::date then 'year'
        when sc.today = (date_trunc('quarter', sc.today) + interval '3 months - 1 day')::date then 'quarter'
        when sc.today = (date_trunc('month', sc.today) + interval '1 month - 1 day')::date then 'month'
        when extract(isodow from sc.today) = 7 then 'week'
      end as period
    from sched sc
    where sc.local_time >= sc.evening_at
      and not private.is_quiet(sc.local_time, sc.quiet_start, sc.quiet_end)
  ),
  candidates as (
    select d.* from due d
    where d.period is not null
      and not exists (
        select 1 from public.reviews r where r.user_id = d.user_id and r.period = d.period
          and r.starts_on = case d.period
            when 'week' then d.today - 6
            when 'month' then date_trunc('month', d.today)::date
            when 'quarter' then date_trunc('quarter', d.today)::date
            else date_trunc('year', d.today)::date end)
      and not exists (select 1 from private.nudges n where n.user_id = d.user_id and n.kind = 'review' and n.day = d.today)
  ),
  recorded as (
    insert into private.nudges (user_id, kind, level, day, occurs_on, sent_at)
    select user_id, 'review', case period when 'week' then 1 when 'month' then 2 when 'quarter' then 3 else 4 end, today, today, p_now
    from candidates
    on conflict do nothing
    returning user_id, level
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'review', 'level', r.level, 'title', to_char(c.today, 'FMMonth YYYY'), 'items', null
    )), '[]'::jsonb)
  into sent
  from recorded r
  join candidates c on c.user_id = r.user_id
  join public.push_subscriptions s on s.user_id = r.user_id;
  return sent;
end;
$$;

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
  payload := private.collect_nudges() || private.collect_application_nudges() || private.collect_fun_nudges() || private.collect_review_nudges();
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
revoke all on function private.collect_review_nudges(timestamptz) from public;
revoke all on function private.send_nudges() from public;
