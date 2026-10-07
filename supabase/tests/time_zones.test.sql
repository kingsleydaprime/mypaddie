-- Each user's nudges and habit days run on their own clock.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
create function pg_temp.briefs_at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg(n->>'endpoint', ',' order by n->>'endpoint'), '')
  from jsonb_array_elements(private.collect_nudges(t)) n where n->>'kind' = 'brief' and n->>'endpoint' like 'https://tz.example/%'
$$;
select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'lagos@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'newyork@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'broken@example.com');
insert into public.settings (user_id, key, value) values
  ('33333333-3333-3333-3333-333333333333', 'profile', '{"timeZone": "America/New_York"}'),
  ('44444444-4444-4444-4444-444444444444', 'profile', '{"timeZone": "Not/AZone"}');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('11111111-1111-1111-1111-111111111111', 'https://tz.example/lagos', 'k', 'a'),
  ('33333333-3333-3333-3333-333333333333', 'https://tz.example/newyork', 'k', 'a'),
  ('44444444-4444-4444-4444-444444444444', 'https://tz.example/utc', 'k', 'a');

select is((select tz from private.user_clock(now()) where user_id = '11111111-1111-1111-1111-111111111111'), 'Africa/Lagos', 'no zone saved: Lagos');
select is((select tz from private.user_clock(now()) where user_id = '33333333-3333-3333-3333-333333333333'), 'America/New_York', 'their saved zone');
select is((select tz from private.user_clock(now()) where user_id = '44444444-4444-4444-4444-444444444444'), 'UTC', 'an invalid zone: UTC');

-- Briefs are at 08:00 on each user's own clock (October: Lagos +1, New York −4).
select is(pg_temp.briefs_at('2026-10-12 07:00:00+00'), 'https://tz.example/lagos', '07:00 UTC = 08:00 Lagos: only Lagos');
select is(pg_temp.briefs_at('2026-10-12 08:00:00+00'), 'https://tz.example/utc', '08:00 UTC: the UTC fallback');
select is(pg_temp.briefs_at('2026-10-12 11:59:00+00'), '', '07:59 in New York: not yet');
select is(pg_temp.briefs_at('2026-10-12 12:00:00+00'), 'https://tz.example/newyork', '08:00 in New York');

-- 03:00 UTC: 04:00 in Lagos, 23:00 in New York, 03:00 UTC — inside everyone's quiet hours.
select is((select (n->>'endpoint') from jsonb_array_elements(private.collect_nudges('2026-10-13 03:00:00+00')) n
  where n->>'kind' = 'brief' and n->>'endpoint' like 'https://tz.example/%' limit 1), null,
  'quiet hours are theirs too: 04:00 Lagos, 23:00 New York — nobody');

insert into public.tasks (user_id, title, base_xp, recurrence, series_id, occurs_on, due_at) values
  ('33333333-3333-3333-3333-333333333333', 'Gym', 10, 'FREQ=DAILY', 'aaaaaaaa-3333-0000-0000-000000000001', '2026-10-10', '2026-10-10 18:00 America/New_York');
select private.spawn_today('2026-10-12 02:00:00+00');
select is((select max(occurs_on) from public.tasks where series_id = 'aaaaaaaa-3333-0000-0000-000000000001'), '2026-10-11'::date,
  'a New York habit is created for New York''s today (the 11th), not Lagos''s (the 12th)');
select is((select to_char(due_at at time zone 'America/New_York', 'HH24:MI') from public.tasks
  where series_id = 'aaaaaaaa-3333-0000-0000-000000000001' and occurs_on = '2026-10-11'), '18:00', 'at 18:00 their time');

select * from finish();
rollback;
