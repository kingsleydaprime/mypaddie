-- Role history: one current role per commitment, dates in order, gone with the commitment.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(4);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'sam@example.com');
insert into public.commitments (id, user_id, kind, title, org) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'membership', 'Secretary', 'Igbo Students Union');
insert into public.commitment_roles (user_id, commitment_id, title, starts_on, ends_on) values
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'Member', '2025-09-01', '2026-03-09'),
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'Secretary', '2026-03-10', null);
select throws_ok($$insert into public.commitment_roles (user_id, commitment_id, title) values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'President')$$,
  '23505', null, 'only one current role at a time');
select throws_ok($$insert into public.commitment_roles (user_id, commitment_id, title, starts_on, ends_on) values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'X', '2026-05-01', '2026-04-01')$$,
  '23514', null, 'a role can''t end before it starts');
select is((select string_agg(title, ' → ' order by starts_on) from public.commitment_roles where commitment_id = 'cccccccc-0000-0000-0000-000000000001'), 'Member → Secretary', 'history kept in order');
delete from public.commitments where id = 'cccccccc-0000-0000-0000-000000000001';
select is((select count(*)::int from public.commitment_roles where commitment_id = 'cccccccc-0000-0000-0000-000000000001'), 0, 'deleting the commitment deletes its history');
select * from finish();
rollback;
