begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select lives_ok($$insert into public.transactions (amount, direction, category, kind) values (85000, 'in', 'Opening balance', 'opening')$$,
  'an opening balance needs no tag');
select throws_ok($$insert into public.transactions (amount, direction, category, kind, tag) values (100, 'out', 'x', 'adjustment', 'want')$$,
  '23514', null, 'balance entries are never tagged need/want');
select throws_ok($$insert into public.transactions (amount, direction, category) values (100, 'out', 'snacks')$$,
  '23514', null, 'normal outflows still need a tag');

insert into public.buckets (name, balance) values ('wants', 10000), ('needs', 5000);
create temp table tx as select public.record_transaction(3000, 'out', 'snacks', 'want', null, null, null, null,
  '[{"pillar":"financial","amount":2,"reason":"transaction_logged"}]') as id;
select is((select balance from public.buckets where name = 'wants'), 7000::bigint, 'logging drew down the wants bucket');

select is(public.void_transaction((select id from tx), 'logged twice by mistake', '[{"pillar":"financial","amount":-2,"reason":"transaction_logged","note":"voided"}]'),
  'voided', 'voids a mistake');
select is((select balance from public.buckets where name = 'wants'), 10000::bigint, 'the money goes back in its bucket');
select is((select xp from public.pillars where name = 'financial'), 0::bigint, 'the logging XP is taken back');
select is((select void_reason from public.transactions where id = (select id from tx)), 'logged twice by mistake', 'it stays on the record, with the reason');
select is(public.void_transaction((select id from tx), null, '[]'), 'already_voided', 'voiding twice changes nothing');

insert into public.transactions (id, amount, direction, category, split_applied_at)
  values ('cccccccc-0000-0000-0000-000000000001', 50000, 'in', 'salary', now());
select is(public.void_transaction('cccccccc-0000-0000-0000-000000000001', null, '[]'), 'split_applied', 'income already split into buckets can''t be voided here');

insert into public.purchase_checks (id, item, price, verdict) values ('dddddddd-0000-0000-0000-000000000001', 'Speaker', 45000, 'wait_24h');
update public.purchase_checks set interest = 'not_interested', interest_changed_at = now() where id = 'dddddddd-0000-0000-0000-000000000001';
select is((select interest from public.purchase_checks), 'not_interested', 'a purchase check can be marked not interested, and kept');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is(public.void_transaction('cccccccc-0000-0000-0000-000000000001', null, '[]'), 'not_found', 'another user can''t void your transactions');

select * from finish();
rollback;
