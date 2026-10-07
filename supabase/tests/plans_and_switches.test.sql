-- App switches (invites, default plan, payments) and choosing a plan.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
create function pg_temp.gate(email text) returns text language sql as $$
  select coalesce(public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', email, 'is_anonymous', false, 'user_metadata', '{}'::jsonb)))->'error'->>'message', 'ok')
$$;
select plan(15);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'sam@example.com');

-- Invites switch.
select is((public.signup_settings()->>'invitesRequired')::boolean, false, 'invites are off for now');
select is(pg_temp.gate('anyone@example.com'), 'ok', 'off: anyone can sign up');
update private.app_config set value = 'true' where key = 'invites_required';
select is((public.signup_settings()->>'invitesRequired')::boolean, true, 'one line turns them back on');
select isnt(pg_temp.gate('anyone@example.com'), 'ok', 'on: no invite, no account');
select is(public.hook_before_user_created('{"user":{"is_anonymous":true,"user_metadata":{}}}')->'error'->>'http_code', '403', 'anonymous refused either way');
update private.app_config set value = 'false' where key = 'invites_required';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is(public.my_plan()->>'plan', 'free', 'no choice made: the default plan, Free');
select is((public.my_plan()->>'chosen')::boolean, false, '…marked as not chosen');
select is(public.choose_plan('pro'), 'ok', 'choosing Pro');
select is(public.my_plan()->>'plan', 'pro', 'a choice beats the default');
select is(public.choose_plan('plus', 'yearly', true), 'ok', 'payments off: any plan is one tap');
select is(public.my_plan()->>'period' || '/' || (public.my_plan()->>'student'), 'yearly/true', 'period and student pricing stored');
select is(public.choose_plan('gold'), 'invalid', 'unknown plans refused');
select throws_ok($$insert into public.user_plans (user_id, plan) values ('11111111-1111-1111-1111-111111111111', 'pro')$$, '42501', null, 'plans can''t be written directly');
reset role;

update private.app_config set value = 'true' where key = 'payments_enabled';
set local role authenticated;
select is(public.choose_plan('pro'), 'payment_required', 'payments on: a paid plan needs a payment');
select is(public.choose_plan('free'), 'ok', '…but anyone can go to Free');
reset role;

select * from finish();
rollback;
