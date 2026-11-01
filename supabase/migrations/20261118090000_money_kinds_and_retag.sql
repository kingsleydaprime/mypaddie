-- Money in isn't always income, and a spend's tag can be fixed.
--
-- 1. New untagged kinds that change the balance but are neither income nor
--    spending (no audit, buckets, split or logging XP), like 'loan':
--      moved  — money moving in or out of what MyPaddie tracks
--      repaid — a debt paid back to them, logged by hand
--      refund — money given back
--    Existing rows are untouched: everything stays 'normal' unless it already wasn't.
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('normal', 'opening', 'adjustment', 'loan', 'moved', 'repaid', 'refund'));
-- A refund or repaid debt only ever comes in.
alter table public.transactions add constraint transactions_in_only_kinds
  check (kind not in ('repaid', 'refund') or direction = 'in');

-- 2. Only real income can be split into buckets. Before, any 'in' entry
--    could be (an opening balance, a loan). Copied from 20261114090000, the
--    latest definition, with the kind check added.
create or replace function public.apply_split(p_transaction_id uuid, p_amounts jsonb)
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
    where id = p_transaction_id and direction = 'in' and kind = 'normal' and split_applied_at is null
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

-- 3. Change a spend's need/want tag. Its amount goes back to the old bucket
--    and comes out of the new one, as logging it right would have done (need
--    and not-sure share the needs bucket, so nothing moves). Spend level only
--    applies to needs, so it's cleared otherwise. Flags judged at logging
--    time aren't re-judged.
create function public.retag_transaction(p_id uuid, p_tag public.money_tag)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tx public.transactions%rowtype;
  old_bucket public.bucket_name;
  new_bucket public.bucket_name;
begin
  select * into tx from public.transactions where id = p_id for update;
  if not found then return 'not_found'; end if;
  if tx.voided_at is not null then return 'voided'; end if;
  if tx.kind <> 'normal' or tx.direction <> 'out' then return 'not_spending'; end if;
  if tx.tag = p_tag then return 'unchanged'; end if;

  update public.transactions
    set tag = p_tag, spend_level = case when p_tag = 'need' then spend_level else null end
    where id = p_id;

  old_bucket := (case when tx.tag = 'want' then 'wants' else 'needs' end)::public.bucket_name;
  new_bucket := (case when p_tag = 'want' then 'wants' else 'needs' end)::public.bucket_name;
  if old_bucket <> new_bucket then
    update public.buckets set balance = balance + tx.amount where name = old_bucket;
    update public.buckets set balance = greatest(0, balance - tx.amount) where name = new_bucket;
  end if;
  return 'retagged';
end;
$$;
revoke all on function public.retag_transaction(uuid, public.money_tag) from public, anon;
grant execute on function public.retag_transaction(uuid, public.money_tag) to authenticated;
