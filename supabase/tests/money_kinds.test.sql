-- Money in isn't always income; a spend's tag can change and its bucket follows.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(12);
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sam@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ada@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.buckets (name, balance) values ('wants', 10000), ('needs', 5000);

-- Kinds
select lives_ok($$insert into public.transactions (amount, direction, category, kind) values (20000, 'in', 'From my GTB', 'moved')$$,
  'money moved in is recorded, untagged');
select lives_ok($$insert into public.transactions (amount, direction, category, kind) values (3000, 'out', 'To my savings account', 'moved')$$,
  'money moved out needs no need/want tag');
select throws_ok($$insert into public.transactions (amount, direction, category, kind) values (500, 'out', 'Shop', 'refund')$$,
  '23514', null, 'a refund can only come in');
select throws_ok($$insert into public.transactions (amount, direction, category, kind, tag) values (500, 'out', 'x', 'moved', 'want')$$,
  '23514', null, 'money moved is never tagged');

-- Splits: only real income
create temp table moved as select id from public.transactions where category = 'From my GTB';
select is(public.apply_split((select id from moved), '{"savings": 20000}'), 'not_found', 'money moved in can''t be split into buckets');
insert into public.transactions (amount, direction, category) values (10000, 'in', 'Salary');
select is(public.apply_split((select id from public.transactions where category = 'Salary'), '{"savings": 10000}'), 'applied', 'income still can');

-- Retag
create temp table spend as select public.record_transaction(4000, 'out', 'shawarma', 'want', null, null, null, null, '[]') as id;
select is((select balance from public.buckets where name = 'wants'), 6000::numeric, 'a want draws from wants');
select is(public.retag_transaction((select id from spend), 'need'), 'retagged', 'want → need');
select is((select balance from public.buckets where name = 'wants'), 10000::numeric, 'the money goes back to wants');
select is((select balance from public.buckets where name = 'needs'), 1000::numeric, 'and comes out of needs');
select is(public.retag_transaction((select id from moved), 'want'), 'not_spending', 'money moved has no tag to change');

-- Someone else's entry is invisible, so it can't be retagged
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(public.retag_transaction((select id from spend), 'want'), 'not_found', 'nobody else can retag your spend');

select * from finish();
rollback;
