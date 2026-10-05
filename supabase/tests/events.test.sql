-- Events: occurrences, the reminder ladder by importance, yearly repeats, RLS. Lagos (+01).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';

-- Only this suite's test devices: on a real database, collect_nudges also sees
-- the real user's tasks and subscriptions, which these assertions must ignore.
create function pg_temp.mine(t timestamptz) returns setof jsonb language sql as $$
  select n from jsonb_array_elements(private.collect_nudges(t)) n where n->>'endpoint' like 'https://push.example/%'
$$;
select plan(20);

-- ── event_occurrence ───────────────────────────────────────────────────────
select is(private.event_occurrence('2026-10-20 18:00+01', false, '2026-10-06'), '2026-10-20 18:00+01'::timestamptz, 'one-off: its own time');
select is(private.event_occurrence('1999-11-02 00:00+01', true, '2026-10-06'), '2026-11-02 00:00+01'::timestamptz, 'yearly: this year''s date');
select is(private.event_occurrence('1999-03-15 00:00+01', true, '2026-10-06'), '2027-03-15 00:00+01'::timestamptz, 'yearly: next year once this year''s has passed');
select is(private.event_occurrence('2000-02-29 00:00+01', true, '2026-10-06'), '2027-02-28 00:00+01'::timestamptz, '29 Feb falls on the 28th in other years');
select is(private.event_occurrence('2000-02-29 00:00+01', true, '2027-03-01'), '2028-02-29 00:00+01'::timestamptz, '…and on the 29th in leap years');
select is(private.event_occurrence('2026-10-06 00:00+01', true, '2026-10-06'), '2026-10-06 00:00+01'::timestamptz, 'today counts as this year''s');

-- ── Reminders ──────────────────────────────────────────────────────────────
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('11111111-1111-1111-1111-111111111111', 'https://push.example/abc', 'k', 'a');
-- Briefs already sent for the days we look at, so they don't clutter the counts.
insert into private.nudges (user_id, kind, level, day, sent_at)
  select '11111111-1111-1111-1111-111111111111', 'brief', 1, d::date, now() from generate_series('2026-10-01'::date, '2026-12-31'::date, '1 day') d;

insert into public.events (user_id, title, kind, starts_at, ends_at, important) values
  ('11111111-1111-1111-1111-111111111111', 'Interview', 'meeting', '2026-10-15 14:00+01', '2026-10-15 15:00+01', true),
  ('11111111-1111-1111-1111-111111111111', 'Game night', 'social', '2026-10-15 19:00+01', null, false);
insert into public.events (user_id, title, kind, starts_at, all_day, yearly, person) values
  ('11111111-1111-1111-1111-111111111111', 'Tolu''s birthday', 'birthday', '1999-10-20 00:00+01', true, true, 'Tolu');

create function pg_temp.events_at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg((n->>'title') || ':' || (n->>'level'), ',' order by n->>'title', n->>'level'), '')
  from pg_temp.mine(t) n where n->>'kind' = 'event'
$$;

select is(pg_temp.events_at('2026-10-07 09:00+01'), '', '8 days out: nothing yet');
select is(pg_temp.events_at('2026-10-08 09:00+01'), 'Interview:1', '7 days out: the important one gets a heads-up; game night doesn''t');
select is(pg_temp.events_at('2026-10-10 09:00+01'), '', 'the week heads-up is sent once');
select is(pg_temp.events_at('2026-10-14 20:00+01'), 'Game night:2,Interview:2', 'the evening before: both');
select is(pg_temp.events_at('2026-10-15 09:00+01'), 'Interview:3', 'the morning of: important only');
select is(pg_temp.events_at('2026-10-15 13:35+01'), 'Interview:4', '30 minutes before the interview');
select is(pg_temp.events_at('2026-10-15 18:35+01'), 'Game night:4', '30 minutes before game night');
select is(pg_temp.events_at('2026-10-15 18:50+01'), '', 'no repeats');

-- Birthday (yearly, all day, not marked important): evening before + morning of.
select is(pg_temp.events_at('2026-10-19 20:00+01'), 'Tolu''s birthday:2', 'birthday: the evening before');
select is(pg_temp.events_at('2026-10-20 09:00+01'), 'Tolu''s birthday:3', 'birthday: the morning of, even though not marked important');
select is((select n->>'person' from pg_temp.mine('2026-10-20 09:01+01') n where n->>'kind' = 'event'), null,
  'and only once that day');

-- Next year it comes round again.
insert into private.nudges (user_id, kind, level, day, sent_at)
  select '11111111-1111-1111-1111-111111111111', 'brief', 1, d::date, now() from generate_series('2027-10-01'::date, '2027-10-31'::date, '1 day') d;
select is(pg_temp.events_at('2027-10-20 09:00+01'), 'Tolu''s birthday:3', 'a yearly event is reminded again the next year');

-- Cancelled events are silent.
update public.events set status = 'cancelled' where title = 'Game night';
insert into public.events (user_id, title, starts_at, important, status) values
  ('11111111-1111-1111-1111-111111111111', 'Old plan', '2026-11-03 10:00+01', true, 'cancelled');
select is(pg_temp.events_at('2026-11-02 20:00+01'), '', 'cancelled events send nothing');

-- RLS
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.events$$, 'another user sees none of these events');

select * from finish();
rollback;
