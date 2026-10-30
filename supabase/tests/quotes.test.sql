-- Quotes: their own, private, no blanks, no repeats (any case).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(5);
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sam@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ada@example.com');

insert into public.quotes (user_id, text, author) values ('11111111-1111-1111-1111-111111111111', 'Keep going.', 'Mum');
select throws_ok($$insert into public.quotes (user_id, text) values ('11111111-1111-1111-1111-111111111111', '  keep going.  ')$$,
  '23505', null, 'the same quote twice (any case) is refused');
select throws_ok($$insert into public.quotes (user_id, text) values ('11111111-1111-1111-1111-111111111111', '   ')$$,
  '23514', null, 'a blank quote is refused');
select lives_ok($$insert into public.quotes (user_id, text) values ('22222222-2222-2222-2222-222222222222', 'Keep going.')$$,
  'someone else can save the same quote');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.quotes), 1, 'they see only their own quotes');
select is_empty($$delete from public.quotes where user_id = '11111111-1111-1111-1111-111111111111' returning id$$, 'and can''t delete anyone else''s');

select * from finish();
rollback;
