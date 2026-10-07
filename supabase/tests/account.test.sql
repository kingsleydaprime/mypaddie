-- Deleting your account removes everything of yours and nothing of anyone else's; rate limits count per user.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(8);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'leaving@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'staying@example.com');
insert into public.tasks (id, user_id, title, base_xp) values
  ('cccccccc-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Mine', 10),
  ('cccccccc-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Theirs', 10);
insert into public.task_pillars (task_id, user_id, pillar, weight) values ('cccccccc-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mental', 100);
insert into public.xp_log (user_id, task_id, pillar, amount, reason) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-00000000000a', 'mental', 10, 'completion');
insert into public.transactions (user_id, amount, direction, category, tag) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500, 'out', 'food', 'need');
insert into public.settings (user_id, key, value) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'profile', '{}');
insert into public.invites (code, created_by) values ('LEAVEXYZ', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.user_plans (user_id, plan) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'plus');
insert into private.nudges (user_id, kind, level, day, sent_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'brief', 1, current_date, now());

set local role anon;
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'signed out: can''t delete anything');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select ok(public.rate_hit('mcp', 2, 600), 'first call allowed');
select ok(public.rate_hit('mcp', 2, 600), 'second allowed');
select ok(not public.rate_hit('mcp', 2, 600), 'third over the limit');
select lives_ok($$select public.delete_my_account()$$, 'deleting your own account');
reset role;

select is((select count(*)::int from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'the account is gone');
create temp table leftovers (tbl text, n bigint);
do $$
declare t record;
begin
  for t in
    select c.table_schema, c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'private') and c.column_name in ('user_id', 'created_by')
  loop
    execute format('insert into leftovers select %L, count(*) from %I.%I where %I = %L',
      t.table_schema || '.' || t.table_name, t.table_schema, t.table_name,
      (select column_name from information_schema.columns where table_schema = t.table_schema and table_name = t.table_name and column_name in ('user_id', 'created_by') limit 1),
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  end loop;
end;
$$;
select is_empty($$ select tbl from leftovers where n > 0 $$, 'nothing of theirs is left, in any table');
select is((select title from public.tasks where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'Theirs', 'other people''s data untouched');

select * from finish();
rollback;
