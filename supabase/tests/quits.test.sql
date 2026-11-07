-- Quit tracker: owner-only, the kind decides the cap and the log shape, one
-- open period at a time, and a milestone can't be paid twice in one run.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sam@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ada@example.com');

-- Sam: one quit, one cut down.
insert into public.quits (id, user_id, title, alias) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Porn', 'Project P');
insert into public.quits (id, user_id, title, kind, limit_per_day, unit) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Scrolling', 'limit', 60, 'minutes');
insert into public.quit_periods (user_id, quit_id, started_at) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-01 00:00+01');
insert into public.quit_periods (user_id, quit_id, started_at, limit_per_day) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', '2026-11-01 00:00+01', 60);

-- ── Setup rules ──
select is((select (status, on_home, show_name_to_ai)::text from public.quits where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '(active,f,f)', 'a new quit is active, off Home, and hidden from Paddie by default');
select throws_ok($$insert into public.quits (user_id, title, limit_per_day, unit) values ('11111111-1111-1111-1111-111111111111', 'Smoking', 5, 'times')$$,
  '23514', null, 'quitting completely has no cap');
select throws_ok($$insert into public.quits (user_id, title, kind, unit) values ('11111111-1111-1111-1111-111111111111', 'Snacks', 'limit', 'times')$$,
  '23514', null, 'cutting down needs a cap');
select throws_ok($$insert into public.quits (user_id, title, kind, limit_per_day, unit) values ('11111111-1111-1111-1111-111111111111', 'Snacks', 'limit', 0, 'times')$$,
  '23514', null, 'a cap of 0 is refused (that''s quitting completely)');
select throws_ok($$insert into public.quits (user_id, title, kind, limit_per_day) values ('11111111-1111-1111-1111-111111111111', 'Snacks', 'limit', 2)$$,
  '23514', null, 'cutting down needs a unit');
select throws_ok($$insert into public.quits (user_id, title) values ('11111111-1111-1111-1111-111111111111', '  porn ')$$,
  '23505', null, 'the same habit twice (any case) is refused');
select throws_ok($$insert into public.quits (user_id, title) values ('11111111-1111-1111-1111-111111111111', '   ')$$,
  '23514', null, 'a blank name is refused');
select throws_ok($$update public.quits set kind = 'limit', limit_per_day = 1, unit = 'times' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, 'a quit''s kind can''t change');
select lives_ok($$update public.quits set limit_per_day = 45 where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  'a cut-down cap can change');

-- ── Periods ──
select throws_ok($$insert into public.quit_periods (user_id, quit_id) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '23505', null, 'only one open period per quit');
select throws_ok($$update public.quit_periods set ended_at = '2026-10-01 00:00+01' where quit_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, 'a period can''t end before it starts');
select lives_ok($$
  update public.quit_periods set ended_at = '2026-11-05 12:00+01' where quit_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into public.quit_periods (user_id, quit_id, started_at) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-06 08:00+01');
$$, 'once paused, it can be resumed with a new period');

-- ── Logs ──
select lives_ok($$insert into public.quit_logs (user_id, quit_id, at, note, cause) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-07 01:00+01', 'bored after midnight', 'late night')$$,
  'a relapse can be logged, backdated, with a note');
select throws_ok($$insert into public.quit_logs (user_id, quit_id, amount) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 3)$$,
  '23514', null, 'a relapse has no amount');
select throws_ok($$insert into public.quit_logs (user_id, quit_id) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  '23514', null, 'usage needs an amount');
select throws_ok($$insert into public.quit_logs (user_id, quit_id, amount, note) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 30, repeat('x', 501))$$,
  '23514', null, 'a note is at most 500 characters');

-- ── Milestones ──
insert into public.quit_milestones (user_id, quit_id, run_started_at, days) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-06 08:00+01', 1);
select throws_ok($$insert into public.quit_milestones (user_id, quit_id, run_started_at, days) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-06 08:00+01', 1)$$,
  '23505', null, 'a milestone can''t be paid twice in the same run');
select lives_ok($$insert into public.quit_milestones (user_id, quit_id, run_started_at, days) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-07 01:00+01', 1)$$,
  'a new run can earn the same milestone again');

-- ── XP survives deleting the quit ──
insert into public.xp_log (user_id, quit_id, pillar, amount, reason) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'character', 3, 'quit_milestone');
delete from public.quits where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is((select count(*)::int from public.quit_periods where quit_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0,
  'deleting a quit removes its periods and logs');
select is((select count(*)::int from public.xp_log where user_id = '11111111-1111-1111-1111-111111111111' and reason = 'quit_milestone' and quit_id is null), 1,
  'but the XP it earned stays');

-- ── Owner only ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.quits) + (select count(*)::int from public.quit_logs)
  + (select count(*)::int from public.quit_periods) + (select count(*)::int from public.quit_milestones), 0,
  'someone else sees none of their quits, logs, periods or milestones');
select throws_ok($$insert into public.quit_logs (user_id, quit_id) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '23503', null, 'and can''t log against their quit');

select * from finish();
rollback;
