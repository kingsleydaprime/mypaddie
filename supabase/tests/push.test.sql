-- Push scheduling: today's habit rows, escalation, check-ins, the brief, quiet hours.
-- Runs as postgres (the scheduler's role); times are Lagos (+01).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';

-- Only this suite's test devices: on a real database, collect_nudges also sees
-- the real user's tasks and subscriptions, which these assertions must ignore.
create function pg_temp.mine(t timestamptz) returns setof jsonb language sql as $$
  select n from jsonb_array_elements(private.collect_nudges(t)) n where n->>'endpoint' like 'https://push.example/%'
$$;
select plan(37);

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
-- (On a real database spawn_today also spawns the real user's habits, so count only the test user's rows.)
select lives_ok($$select private.spawn_today('2026-10-06 06:00+01')$$, 'spawning runs');
select is((select count(*)::int from public.tasks where user_id = '11111111-1111-1111-1111-111111111111' and occurs_on = '2026-10-06'), 2, 'spawns today''s rows for both habits on Tuesday');
select is((select due_at from public.tasks where series_id = 'cccccccc-0000-0000-0000-000000000001' and occurs_on = '2026-10-06'),
  '2026-10-06 07:00+01'::timestamptz, 'keeps the habit''s 07:00 wall-clock time');
select lives_ok($$select private.spawn_today('2026-10-06 09:00+01')$$, 'running again the same day…');
select is((select count(*)::int from public.tasks where user_id = '11111111-1111-1111-1111-111111111111' and occurs_on = '2026-10-06'), 2, '…spawns nothing new');
select is((select count(*)::int from public.task_pillars tp join public.tasks t on t.id = tp.task_id where t.occurs_on = '2026-10-06' and t.user_id = '11111111-1111-1111-1111-111111111111'),
  2, 'spawned rows get their pillar weights');

-- One ordinary one-off task on Tuesday at 10:00.
insert into public.tasks (id, user_id, title, due_at) values
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Email the lecturer', '2026-10-06 10:00+01');

-- ── collect_nudges ─────────────────────────────────────────────────────────
select is((select coalesce(jsonb_agg(m), '[]'::jsonb) from pg_temp.mine('2026-10-06 06:30+01') m), '[]'::jsonb, 'quiet hours: nothing before 07:00');

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('11111111-1111-1111-1111-111111111111', 'https://push.example/abc', 'key', 'secret');

-- 07:10: the reading is 10 minutes overdue. Before 08:00, so no brief yet.
create temp table out1 as select pg_temp.mine('2026-10-06 07:10+01') as n;
select is((select count(*)::int from out1), 1, '07:10: one nudge');
select is((select n->>'kind' || '/' || (n->>'level') || '/' || (n->>'title') from out1), 'nudge/1/Morning reading',
  'first escalation level for the overdue non-negotiable');
select is((select n->>'endpoint' from out1), 'https://push.example/abc', 'addressed to the subscribed device');

select is((select coalesce(jsonb_agg(m), '[]'::jsonb) from pg_temp.mine('2026-10-06 07:40+01') m), '[]'::jsonb, '07:40: under an hour since the last nudge — quiet');

-- 08:10: brief + second escalation.
create temp table out2 as select pg_temp.mine('2026-10-06 08:10+01') as n;
select is((select string_agg(n->>'kind' || '/' || (n->>'level'), ',' order by n->>'kind') from out2), 'brief/1,nudge/2',
  '08:10: the morning brief and the second nudge');
select is((select n->'items' from out2 where n->>'kind' = 'brief'), '["Morning reading", "Email the lecturer", "Gym"]'::jsonb,
  'the brief lists today''s top three, non-negotiables first');
select is((select count(*)::int from pg_temp.mine('2026-10-06 08:20+01')), 0,
  'one brief per day');
-- The brief ranks like Today: a high-priority task beats an earlier normal one (but not a must-do).
update public.tasks set priority = 'high' where series_id = 'cccccccc-0000-0000-0000-000000000002' and occurs_on = '2026-10-06';
delete from private.nudges where kind = 'brief' and user_id = '11111111-1111-1111-1111-111111111111';
select is((select n->'items' from pg_temp.mine('2026-10-06 08:25+01') n where n->>'kind' = 'brief'), '["Morning reading", "Gym", "Email the lecturer"]'::jsonb,
  'high priority comes before time, after must-dos');
update public.tasks set priority = 'normal' where series_id = 'cccccccc-0000-0000-0000-000000000002' and occurs_on = '2026-10-06';

-- 09:50: the 10:00 email task is 10 minutes away → its 10-minute reminder.
create temp table out_h as select pg_temp.mine('2026-10-06 09:50+01') as n;
select is((select n->>'kind' || '/' || (n->>'level') || '/' || (n->>'title') || '/' || (n->>'due') from out_h where n->>'kind' = 'reminder'),
  'reminder/4/Email the lecturer/10:00', '09:50: the 10-minute reminder, with its time');
select is((select count(*)::int from pg_temp.mine('2026-10-06 09:55+01') n where n->>'kind' = 'reminder'),
  0, 'each reminder is sent once');

-- 10:15: the email task is overdue → one check-in.
create temp table out3 as select pg_temp.mine('2026-10-06 10:15+01') as n;
select is((select string_agg(n->>'kind' || '/' || (n->>'level'), ',' order by n->>'kind') from out3), 'checkin/1',
  '10:15: the check-in still fires after its reminder (the reading''s third nudge already went at 09:50)');
select is((select count(*)::int from pg_temp.mine('2026-10-06 11:20+01')), 1, '11:20: fourth nudge');
select is((select count(*)::int from pg_temp.mine('2026-10-06 12:30+01') n where n->>'kind' = 'checkin'),
  0, 'ordinary tasks only get one check-in');
select is((select count(*)::int from pg_temp.mine('2026-10-06 13:00+01')), 0,
  'after four nudges, the non-negotiable stops escalating');

-- A task in progress gets no reminders (you're already doing it); stopping it brings them back.
insert into public.tasks (id, user_id, title, due_at, started_at) values
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Write the report', '2026-10-06 15:00+01', '2026-10-06 14:30+01');
select is((select count(*)::int from pg_temp.mine('2026-10-06 14:51+01') n where n->>'title' = 'Write the report'),
  0, 'a started task gets no reminder');
update public.tasks set started_at = null where id = 'aaaaaaaa-0000-0000-0000-000000000004';
select is((select n->>'kind' || '/' || (n->>'level') from pg_temp.mine('2026-10-06 14:53+01') n where n->>'title' = 'Write the report'),
  'reminder/4', 'stopped again, its reminder comes back');

-- An any-time must-do (no set time) starts escalating at 15:00, not never.
insert into public.tasks (id, user_id, title, due_at, is_non_negotiable) values
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Pay rent', '2026-10-06 23:59+01', true);
-- (Its ordinary "morning of" reminder can still go out; only escalation is counted here.)
select is((select count(*)::int from pg_temp.mine('2026-10-06 14:55+01') n where n->>'title' = 'Pay rent' and n->>'kind' = 'nudge'),
  0, 'an any-time must-do doesn''t escalate before 15:00');
select is((select n->>'level' from pg_temp.mine('2026-10-06 15:05+01') n where n->>'title' = 'Pay rent' and n->>'kind' = 'nudge'),
  '1', 'from 15:00 it escalates');
select is((select count(*)::int from pg_temp.mine('2026-10-06 15:40+01') n where n->>'title' = 'Pay rent' and n->>'kind' = 'nudge'),
  0, 'hourly, like any other must-do');
update public.tasks set status = 'done', done_at = '2026-10-06 15:45+01' where id = 'aaaaaaaa-0000-0000-0000-000000000005';
-- The same for a daily must-do habit with no time at all (its day, no due time).
insert into public.tasks (id, user_id, title, due_at, recurrence, series_id, occurs_on, is_non_negotiable) values
  ('aaaaaaaa-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Read Bible', null,
   'FREQ=DAILY', 'cccccccc-0000-0000-0000-000000000006', '2026-10-06', true);
select is((select n->>'level' from pg_temp.mine('2026-10-06 16:10+01') n where n->>'title' = 'Read Bible' and n->>'kind' = 'nudge'),
  '1', 'an untimed must-do habit escalates from 15:00 too');
update public.tasks set status = 'done', done_at = '2026-10-06 16:15+01' where id = 'aaaaaaaa-0000-0000-0000-000000000006';

select is((select n->>'title' from pg_temp.mine('2026-10-06 17:50+01') n where n->>'kind' = 'reminder'),
  'Gym', '17:50: a habit gets its 10-minute reminder');
select is((select count(*)::int from pg_temp.mine('2026-10-06 17:51+01') n where n->>'kind' = 'nudge'),
  0, 'a reminder doesn''t restart or trigger escalation');

-- Doing the task stops its nudges; tomorrow's row starts fresh.
update public.tasks set status = 'done', done_at = '2026-10-06 18:05+01' where series_id = 'cccccccc-0000-0000-0000-000000000002' and occurs_on = '2026-10-06';
select is((select count(*)::int from pg_temp.mine('2026-10-06 18:30+01') n where n->>'title' = 'Gym'),
  0, 'a done task is never nudged');

select is((select coalesce(jsonb_agg(m), '[]'::jsonb) from pg_temp.mine('2026-10-06 22:05+01') m), '[]'::jsonb, 'quiet hours: nothing after 22:00');

-- Without Vault secrets, the job runs safely and sends nothing.
select lives_ok($$select private.send_nudges()$$, 'send_nudges is a no-op until configured');

select is((select count(*)::int from cron.job where jobname = 'mypaddie-nudges' and schedule = '* * * * *'), 1,
  'the job runs every minute');

select * from finish();
rollback;
