-- Recipes unique per name (any case); one plan per meal slot per day (any case);
-- deleting a recipe keeps the plan's name.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(6);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'm@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.recipes (id, name, ingredients) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Jollof', '[{"name":"rice","quantity":2,"unit":"cups"}]');
select throws_ok($$insert into public.recipes (name) values (' jollof ')$$, '23505', null, 'one recipe per name, any case');
select throws_ok($$insert into public.recipes (name, ingredients) values ('Bad', '{}')$$, '23514', null, 'ingredients are a list');

insert into public.meal_plans (day, slot, recipe_id, name) values ('2026-10-08', 'Lunch', 'aaaaaaaa-0000-0000-0000-000000000001', 'Jollof');
select throws_ok($$insert into public.meal_plans (day, slot, name) values ('2026-10-08', 'lunch', 'Beans')$$, '23505', null, 'one plan per slot per day');
select lives_ok($$insert into public.meal_plans (day, slot, name) values ('2026-10-08', 'Dinner', 'Beans')$$, 'another slot is fine');

delete from public.recipes where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select name || '|' || coalesce(recipe_id::text, '-') from public.meal_plans where slot = 'Lunch'), 'Jollof|-', 'the plan keeps its name when the recipe goes');
select throws_ok($$update public.meal_plans set status = 'eaten'$$, '23514', null, 'only known statuses');

select * from finish();
rollback;
