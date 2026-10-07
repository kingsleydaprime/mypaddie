-- Values (unique per user, any case), richer check-ins (each field optional, in range,
-- never empty) and experiments (dates in order, known verdicts).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(10);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'sam@example.com');
\set uid '''11111111-1111-1111-1111-111111111111'''

insert into public.life_values (user_id, value, position) values (:uid, 'Honesty', 0);
select throws_ok($$insert into public.life_values (user_id, value, position) values ('11111111-1111-1111-1111-111111111111', 'honesty', 1)$$,
  '23505', null, 'the same value twice (any case) is refused');
select throws_ok($$insert into public.life_values (user_id, value, position) values ('11111111-1111-1111-1111-111111111111', '  ', 1)$$,
  '23514', null, 'a blank value is refused');

-- Sleep alone is a check-in; energy can come later the same day.
select lives_ok($$insert into public.checkins (user_id, day, sleep_hours) values ('11111111-1111-1111-1111-111111111111', '2026-10-01', 7.5)$$, 'sleep alone is a check-in');
update public.checkins set energy = 4, mood = 3 where user_id = :uid and day = '2026-10-01';
select is((select (sleep_hours, energy, mood)::text from public.checkins where user_id = :uid and day = '2026-10-01'), '(7.5,4,3)', 'later fields merge into the same day');
select throws_ok($$insert into public.checkins (user_id, day) values ('11111111-1111-1111-1111-111111111111', '2026-10-02')$$,
  '23514', null, 'an empty check-in is refused');
select throws_ok($$insert into public.checkins (user_id, day, mood) values ('11111111-1111-1111-1111-111111111111', '2026-10-02', 6)$$,
  '23514', null, 'mood is 1 to 5');
select throws_ok($$insert into public.checkins (user_id, day, screen_minutes) values ('11111111-1111-1111-1111-111111111111', '2026-10-02', 1441)$$,
  '23514', null, 'screen time fits in a day');

select lives_ok($$insert into public.experiments (user_id, change, metric, starts_on, ends_on) values ('11111111-1111-1111-1111-111111111111', 'No phone after 10pm', 'sleep', '2026-10-01', '2026-10-14')$$, 'an experiment starts');
select throws_ok($$insert into public.experiments (user_id, change, starts_on, ends_on) values ('11111111-1111-1111-1111-111111111111', 'Backwards', '2026-10-14', '2026-10-01')$$,
  '23514', null, 'an experiment can''t end before it starts');
select throws_ok($$update public.experiments set status = 'done', conclusion = 'maybe' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'only known verdicts');
select * from finish();
rollback;
