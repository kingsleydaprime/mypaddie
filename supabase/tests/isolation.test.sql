-- Isolation between users, checked across the whole schema rather than table
-- by table: a new table or function that forgets RLS or leaks to anon fails
-- here even if nobody wrote a test for it.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(10);

-- 1. Row-level security on every public table.
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'every public table has row-level security on');

-- 2. Nothing in public is granted to anon (signed-out visitors).
select is_empty($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
$$, 'anon has no table privileges at all');

-- 3. Every policy for signed-in users is tied to the caller.
select is_empty($$
  select tablename || '.' || policyname from pg_policies
  where schemaname = 'public'
    and coalesce(qual, '') not like '%auth.uid()%'
    and coalesce(with_check, '') not like '%auth.uid()%'
$$, 'every policy checks auth.uid()');

-- 4. Every table with a user_id has policies (RLS on with none = locked, which is fine, but should be deliberate).
select is_empty($$
  select c.table_name from information_schema.columns c
  where c.table_schema = 'public' and c.column_name = 'user_id'
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name)
$$, 'every table with user_id has owner policies');

-- 5. Signed-out callers can run only the functions meant for them.
select bag_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not like 'pgtap%'
$$, $$ values ('claim_invite'), ('signup_settings') $$, 'anon can execute only claim_invite and signup_settings');

-- 6. The private schema is invisible to API roles.
select ok(not has_schema_privilege('anon', 'private', 'usage') and not has_schema_privilege('authenticated', 'private', 'usage'),
  'the private schema is closed to anon and authenticated');

-- 7. Every SECURITY DEFINER function pins its search_path (no hijacking via a user-created schema object).
select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
$$, 'every security definer function sets search_path');

-- 8. A second user sees none of the first's rows, in any table, after a realistic day.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com');
insert into public.items (user_id, tier, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'goal', 'A goal');
insert into public.tasks (id, user_id, title, base_xp) values ('cccccccc-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A task', 10);
insert into public.task_pillars (task_id, user_id, pillar, weight) values ('cccccccc-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mental', 100);
insert into public.xp_log (user_id, task_id, pillar, amount, reason) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-00000000000a', 'mental', 10, 'completion');
insert into public.transactions (user_id, amount, direction, category, tag) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 500, 'out', 'food', 'need');
insert into public.memories (user_id, category, text) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fact', 'secret');
insert into public.settings (user_id, key, value) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'profile', '{"displayName":"A"}');
insert into public.fun_activities (user_id, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Beach');
insert into public.promises (user_id, person, what) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ada', 'Notes');
insert into public.commitments (user_id, kind, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'team', 'Striker');

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
create temp table seen (tbl text, n bigint) on commit drop;
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.table_privileges p on p.table_schema = c.table_schema and p.table_name = c.table_name
      and p.grantee = 'authenticated' and p.privilege_type = 'SELECT'
    where c.table_schema = 'public' and c.column_name = 'user_id'
  loop
    execute format('insert into seen select %L, count(*) from public.%I where user_id <> auth.uid()', t, t);
  end loop;
end;
$$;
select cmp_ok((select count(*)::int from seen), '>=', 30, 'the check really walked the schema (30+ tables)');
select is_empty($$ select tbl from seen where n > 0 $$, 'user B sees zero of user A''s rows in every readable table');
reset role;
-- And the check can fail: as A, A's own rows are counted.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select cmp_ok((select count(*)::int from public.tasks where user_id = auth.uid()), '>', 0, 'sanity: A does see their own rows, so zero for B means something');

select * from finish();
rollback;
