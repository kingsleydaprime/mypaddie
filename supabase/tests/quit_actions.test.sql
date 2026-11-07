-- Quit tracker writes: start, pause/resume, cap changes, logging with honesty
-- XP, and milestones paid once per run — all as the signed-in owner.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sam@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ada@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values
  ('p', public.start_quit('Porn', 'Project P', 'quit', null, null, 'my mornings', false, '2026-11-01 00:00+01')),
  ('s', public.start_quit('Scrolling', null, 'limit', 60, 'minutes', null, false, '2026-11-01 00:00+01'));

-- ── start ──
select is((select count(*)::int from public.quit_periods where quit_id = (select id from ids where name = 'p') and ended_at is null), 1,
  'starting a quit opens its first period');
select is((select limit_per_day from public.quit_periods where quit_id = (select id from ids where name = 's')), 60,
  'a cut-down period runs under the cap it started with');
select is((select alias from public.quits where id = (select id from ids where name = 's')), null,
  'a blank alias is stored as none');

-- ── pause and resume ──
select is(public.set_quit_status((select id from ids where name = 'p'), 'paused', '2026-11-05 12:00+01'), 'changed', 'pausing works');
select is((select count(*)::int from public.quit_periods where quit_id = (select id from ids where name = 'p') and ended_at is null), 0,
  'pausing closes the open period');
select is(public.set_quit_status((select id from ids where name = 'p'), 'paused', '2026-11-05 13:00+01'), 'unchanged', 'pausing twice changes nothing');
select is(public.set_quit_status((select id from ids where name = 'p'), 'ended', '2026-11-05 14:00+01'), 'changed', 'a paused quit can be ended');
select is((select count(*)::int from public.quit_periods where quit_id = (select id from ids where name = 'p')), 1,
  'ending a paused quit doesn''t touch its periods');
select is(public.set_quit_status((select id from ids where name = 'p'), 'active', '2026-11-06 08:00+01'), 'changed', 'and restarted');
select is((select started_at from public.quit_periods where quit_id = (select id from ids where name = 'p') and ended_at is null), '2026-11-06 08:00+01'::timestamptz,
  'restarting opens a new period from now: the streak starts again');

-- ── cap changes ──
select is(public.set_quit_cap((select id from ids where name = 'p'), 5, now()), 'not_limit', 'a quit has no cap to change');
select is(public.set_quit_cap((select id from ids where name = 's'), 60, now()), 'unchanged', 'the same cap changes nothing');
select is(public.set_quit_cap((select id from ids where name = 's'), 30, '2026-11-05 12:00+01'), 'lowered', 'lowering the cap');
select is((select (limit_per_day, continues_run)::text from public.quit_periods where quit_id = (select id from ids where name = 's') and ended_at is null),
  '(30,t)', 'opens a period under the lower cap that carries the streak on');
select is(public.set_quit_cap((select id from ids where name = 's'), 45, '2026-11-06 12:00+01'), 'raised', 'raising the cap');
select is((select (limit_per_day, continues_run)::text from public.quit_periods where quit_id = (select id from ids where name = 's') and ended_at is null),
  '(45,f)', 'starts a new attempt');

-- ── logging ──
select lives_ok($$select public.log_quit((select id from ids where name = 'p'), '2026-11-07 01:00+01', null, '  bored  ', 'late night',
  '[{"pillar":"character","amount":1},{"pillar":"mental","amount":1}]')$$, 'a relapse is logged with its honesty XP');
select is((select sum(amount)::int from public.xp_log where reason = 'quit_honesty' and quit_id = (select id from ids where name = 'p')), 2,
  'the honesty XP lands in the ledger, linked to the quit');

-- ── milestones ──
select is(public.pay_quit_milestones((select id from ids where name = 'p'), '2026-11-07 01:00+01',
  '[{"days":1,"xp":[{"pillar":"character","amount":3},{"pillar":"mental","amount":2}]},{"days":3,"xp":[{"pillar":"character","amount":6},{"pillar":"mental","amount":4}]}]'),
  array[1, 3], 'crossed milestones are paid');
select is(public.pay_quit_milestones((select id from ids where name = 'p'), '2026-11-07 01:00+01',
  '[{"days":1,"xp":[{"pillar":"character","amount":3},{"pillar":"mental","amount":2}]},{"days":3,"xp":[{"pillar":"character","amount":6},{"pillar":"mental","amount":4}]}]')
  || (select sum(amount)::int from public.xp_log where reason = 'quit_milestone'),
  array[15], 'paying the same run again pays nothing (still 15 XP in total)');

-- ── someone else ──
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(public.set_quit_status((select id from ids where name = 'p'), 'paused', now()), 'not_found',
  'someone else can''t pause their quit');
select throws_ok($$select public.log_quit((select id from ids where name = 'p'), now(), null, null, null, '[]')$$,
  '23503', null, 'or log against it');

select * from finish();
rollback;
