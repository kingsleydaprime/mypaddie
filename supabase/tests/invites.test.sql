-- Invite-only sign-up: who gets in, invites get used, allowances hold.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
create function pg_temp.gate(email text, code text default null) returns text language sql as $$
  select coalesce(public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object(
    'email', email, 'is_anonymous', false,
    'user_metadata', case when code is null then '{}'::jsonb else jsonb_build_object('invite_code', code) end
  )))->'error'->>'message', 'ok')
$$;
select plan(20);
-- These tests are about the gate itself, so it's switched on (the app default is off for now).
update private.app_config set value = 'true' where key = 'invites_required';

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'host@example.com');
insert into private.invite_allowances (user_id, allowance) values ('11111111-1111-1111-1111-111111111111', 2);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is(public.invites_left(), 2, 'two invites to give');
select ok((select code ~ '^[A-Z2-9]{8}$' from public.create_invite(null, 'For Ada')), 'an open code: 8 characters, no look-alikes');
select is((select invites_left from public.create_invite('  Tobi@Example.com ', null)), 0, 'an email invite, the last one');
select throws_ok($$select public.create_invite()$$, 'P0001', 'no invites left', 'allowance holds');
select throws_ok($$insert into public.invites (code, created_by) values ('ABCDEFGH', '11111111-1111-1111-1111-111111111111')$$, '42501', null,
  'invites can''t be inserted directly, only through create_invite');
reset role;

select is(pg_temp.gate('stranger@example.com'), 'MyPaddie is invite-only for now. Ask whoever told you about it for an invite code.', 'no invite: refused');
select is(pg_temp.gate('stranger@example.com', 'ZZZZZZZZ'), 'That invite code isn''t valid — it may be used, expired, or for a different email.', 'a made-up code: refused, and told why');
select is(pg_temp.gate('ada@example.com', (select code from public.invites where note = 'For Ada')), 'ok', 'an open code works for anyone');
select is(pg_temp.gate('ada@example.com', lower((select code from public.invites where note = 'For Ada'))), 'ok', 'codes are not case-sensitive');
select is(pg_temp.gate('TOBI@example.com'), 'ok', 'an invited email gets in with no code (Google sign-in), ignoring case');
select is(pg_temp.gate('someone@example.com', (select code from public.invites where email = 'tobi@example.com')), 'That invite code isn''t valid — it may be used, expired, or for a different email.',
  'an email-bound code doesn''t work for someone else');
select is(public.hook_before_user_created('{"user":{"email":null,"is_anonymous":true,"user_metadata":{}}}')->'error'->>'http_code', '403', 'anonymous sign-ins refused');

-- The account is created: its invite is used up.
insert into auth.users (id, email, raw_user_meta_data) values
  ('22222222-2222-2222-2222-222222222222', 'ada@example.com', jsonb_build_object('invite_code', (select code from public.invites where note = 'For Ada')));
select is((select used_by from public.invites where note = 'For Ada'), '22222222-2222-2222-2222-222222222222'::uuid, 'Ada''s code is marked used, by her');
select is(pg_temp.gate('ada2@example.com', (select code from public.invites where note = 'For Ada')), 'That invite code isn''t valid — it may be used, expired, or for a different email.', 'a used code is refused');
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'tobi@example.com');
select isnt((select used_at from public.invites where email = 'tobi@example.com'), null, 'an email invite is used when that email signs up (Google)');
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'nobody@example.com');
select is((select count(*)::int from public.invites where used_by = '44444444-4444-4444-4444-444444444444'), 0, 'an account made another way (e.g. by you, in the dashboard) uses nothing');

-- Expired and revoked invites.
insert into public.invites (code, created_by, email, expires_at) values ('EXPRDXYZ', '11111111-1111-1111-1111-111111111111', 'late@example.com', now() - interval '1 day');
select isnt(pg_temp.gate('late@example.com', 'EXPRDXYZ'), 'ok', 'expired: refused');
insert into public.invites (code, created_by, email) values ('RVKDXYZA', '11111111-1111-1111-1111-111111111111', 'gone@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.invites set revoked_at = now() where code = 'RVKDXYZA';
reset role;
select isnt(pg_temp.gate('gone@example.com'), 'ok', 'revoked: refused');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.invites$$, 'other people''s invites are invisible');
select is(public.invites_left(), 0, 'a new user has no invites to give unless granted');

select * from finish();
rollback;
