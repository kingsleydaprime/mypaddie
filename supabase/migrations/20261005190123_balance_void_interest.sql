-- Real balance, voiding mistakes, editable narration, and purchase interest.

-- ─── Transaction kinds ──────────────────────────────────────────────────────
-- 'normal'     everyday money in/out: counts for the audit, stage and flags
-- 'opening'    the balance you already had when you started
-- 'adjustment' a correction so the balance matches your real account
-- Opening and adjustment entries affect the balance only — never income,
-- needs or wants, so they can't distort the deficit/surplus picture.
alter table public.transactions
  add column kind text not null default 'normal' check (kind in ('normal', 'opening', 'adjustment')),
  add column voided_at timestamptz,
  add column void_reason text check (length(void_reason) <= 200);

alter table public.transactions drop constraint tag_only_on_outflows;
alter table public.transactions add constraint tag_only_on_normal_outflows
  check (kind <> 'normal' or ((direction = 'out') = (tag is not null)));
alter table public.transactions add constraint balance_entries_untagged
  check (kind = 'normal' or tag is null);

create index transactions_user_live_idx on public.transactions (user_id, at desc) where voided_at is null;

-- ─── void_transaction: undo a mistake without erasing it ────────────────────
-- Marks it void (it stays on the record), puts drawn-down money back in its
-- bucket, and takes back the logging XP — otherwise log-then-void would be
-- free XP. Income that's already been split into buckets can't be voided here.
create function public.void_transaction(p_id uuid, p_reason text, p_xp_reversal jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tx public.transactions%rowtype;
begin
  select * into tx from public.transactions where id = p_id for update;
  if not found then return 'not_found'; end if;
  if tx.voided_at is not null then return 'already_voided'; end if;
  if tx.direction = 'in' and tx.split_applied_at is not null then return 'split_applied'; end if;

  update public.transactions set voided_at = now(), void_reason = nullif(trim(p_reason), '') where id = p_id;

  if tx.kind = 'normal' then
    if tx.direction = 'out' then
      update public.buckets
        set balance = balance + tx.amount
        where name = (case when tx.tag = 'want' then 'wants' else 'needs' end)::public.bucket_name;
    end if;
    perform public.award_xp(p_xp_reversal);
  end if;
  return 'voided';
end;
$$;

revoke all on function public.void_transaction(uuid, text, jsonb) from public, anon;
grant execute on function public.void_transaction(uuid, text, jsonb) to authenticated;

-- ─── Purchase checks: change your mind, keep the record ─────────────────────
alter table public.purchase_checks
  add column interest text not null default 'interested' check (interest in ('interested', 'not_interested', 'bought')),
  add column interest_changed_at timestamptz;
