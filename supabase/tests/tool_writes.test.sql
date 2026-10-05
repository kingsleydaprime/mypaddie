begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(17);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ── record_slip ────────────────────────────────────────────────────────────
insert into public.tasks (id, title) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Gym');
select isnt(public.record_slip('bbbbbbbb-0000-0000-0000-000000000001', 'I was tired.', 'tired', true, 'curious'),
  null, 'records a slip');
select is((select status::text from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'skipped',
  'and marks the task skipped');
select is((select why_category from public.slips), 'tired', 'keeps the category');
select throws_ok($$select public.record_slip('99999999-0000-0000-0000-000000000000', 'x', null, true, null)$$,
  '23503', null, 'a slip on a task that isn''t yours (or doesn''t exist) fails');

-- ── record_transaction ─────────────────────────────────────────────────────
insert into public.buckets (name, balance) values ('wants', 30000), ('needs', 50000);
select isnt(public.record_transaction(12000, 'out', 'snacks', 'want', null, null, null, null,
  '[{"pillar":"financial","amount":2,"reason":"transaction_logged"}]'), null, 'logs a spend');
select is((select balance from public.buckets where name = 'wants'), 18000::bigint, 'a want draws down the wants bucket');
select is((select xp from public.pillars where name = 'financial'), 2::bigint, 'and pays the logging XP');
select lives_ok($$select public.record_transaction(40000, 'out', 'shoes', 'want', null, null, null, null, '[]')$$,
  'overspending the bucket still logs (honest logging always works)');
select is((select balance from public.buckets where name = 'wants'), 0::bigint, 'the bucket floors at zero');
select lives_ok($$select public.record_transaction(5000, 'out', 'data', 'unsure', null, null, null, null, '[]')$$,
  'unsure counts as a need');
select is((select balance from public.buckets where name = 'needs'), 45000::bigint, '…and comes out of the needs bucket');

-- ── apply_split ────────────────────────────────────────────────────────────
insert into public.transactions (id, amount, direction, category)
  values ('cccccccc-0000-0000-0000-000000000001', 100000, 'in', 'salary');
select throws_ok(
  $$select public.apply_split('cccccccc-0000-0000-0000-000000000001', '{"needs":50000,"savings":40000}')$$,
  '23514', null, 'a split that doesn''t add up to the income is rejected');
select is(
  public.apply_split('cccccccc-0000-0000-0000-000000000001', '{"needs":50000,"buffer":20000,"savings":15000,"wants":9000,"flexible":6000}'),
  'applied', 'an exact split is applied');
select is((select balance from public.buckets where name = 'needs'), 95000::bigint, 'buckets are topped up, not replaced');
select is(
  public.apply_split('cccccccc-0000-0000-0000-000000000001', '{"needs":100000}'),
  'already_applied', 'the same income can''t be split twice');

-- ── identity ───────────────────────────────────────────────────────────────
select lives_ok($$select public.save_identity('v1', 'calm', true); select public.save_identity('v2', 'bold', true)$$,
  'saving an active version deactivates the old one');
select is((select string_agg(name, ',') from public.identity_profiles where is_active), 'v2', 'only the newest is active');

select * from finish();
rollback;
