-- 20261114090000_money_decimal_amounts recreated pay_bill (bigint → numeric)
-- from the older 20261020 copy and dropped 20261103's rule: a one-off payment
-- (every = 'once', e.g. a course fee) ends once it's paid. Restore it.
create or replace function public.pay_bill(
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
revoke all on function public.pay_bill(uuid, date, date, numeric, timestamptz, jsonb) from public, anon;
grant execute on function public.pay_bill(uuid, date, date, numeric, timestamptz, jsonb) to authenticated;

-- Backfill: one-offs paid while the rule was missing. Only pay_bill sets
-- last_paid_at, so an active one-off with one was paid and should have ended.
update public.bills set status = 'ended'
  where every = 'once' and status = 'active' and last_paid_at is not null;
