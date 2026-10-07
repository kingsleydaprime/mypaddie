-- Undo: XP reversed (not deleted), side effects rolled back, a redo pays again,
-- penalties can't be reversed, and only your own rows.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sam@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.tasks (id, title, base_xp) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Gym', 20);
insert into public.task_pillars (task_id, pillar, weight) values ('bbbbbbbb-0000-0000-0000-000000000001', 'physical', 100);
select public.complete_task('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-07 07:00:00+00',
  '[{"pillar":"physical","amount":20,"reason":"completion"}]');
insert into public.workout_logs (id, task_id, at, duration_minutes)
  values ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '2026-10-07 07:00:00+00', 45);
insert into public.promises (id, person, what, task_id, status, kept_at)
  values ('eeeeeeee-0000-0000-0000-000000000001', 'Tobi', 'Gym together', 'bbbbbbbb-0000-0000-0000-000000000001', 'kept', now());

select is((select xp::int from public.pillars where name = 'physical'), 20, 'completed: +20');

select is(public.undo_task('bbbbbbbb-0000-0000-0000-000000000001', false)->>'result', 'undone', 'undo works');
select is((select xp::int from public.pillars where name = 'physical'), 0, 'the XP is taken back');
select is((select status::text from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'pending', 'the task is pending again');
select is((select count(*)::int from public.xp_log where task_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 2, 'the ledger keeps both rows');
select is((select count(*)::int from public.xp_log where reason = 'undo' and amount = -20), 1, 'one undo row of -20');
select is((select count(*)::int from public.workout_logs where task_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0, 'the workout log goes');
select is((select status || '|' || coalesce(kept_at::text, '-') from public.promises), 'open|-', 'the promise is open again');

select is(public.undo_task('bbbbbbbb-0000-0000-0000-000000000001', false)->>'result', 'not_done', 'undoing twice does nothing');
select is((select xp::int from public.pillars where name = 'physical'), 0, 'still 0');

-- Really done later: pays again, because the first payment was reversed.
select is(
  (public.complete_task('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-07 18:00:00+00',
    '[{"pillar":"physical","amount":10,"reason":"late_completion"}]')->>'xp_rows')::int,
  1, 'a redo pays');
select is((select xp::int from public.pillars where name = 'physical'), 10, 'now +10');

-- Logged after the fact: undo cancels instead of leaving a pending task behind.
select is(public.undo_task('bbbbbbbb-0000-0000-0000-000000000001', true)->>'result', 'cancelled', 'cancel mode');
select is((select status::text from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'cancelled', 'the task is cancelled');

-- A learning session: XP back, session gone, ledger keeps both.
insert into public.skills (id, name) values ('cccccccc-0000-0000-0000-000000000001', 'DSA');
select public.record_learning('cccccccc-0000-0000-0000-000000000001', 'Graphs', 60, null, null, 4::smallint, null, now(),
  '[{"pillar":"skills","amount":12,"reason":"learning"}]') as session_id \gset
select is(public.undo_learning(:'session_id')->>'xp', '-12', 'undo a learning session');
select is((select xp::int from public.pillars where name = 'skills'), 0, 'its XP is taken back');
select is((select count(*)::int from public.learning_sessions), 0, 'the session is gone');

-- A slip logged by mistake: gone, and its task back to pending.
insert into public.tasks (id, title) values ('bbbbbbbb-0000-0000-0000-000000000003', 'Pray');
select public.record_slip('bbbbbbbb-0000-0000-0000-000000000003', 'Overslept', 'tired', false, 'curious') as slip_id \gset
select is((select status::text from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000003'), 'skipped', 'a slip skips the task');
select is(public.undo_slip(:'slip_id')->>'result', 'undone', 'undo the slip');
select is((select status::text || '|' || (select count(*) from public.slips where task_id = 'bbbbbbbb-0000-0000-0000-000000000003')
  from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000003'), 'pending|0', 'the slip is gone and the task is pending again');
select is(public.undo_slip(:'slip_id')->>'result', 'not_found', 'undoing twice finds nothing');

-- A penalty can't be reversed through the helper.
insert into public.xp_log (id, pillar, amount, reason) values ('ffffffff-0000-0000-0000-000000000001', 'character', -15, 'broken_promise');
select is(public.reverse_xp(array['ffffffff-0000-0000-0000-000000000001'::uuid], 'nice try'), 0, 'a deduction is not reversible');
select is((select xp::int from public.pillars where name = 'character'), -15, 'the penalty stands');

-- An undo mark can't be lifted.
select is_empty(
  $$update public.xp_log set reversed_at = null where reason = 'undo' returning id$$,
  'reversed rows stay reversed');

-- Someone else can't undo your task.
insert into public.tasks (id, title) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Read');
insert into public.task_pillars (task_id, pillar, weight) values ('bbbbbbbb-0000-0000-0000-000000000002', 'mental', 100);
select public.complete_task('bbbbbbbb-0000-0000-0000-000000000002', now(), '[{"pillar":"mental","amount":10,"reason":"completion"}]');
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is(public.undo_task('bbbbbbbb-0000-0000-0000-000000000002', false)->>'result', 'not_found', 'another user''s task is invisible');

select * from finish();
rollback;
