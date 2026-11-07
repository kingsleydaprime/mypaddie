-- Quit tracker, step 3: the writes that must happen together (a state change
-- and its periods, a log and its honesty XP, a milestone and its payout), as
-- security-invoker functions so RLS still applies. Additive only.

-- Lowering a cap closes the period and opens one under the lower cap, so past
-- days keep the cap they ran under; this marks that the streak carries on.
alter table public.quit_periods add column continues_run boolean not null default false;

-- ─── start_quit: the quit and its first period ──────────────────────────────
create function public.start_quit(
  p_title text, p_alias text, p_kind public.quit_kind, p_limit integer, p_unit public.quit_unit,
  p_why text, p_on_home boolean, p_at timestamptz
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q uuid;
begin
  insert into public.quits (title, alias, kind, limit_per_day, unit, why, on_home)
    values (trim(p_title), nullif(trim(p_alias), ''), p_kind, p_limit, p_unit, nullif(trim(p_why), ''), coalesce(p_on_home, false))
    returning id into q;
  insert into public.quit_periods (quit_id, started_at, limit_per_day)
    values (q, coalesce(p_at, now()), p_limit);
  return q;
end;
$$;

-- ─── set_quit_status: pause, end, resume or restart ─────────────────────────
-- Pausing or ending closes the open period. Resuming opens a new one: a
-- paused streak is a stopped streak (D7).
create function public.set_quit_status(p_id uuid, p_status public.quit_status, p_at timestamptz)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.quits%rowtype;
  t timestamptz := coalesce(p_at, now());
begin
  select * into q from public.quits where id = p_id for update;
  if not found then return 'not_found'; end if;
  if q.status = p_status then return 'unchanged'; end if;
  if p_status = 'active' then
    insert into public.quit_periods (quit_id, started_at, limit_per_day) values (p_id, t, q.limit_per_day);
  elsif q.status = 'active' then
    update public.quit_periods set ended_at = t where quit_id = p_id and ended_at is null;
  end if;
  update public.quits set status = p_status where id = p_id;
  return 'changed';
end;
$$;

-- ─── set_quit_cap: a new daily cap for cutting down ─────────────────────────
-- Raised: a new attempt (a looser cap can't rewrite past over days).
-- Lowered: the run carries on. Either way the new cap applies from today.
create function public.set_quit_cap(p_id uuid, p_cap integer, p_at timestamptz)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.quits%rowtype;
  t timestamptz := coalesce(p_at, now());
begin
  select * into q from public.quits where id = p_id for update;
  if not found then return 'not_found'; end if;
  if q.kind <> 'limit' then return 'not_limit'; end if;
  if p_cap = q.limit_per_day then return 'unchanged'; end if;
  update public.quits set limit_per_day = p_cap where id = p_id;
  if q.status = 'active' then
    update public.quit_periods set ended_at = t where quit_id = p_id and ended_at is null;
    insert into public.quit_periods (quit_id, started_at, limit_per_day, continues_run)
      values (p_id, t, p_cap, p_cap < q.limit_per_day);
  end if;
  return case when p_cap > q.limit_per_day then 'raised' else 'lowered' end;
end;
$$;

-- ─── log_quit: a relapse or usage, with its honesty XP ──────────────────────
-- The caller works out whether the bonus is due today (p_xp is empty when
-- not); the reason is fixed here, so this can only ever pay honesty XP.
create function public.log_quit(
  p_id uuid, p_at timestamptz, p_amount integer, p_note text, p_cause text, p_xp jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  l uuid;
begin
  insert into public.quit_logs (quit_id, at, amount, note, cause)
    values (p_id, coalesce(p_at, now()), p_amount, nullif(trim(p_note), ''), nullif(trim(p_cause), ''))
    returning id into l;
  insert into public.xp_log (quit_id, pillar, amount, reason)
    select p_id, e.pillar, e.amount, 'quit_honesty'
    from jsonb_to_recordset(coalesce(p_xp, '[]'::jsonb)) as e(pillar public.pillar, amount integer);
  return l;
end;
$$;

-- ─── pay_quit_milestones: record and pay, once per run ──────────────────────
-- p_milestones: [{ "days": 7, "xp": [{ "pillar": "character", "amount": 12 }, …] }, …].
-- A milestone already recorded for this run is skipped, with its XP; returns
-- the days actually paid.
create function public.pay_quit_milestones(p_id uuid, p_run_started_at timestamptz, p_milestones jsonb)
returns integer[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
  paid integer[] := '{}';
begin
  for m in select * from jsonb_to_recordset(p_milestones) as x(days integer, xp jsonb) loop
    insert into public.quit_milestones (quit_id, run_started_at, days)
      values (p_id, p_run_started_at, m.days)
      on conflict do nothing;
    if found then
      insert into public.xp_log (quit_id, pillar, amount, reason)
        select p_id, e.pillar, e.amount, 'quit_milestone'
        from jsonb_to_recordset(m.xp) as e(pillar public.pillar, amount integer);
      paid := paid || m.days;
    end if;
  end loop;
  return paid;
end;
$$;

revoke all on function public.start_quit(text, text, public.quit_kind, integer, public.quit_unit, text, boolean, timestamptz) from public, anon;
revoke all on function public.set_quit_status(uuid, public.quit_status, timestamptz) from public, anon;
revoke all on function public.set_quit_cap(uuid, integer, timestamptz) from public, anon;
revoke all on function public.log_quit(uuid, timestamptz, integer, text, text, jsonb) from public, anon;
revoke all on function public.pay_quit_milestones(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.start_quit(text, text, public.quit_kind, integer, public.quit_unit, text, boolean, timestamptz) to authenticated;
grant execute on function public.set_quit_status(uuid, public.quit_status, timestamptz) to authenticated;
grant execute on function public.set_quit_cap(uuid, integer, timestamptz) to authenticated;
grant execute on function public.log_quit(uuid, timestamptz, integer, text, text, jsonb) to authenticated;
grant execute on function public.pay_quit_milestones(uuid, timestamptz, jsonb) to authenticated;
