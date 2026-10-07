-- Milestones: need a goal/dream, pay 3× once even if reopened, several per dream
-- each pay; moments stand alone and pay nothing.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(8);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'm@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.items (id, tier, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'dream', 'Build a company');
insert into public.milestones (id, item_id, title) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'First paying user'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '100 users');
select throws_ok($$insert into public.milestones (title) values ('Floating milestone')$$, '23514', null, 'a milestone sits under a goal or dream');
select lives_ok($$insert into public.milestones (kind, title, on_date, status, achieved_on, before, after) values
  ('moment', 'Graduated', '2023-11-20', 'achieved', '2023-11-20', 'Student, broke', 'Job hunting')$$, 'a moment stands alone');

select is(public.achieve_milestone('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-07',
  '[{"pillar":"skills","amount":30,"reason":"dream_milestone"}]')->>'result', 'achieved', 'hit it');
select is((select xp::int from public.pillars where name = 'skills'), 30, 'pays 3×');
select is(public.achieve_milestone('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-07', '[]')->>'result', 'already_achieved', 'a retry pays nothing');

-- Reopened by mistake, hit again: the ledger already has it.
update public.milestones set status = 'planned', achieved_on = null where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((public.achieve_milestone('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-08',
  '[{"pillar":"skills","amount":30,"reason":"dream_milestone"}]')->>'xp_rows')::int, 0, 'never pays twice');

select is((public.achieve_milestone('bbbbbbbb-0000-0000-0000-000000000002', '2026-10-09',
  '[{"pillar":"skills","amount":30,"reason":"dream_milestone"}]')->>'xp_rows')::int, 1, 'the next milestone on the same dream pays');
select is((select xp::int from public.pillars where name = 'skills'), 60, 'two milestones, 60');

select * from finish();
rollback;
