begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.skills (id, name, pillar) values ('aaaaaaaa-0000-0000-0000-000000000001', 'DSA', 'skills');
insert into public.skills (id, name, pillar) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Calculus', 'academic');

select throws_ok($$insert into public.skills (name) values ('dsa')$$, '23505', null, 'skill names are unique, ignoring case');

select isnt(public.record_learning('aaaaaaaa-0000-0000-0000-000000000001', 'sliding window', 45, 3, 'problems', 2::smallint,
  'still shaky', null, '[{"pillar":"skills","amount":9,"reason":"learning"}]'), null, 'logs a session');
select is((select topic || '|' || minutes || '|' || count || ' ' || unit || '|' || confidence from public.learning_sessions),
  'sliding window|45|3 problems|2', 'session details are stored');
select is((select xp from public.pillars where name = 'skills'), 9::bigint, 'XP lands on the skill''s pillar');

select is(public.award_xp(jsonb_build_array(jsonb_build_object(
  'learning_session_id', (select id from public.learning_sessions), 'pillar', 'skills', 'amount', 9, 'reason', 'learning'))),
  0, 'a session can''t be paid twice');

select lives_ok($$select public.record_learning('aaaaaaaa-0000-0000-0000-000000000002', 'limits', 30, null, null, null, null, null,
  '[{"pillar":"academic","amount":6,"reason":"learning"}]')$$, 'count, unit, confidence and notes are optional');
select is((select xp from public.pillars where name = 'academic'), 6::bigint, 'coursework goes to academic');

select throws_ok($$select public.record_learning('aaaaaaaa-0000-0000-0000-000000000001', 'x', 0, null, null, null, null, null, '[]')$$,
  '23514', null, 'zero minutes is rejected');
select throws_ok($$select public.record_learning('aaaaaaaa-0000-0000-0000-000000000001', 'x', 10, null, 'problems', null, null, null, '[]')$$,
  '23514', null, 'a unit without a count is rejected');

-- ── Tasks that count as practice ──────────────────────────────────────────
insert into public.tasks (id, title, skill_id) values ('bbbbbbbb-0000-0000-0000-000000000001', 'LeetCode 1h', 'aaaaaaaa-0000-0000-0000-000000000002');
delete from public.skills where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is((select skill_id from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001'), null,
  'deleting a skill unlinks its tasks without deleting them');

-- ── Another user ───────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.skills$$, 'intruder sees no skills');
select is_empty($$select 1 from public.learning_sessions$$, 'intruder sees no sessions');
select throws_ok($$select public.record_learning('aaaaaaaa-0000-0000-0000-000000000001', 'x', 10, null, null, null, null, null, '[]')$$,
  '23503', null, 'intruder can''t log against someone else''s skill');
select throws_ok($$insert into public.tasks (title, skill_id) values ('sneaky', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '23503', null, 'intruder can''t link a task to someone else''s skill');

select * from finish();
rollback;
