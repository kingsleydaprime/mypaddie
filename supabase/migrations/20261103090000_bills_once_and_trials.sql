-- Bills grow two shapes: a payment due once (a course fee, a deposit), and a
-- subscription on a free trial (keep or cancel before the first charge).

-- Once: paid, and done. Paying it closes the bill instead of moving it on.
alter table public.bills drop constraint bills_every_check;
alter table public.bills add constraint bills_every_check check (every in ('once', 'week', 'month', 'year'));

-- A free trial: the first charge is due when it ends; a "keep or cancel?" task
-- comes a couple of days before.
alter table public.bills
  add column trial_ends_on date,
  add column trial_task_id uuid,
  add foreign key (trial_task_id, user_id) references public.tasks (id, user_id) on delete set null (trial_task_id);
create index bills_trial_task_user_idx on public.bills (trial_task_id, user_id);

create or replace function public.pay_bill(
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
    set next_due = p_next_due, last_paid_at = coalesce(p_at, now()),
        -- A one-off payment is finished once it's paid.
        status = case when every = 'once' then 'ended' else status end
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
