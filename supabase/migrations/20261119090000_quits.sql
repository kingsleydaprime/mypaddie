-- Quit tracker (docs/QUIT-TRACKER-PLAN.md, decided 2026-11-07): counters for
-- habits being quit completely (`quit`) or cut down under a daily cap
-- (`limit`). Streaks, totals and milestones are derived in
-- src/features/quits/quits.ts and never stored here.
--
-- Purely additive: new types and tables, two new xp_reason values and a
-- nullable column on xp_log. No existing row is read or changed.
--
-- Privacy: `title` is the real name and is sensitive. Nothing else in the
-- schema copies it (xp_log rows link by id; their note stays empty).

alter type public.xp_reason add value if not exists 'quit_milestone';
alter type public.xp_reason add value if not exists 'quit_honesty';

create type public.quit_kind as enum ('quit', 'limit');
create type public.quit_unit as enum ('minutes', 'times');
create type public.quit_status as enum ('active', 'paused', 'ended');

-- ─── quits: one per habit being quit ─────────────────────────────────────────
create table public.quits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  alias text check (length(trim(alias)) between 1 and 40),
  kind public.quit_kind not null default 'quit',
  -- The current cap; each period keeps the cap it ran under.
  limit_per_day integer,
  unit public.quit_unit,
  status public.quit_status not null default 'active',
  why text check (length(trim(why)) between 1 and 300),
  on_home boolean not null default false,
  -- D5: Paddie sees only the alias unless this is on.
  show_name_to_ai boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint quits_cap_matches_kind check (
    (kind = 'quit' and limit_per_day is null and unit is null)
    -- `is not null` is needed: `null >= 1` is unknown, and a check passes on unknown.
    or (kind = 'limit' and limit_per_day is not null and limit_per_day >= 1 and unit is not null)
  )
);
create index quits_user_idx on public.quits (user_id, created_at);
-- Two quits with the same name is a mistake (any case, any spacing at the ends).
create unique index quits_user_title_idx on public.quits (user_id, lower(trim(title)));

-- A quit's kind is fixed: relapse logs and usage logs mean different things,
-- so switching would reinterpret its whole history.
create function private.quits_kind_is_fixed() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> old.kind then
    raise exception 'a quit''s kind can''t change; start a new one instead' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger quits_kind_is_fixed before update of kind on public.quits
  for each row execute function private.quits_kind_is_fixed();

-- ─── quit_periods: the stretches it was tracked ──────────────────────────────
-- Pausing, ending or raising the cap closes the open period; resuming or
-- restarting opens a new one. A streak never survives a closed period (D7).
create table public.quit_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quit_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  limit_per_day integer check (limit_per_day >= 1),
  unique (id, user_id),
  foreign key (quit_id, user_id) references public.quits (id, user_id) on delete cascade,
  constraint quit_periods_end_after_start check (ended_at is null or ended_at >= started_at)
);
create index quit_periods_quit_idx on public.quit_periods (quit_id, started_at);
-- At most one open period per quit.
create unique index quit_periods_one_open_idx on public.quit_periods (quit_id) where ended_at is null;

-- ─── quit_logs: relapses (quit) and usage (limit) ────────────────────────────
create table public.quit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quit_id uuid not null,
  -- When it happened (can be backdated); created_at is when it was logged.
  at timestamptz not null default now(),
  amount integer check (amount >= 1),
  note text check (length(trim(note)) between 1 and 500),
  -- Short label, the same idea as a slip's why_category ("late night", "bored").
  cause text check (length(trim(cause)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (quit_id, user_id) references public.quits (id, user_id) on delete cascade
);
create index quit_logs_quit_at_idx on public.quit_logs (quit_id, at);

-- A relapse has no amount; usage must have one.
create function private.quit_logs_match_kind() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k public.quit_kind;
begin
  select q.kind into k from public.quits q where q.id = new.quit_id;
  if k = 'quit' and new.amount is not null then
    raise exception 'a relapse has no amount' using errcode = '23514';
  elsif k = 'limit' and new.amount is null then
    raise exception 'usage needs an amount' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger quit_logs_match_kind before insert or update of amount, quit_id on public.quit_logs
  for each row execute function private.quit_logs_match_kind();

-- ─── quit_milestones: which milestones each clean run has been paid for ──────
-- D3: milestones pay again on every new run, never twice in the same run. The
-- unique key makes a double payout impossible, even from two requests at once.
create table public.quit_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quit_id uuid not null,
  run_started_at timestamptz not null,
  days integer not null check (days in (1, 3, 7, 14, 30, 60, 90, 180, 365)),
  paid_at timestamptz not null default now(),
  unique (quit_id, run_started_at, days),
  foreign key (quit_id, user_id) references public.quits (id, user_id) on delete cascade
);

-- ─── xp_log: link quit XP to its quit ────────────────────────────────────────
-- Deleting a quit keeps the XP it earned (earned XP is never taken back, D1).
alter table public.xp_log add column quit_id uuid;
alter table public.xp_log add foreign key (quit_id, user_id)
  references public.quits (id, user_id) on delete set null (quit_id);
create index xp_log_quit_idx on public.xp_log (quit_id) where quit_id is not null;

-- ─── RLS: owner only, the usual four policies on each table ──────────────────
do $$
declare t text;
begin
  foreach t in array array['quits', 'quit_periods', 'quit_logs', 'quit_milestones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "owner can read" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner can insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner can update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner can delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;
