-- App-wide switches, and plans (no payments yet).
--
-- private.app_config holds switches you flip with one SQL line, no redeploy:
--   invites_required  — the sign-up hook only admits invitees (off for now)
--   default_plan      — the plan of anyone who hasn't chosen one ('free';
--                       people switch to Plus or Pro themselves in Settings)
--   payments_enabled  — when true, choosing a paid plan needs a payment
--
-- Plans: free / plus / pro. What each allows lives in
-- src/features/plans/plans.ts; the database only stores who chose what.

create table private.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into private.app_config (key, value) values
  ('invites_required', 'false'),
  ('default_plan', '"free"'),
  ('payments_enabled', 'false');

create function private.config(p_key text, p_default jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$ select coalesce((select value from private.app_config where key = p_key), p_default) $$;
revoke all on function private.config(text, jsonb) from public;
grant execute on function private.config(text, jsonb) to supabase_auth_admin;
grant select on private.app_config to supabase_auth_admin;

-- ─── The sign-up gate reads the switch ──────────────────────────────────────
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  email text := nullif(lower(trim(event->'user'->>'email')), '');
  code text := nullif(upper(trim(event->'user'->'user_metadata'->>'invite_code')), '');
begin
  if coalesce((event->'user'->>'is_anonymous')::boolean, false) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'MyPaddie needs a real account — anonymous sign-ins are off.'));
  end if;
  -- Invites off: anyone may join. (An invite, if given, is still used up by the trigger.)
  if not (private.config('invites_required', 'true'))::boolean then
    return '{}'::jsonb;
  end if;
  if private.admitting_invite(email, code) is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', case when code is null
        then 'MyPaddie is invite-only for now. Ask whoever told you about it for an invite code.'
        else 'That invite code isn''t valid — it may be used, expired, or for a different email.' end));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- What the (signed-out) sign-up page needs to know.
create function public.signup_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select jsonb_build_object('invitesRequired', (private.config('invites_required', 'true'))::boolean) $$;
revoke all on function public.signup_settings() from public;
grant execute on function public.signup_settings() to anon, authenticated;

-- ─── Plans ──────────────────────────────────────────────────────────────────
create table public.user_plans (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  plan text not null check (plan in ('free', 'plus', 'pro')),
  period text not null default 'monthly' check (period in ('monthly', 'yearly')),
  -- Claimed student pricing (verified once payments exist).
  student boolean not null default false,
  chosen_at timestamptz not null default now(),
  -- Set when payments start: a trial runs until then; null = no trial.
  trial_ends_at timestamptz
);
alter table public.user_plans enable row level security;
revoke all on public.user_plans from anon, authenticated;
grant select on public.user_plans to authenticated;
create policy "owner can read" on public.user_plans for select to authenticated using ((select auth.uid()) = user_id);

-- Your plan: your choice if you made one, else the app default.
create function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', coalesce(p.plan, private.config('default_plan', '"free"') #>> '{}'),
    'chosen', p.plan is not null,
    'period', coalesce(p.period, 'monthly'),
    'student', coalesce(p.student, false),
    'trialEndsAt', p.trial_ends_at,
    'paymentsEnabled', (private.config('payments_enabled', 'false'))::boolean
  )
  from (select 1) one
  left join public.user_plans p on p.user_id = auth.uid()
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Choosing a plan. While payments are off, any plan is one tap. Once they're
-- on, only Free can be chosen here; paid plans come from a confirmed payment.
create function public.choose_plan(p_plan text, p_period text default 'monthly', p_student boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_plan not in ('free', 'plus', 'pro') or p_period not in ('monthly', 'yearly') then
    return 'invalid';
  end if;
  if p_plan <> 'free' and (private.config('payments_enabled', 'false'))::boolean then
    return 'payment_required';
  end if;
  insert into public.user_plans (user_id, plan, period, student, chosen_at)
    values (auth.uid(), p_plan, p_period, p_student, now())
  on conflict (user_id) do update set plan = excluded.plan, period = excluded.period, student = excluded.student, chosen_at = now();
  return 'ok';
end;
$$;
revoke all on function public.choose_plan(text, text, boolean) from public, anon;
grant execute on function public.choose_plan(text, text, boolean) to authenticated;
