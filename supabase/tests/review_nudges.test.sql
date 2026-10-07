-- Review reminders: Sunday evening for the week, the last day of a month / quarter / year, once, until written.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
create function pg_temp.at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg((n->>'level') || ':' || (n->>'title'), ','), '')
  from jsonb_array_elements(private.collect_review_nudges(t)) n where n->>'endpoint' like 'https://rv.example/%'
$$;
select plan(9);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'r@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('11111111-1111-1111-1111-111111111111', 'https://rv.example/a', 'k', 'a');

-- Sunday 18 Oct 2026 (Lagos +1). Evening reminders at 20:00 by default.
select is(pg_temp.at('2026-10-18 19:59+01'), '', 'Sunday before the evening time: nothing');
select is(pg_temp.at('2026-10-18 20:00+01'), '1:October 2026', 'Sunday evening: the week');
select is(pg_temp.at('2026-10-18 21:00+01'), '', 'once a day');
select is(pg_temp.at('2026-10-17 20:00+01'), '', 'a Saturday: nothing');

-- Already written: no reminder.
insert into public.reviews (user_id, period, starts_on, ends_on) values ('11111111-1111-1111-1111-111111111111', 'week', '2026-10-19', '2026-10-25');
select is(pg_temp.at('2026-10-25 20:00+01'), '', 'the week''s review is written: nothing');

select is(pg_temp.at('2026-10-31 20:00+01'), '2:October 2026', 'last day of the month: the month');
select is(pg_temp.at('2026-09-30 20:00+01'), '3:September 2026', 'last day of a quarter: the quarter wins');
select is(pg_temp.at('2026-12-31 20:00+01'), '4:December 2026', '31 December: the year');
select is(pg_temp.at('2026-11-30 22:30+01'), '', 'never in quiet hours');

select * from finish();
rollback;
