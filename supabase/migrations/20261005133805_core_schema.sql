-- MyPaddie core schema: every table from docs/BLUEPRINT.md, plus `checkins`
-- (mood/energy for soft mode). Every row belongs to one user, and row-level
-- security makes sure only that user can read or write it.
--
-- Conventions:
--   * user_id defaults to auth.uid(), so clients never send it.
--   * Child tables point at parents with a composite (id, user_id) foreign
--     key, so you can't attach your row to someone else's parent row even if
--     you guess its id.
--   * Money is bigint whole naira. XP is integer.
--   * Enums here mirror src/shared/domain.ts and the feature types.

-- ─── Types ──────────────────────────────────────────────────────────────────

create type public.tier as enum ('need', 'want', 'goal', 'wish', 'dream');
create type public.item_status as enum ('active', 'done', 'paused', 'dropped');
create type public.task_status as enum ('pending', 'done', 'skipped', 'cancelled');
create type public.pillar as enum (
  'spiritual', 'mental', 'physical', 'financial', 'emotional',
  'social', 'character', 'skills', 'creativity', 'relationships'
);
create type public.xp_reason as enum (
  'completion', 'late_completion', 'ignored_need',
  'goal_completion', 'wish_fulfilled', 'dream_milestone', 'transaction_logged'
);
create type public.mode as enum ('curious', 'strict', 'soft', 'strictest', 'softest');
create type public.money_direction as enum ('in', 'out');
create type public.money_tag as enum ('need', 'want', 'unsure');
create type public.spend_level as enum ('floor', 'comfortable');
create type public.bucket_name as enum ('needs', 'buffer', 'savings', 'wants', 'flexible');
create type public.purchase_verdict as enum ('yes', 'wait_24h', 'no');

-- ─── items: everything you do or want, by tier ──────────────────────────────

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tier public.tier not null,
  title text not null check (length(trim(title)) > 0),
  target text,
  deadline timestamptz,
  status public.item_status not null default 'active',
  -- Deficit mode funds needs in this order (lower first).
  priority integer not null default 100,
  -- Monthly cost of a need: cheapest honest version vs what you spend now.
  floor_amount bigint check (floor_amount >= 0),
  comfortable_amount bigint check (comfortable_amount >= 0),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint floor_and_comfortable_only_on_needs
    check (tier = 'need' or (floor_amount is null and comfortable_amount is null)),
  constraint floor_not_above_comfortable
    check (floor_amount is null or comfortable_amount is null or floor_amount <= comfortable_amount)
);
create index items_user_tier_status_idx on public.items (user_id, tier, status);

-- ─── tasks: scheduled work; a recurring habit is one row per occurrence ─────

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid,
  title text not null check (length(trim(title)) > 0),
  base_xp integer not null default 10 check (base_xp > 0),
  due_at timestamptz,
  -- iCalendar RRULE describing the series this occurrence belongs to.
  recurrence text,
  is_non_negotiable boolean not null default false,
  status public.task_status not null default 'pending',
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete set null (item_id),
  constraint done_at_matches_status check ((status = 'done') = (done_at is not null))
);
create index tasks_user_due_idx on public.tasks (user_id, due_at);
create index tasks_item_idx on public.tasks (item_id, user_id);

-- ─── task_pillars: how a task's XP splits across pillars ────────────────────

create table public.task_pillars (
  task_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pillar public.pillar not null,
  weight integer not null check (weight between 1 and 100),
  primary key (task_id, pillar),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index task_pillars_user_idx on public.task_pillars (user_id);

-- Weights for a task must sum to 100. Checked at COMMIT (deferred), so you
-- can insert 50 + 30 + 20 as three statements in one transaction.
create schema if not exists private;

create function private.check_task_weights() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
  total integer;
begin
  foreach affected in array array_remove(array[
    case when tg_op <> 'DELETE' then new.task_id end,
    case when tg_op <> 'INSERT' then old.task_id end
  ], null) loop
    select sum(weight) into total from public.task_pillars where task_id = affected;
    if total is not null and total <> 100 then
      raise exception 'pillar weights for task % sum to %, must be 100', affected, total
        using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger task_pillars_sum_to_100
  after insert or update or delete on public.task_pillars
  deferrable initially deferred
  for each row execute function private.check_task_weights();

-- ─── pillars: the ten stats, kept in sync from xp_log ───────────────────────

create table public.pillars (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name public.pillar not null,
  xp bigint not null default 0,
  level integer not null default 1 check (level >= 1),
  hp integer not null default 100 check (hp between 0 and 100),
  primary key (user_id, name)
);

-- ─── xp_log: append-only ledger of every gain and deduction ─────────────────

create table public.xp_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid,
  item_id uuid,
  pillar public.pillar not null,
  amount integer not null check (amount <> 0),
  reason public.xp_reason not null,
  note text,
  at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete set null (item_id)
);
create index xp_log_user_at_idx on public.xp_log (user_id, at desc);
create index xp_log_task_idx on public.xp_log (task_id);
create index xp_log_item_idx on public.xp_log (item_id);

-- Idempotency: a retried "complete task" can't pay twice, and a task can't be
-- deducted twice for the same reason.
create unique index xp_log_once_per_task_reason
  on public.xp_log (task_id, pillar, reason) where task_id is not null;
-- A goal completes once and a wish happens once. Dream milestones can repeat.
create unique index xp_log_once_per_item_reason
  on public.xp_log (item_id, pillar, reason)
  where item_id is not null and reason in ('goal_completion', 'wish_fulfilled');

-- Pillar totals follow the ledger. SECURITY DEFINER so clients can't write
-- pillars.xp directly; the function only ever touches the inserting row's
-- user_id, which RLS has already verified is the caller. It lives in the
-- unexposed `private` schema and only runs as a trigger.
create function private.apply_xp() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pillars (user_id, name, xp)
  values (new.user_id, new.pillar, new.amount)
  on conflict (user_id, name) do update set xp = public.pillars.xp + excluded.xp;
  return null;
end;
$$;

create trigger xp_log_apply after insert on public.xp_log
  for each row execute function private.apply_xp();

-- ─── slips: skipped tasks and the reason given ──────────────────────────────

create table public.slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  why text,
  -- Short label Paddie assigns ("tired", "late night") so reworded reasons
  -- still match for the repeat-excuse rule and for pattern detection.
  why_category text,
  -- Whether the reason was accepted (see judgeSlip in src/features/slips);
  -- only accepted slips protect a need from the ignored-need deduction.
  -- No default: the caller must decide.
  accepted boolean not null,
  tone_used public.mode,
  at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index slips_user_at_idx on public.slips (user_id, at desc);
create index slips_task_idx on public.slips (task_id);

-- ─── checkins: daily energy, for soft mode on low-HP days ───────────────────

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  energy smallint not null check (energy between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- ─── transactions: every naira in and out ───────────────────────────────────

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount bigint not null check (amount > 0),
  direction public.money_direction not null,
  category text not null check (length(trim(category)) > 0),
  tag public.money_tag,
  spend_level public.spend_level,
  item_id uuid,
  note text,
  at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete set null (item_id),
  -- Outflows must be tagged need/want/unsure; income is never tagged.
  constraint tag_only_on_outflows check ((direction = 'out') = (tag is not null)),
  constraint spend_level_only_on_needs check (spend_level is null or tag = 'need')
);
create index transactions_user_at_idx on public.transactions (user_id, at desc);

-- ─── buckets: needs, buffer, savings, wants, flexible ───────────────────────

create table public.buckets (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name public.bucket_name not null,
  -- Only savings/wants/flexible take a percentage of the remainder.
  target_pct integer check (target_pct between 0 and 100),
  balance bigint not null default 0 check (balance >= 0),
  primary key (user_id, name),
  constraint pct_only_on_split_buckets
    check (target_pct is null or name in ('savings', 'wants', 'flexible'))
);

-- ─── purchase_checks: don't-buy-this history ────────────────────────────────

create table public.purchase_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item text not null,
  price bigint not null check (price >= 0),
  verdict public.purchase_verdict not null,
  reasons jsonb not null default '[]'::jsonb,
  decided_at timestamptz not null default now()
);
create index purchase_checks_user_at_idx on public.purchase_checks (user_id, decided_at desc);

-- ─── memories: facts and patterns Paddie should remember ────────────────────

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null,
  text text not null,
  source text,
  at timestamptz not null default now()
);
create index memories_user_category_idx on public.memories (user_id, category);

-- ─── identity_profiles: "Who I'm becoming" versions ─────────────────────────

create table public.identity_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  text text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create index identity_profiles_user_idx on public.identity_profiles (user_id);
-- At most one active profile per user.
create unique index identity_profiles_one_active
  on public.identity_profiles (user_id) where is_active;

-- ─── settings: split %, quiet hours, phone-free windows, mode override ──────

create table public.settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  primary key (user_id, key)
);

-- ─── Row-level security ─────────────────────────────────────────────────────
-- Policy shape (per Supabase guidance): one policy per operation, scoped
-- `to authenticated`, ownership checked with `(select auth.uid())` so it is
-- evaluated once per statement, and `with check` on writes so a row can't be
-- handed to another user.
--
-- Grants: new tables are no longer exposed to the Data API automatically, so
-- grant exactly what each table needs to `authenticated` and nothing to `anon`.

do $$
declare
  t text;
  owned_tables text[] := array[
    'items', 'tasks', 'task_pillars', 'slips', 'checkins', 'transactions',
    'buckets', 'purchase_checks', 'memories', 'identity_profiles', 'settings'
  ];
begin
  foreach t in array owned_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format($p$create policy "owner can read" on public.%I
      for select to authenticated using ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can insert" on public.%I
      for insert to authenticated with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can update" on public.%I
      for update to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can delete" on public.%I
      for delete to authenticated using ((select auth.uid()) = user_id)$p$, t);
  end loop;
end;
$$;

-- xp_log is an append-only ledger: read and insert, never edit or delete.
alter table public.xp_log enable row level security;
revoke all on public.xp_log from anon, authenticated;
grant select, insert on public.xp_log to authenticated;
create policy "owner can read" on public.xp_log
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can insert" on public.xp_log
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- pillars are derived from xp_log by trigger: read-only to clients.
alter table public.pillars enable row level security;
revoke all on public.pillars from anon, authenticated;
grant select on public.pillars to authenticated;
create policy "owner can read" on public.pillars
  for select to authenticated using ((select auth.uid()) = user_id);

-- ─── export_all: your data is never trapped ─────────────────────────────────
-- SECURITY INVOKER, so RLS applies and it can only ever return the caller's rows.

create function public.export_all() returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'items', (select coalesce(jsonb_agg(t), '[]') from public.items t),
    'tasks', (select coalesce(jsonb_agg(t), '[]') from public.tasks t),
    'task_pillars', (select coalesce(jsonb_agg(t), '[]') from public.task_pillars t),
    'pillars', (select coalesce(jsonb_agg(t), '[]') from public.pillars t),
    'xp_log', (select coalesce(jsonb_agg(t), '[]') from public.xp_log t),
    'slips', (select coalesce(jsonb_agg(t), '[]') from public.slips t),
    'checkins', (select coalesce(jsonb_agg(t), '[]') from public.checkins t),
    'transactions', (select coalesce(jsonb_agg(t), '[]') from public.transactions t),
    'buckets', (select coalesce(jsonb_agg(t), '[]') from public.buckets t),
    'purchase_checks', (select coalesce(jsonb_agg(t), '[]') from public.purchase_checks t),
    'memories', (select coalesce(jsonb_agg(t), '[]') from public.memories t),
    'identity_profiles', (select coalesce(jsonb_agg(t), '[]') from public.identity_profiles t),
    'settings', (select coalesce(jsonb_agg(t), '[]') from public.settings t)
  );
$$;

revoke all on function public.export_all() from public, anon;
grant execute on function public.export_all() to authenticated;
