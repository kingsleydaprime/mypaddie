-- Start-by times: "start the market run by 16:00, done by 18:00". Lagos times (+01).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';

create function pg_temp.mine(t timestamptz) returns setof jsonb language sql as $$
  select n from jsonb_array_elements(private.collect_nudges(t)) n where n->>'endpoint' like 'https://push.example/%'
$$;
-- "kind:level:startBy" for each nudge at t, e.g. "nudge:1:16:00".
create function pg_temp.at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg(n->>'title' || ' ' || (n->>'kind') || ':' || (n->>'level') || ':' || coalesce(n->>'startBy', '-'), ',' order by n->>'title', n->>'kind'), '')
  from pg_temp.mine(t) n
$$;
select plan(11);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('11111111-1111-1111-1111-111111111111', 'https://push.example/abc', 'key', 'secret');
insert into private.nudges (user_id, kind, level, day, sent_at) values
  ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-13', now()),
  ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-14', now());

insert into public.tasks (user_id, title, due_at, must_from, reminders) values
  ('11111111-1111-1111-1111-111111111111', 'Market', '2026-10-14 18:00+01', '2026-10-14 16:00+01', array['30']);

select is(pg_temp.at('2026-10-14 15:29+01'), '', 'nothing before 30 minutes ahead of the start');
select is(pg_temp.at('2026-10-14 15:30+01'), 'Market reminder:5:16:00', '15:30: start in 30 minutes, with the start time');
select is(pg_temp.at('2026-10-14 15:45+01'), '', 'sent once');
select is(pg_temp.at('2026-10-14 16:00+01'), 'Market nudge:1:16:00', '16:00: a must-do now, nudged to start');
select is(pg_temp.at('2026-10-14 17:00+01'), 'Market nudge:2:16:00', 'hourly, still about starting');
select is(pg_temp.at('2026-10-14 17:30+01'), 'Market reminder:3:16:00', 'the deadline ladder still runs (30 minutes before 18:00)');
select is(pg_temp.at('2026-10-14 18:00+01'), 'Market nudge:3:-', 'deadline passed: the usual escalation, no start wording');

-- Starting it stops everything. (Market is done; out of the way.)
update public.tasks set status = 'done', done_at = now() where title = 'Market';
insert into public.tasks (user_id, title, due_at, must_from, started_at) values
  ('11111111-1111-1111-1111-111111111111', 'Started', '2026-10-14 21:00+01', '2026-10-14 20:00+01', '2026-10-14 19:00+01');
select is(pg_temp.at('2026-10-14 19:30+01'), '', 'a started task gets no start reminder');

-- A prep day before a later deadline (applications, courses) isn't a start-by.
insert into private.nudges (user_id, kind, level, day, sent_at) values ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-15', now());
insert into public.tasks (user_id, title, due_at, must_from, reminders) values
  ('11111111-1111-1111-1111-111111111111', 'Apply', '2026-10-18 12:00+01', '2026-10-15 09:00+01', array['eve']);
select is(pg_temp.at('2026-10-15 08:30+01'), '', 'different days: no 30-minute start reminder');

update public.tasks set status = 'done', done_at = now() where title = 'Apply';
-- No reminders at all ([]) opts out of the start one too; 23:59 (any time) isn't a deadline.
insert into private.nudges (user_id, kind, level, day, sent_at) values ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-16', now());
insert into public.tasks (user_id, title, due_at, must_from, reminders) values
  ('11111111-1111-1111-1111-111111111111', 'Quiet', '2026-10-16 15:00+01', '2026-10-16 12:00+01', array[]::text[]),
  ('11111111-1111-1111-1111-111111111111', 'Whenever', '2026-10-16 23:59+01', '2026-10-16 12:00+01', array[]::text[]);
select is(pg_temp.at('2026-10-16 11:30+01'), '', 'reminders = [] and any-time tasks get no start reminder');
select is(pg_temp.at('2026-10-16 12:00+01'), 'Quiet nudge:1:12:00,Whenever nudge:1:-', 'any-time keeps the plain wording');

select * from finish();
rollback;
