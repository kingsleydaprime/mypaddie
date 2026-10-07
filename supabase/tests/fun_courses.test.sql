-- Fun list, courses, the fun nudge, habits keeping their details, export_all. Lagos (+01).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
create function pg_temp.fun_at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg((n->>'days') || ':' || (n->'items')::text, ','), '')
  from jsonb_array_elements(private.collect_fun_nudges(t)) n where n->>'endpoint' like 'https://push.example/%'
$$;
select plan(24);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('11111111-1111-1111-1111-111111111111', 'https://push.example/abc', 'k', 'a');

-- ─── Fun nudge ──────────────────────────────────────────────────────────────
insert into public.fun_activities (user_id, title, cost, last_done_at, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'Movie', 3000, '2026-10-02 20:00+01', '2026-09-01 12:00+01'),
  ('11111111-1111-1111-1111-111111111111', 'Beach', 0, '2026-09-20 15:00+01', '2026-09-01 12:00+01'),
  ('11111111-1111-1111-1111-111111111111', 'Gaming', 0, null, '2026-09-01 12:00+01'),
  ('11111111-1111-1111-1111-111111111111', 'Football', 0, '2026-09-25 17:00+01', '2026-09-01 12:00+01');

select is(pg_temp.fun_at('2026-10-08 17:00+01'), '', '6 days since the last fun (the movie, 2 Oct): not yet');
select is(pg_temp.fun_at('2026-10-09 16:59+01'), '', 'not before 17:00');
select is(pg_temp.fun_at('2026-10-09 17:00+01'), '7:["Gaming", "Beach", "Football"]',
  '7 days without fun: three ideas, never-done first, then least recently done');
select is(pg_temp.fun_at('2026-10-09 18:00+01'), '', 'once a day');
select is(pg_temp.fun_at('2026-10-10 17:00+01'), '', 'not the next day either…');
select is(pg_temp.fun_at('2026-10-11 17:00+01'), '', '…nor the day after');
select is(pg_temp.fun_at('2026-10-12 17:00+01'), '10:["Gaming", "Beach", "Football"]', 'three days later, again');
select is(pg_temp.fun_at('2026-10-16 22:30+01'), '', 'never in quiet hours');

update public.fun_activities set last_done_at = '2026-10-15 19:00+01' where title = 'Football';
select is(pg_temp.fun_at('2026-10-19 17:00+01'), '', 'fun 4 days ago: nothing');

update public.fun_activities set last_done_at = '2026-10-01 19:00+01' where title = 'Football';
insert into public.settings (user_id, key, value) values ('11111111-1111-1111-1111-111111111111', 'schedule', '{"funEveryDays": 0}');
select is(pg_temp.fun_at('2026-10-25 17:00+01'), '', 'funEveryDays 0 turns it off');
update public.settings set value = '{"funEveryDays": 3, "funAt": "18:30"}' where key = 'schedule';
select is(pg_temp.fun_at('2026-10-25 18:00+01'), '', 'his own time: not before 18:30');
select isnt(pg_temp.fun_at('2026-10-25 18:30+01'), '', 'his own time and threshold');

update public.fun_activities set active = false;
select is(pg_temp.fun_at('2026-10-30 18:30+01'), '', 'everything paused: no nudge');
delete from public.fun_activities;

insert into public.fun_activities (user_id, title, created_at) values ('11111111-1111-1111-1111-111111111111', 'Brand new', '2026-11-10 09:00+01');
select is(pg_temp.fun_at('2026-11-11 18:30+01'), '', 'a new list counts from when it was made, not from "never"');

-- ─── Habits keep their details from day to day (spawn_occurrence fix) ───────
insert into public.skills (id, user_id, name, pillar) values ('55555555-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'DSA', 'skills');
insert into public.tasks (id, user_id, title, base_xp, recurrence, series_id, occurs_on, due_at, duration_minutes, reminders, skill_id, reminder_note, topic)
  values ('66666666-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'LeetCode', 10, 'FREQ=DAILY',
          '77777777-0000-0000-0000-000000000001', '2026-11-01', '2026-11-01 18:00+01', 60, '{10}', '55555555-0000-0000-0000-000000000001', 'Two mediums', 'Graphs');
insert into public.task_pillars (task_id, user_id, pillar, weight) values ('66666666-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'skills', 100);
select isnt(public.spawn_occurrence('77777777-0000-0000-0000-000000000001', '2026-11-02', '2026-11-02 18:00+01'), null, 'the next day is created');
select is(
  (select row(duration_minutes, reminders, skill_id, reminder_note, topic)::text from public.tasks where occurs_on = '2026-11-02'),
  row(60, '{10}'::text[], '55555555-0000-0000-0000-000000000001'::uuid, 'Two mediums', 'Graphs')::text,
  'a habit''s next day keeps its duration, reminders, skill link, note and topic');

-- ─── Courses ────────────────────────────────────────────────────────────────
insert into public.skills (id, user_id, name, pillar) values ('55555555-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'MTH 201', 'academic');
insert into public.courses (id, user_id, skill_id, code, title) values
  ('88888888-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000002', 'MTH 201', 'Calculus II');
insert into public.course_topics (user_id, course_id, title, position) values
  ('11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000001', 'Limits', 0);
select throws_ok($$insert into public.course_topics (user_id, course_id, title) values
  ('11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000001', 'LIMITS')$$,
  '23505', null, 'a topic title is unique per course, ignoring case');
select throws_ok($$insert into public.courses (user_id, skill_id, title) values
  ('11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000002', 'Same skill again')$$,
  '23505', null, 'one course per skill');
insert into public.events (id, user_id, title, kind, starts_at, important) values
  ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'MTH 201 Midterm', 'exam', '2026-11-20 09:00+01', true);
select lives_ok($$insert into public.course_assessments (user_id, course_id, kind, title, due_at, topics, event_id) values
  ('11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000001', 'exam', 'Midterm', '2026-11-20 09:00+01', '{Limits}',
   '99999999-0000-0000-0000-000000000001')$$, 'an exam is an event of kind exam, linked to its assessment');
select throws_ok($$insert into public.course_assessments (user_id, course_id, kind, title) values
  ('11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000001', 'essay-ish', 'Bad')$$,
  '23514', null, 'assessment kinds are checked');

select ok((select public.export_all() ?& array['fun_activities', 'courses', 'course_topics', 'course_assessments', 'learning_sessions', 'events', 'applications', 'tasks'])
  , 'export_all includes every table, not just the first twelve');

-- ─── Another user ───────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.fun_activities union all select 1 from public.courses
  union all select 1 from public.course_topics union all select 1 from public.course_assessments$$, 'another user sees none of it');
select throws_ok($$insert into public.course_topics (course_id, title) values ('88888888-0000-0000-0000-000000000001', 'Sneaky')$$,
  '23503', null, 'and can''t attach a topic to his course, even knowing its id');
select is((select count(*) from jsonb_object_keys(public.export_all()) k where k = 'courses'
  and jsonb_array_length(public.export_all()->'courses') = 0)::int, 1, 'their export holds none of his rows');

select * from finish();
rollback;
