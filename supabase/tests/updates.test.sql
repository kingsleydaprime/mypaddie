begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.updates (id, recipient, channel, about, format) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Tobi (manager)', 'slack', 'Weekly progress on the API', '3 bullets: done, next, blockers');
select throws_ok($$insert into public.updates (recipient, channel, about) values ('X', 'pigeon', 'y')$$, '23514', null, 'unknown channels are refused');

select is(public.record_update_sent('aaaaaaaa-0000-0000-0000-000000000001', '- shipped auth', '2026-10-09 16:05+01'), 'logged', 'logs a sent update');
select is((select last_sent_at from public.updates), '2026-10-09 16:05+01'::timestamptz, 'and moves the "since" marker');
select is((select content from public.update_log), '- shipped auth', 'keeping what was sent');
select is(public.record_update_sent('aaaaaaaa-0000-0000-0000-000000000001', '  ', null), 'logged', 'content is optional');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.updates union all select 1 from public.update_log$$, 'another user sees none of it');
select is(public.record_update_sent('aaaaaaaa-0000-0000-0000-000000000001', 'x', null), 'not_found', 'and can''t log against it');

select * from finish();
rollback;
