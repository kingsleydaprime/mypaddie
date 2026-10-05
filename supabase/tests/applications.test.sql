-- Applications: reminders aim at the target date, list what's missing, stop on submit. Lagos (+01).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
create function pg_temp.apps_at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg((n->>'title') || ':' || (n->>'level'), ',' order by n->>'title'), '')
  from jsonb_array_elements(private.collect_application_nudges(t)) n where n->>'endpoint' like 'https://push.example/%'
$$;
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('11111111-1111-1111-1111-111111111111', 'https://push.example/abc', 'k', 'a');

-- Closes 15 Nov 23:59 New York time. US clocks went back on 1 Nov, so that's EST (UTC−5):
-- 04:59 UTC = 05:59 Lagos on the 16th. Target: 3 days before → 13 Nov.
insert into public.applications (id, user_id, title, kind, deadline_at, deadline_tz, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Scholarship X', 'scholarship',
   '2026-11-15 23:59 America/New_York', 'America/New_York', 'preparing');
insert into public.application_requirements (user_id, application_id, title, position, done) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Essay', 0, false),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'CV', 1, true),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '2nd reference', 2, false);

select is((select (deadline_at at time zone 'Africa/Lagos')::text from public.applications), '2026-11-16 05:59:00',
  'a New York 23:59 deadline (EST, after US clocks change) is 05:59 the next morning in Lagos');

select is(pg_temp.apps_at('2026-10-30 09:00+01'), 'Scholarship X:1', '14 days before the target');
select is(pg_temp.apps_at('2026-10-30 10:00+01'), '', 'once');
select is(pg_temp.apps_at('2026-11-06 08:59+01'), '', 'not before his morning time');
select is(pg_temp.apps_at('2026-11-06 09:00+01'), 'Scholarship X:2', '7 days before');
select is((select n->'items' from jsonb_array_elements(private.collect_application_nudges('2026-11-10 09:00+01')) n
  where n->>'endpoint' like 'https://push.example/%'), '["Essay", "2nd reference"]'::jsonb, '3 days before, listing only what''s still missing');
select is((select n->>'due' from jsonb_array_elements(private.collect_application_nudges('2026-11-12 09:00+01')) n
  where n->>'endpoint' like 'https://push.example/%'), 'Mon 16 Nov 05:59', 'the real deadline, in his time');
select is(pg_temp.apps_at('2026-11-13 09:00+01'), 'Scholarship X:5', 'the target day itself');

-- Rolling deadline: "apply soon" on Mondays only.
insert into public.applications (user_id, title, status) values ('11111111-1111-1111-1111-111111111111', 'Rolling job', 'researching');
select is(pg_temp.apps_at('2026-11-17 09:00+01'), '', 'a Tuesday: nothing for the rolling one');
select is(pg_temp.apps_at('2026-11-23 09:00+01'), 'Rolling job:6', 'a Monday: apply soon');

-- Submitted: the countdown stops; results day gets a nudge.
update public.applications set status = 'submitted', results_expected = '2026-12-01' where title = 'Scholarship X';
update public.applications set status = 'withdrawn' where title = 'Rolling job';
select is(pg_temp.apps_at('2026-11-30 09:00+01'), '', 'submitted: no more countdown');
select is(pg_temp.apps_at('2026-12-01 09:00+01'), 'Scholarship X:7', 'results day: check');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.applications union all select 1 from public.application_requirements$$, 'another user sees none of it');

select * from finish();
rollback;
