-- Close-out: once a day pays, a second close updates; the evening push comes at
-- closeAt on a day with something due, once, never after closing or in quiet hours.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
create function pg_temp.at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg(n->>'level', ','), '')
  from jsonb_array_elements(private.collect_close_out_nudges(t)) n where n->>'endpoint' like 'https://co.example/%'
$$;
select plan(14);
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'c@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'idle@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('11111111-1111-1111-1111-111111111111', 'https://co.example/a', 'k', 'a'),
  ('22222222-2222-2222-2222-222222222222', 'https://co.example/b', 'k', 'a');

-- Wed 14 Oct 2026, Lagos (+1). One task done today, one open, one open since Monday.
insert into public.tasks (user_id, title, due_at, status, done_at) values
  ('11111111-1111-1111-1111-111111111111', 'Gym', '2026-10-14 07:00+01', 'done', '2026-10-14 07:30+01'),
  ('11111111-1111-1111-1111-111111111111', 'Essay', '2026-10-14 23:59+01', 'pending', null),
  ('11111111-1111-1111-1111-111111111111', 'Call bank', '2026-10-12 23:59+01', 'pending', null);

select is(pg_temp.at('2026-10-14 21:29+01'), '', 'before 21:30: nothing');
select is(pg_temp.at('2026-10-14 21:30+01'), '2', 'at 21:30: the push, with 2 open (the idle user gets none)');
select is(pg_temp.at('2026-10-14 21:45+01'), '', 'once a day');
select is(pg_temp.at('2026-10-15 22:30+01'), '', 'never in quiet hours');

-- A custom time, and switched off.
insert into public.settings (user_id, key, value) values ('11111111-1111-1111-1111-111111111111', 'schedule', '{"closeAt":"20:45"}');
select is(pg_temp.at('2026-10-15 20:45+01'), '2', 'their own close-out time; nothing due today but two still open');
update public.settings set value = '{"closeOut":false}' where user_id = '11111111-1111-1111-1111-111111111111';
select is(pg_temp.at('2026-10-16 21:30+01'), '', 'switched off: nothing');
update public.settings set value = '{}' where user_id = '11111111-1111-1111-1111-111111111111';

-- close_day, as the user.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is(public.close_day('2026-10-16', 'Finished the essay plan', null, '{"moved":1}',
  '[{"pillar":"character","amount":3,"reason":"day_closed"},{"pillar":"mental","amount":2,"reason":"day_closed"}]')->>'result',
  'closed', 'closing the day');
select is((select sum(amount)::int from public.xp_log where reason = 'day_closed'), 5, 'pays 5');
select is(public.close_day('2026-10-16', null, 'Tired', '{"slipped":1}',
  '[{"pillar":"character","amount":3,"reason":"day_closed"}]')->>'result',
  'updated', 'closing again updates');
select is((select sum(amount)::int from public.xp_log where reason = 'day_closed'), 5, 'and pays nothing more');
select is((select win || '|' || note || '|' || summary::text from public.day_closes), 'Finished the essay plan|Tired|{"moved": 1, "slipped": 1}',
  'the win stays, the note and summary add up');
reset role;

select is(pg_temp.at('2026-10-16 21:31+01'), '', 'a closed day gets no push');

-- Habits with no time count by their day.
insert into public.tasks (user_id, title, occurs_on, series_id, recurrence) values
  ('22222222-2222-2222-2222-222222222222', 'Pray', '2026-10-17', gen_random_uuid(), 'FREQ=DAILY');
select is((select string_agg(n->>'level', ',') from jsonb_array_elements(private.collect_close_out_nudges('2026-10-17 21:30+01')) n
  where n->>'endpoint' = 'https://co.example/b'), '1', 'an untimed habit due today counts');

-- The push carries the day's numbers and tomorrow's first three (Mon 19 Oct).
insert into public.tasks (user_id, title, due_at, status, done_at) values
  ('11111111-1111-1111-1111-111111111111', 'Laundry', '2026-10-19 10:00+01', 'done', '2026-10-19 10:30+01');
insert into public.xp_log (user_id, pillar, amount, reason, at) values ('11111111-1111-1111-1111-111111111111', 'physical', 10, 'completion', '2026-10-19 10:30+01');
insert into public.tasks (user_id, title, due_at, is_non_negotiable) values
  ('11111111-1111-1111-1111-111111111111', 'Standup', '2026-10-20 09:00+01', true),
  ('11111111-1111-1111-1111-111111111111', 'Read', '2026-10-20 23:59+01', false);
-- A daily habit whose last row is from Saturday: tomorrow comes from its rule.
insert into public.tasks (user_id, title, due_at, recurrence, series_id, occurs_on) values
  ('11111111-1111-1111-1111-111111111111', 'Pray', '2026-10-17 06:00+01', 'FREQ=DAILY', gen_random_uuid(), '2026-10-17');
select is(
  (select (n->'summary')::text || ' ' || (n->'items')::text from jsonb_array_elements(private.collect_close_out_nudges('2026-10-19 21:30+01')) n
    where n->>'endpoint' = 'https://co.example/a'),
  '{"xp": 10, "done": 1, "slipped": 0, "tomorrow": 3} ["09:00 Standup", "06:00 Pray", "Read"]',
  'done, XP and tomorrow: must-dos first, then by time, then any time; habits from their rule');

select * from finish();
rollback;
