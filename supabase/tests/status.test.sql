-- Status holds: what wins, classes and phone-free windows, held pushes deferred
-- (not lost), soft holds letting upcoming things through, and leave nudges.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
create function pg_temp.hold(u uuid, t timestamptz) returns text language sql as $$
  select coalesce((select hold || ':' || kind from private.holds(t) where user_id = u), 'none')
$$;
select plan(19);

\set sam '''11111111-1111-1111-1111-111111111111'''
\set ada '''22222222-2222-2222-2222-222222222222'''
insert into auth.users (id, email) values (:sam, 's@example.com'), (:ada, 'a@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  (:sam, 'https://st.example/sam', 'k', 'a'), (:ada, 'https://st.example/ada', 'k', 'a');

-- Wed 14 Oct 2026, Lagos (+1).
select is(pg_temp.hold(:sam, '2026-10-14 12:00+01'), 'none', 'nothing set: no hold');

-- A class 10:00–12:00 holds everything while it runs.
insert into public.skills (id, user_id, name) values ('dddddddd-0000-0000-0000-000000000001', :sam, 'CSC 201');
insert into public.courses (id, user_id, skill_id, code, title) values ('cccccccc-0000-0000-0000-000000000001', :sam, 'dddddddd-0000-0000-0000-000000000001', 'CSC 201', 'Data structures');
insert into public.tasks (user_id, title, due_at, duration_minutes, course_id, recurrence, series_id, occurs_on, is_class)
  values (:sam, 'CSC 201 Lecture', '2026-10-14 10:00+01', 120, 'cccccccc-0000-0000-0000-000000000001', 'FREQ=WEEKLY;BYDAY=WE', gen_random_uuid(), '2026-10-14', true);
-- A weekly study group for the same course is not a class: it doesn't hold anything.
insert into public.tasks (user_id, title, due_at, duration_minutes, course_id, recurrence, series_id, occurs_on)
  values (:sam, 'CSC 201 study group', '2026-10-14 14:00+01', 60, 'cccccccc-0000-0000-0000-000000000001', 'FREQ=WEEKLY;BYDAY=WE', gen_random_uuid(), '2026-10-14');
select is(pg_temp.hold(:sam, '2026-10-14 14:30+01'), 'none', 'a course-linked task that isn''t a class holds nothing');
select is(pg_temp.hold(:sam, '2026-10-14 11:00+01'), 'all:in_class', 'a running class: in class');
select is(pg_temp.hold(:sam, '2026-10-14 12:00+01'), 'none', 'over at 12:00');

-- A status they set beats the class, even one that holds nothing.
insert into public.statuses (user_id, kind, started_at, ends_at) values (:sam, 'other', '2026-10-14 10:30+01', '2026-10-14 11:30+01');
select is(pg_temp.hold(:sam, '2026-10-14 11:00+01'), 'none', '"Busy" they set beats the timetable (lecture cancelled)');
insert into public.statuses (user_id, kind, started_at, ends_at) values (:sam, 'with_friends', '2026-10-14 17:00+01', '2026-10-14 21:00+01');
select is(pg_temp.hold(:sam, '2026-10-14 18:00+01'), 'soft:with_friends', 'with friends: soft hold');
update public.statuses set ended_at = '2026-10-14 18:30+01' where user_id = :sam and kind = 'with_friends';
select is(pg_temp.hold(:sam, '2026-10-14 18:45+01'), 'none', 'cleared early: gone');
-- (Spawn first, check in a separate statement: a query can't see rows its own call inserted.)
select public.spawn_occurrence((select series_id from public.tasks where user_id = :sam and title = 'CSC 201 Lecture'), '2026-10-21', '2026-10-21 10:00+01');
select is((select is_class from public.tasks where user_id = :sam and title = 'CSC 201 Lecture' and occurs_on = '2026-10-21'), true, 'next week''s lecture is still a class');
select throws_ok($$insert into public.statuses (user_id, kind, started_at, ends_at) values ('11111111-1111-1111-1111-111111111111', 'sleeping', now(), now() + interval '17 hours')$$,
  '23514', null, 'no status longer than 16 hours');

-- Phone-free: first 2h after 07:00, last hour before 22:00.
insert into public.settings (user_id, key, value) values (:ada, 'schedule', '{"phoneFreeMorning":120,"phoneFreeEvening":60}');
select is(pg_temp.hold(:ada, '2026-10-14 08:30+01'), 'all:phone_free', 'phone-free morning');
select is(pg_temp.hold(:ada, '2026-10-14 09:00+01'), 'none', 'over at 09:00');
select is(pg_temp.hold(:ada, '2026-10-14 21:10+01'), 'all:phone_free', 'phone-free evening');

-- Deferral: a held push is dropped from the payload and its record forgotten, so it's retried later.
insert into private.nudges (user_id, kind, level, day, occurs_on, sent_at) values
  (:ada, 'fun', 1, '2026-10-14', '2026-10-14', '2026-10-14 21:10+01'),
  (:sam, 'fun', 1, '2026-10-14', '2026-10-14', '2026-10-14 21:10+01');
select is(
  (select string_agg(p->>'endpoint', ',') from jsonb_array_elements(private.apply_holds(
    '[{"endpoint":"https://st.example/ada","kind":"fun"},{"endpoint":"https://st.example/sam","kind":"fun"}]', '2026-10-14 21:10+01')) p),
  'https://st.example/sam', 'the held user''s push is held back; the other goes');
select is((select count(*)::int from private.nudges where user_id = :ada), 0, 'and its record is forgotten, so it comes back later');
select is((select count(*)::int from private.nudges where user_id = :sam), 1, 'the sent one stays recorded');

-- Soft hold: reminders through, other nudges held.
insert into public.statuses (user_id, kind, started_at, ends_at, leave_lead_minutes) values (:sam, 'with_friends', '2026-10-15 17:00+01', '2026-10-15 22:00+01', 30);
select is(
  (select string_agg(p->>'kind', ',') from jsonb_array_elements(private.apply_holds(
    '[{"endpoint":"https://st.example/sam","kind":"reminder"},{"endpoint":"https://st.example/sam","kind":"nudge"}]', '2026-10-15 18:00+01')) p),
  'reminder', 'with friends: the reminder gets through, the nag waits');

-- Leave nudges: a timed task within 30 minutes, once.
insert into public.tasks (user_id, title, due_at) values
  (:sam, 'Standup', '2026-10-15 18:20+01'),
  (:sam, 'Any time today', '2026-10-15 23:59+01'),
  (:sam, 'Later', '2026-10-15 19:30+01');
select is(
  (select string_agg((n->>'title') || '@' || (n->>'due'), ',') from jsonb_array_elements(private.collect_leave_nudges('2026-10-15 18:00+01')) n where n->>'endpoint' = 'https://st.example/sam'),
  'Standup@18:20', 'time to head out: only what starts within 30 minutes');
select is(jsonb_array_length(private.collect_leave_nudges('2026-10-15 18:05+01')), 0, 'once');
select is(
  (select count(*)::int from jsonb_array_elements(private.collect_leave_nudges('2026-10-14 13:00+01')) n where n->>'endpoint' = 'https://st.example/sam'),
  0, 'no leave nudges without a status that wants them');

select * from finish();
rollback;
