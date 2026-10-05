-- Per-user schedules in the nudge job. Lagos (+01).
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(11);

select ok(private.is_quiet('23:30', '22:00', '07:00') and private.is_quiet('06:59', '22:00', '07:00') and not private.is_quiet('07:00', '22:00', '07:00'),
  'quiet hours across midnight');
select ok(private.is_quiet('14:00', '13:00', '15:00') and not private.is_quiet('15:00', '13:00', '15:00'), 'quiet hours within a day');
select is(private.setting_time('{"briefAt":"nonsense"}', 'briefAt', '08:00'), '08:00'::time, 'a malformed stored time falls back to the default');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owl@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'lark@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('11111111-1111-1111-1111-111111111111', 'https://push.example/owl', 'k', 'a'),
  ('22222222-2222-2222-2222-222222222222', 'https://push.example/lark', 'k', 'a');
-- The owl stays up late and gets up early; the lark keeps the defaults.
insert into public.settings (user_id, key, value) values ('11111111-1111-1111-1111-111111111111', 'schedule',
  '{"quietStart":"23:00","quietEnd":"06:30","briefAt":"06:45","eveningAt":"21:30","eventCloseDays":14}');

create function pg_temp.kinds_at(t timestamptz) returns text language sql as $$
  select coalesce(string_agg(split_part(n->>'endpoint', '/', 4) || ':' || (n->>'kind') || coalesce('/' || (n->>'title'), ''), ',' order by n->>'endpoint', n->>'kind'), '')
  from jsonb_array_elements(private.collect_nudges(t)) n
$$;

select is(pg_temp.kinds_at('2026-10-06 06:45+01'), 'owl:brief', '06:45: the owl''s brief; the lark is still in quiet hours');
select is(pg_temp.kinds_at('2026-10-06 08:00+01'), 'lark:brief', '08:00: the lark''s brief (default)');

-- Both have a one-off task tomorrow at 10:00.
insert into public.tasks (user_id, title, due_at) values
  ('11111111-1111-1111-1111-111111111111', 'Owl task', '2026-10-07 10:00+01'),
  ('22222222-2222-2222-2222-222222222222', 'Lark task', '2026-10-07 10:00+01');
select is(pg_temp.kinds_at('2026-10-06 20:00+01'), 'lark:reminder/Lark task', '20:00: only the lark''s evening reminder');
select is(pg_temp.kinds_at('2026-10-06 21:30+01'), 'owl:reminder/Owl task', '21:30: the owl''s evening reminder');

-- Late night: the lark is quiet, the owl isn't.
insert into public.tasks (user_id, title, due_at, is_non_negotiable) values
  ('11111111-1111-1111-1111-111111111111', 'Owl must', '2026-10-06 22:20+01', true),
  ('22222222-2222-2222-2222-222222222222', 'Lark must', '2026-10-06 22:20+01', true);
select is(pg_temp.kinds_at('2026-10-06 22:30+01'), 'owl:nudge/Owl must', '22:30: the owl is nudged; the lark is in quiet hours');
select is(pg_temp.kinds_at('2026-10-06 23:30+01'), '', '23:30: both quiet');

-- An important event 12 days out: inside the owl's 14-day "close", outside the lark's 7.
insert into public.events (user_id, title, starts_at, important) values
  ('11111111-1111-1111-1111-111111111111', 'Owl conference', '2026-10-19 10:00+01', true),
  ('22222222-2222-2222-2222-222222222222', 'Lark conference', '2026-10-19 10:00+01', true);
insert into private.nudges (user_id, kind, level, day, sent_at) values
  ('11111111-1111-1111-1111-111111111111', 'brief', 1, '2026-10-07', now()),
  ('22222222-2222-2222-2222-222222222222', 'brief', 1, '2026-10-07', now());
update public.tasks set status = 'done', done_at = now() where title in ('Owl task', 'Lark task', 'Owl must', 'Lark must');
select is(pg_temp.kinds_at('2026-10-07 09:00+01'), 'owl:event/Owl conference', 'the owl''s wider "close" gives an earlier heads-up');

-- A garbage stored setting can't break the job: it falls back to defaults.
update public.settings set value = '{"quietStart":"banana","briefAt":42}' where user_id = '11111111-1111-1111-1111-111111111111';
select lives_ok($$select private.collect_nudges('2026-10-08 12:00+01')$$, 'malformed settings never break the nudge job');

select * from finish();
rollback;
