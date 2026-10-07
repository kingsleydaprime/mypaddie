-- Claiming an invite on the sign-up page.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(11);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'host@example.com');
insert into public.invites (code, created_by, email) values
  ('OPENCODE', '11111111-1111-1111-1111-111111111111', null),
  ('TOBICODE', '11111111-1111-1111-1111-111111111111', 'tobi@example.com'),
  ('USEDCODE', '11111111-1111-1111-1111-111111111111', null);
update public.invites set used_at = now() where code = 'USEDCODE';

set local role anon;
select is(public.claim_invite('nope1234', 'ada@example.com'), 'invalid', 'unknown code');
select is(public.claim_invite('usedcode', 'ada@example.com'), 'used', 'used code');
select is(public.claim_invite('OPENCODE', 'not-an-email'), 'bad_email', 'email checked');
select is(public.claim_invite('OPENCODE', 'host@example.com'), 'has_account', 'already has an account: sign in instead');
select is(public.claim_invite(' opencode ', ' Ada@Example.com '), 'ok', 'an open code, claimed by anyone (not signed in)');
reset role;
select is((select email || ':' || bound_by_claim from public.invites where code = 'OPENCODE'), 'ada@example.com:true', 'tied to her email, by claim');
select is(private.admitting_invite('ada@example.com', null) is not null, true, 'so the hook admits that email with no code (Google)');
set local role anon;
select is(public.claim_invite('OPENCODE', 'ada.typo@example.com'), 'ok', 'a typo can be fixed by claiming again');
select is(public.claim_invite('TOBICODE', 'ada@example.com'), 'other_email', 'a code the host tied to someone stays theirs');
select is(public.claim_invite('TOBICODE', 'tobi@example.com'), 'ok', 'the right person can claim it');
reset role;
select is((select bound_by_claim from public.invites where code = 'TOBICODE'), false, '…and it stays host-tied');

select * from finish();
rollback;
