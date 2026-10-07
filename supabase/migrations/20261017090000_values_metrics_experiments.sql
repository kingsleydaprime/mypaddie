-- Values, a fuller daily check-in (sleep, mood, screen time), and experiments.

-- ─── Values: a short, permanent list of rules to live by ────────────────────
create table public.life_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value text not null check (length(trim(value)) between 1 and 120),
  why text check (length(why) <= 500),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index life_values_per_user on public.life_values (user_id, lower(value));

-- ─── Check-ins: energy, and now sleep, mood and screen time (all optional) ──
alter table public.checkins alter column energy drop not null;
alter table public.checkins
  add column sleep_hours numeric(3, 1) check (sleep_hours between 0 and 24),
  add column mood smallint check (mood between 1 and 5),
  add column screen_minutes integer check (screen_minutes between 0 and 1440),
  add constraint checkin_says_something check (energy is not null or sleep_hours is not null or mood is not null or screen_minutes is not null or note is not null);

-- ─── Experiments: "for 14 days, phone outside the bedroom — does sleep improve?" ─
create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The change being tried.
  change text not null check (length(trim(change)) between 1 and 200),
  -- What they want to find out.
  question text check (length(question) <= 300),
  -- What to watch: a tracked metric (sleep, energy, mood, screen_time…) or null for "just tell me".
  metric text check (length(metric) <= 40),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'running' check (status in ('running', 'done', 'abandoned')),
  conclusion text check (conclusion in ('helped', 'no_difference', 'made_worse', 'unclear')),
  result text check (length(result) <= 2000),
  task_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  constraint experiment_in_order check (ends_on >= starts_on)
);
create index experiments_task_user_idx on public.experiments (task_id, user_id);

do $$
declare t text;
begin
  foreach t in array array['life_values', 'experiments'] loop
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
