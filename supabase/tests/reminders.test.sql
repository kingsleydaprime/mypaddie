-- The reminder ladder and tasks that become non-negotiable later. Lagos times (+01).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';

-- Only this suite's test devices: on a real database, collect_nudges also sees
-- the real user's tasks and subscriptions, which these assertions must ignore.
create function pg_temp.mine(t timestamptz) returns setof jsonb language sql as $$
  select n from jsonb_array_elements(private.collect_nudges(t)) n where n->>'endpoint' like 'https://push.example/%'
$$;
select plan(18);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('11111111-1111-1111-1111-111111111111', 'https://push.example/abc', 'key', 'secret');
-- Mark today's and tomorrow's briefs as sent so they don't clutter the counts.
insert into private.nudges (user_id, kind, level, day, sent_at) values
  ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-06', now()),
  ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-07', now());

-- A one-off meeting Wednesday 14:00, and a habit Wednesday 06:30.
insert into public.tasks (id, user_id, title, due_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Standup', '2026-10-07 14:00+01');
insert into public.tasks (id, user_id, title, due_at, recurrence, series_id, occurs_on) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Reading', '2026-10-07 07:30+01',
   'FREQ=DAILY', 'cccccccc-0000-0000-0000-000000000001', '2026-10-07');

create function pg_temp.reminders_at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg(n->>'title' || ':' || (n->>'level'), ',' order by n->>'title'), '')
  from pg_temp.mine(t) n where n->>'kind' = 'reminder'
$$;

-- ── The ladder for a one-off ───────────────────────────────────────────────
select is(pg_temp.reminders_at('2026-10-06 19:59+01'), '', 'nothing before 20:00 the evening before');
select is(pg_temp.reminders_at('2026-10-06 20:00+01'), 'Standup:1', '20:00 the day before: the evening reminder (the habit skips it)');
select is(pg_temp.reminders_at('2026-10-06 21:00+01'), '', 'the evening reminder is sent once');
select is(pg_temp.reminders_at('2026-10-07 07:20+01'), 'Reading:4', '07:20: the habit''s 10-minute reminder only');
select is(pg_temp.reminders_at('2026-10-07 09:00+01'), 'Standup:2', '09:00 on the day: the morning reminder');
select is(pg_temp.reminders_at('2026-10-07 13:35+01'), 'Standup:3', '13:35: 30-minute reminder');
select is(pg_temp.reminders_at('2026-10-07 13:45+01'), '', 'nothing between the 30- and 10-minute marks');
select is(pg_temp.reminders_at('2026-10-07 13:52+01'), 'Standup:4', '13:52: 10-minute reminder');
select is(pg_temp.reminders_at('2026-10-07 13:58+01'), '', 'no repeats');

-- ── Edges ──────────────────────────────────────────────────────────────────
-- Something at 09:20: the morning reminder would be pointless (under 45 min away).
insert into public.tasks (user_id, title, due_at) values ('11111111-1111-1111-1111-111111111111', 'Early call', '2026-10-08 09:20+01');
insert into private.nudges (user_id, kind, level, day, sent_at) values ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-08', now());
select is(pg_temp.reminders_at('2026-10-08 09:00+01'), 'Early call:3', '09:00 for a 09:20 call: skip "morning", send the 30-minute one');

-- A custom ladder: only the evening before.
insert into public.tasks (user_id, title, due_at, reminders) values
  ('11111111-1111-1111-1111-111111111111', 'Submit essay', '2026-10-09 12:00+01', array['eve']);
insert into private.nudges (user_id, kind, level, day, sent_at) values ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-09', now());
select is(pg_temp.reminders_at('2026-10-08 20:30+01'), 'Submit essay:1', 'a custom ladder is respected (evening)…');
select is(pg_temp.reminders_at('2026-10-09 11:52+01'), '', '…and nothing it didn''t ask for');

-- Quiet hours still win: an evening reminder can't arrive at 22:00+.
insert into public.tasks (user_id, title, due_at) values ('11111111-1111-1111-1111-111111111111', 'Late', '2026-10-11 10:00+01');
select is(pg_temp.reminders_at('2026-10-10 22:00+01'), '', 'quiet hours beat the evening reminder');

-- ── Becomes non-negotiable later ───────────────────────────────────────────
-- "Text the boss" due Friday 17:00, becomes a must-do Thursday 09:00. No reminders, to isolate escalation.
insert into public.tasks (user_id, title, due_at, must_from, reminders) values
  ('11111111-1111-1111-1111-111111111111', 'Text the boss', '2026-10-16 17:00+01', '2026-10-15 09:00+01', '{}');
insert into private.nudges (user_id, kind, level, day, sent_at) values
  ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-14', now()),
  ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-15', now()),
  ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-16', now());

create function pg_temp.nudges_at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg(n->>'title' || ':' || (n->>'level'), ','), '')
  from pg_temp.mine(t) n where n->>'kind' = 'nudge'
$$;
select is(pg_temp.nudges_at('2026-10-14 12:00+01'), '', 'before it turns must-do: no nudges');
select is(pg_temp.nudges_at('2026-10-15 09:05+01'), 'Text the boss:1', 'once it''s a must-do, it escalates — even before its due date');
select is(pg_temp.nudges_at('2026-10-15 10:10+01'), 'Text the boss:2', '…an hour later, firmer');
select is(pg_temp.nudges_at('2026-10-16 08:00+01'), 'Text the boss:1', 'escalation starts fresh the next day');

-- A custom note travels with the reminder.
insert into public.tasks (user_id, title, due_at, reminder_note) values
  ('11111111-1111-1111-1111-111111111111', 'Bank visit', '2026-10-20 11:00+01', 'Bring the signed form and your ID');
insert into private.nudges (user_id, kind, level, day, sent_at) values ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-20', now());
select is((select n->>'note' from pg_temp.mine('2026-10-20 10:52+01') n where n->>'title' = 'Bank visit'),
  'Bring the signed form and your ID', 'the reminder carries his note');

select * from finish();
rollback;
