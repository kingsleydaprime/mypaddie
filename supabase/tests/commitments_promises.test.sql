-- Commitments and promises: ownership, links, and a broken promise charged once.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');

insert into public.commitments (id, user_id, kind, title, org, priority) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'team', 'Striker', 'School team', 'important');
select throws_ok($$insert into public.commitments (user_id, kind, title) values ('11111111-1111-1111-1111-111111111111', 'gig', 'X')$$,
  '23514', null, 'commitment kinds are checked');
select throws_ok($$insert into public.commitments (user_id, kind, title, starts_on, ends_on) values
  ('11111111-1111-1111-1111-111111111111', 'team', 'X', '2026-10-10', '2026-10-01')$$, '23514', null, 'it can''t end before it starts');

-- Team training, a weekly habit tied to the team: its next day stays tied to it.
insert into public.tasks (id, user_id, title, base_xp, recurrence, series_id, occurs_on, due_at, duration_minutes, commitment_id) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Team training', 10, 'FREQ=WEEKLY;BYDAY=TU,TH',
   'eeeeeeee-0000-0000-0000-000000000001', '2026-10-13', '2026-10-13 16:00+01', 120, 'cccccccc-0000-0000-0000-000000000001');
insert into public.task_pillars (task_id, user_id, pillar, weight) values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'physical', 100);
select isnt(public.spawn_occurrence('eeeeeeee-0000-0000-0000-000000000001', '2026-10-15', '2026-10-15 16:00+01'), null, 'Thursday''s training is created');
select is((select commitment_id from public.tasks where occurs_on = '2026-10-15'), 'cccccccc-0000-0000-0000-000000000001'::uuid,
  'and stays tied to the team');

insert into public.events (user_id, title, kind, starts_at, important, commitment_id) values
  ('11111111-1111-1111-1111-111111111111', 'Inter-faculty final', 'other', '2026-10-24 15:00+01', true, 'cccccccc-0000-0000-0000-000000000001');
delete from public.commitments where id = 'cccccccc-0000-0000-0000-000000000001';
select is((select count(*)::int from public.tasks where commitment_id is null and title = 'Team training'), 2,
  'deleting a commitment keeps its sessions (history), just unlinked');
select is((select commitment_id from public.events where title = 'Inter-faculty final'), null, 'and its events');

-- A broken promise: charged once against its task, however often catch-up runs.
insert into public.tasks (id, user_id, title, base_xp, due_at) values
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Promise to Ada: notes', 15, '2026-10-10 23:59+01');
insert into public.task_pillars (task_id, user_id, pillar, weight) values
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'character', 60),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'relationships', 40);
insert into public.promises (id, user_id, person, what, due_at, task_id) values
  ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ada', 'Send the notes', '2026-10-10 23:59+01', 'dddddddd-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is(public.award_xp('[{"task_id":"dddddddd-0000-0000-0000-000000000002","pillar":"character","amount":-9,"reason":"broken_promise"},
                            {"task_id":"dddddddd-0000-0000-0000-000000000002","pillar":"relationships","amount":-6,"reason":"broken_promise"}]'::jsonb),
  2, 'a broken promise is charged');
select is(public.award_xp('[{"task_id":"dddddddd-0000-0000-0000-000000000002","pillar":"character","amount":-9,"reason":"broken_promise"},
                            {"task_id":"dddddddd-0000-0000-0000-000000000002","pillar":"relationships","amount":-6,"reason":"broken_promise"}]'::jsonb),
  0, 'once: running catch-up again charges nothing');
select is((select sum(xp)::int from public.pillars where name in ('character', 'relationships')), -15, 'his pillars show the −15');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.commitments union all select 1 from public.promises$$, 'another user sees none of it');
select throws_ok($$insert into public.promises (person, what, task_id) values ('X', 'Y', 'dddddddd-0000-0000-0000-000000000002')$$,
  '23503', null, 'and can''t hang a promise on his task');

select * from finish();
rollback;
