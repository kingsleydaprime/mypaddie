-- Money guardrails: spending caps per category, recurring bills, and money
-- owed either way (lent and borrowed).

-- ─── Spending caps: "food: 40k a month" ─────────────────────────────────────
create table public.spending_caps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (length(trim(category)) between 1 and 60),
  monthly_cap bigint not null check (monthly_cap > 0),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
-- One cap per category, however it's typed.
create unique index spending_caps_per_category on public.spending_caps (user_id, lower(trim(category)));

-- ─── Bills: data, rent, subscriptions ───────────────────────────────────────
-- Each bill keeps its own schedule (the habit engine only knows daily and
-- weekly) and one open "Pay: …" task for its next due date, which carries the
-- reminder ladder. Paying moves next_due on and makes the next task.
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  amount bigint not null check (amount > 0),
  category text not null check (length(trim(category)) between 1 and 60),
  tag public.money_tag not null default 'need',
  every text not null check (every in ('week', 'month', 'year')),
  -- The first due date: monthly/yearly bills keep its day of the month.
  anchor_on date not null,
  next_due date not null,
  item_id uuid,
  task_id uuid,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  last_paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete set null (item_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  constraint bill_due_after_anchor check (next_due >= anchor_on)
);
create unique index bills_per_title on public.bills (user_id, lower(trim(title))) where status <> 'ended';
create index bills_user_due_idx on public.bills (user_id, status, next_due);
create index bills_item_user_idx on public.bills (item_id, user_id);
create index bills_task_user_idx on public.bills (task_id, user_id);

-- ─── Money owed: lent and borrowed ──────────────────────────────────────────
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person text not null check (length(trim(person)) between 1 and 100),
  person_id uuid,
  -- i_owe: they lent me money. owed_to_me: I lent them money.
  direction text not null check (direction in ('i_owe', 'owed_to_me')),
  amount bigint not null check (amount > 0),
  reason text check (length(reason) <= 300),
  due_on date,
  status text not null default 'open' check (status in ('open', 'settled', 'forgiven')),
  closed_at timestamptz,
  -- "Pay Tobi back" (or "Ask Ada about the 5k") on its due date.
  task_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (person_id, user_id) references public.people (id, user_id) on delete set null (person_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  constraint debt_closed_at_matches_status check ((status = 'open') = (closed_at is null))
);
create index debts_user_status_idx on public.debts (user_id, status, due_on);
create index debts_person_user_idx on public.debts (person_id, user_id);
create index debts_task_user_idx on public.debts (task_id, user_id);

-- Loans move real money but are neither income nor spending: a 'loan'
-- transaction changes the balance, never the money stage, buckets or XP.
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('normal', 'opening', 'adjustment', 'loan'));
-- For the composite foreign key below (a payment can only point at your own transaction).
alter table public.transactions add constraint transactions_id_user_key unique (id, user_id);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  debt_id uuid not null,
  amount bigint not null check (amount > 0),
  at timestamptz not null default now(),
  transaction_id uuid,
  unique (id, user_id),
  foreign key (debt_id, user_id) references public.debts (id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete set null (transaction_id)
);
create index debt_payments_debt_user_idx on public.debt_payments (debt_id, user_id);
create index debt_payments_tx_user_idx on public.debt_payments (transaction_id, user_id);

do $$
declare
  t text;
begin
  foreach t in array array['spending_caps', 'bills', 'debts', 'debt_payments'] loop
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

-- ─── pay_bill: one payment per due date, atomically ─────────────────────────
-- Compare-and-set on next_due: a second tap (or a retried call) for the same
-- due date finds it already moved on and pays nothing. The spend goes through
-- record_transaction, so the bucket and logging XP behave like any spend.
create function public.pay_bill(
  p_bill_id uuid, p_for_due date, p_next_due date, p_amount bigint, p_at timestamptz, p_xp jsonb
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
revoke all on function public.pay_bill(uuid, date, date, bigint, timestamptz, jsonb) from public, anon;
grant execute on function public.pay_bill(uuid, date, date, bigint, timestamptz, jsonb) to authenticated;

-- ─── add_debt / record_debt_payment: the record and the money move together ─
create function public.add_debt(
  p_person text, p_person_id uuid, p_direction text, p_amount bigint, p_reason text, p_due_on date,
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
  -- Borrowing brings money in; lending sends it out.
  if p_money_moved then
    insert into public.transactions (amount, direction, category, kind, note, at)
      values (p_amount, case when p_direction = 'i_owe' then 'in' else 'out' end::public.money_direction,
              'Loan: ' || trim(p_person), 'loan', nullif(trim(p_reason), ''), coalesce(p_at, now()));
  end if;
  return debt_id;
end;
$$;
revoke all on function public.add_debt(text, uuid, text, bigint, text, date, boolean, timestamptz) from public, anon;
grant execute on function public.add_debt(text, uuid, text, bigint, text, date, boolean, timestamptz) to authenticated;

create function public.record_debt_payment(p_debt_id uuid, p_amount bigint, p_money_moved boolean, p_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d public.debts%rowtype;
  paid bigint;
  tx_id uuid;
begin
  select * into d from public.debts where id = p_debt_id for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if d.status <> 'open' then return jsonb_build_object('result', 'not_open', 'status', d.status); end if;
  select coalesce(sum(amount), 0) into paid from public.debt_payments where debt_id = p_debt_id;
  if p_amount > d.amount - paid then
    return jsonb_build_object('result', 'more_than_owed', 'left', d.amount - paid);
  end if;

  -- Paying back sends money out; being paid back brings it in.
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
revoke all on function public.record_debt_payment(uuid, bigint, boolean, timestamptz) from public, anon;
grant execute on function public.record_debt_payment(uuid, bigint, boolean, timestamptz) to authenticated;
