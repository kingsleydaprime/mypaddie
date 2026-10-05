-- Writes behind the remaining MCP tools. Each one changes several rows that
-- must agree, so each is a single function (one transaction). All SECURITY
-- INVOKER: RLS applies exactly as for direct queries.

-- ─── Splits are applied once per income entry ───────────────────────────────
alter table public.transactions
  add column split_applied_at timestamptz,
  add constraint split_only_on_income check (split_applied_at is null or direction = 'in');

-- ─── record_slip: mark the task skipped and log why, together ───────────────
create function public.record_slip(
  p_task_id uuid, p_why text, p_why_category text, p_accepted boolean, p_tone public.mode
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  slip_id uuid;
begin
  update public.tasks set status = 'skipped' where id = p_task_id and status = 'pending';
  -- Fails with a foreign-key error if the task doesn't exist or isn't yours.
  insert into public.slips (task_id, why, why_category, accepted, tone_used)
    values (p_task_id, p_why, nullif(trim(p_why_category), ''), p_accepted, p_tone)
    returning id into slip_id;
  return slip_id;
end;
$$;

-- ─── record_transaction: log it, draw down its bucket, pay the logging XP ───
-- Spending comes out of the matching envelope (wants → wants, else needs),
-- floored at zero: the bucket is a budget, not a bank balance. Income is not
-- added to any bucket here — that happens when you accept a split.
create function public.record_transaction(
  p_amount bigint, p_direction public.money_direction, p_category text, p_tag public.money_tag,
  p_spend_level public.spend_level, p_item_id uuid, p_note text, p_at timestamptz, p_xp jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tx_id uuid;
begin
  insert into public.transactions (amount, direction, category, tag, spend_level, item_id, note, at)
    values (p_amount, p_direction, p_category, p_tag, p_spend_level, p_item_id, p_note, coalesce(p_at, now()))
    returning id into tx_id;

  if p_direction = 'out' then
    update public.buckets
      set balance = greatest(0, balance - p_amount)
      where name = (case when p_tag = 'want' then 'wants' else 'needs' end)::public.bucket_name;
  end if;

  perform public.award_xp(p_xp);
  return tx_id;
end;
$$;

-- ─── apply_split: move an accepted split into the buckets, once ─────────────
-- The guard is the UPDATE: only an income row not yet split can be claimed,
-- so a retried "accept" can't add the money twice.
create function public.apply_split(p_transaction_id uuid, p_amounts jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  income bigint;
  total bigint;
begin
  select coalesce(sum(value::bigint), 0) into total from jsonb_each_text(p_amounts);

  update public.transactions
    set split_applied_at = now()
    where id = p_transaction_id and direction = 'in' and split_applied_at is null
    returning amount into income;

  if income is null then
    return case
      when exists (select 1 from public.transactions where id = p_transaction_id and split_applied_at is not null)
        then 'already_applied'
      else 'not_found'
    end;
  end if;

  if total <> income then
    raise exception 'split must add up to the income (% ≠ %)', total, income using errcode = 'check_violation';
  end if;

  insert into public.buckets (name, balance)
    select key::public.bucket_name, value::bigint
    from jsonb_each_text(p_amounts)
    where value::bigint > 0
  on conflict (user_id, name) do update set balance = public.buckets.balance + excluded.balance;
  return 'applied';
end;
$$;

-- ─── save_identity: add a "Who I'm becoming" version, optionally switch to it
create function public.save_identity(p_name text, p_text text, p_activate boolean)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  -- Deactivate first: the one-active unique index would reject two at once.
  if p_activate then
    update public.identity_profiles set is_active = false where is_active;
  end if;
  insert into public.identity_profiles (name, text, is_active)
    values (p_name, p_text, p_activate)
    returning id into new_id;
  return new_id;
end;
$$;

create function public.activate_identity(p_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.identity_profiles where id = p_id) then
    return false;
  end if;
  update public.identity_profiles set is_active = false where is_active and id <> p_id;
  update public.identity_profiles set is_active = true where id = p_id;
  return true;
end;
$$;

revoke all on function public.record_slip(uuid, text, text, boolean, public.mode) from public, anon;
revoke all on function public.record_transaction(bigint, public.money_direction, text, public.money_tag, public.spend_level, uuid, text, timestamptz, jsonb) from public, anon;
revoke all on function public.apply_split(uuid, jsonb) from public, anon;
revoke all on function public.save_identity(text, text, boolean) from public, anon;
revoke all on function public.activate_identity(uuid) from public, anon;
grant execute on function public.record_slip(uuid, text, text, boolean, public.mode) to authenticated;
grant execute on function public.record_transaction(bigint, public.money_direction, text, public.money_tag, public.spend_level, uuid, text, timestamptz, jsonb) to authenticated;
grant execute on function public.apply_split(uuid, jsonb) to authenticated;
grant execute on function public.save_identity(text, text, boolean) to authenticated;
grant execute on function public.activate_identity(uuid) to authenticated;
