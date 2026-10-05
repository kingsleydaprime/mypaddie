-- Imported Google Calendar events: identity per occurrence, and re-syncs never override his decisions.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(6);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select throws_ok($$insert into public.events (title, starts_at, source) values ('x', now(), 'google')$$, '23514', null, 'an imported event must carry its feed id');
select throws_ok($$insert into public.events (title, starts_at, external_uid) values ('x', now(), 'abc')$$, '23514', null, 'a manual event must not');

insert into public.events (title, starts_at, source, external_uid, kind) values ('Standup', '2026-10-07 09:00+01', 'google', 'standup#20261007', 'meeting');
select throws_ok($$insert into public.events (title, starts_at, source, external_uid) values ('Standup', '2026-10-07 09:00+01', 'google', 'standup#20261007')$$,
  '23505', null, 'one row per occurrence');

-- He marks it important and later cancels another; then a re-sync upserts (as the app does: no status, no important).
update public.events set important = true where external_uid = 'standup#20261007';
insert into public.events (title, starts_at, source, external_uid, status) values ('Optional sync', '2026-10-08 15:00+01', 'google', 'opt#20261008', 'cancelled');
insert into public.events (title, starts_at, ends_at, source, external_uid, kind) values
  ('Standup (renamed)', '2026-10-07 09:30+01', '2026-10-07 09:45+01', 'google', 'standup#20261007', 'meeting'),
  ('Optional sync', '2026-10-08 15:00+01', null, 'google', 'opt#20261008', 'meeting')
on conflict (user_id, external_uid) do update set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at, kind = excluded.kind;

select is((select title || ' ' || to_char(starts_at at time zone 'Africa/Lagos', 'HH24:MI') from public.events where external_uid = 'standup#20261007'),
  'Standup (renamed) 09:30', 're-sync updates title and time');
select is((select important from public.events where external_uid = 'standup#20261007'), true, '…and keeps his "important"');
select is((select status from public.events where external_uid = 'opt#20261008'), 'cancelled', '…and keeps his cancellation');

select * from finish();
rollback;
