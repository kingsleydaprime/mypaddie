-- Push scheduling: today's habit rows, escalation, check-ins, the brief, quiet hours.
-- Runs as postgres (the scheduler's role); times are Lagos (+01).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(24);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com');
-- Monday 2026-10-05 rows: a daily non-negotiable at 07:00, a Tue/Thu habit, an ordinary task at 10:00.
insert into public.tasks (id, user_id, title, due_at, recurrence, series_id, occurs_on, is_non_negotiable) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Morning reading',
   '2026-10-05 07:00+01', 'FREQ=DAILY', 'cccccccc-0000-0000-0000-000000000001', '2026-10-05', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Gym',
   '2026-10-01 18:00+01', 'FREQ=WEEKLY;BYDAY=TU,TH', 'cccccccc-0000-0000-0000-000000000002', '2026-10-01', false);
insert into public.task_pillars (task_id, user_id, pillar, weight) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'spiritual', 100),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'physical', 100);

-- ── recurs_on (must agree with occursOn in recurrence.ts) ───────────────────
select ok(private.recurs_on('FREQ=DAILY', '2026-10-06'), 'daily recurs every day');
select ok(private.recurs_on('RRULE:FREQ=WEEKLY;BYDAY=MO,WE', '2026-10-07'), 'weekly recurs on a listed day (Wed)');
select ok(not private.recurs_on('FREQ=WEEKLY;BYDAY=MO,WE', '2026-10-06'), 'weekly skips an unlisted day (Tue)');
select ok(not private.recurs_on('FREQ=MONTHLY', '2026-10-06'), 'unsupported rules never recur');

-- ── spawn_today ────────────────────────────────────────────────────────────
-- Tuesday 06:00 Lagos: both habits recur today.
select is(private.spawn_today('2026-10-06 06:00+01'), 2, 'spawns today''s rows for both habits on Tuesday');
select is((select due_at from public.tasks where series_id = 'cccccccc-0000-0000-0000-000000000001' and occurs_on = '2026-10-06'),
  '2026-10-06 07:00+01'::timestamptz, 'keeps the habit''s 07:00 wall-clock time');
select is(private.spawn_today('2026-10-06 09:00+01'), 0, 'running again the same day spawns nothing');
select is((select count(*)::int from public.task_pillars tp join public.tasks t on t.id = tp.task_id where t.occurs_on = '2026-10-06'),
  2, 'spawned rows get their pillar weights');

-- One ordinary one-off task on Tuesday at 10:00.
insert into public.tasks (id, user_id, title, due_at) values
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Email the lecturer', '2026-10-06 10:00+01');

-- ── collect_nudges ─────────────────────────────────────────────────────────
select is(private.collect_nudges('2026-10-06 06:30+01'), '[]'::jsonb, 'quiet hours: nothing before 07:00');

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('11111111-1111-1111-1111-111111111111', 'https://push.example/abc', 'key', 'secret');

-- 07:10: the reading is 10 minutes overdue. Before 08:00, so no brief yet.
create temp table out1 as select jsonb_array_elements(private.collect_nudges('2026-10-06 07:10+01')) as n;
select is((select count(*)::int from out1), 1, '07:10: one nudge');
select is((select n->>'kind' || '/' || (n->>'level') || '/' || (n->>'title') from out1), 'nudge/1/Morning reading',
  'first escalation level for the overdue non-negotiable');
select is((select n->>'endpoint' from out1), 'https://push.example/abc', 'addressed to the subscribed device');

select is(private.collect_nudges('2026-10-06 07:40+01'), '[]'::jsonb, '07:40: under an hour since the last nudge — quiet');

-- 08:10: brief + second escalation.
create temp table out2 as select jsonb_array_elements(private.collect_nudges('2026-10-06 08:10+01')) as n;
select is((select string_agg(n->>'kind' || '/' || (n->>'level'), ',' order by n->>'kind') from out2), 'brief/1,nudge/2',
  '08:10: the morning brief and the second nudge');
select is((select n->'items' from out2 where n->>'kind' = 'brief'), '["Morning reading", "Email the lecturer", "Gym"]'::jsonb,
  'the brief lists today''s top three, non-negotiables first');
select is((select count(*)::int from jsonb_array_elements(private.collect_nudges('2026-10-06 08:20+01'))), 0,
  'one brief per day');

-- 10:15: the email task is overdue → one check-in; reading → level 3.
create temp table out3 as select jsonb_array_elements(private.collect_nudges('2026-10-06 10:15+01')) as n;
select is((select string_agg(n->>'kind' || '/' || (n->>'level'), ',' order by n->>'kind') from out3), 'checkin/1,nudge/3',
  '10:15: a check-in for the ordinary task, a third nudge for the reading');
select is((select count(*)::int from jsonb_array_elements(private.collect_nudges('2026-10-06 11:20+01'))), 1, '11:20: fourth nudge');
select is((select count(*)::int from jsonb_array_elements(private.collect_nudges('2026-10-06 12:30+01')) n where n->>'kind' = 'checkin'),
  0, 'ordinary tasks only get one check-in');
select is((select count(*)::int from jsonb_array_elements(private.collect_nudges('2026-10-06 13:00+01'))), 0,
  'after four nudges, the non-negotiable stops escalating');

-- Doing the task stops its nudges; tomorrow's row starts fresh.
update public.tasks set status = 'done', done_at = '2026-10-06 18:05+01' where series_id = 'cccccccc-0000-0000-0000-000000000002' and occurs_on = '2026-10-06';
select is((select count(*)::int from jsonb_array_elements(private.collect_nudges('2026-10-06 18:30+01')) n where n->>'title' = 'Gym'),
  0, 'a done task is never nudged');

select is(private.collect_nudges('2026-10-06 22:05+01'), '[]'::jsonb, 'quiet hours: nothing after 22:00');

-- Without Vault secrets, the job runs safely and sends nothing.
select lives_ok($$select private.send_nudges()$$, 'send_nudges is a no-op until configured');

select is((select count(*)::int from cron.job where jobname = 'mypaddie-nudges' and schedule = '*/10 * * * *'), 1,
  'the job is scheduled every 10 minutes');

select * from finish();
rollback;
