-- complete_item: done + bonus in one go, retry-safe, bonus once ever, RLS-scoped.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sam@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.items (id, tier, title) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'goal', 'Ship MyPaddie'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'need', 'Rent');

select is(
  public.complete_item('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-07 12:00:00+00',
    '[{"pillar":"skills","amount":20,"reason":"goal_completion"}]')->>'result',
  'completed', 'a goal completes');
select is((select status::text from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'done', 'status is done');
select is((select xp::int from public.pillars where name = 'skills'), 20, 'the bonus reached the pillar');
select is(
  (select item_id::text from public.xp_log where reason = 'goal_completion'),
  'aaaaaaaa-0000-0000-0000-000000000001', 'the bonus is tied to the item');

select is(
  public.complete_item('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-07 12:00:00+00',
    '[{"pillar":"skills","amount":20,"reason":"goal_completion"}]')->>'result',
  'already_done', 'a retry pays nothing');

-- Reopen and finish again: done again, but the bonus was already paid.
update public.items set status = 'active', done_at = null where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (public.complete_item('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-08 12:00:00+00',
    '[{"pillar":"skills","amount":20,"reason":"goal_completion"}]')->>'xp_rows')::int,
  0, 'reopening and finishing again never pays the bonus twice');
select is((select xp::int from public.pillars where name = 'skills'), 20, 'still 20');

select throws_ok(
  $$update public.items set status = 'done' where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  '23514', null, 'done needs a done_at');

-- Someone else can't finish your goal.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is(
  public.complete_item('aaaaaaaa-0000-0000-0000-000000000002', now(), '[]')->>'result',
  'not_found', 'another user''s item is invisible');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is((select status::text from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 'active', 'and it stays active');

select * from finish();
rollback;
