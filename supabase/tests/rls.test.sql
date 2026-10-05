-- Proves the database enforces what the blueprint promises: only the owner
-- can read their rows, and the core invariants hold even if app code is wrong.
-- Run with: bunx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
-- Find pgTAP wherever it's installed (the CLI's remote runner may put it
-- somewhere not on this connection's search_path) and add that schema.
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';

select plan(22);

-- Two users. Kingsley owns data; the intruder tries to reach it.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');

-- Act as Kingsley: the `authenticated` role with his id in the JWT.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; -- older auth.uid() reads this one

insert into public.items (id, tier, title)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'need', 'Rhapsody');
insert into public.tasks (id, item_id, title, base_xp, due_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'Read Rhapsody', 10, now());
insert into public.task_pillars (task_id, pillar, weight) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'spiritual', 70),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'character', 30);
insert into public.transactions (amount, direction, category, tag)
  values (2500, 'out', 'food', 'need');

-- 1. user_id is filled from the JWT, not trusted from the client.
select is(
  (select user_id from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_id defaults to auth.uid()'
);

-- 2–3. XP ledger feeds pillar totals.
insert into public.xp_log (task_id, pillar, amount, reason) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'spiritual', 7, 'completion'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'character', 3, 'completion');
select is(
  (select xp from public.pillars where name = 'spiritual'), 7::bigint,
  'xp_log insert updates the pillar total'
);
insert into public.xp_log (task_id, pillar, amount, reason)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'spiritual', -4, 'ignored_need');
select is(
  (select xp from public.pillars where name = 'spiritual'), 3::bigint,
  'deductions subtract from the pillar total'
);

-- 4. Idempotency: the same completion can't be paid twice.
select throws_ok(
  $$insert into public.xp_log (task_id, pillar, amount, reason)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'spiritual', 7, 'completion')$$,
  '23505', null,
  'a task cannot earn the same XP twice'
);

-- 5–6. The ledger is append-only and pillars are read-only.
select throws_ok(
  $$update public.xp_log set amount = 1000$$,
  '42501', null,
  'xp_log rows cannot be edited'
);
select throws_ok(
  $$update public.pillars set xp = 99999$$,
  '42501', null,
  'pillar totals cannot be written directly'
);

-- 7–8. Weights must sum to 100, checked at commit (simulated with SET CONSTRAINTS).
select lives_ok(
  $$update public.task_pillars set weight = 60 where pillar = 'spiritual';
    update public.task_pillars set weight = 40 where pillar = 'character';
    set constraints task_pillars_sum_to_100 immediate;
    set constraints task_pillars_sum_to_100 deferred$$,
  'weights can be rebalanced in steps inside one transaction'
);
select throws_ok(
  $$update public.task_pillars set weight = 50 where pillar = 'spiritual';
    set constraints task_pillars_sum_to_100 immediate$$,
  '23514', null,
  'weights that do not sum to 100 are rejected'
);

-- 9. Outflows must be tagged.
select throws_ok(
  $$insert into public.transactions (amount, direction, category) values (100, 'out', 'snacks')$$,
  '23514', null,
  'an untagged outflow is rejected'
);

-- 10. Only one active identity profile.
insert into public.identity_profiles (name, text, is_active) values ('v1', 'calm and direct', true);
select throws_ok(
  $$insert into public.identity_profiles (name, text, is_active) values ('v2', 'bolder', true)$$,
  '23505', null,
  'only one identity profile can be active'
);

-- 11. export_all returns his own data.
select is(
  jsonb_array_length(public.export_all() -> 'items'), 1,
  'export_all returns the owner''s rows'
);

-- ── Now act as the intruder ────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; -- older auth.uid() reads this one

-- 12–17. Can't read anything of Kingsley's.
select is_empty($$select 1 from public.items$$, 'intruder sees no items');
select is_empty($$select 1 from public.tasks$$, 'intruder sees no tasks');
select is_empty($$select 1 from public.task_pillars$$, 'intruder sees no task weights');
select is_empty($$select 1 from public.xp_log$$, 'intruder sees no XP history');
select is_empty($$select 1 from public.pillars$$, 'intruder sees no pillar stats');
select is_empty($$select 1 from public.transactions$$, 'intruder sees no transactions');

-- 18. export_all only ever exports the caller's rows.
select is(
  jsonb_array_length(public.export_all() -> 'items'), 0,
  'export_all returns nothing of another user''s'
);

-- 19. Updates and deletes silently touch zero rows.
select is_empty(
  $$update public.items set title = 'hacked' returning 1$$,
  'intruder cannot update Kingsley''s items'
);

-- 20. Can't write a row claiming to be Kingsley.
select throws_ok(
  $$insert into public.memories (user_id, category, text)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'planted')$$,
  '42501', null,
  'intruder cannot insert rows as another user'
);

-- 21. Can't attach own task to Kingsley's item, even knowing its id.
select throws_ok(
  $$insert into public.tasks (item_id, title)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'sneaky')$$,
  '23503', null,
  'intruder cannot link a task to someone else''s item'
);

-- 22. Anonymous visitors get nothing at all.
reset role;
set local role anon;
select throws_ok(
  $$select 1 from public.items$$,
  '42501', null,
  'anon has no access to tables'
);

select * from finish();
rollback;
