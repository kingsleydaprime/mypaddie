-- Task details: capped at 2000 characters, and carried to a habit's next day.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(3);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'd@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select throws_ok($$insert into public.tasks (title, details) values ('Too long', repeat('x', 2001))$$, '23514', null, 'details are at most 2000 characters');
insert into public.tasks (id, title, details, recurrence, series_id, occurs_on) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Stretch', '1. Neck 2. Back 3. Hamstrings', 'FREQ=DAILY', 'cccccccc-0000-0000-0000-000000000001', '2026-10-07');
select isnt(public.spawn_occurrence('cccccccc-0000-0000-0000-000000000001', '2026-10-08', null), null, 'tomorrow spawns');
select is((select details from public.tasks where occurs_on = '2026-10-08'), '1. Neck 2. Back 3. Hamstrings', 'and keeps the details');

select * from finish();
rollback;
