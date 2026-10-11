-- Money amounts: bigint whole naira → numeric(15,2) to support kobo/decimal
-- amounts. This covers every money column: transactions, buckets, items
-- (floor/comfortable), purchase_checks, spending_caps, bills, debts, and
-- debt_payments. The RPCs that cast to bigint are replaced.
--
-- All existing integer values cast exactly (42000 → 42000.00), so no data
-- is lost or changed. The check constraints are kept identical, just on the
-- new type.

-- ─── Core money tables ───────────────────────────────────────────────────────

alter table public.transactions
  alter column amount type numeric(15,2) using amount::numeric(15,2);

alter table public.buckets
  alter column balance type numeric(15,2) using balance::numeric(15,2);

-- Items: monthly budget figures for needs.
alter table public.items
  alter column floor_amount type numeric(15,2) using floor_amount::numeric(15,2),
  alter column comfortable_amount type numeric(15,2) using comfortable_amount::numeric(15,2);

-- Purchase checks: the price asked about.
alter table public.purchase_checks
  alter column price type numeric(15,2) using price::numeric(15,2);

-- ─── Guardrail tables ────────────────────────────────────────────────────────

alter table public.spending_caps
  alter column monthly_cap type numeric(15,2) using monthly_cap::numeric(15,2);

alter table public.bills
  alter column amount type numeric(15,2) using amount::numeric(15,2);

alter table public.debts
  alter column amount type numeric(15,2) using amount::numeric(15,2);

alter table public.debt_payments
  alter column amount type numeric(15,2) using amount::numeric(15,2);

-- ─── Replace record_transaction (bigint → numeric) ───────────────────────────
-- Revoke the old signature first; the new one gets the same grants.

revoke all on function public.record_transaction(bigint, public.money_direction, text, public.money_tag, public.spend_level, uuid, text, timestamptz, jsonb) from public, anon, authenticated;
drop function public.record_transaction(bigint, public.money_direction, text, public.money_tag, public.spend_level, uuid, text, timestamptz, jsonb);

create function public.record_transaction(
  p_amount numeric, p_direction public.money_direction, p_category text, p_tag public.money_tag,
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

revoke all on function public.record_transaction(numeric, public.money_direction, text, public.money_tag, public.spend_level, uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.record_transaction(numeric, public.money_direction, text, public.money_tag, public.spend_level, uuid, text, timestamptz, jsonb) to authenticated;

-- ─── Replace apply_split (bigint casts → numeric) ────────────────────────────

drop function public.apply_split(uuid, jsonb);

create function public.apply_split(p_transaction_id uuid, p_amounts jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  income numeric;
  total  numeric;
begin
  select coalesce(sum(value::numeric), 0) into total from jsonb_each_text(p_amounts);

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
    select key::public.bucket_name, value::numeric
    from jsonb_each_text(p_amounts)
    where value::numeric > 0
  on conflict (user_id, name) do update set balance = public.buckets.balance + excluded.balance;
  return 'applied';
end;
$$;

revoke all on function public.apply_split(uuid, jsonb) from public, anon;
grant execute on function public.apply_split(uuid, jsonb) to authenticated;

-- ─── Replace pay_bill (bigint → numeric) ─────────────────────────────────────

revoke all on function public.pay_bill(uuid, date, date, bigint, timestamptz, jsonb) from public, anon, authenticated;
drop function public.pay_bill(uuid, date, date, bigint, timestamptz, jsonb);

create function public.pay_bill(
  p_bill_id uuid, p_for_due date, p_next_due date, p_amount numeric, p_at timestamptz, p_xp jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b public.bills%rowtype;
  tx_id uuid;
begin
  update public.bills
    set next_due = p_next_due, last_paid_at = coalesce(p_at, now())
    where id = p_bill_id and next_due = p_for_due and status = 'active'
    returning * into b;
  if not found then
    select * into b from public.bills where id = p_bill_id;
    return jsonb_build_object('result', case when b.id is null then 'not_found'
                                             when b.status <> 'active' then b.status
                                             else 'already_paid' end);
  end if;
  tx_id := public.record_transaction(
    p_amount, 'out', b.category, b.tag, null, b.item_id, 'Bill: ' || b.title, p_at, p_xp);
  return jsonb_build_object('result', 'paid', 'transaction_id', tx_id);
end;
$$;

revoke all on function public.pay_bill(uuid, date, date, numeric, timestamptz, jsonb) from public, anon;
grant execute on function public.pay_bill(uuid, date, date, numeric, timestamptz, jsonb) to authenticated;

-- ─── Replace add_debt (bigint → numeric) ─────────────────────────────────────

revoke all on function public.add_debt(text, uuid, text, bigint, text, date, boolean, timestamptz) from public, anon, authenticated;
drop function public.add_debt(text, uuid, text, bigint, text, date, boolean, timestamptz);

create function public.add_debt(
  p_person text, p_person_id uuid, p_direction text, p_amount numeric, p_reason text, p_due_on date,
  p_money_moved boolean, p_at timestamptz
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  debt_id uuid;
begin
  insert into public.debts (person, person_id, direction, amount, reason, due_on)
    values (trim(p_person), p_person_id, p_direction, p_amount, nullif(trim(p_reason), ''), p_due_on)
    returning id into debt_id;
  if p_money_moved then
    insert into public.transactions (amount, direction, category, kind, note, at)
      values (p_amount, case when p_direction = 'i_owe' then 'in' else 'out' end::public.money_direction,
              'Loan: ' || trim(p_person), 'loan', nullif(trim(p_reason), ''), coalesce(p_at, now()));
  end if;
  return debt_id;
end;
$$;

revoke all on function public.add_debt(text, uuid, text, numeric, text, date, boolean, timestamptz) from public, anon;
grant execute on function public.add_debt(text, uuid, text, numeric, text, date, boolean, timestamptz) to authenticated;

-- ─── Replace record_debt_payment (bigint → numeric) ──────────────────────────

revoke all on function public.record_debt_payment(uuid, bigint, boolean, timestamptz) from public, anon, authenticated;
drop function public.record_debt_payment(uuid, bigint, boolean, timestamptz);

create function public.record_debt_payment(p_debt_id uuid, p_amount numeric, p_money_moved boolean, p_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d public.debts%rowtype;
  paid  numeric;
  tx_id uuid;
begin
  select * into d from public.debts where id = p_debt_id for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if d.status <> 'open' then return jsonb_build_object('result', 'not_open', 'status', d.status); end if;
  select coalesce(sum(amount), 0) into paid from public.debt_payments where debt_id = p_debt_id;
  if p_amount > d.amount - paid then
    return jsonb_build_object('result', 'more_than_owed', 'left', d.amount - paid);
  end if;

  if p_money_moved then
    insert into public.transactions (amount, direction, category, kind, at)
      values (p_amount, case when d.direction = 'i_owe' then 'out' else 'in' end::public.money_direction,
              'Loan: ' || d.person, 'loan', coalesce(p_at, now()))
      returning id into tx_id;
  end if;
  insert into public.debt_payments (debt_id, amount, at, transaction_id)
    values (p_debt_id, p_amount, coalesce(p_at, now()), tx_id);

  if paid + p_amount = d.amount then
    update public.debts set status = 'settled', closed_at = coalesce(p_at, now()) where id = p_debt_id;
  end if;
  return jsonb_build_object('result', case when paid + p_amount = d.amount then 'settled' else 'paid' end,
                            'left', d.amount - paid - p_amount);
end;
$$;

revoke all on function public.record_debt_payment(uuid, numeric, boolean, timestamptz) from public, anon;
grant execute on function public.record_debt_payment(uuid, numeric, boolean, timestamptz) to authenticated;

-- ─── Fun activities cost ─────────────────────────────────────────────────────
alter table public.fun_activities
  alter column cost type numeric(15,2) using cost::numeric(15,2);
