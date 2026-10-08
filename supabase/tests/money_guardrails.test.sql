-- Caps (one per category, any case), bills paid once per due date, loans that
-- move the balance but never count as income or spending, and debts that
-- can't be overpaid.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sam@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ── caps ────────────────────────────────────────────────────────────────────
insert into public.spending_caps (category, monthly_cap) values ('Food', 40000);
select throws_ok($$insert into public.spending_caps (category, monthly_cap) values (' food ', 1000)$$,
  '23505', null, 'one cap per category, any case');
select throws_ok($$insert into public.spending_caps (category, monthly_cap) values ('Data', 0)$$,
  '23514', null, 'a cap is more than zero');

-- ── bills ───────────────────────────────────────────────────────────────────
insert into public.buckets (name, balance) values ('needs', 20000);
insert into public.bills (id, title, amount, category, every, anchor_on, next_due)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Data', 5000, 'Data', 'month', '2026-10-10', '2026-10-10');

select is(
  public.pay_bill('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-10', '2026-11-10', 5000, '2026-10-09 10:00:00+00',
    '[{"pillar":"financial","amount":2,"reason":"transaction_logged"}]')->>'result',
  'paid', 'a bill is paid');
select is((select next_due::text from public.bills), '2026-11-10', 'it moves to next month');
select is((select category || '|' || tag || '|' || note from public.transactions where kind = 'normal'), 'Data|need|Bill: Data', 'the spend is logged as a need in its category');
select is((select balance::int from public.buckets where name = 'needs'), 15000, 'the needs bucket pays it');
select is(
  public.pay_bill('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-10', '2026-11-10', 5000, now(), '[]')->>'result',
  'already_paid', 'a second tap for the same due date pays nothing');
select is((select count(*)::int from public.transactions), 1, 'still one transaction');
update public.bills set status = 'paused';
select is(
  public.pay_bill('aaaaaaaa-0000-0000-0000-000000000001', '2026-11-10', '2026-12-10', 5000, now(), '[]')->>'result',
  'paused', 'a paused bill isn''t paid');

-- A one-off payment (a course fee): paid once, then it's finished.
insert into public.bills (id, title, amount, category, every, anchor_on, next_due)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'Course fee', 50000, 'School', 'once', '2026-11-01', '2026-11-01');
select is(
  public.pay_bill('aaaaaaaa-0000-0000-0000-000000000002', '2026-11-01', '2026-11-01', 50000, now(), '[]')->>'result',
  'paid', 'a one-off payment is paid');
select is((select status from public.bills where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 'ended', 'and then it''s finished');
select is(
  public.pay_bill('aaaaaaaa-0000-0000-0000-000000000002', '2026-11-01', '2026-11-01', 50000, now(), '[]')->>'result',
  'ended', 'it can''t be paid twice');

-- ── debts ───────────────────────────────────────────────────────────────────
select public.add_debt('Tobi', null, 'i_owe', 10000, 'Rent top-up', '2026-10-20', true, now()) as tobi \gset
select is((select direction || '|' || kind || '|' || amount from public.transactions where category = 'Loan: Tobi'), 'in|loan|10000',
  'borrowing brings money in, as a loan');
select is((select tag from public.transactions where category = 'Loan: Tobi'), null, 'a loan is never tagged');

select is(public.record_debt_payment(:'tobi', 4000, true, now())->>'left', '6000', 'a partial payment');
select is(public.record_debt_payment(:'tobi', 6001, true, now())->>'result', 'more_than_owed', 'can''t pay back more than is left');
select is(public.record_debt_payment(:'tobi', 6000, true, now())->>'result', 'settled', 'the rest settles it');
select is((select status from public.debts where id = :'tobi'), 'settled', 'the debt is settled');
select is(
  (select sum(case when direction = 'in' then amount else -amount end)::int from public.transactions where kind = 'loan' and category = 'Loan: Tobi'),
  0, 'borrowed and repaid nets to zero');
select is(public.record_debt_payment(:'tobi', 1, true, now())->>'result', 'not_open', 'a settled debt takes nothing more');

select public.add_debt('Ada', null, 'owed_to_me', 5000, null, null, false, now()) as ada \gset
select is((select count(*)::int from public.transactions where category = 'Loan: Ada'), 0, 'recording an old loan can skip moving money');

-- Someone else's debt is invisible.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is(public.record_debt_payment(:'ada', 100, true, now())->>'result', 'not_found', 'another user''s debt is invisible');

select * from finish();
rollback;
