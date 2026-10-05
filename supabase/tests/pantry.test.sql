begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select lives_ok($$select public.adjust_pantry('[
  {"name":"Rice","unit":"kg","delta":5,"category":"grains","low_at":1},
  {"name":"Eggs","unit":"pieces","delta":12,"category":"protein","low_at":4},
  {"name":"Tomato paste","unit":"tins","delta":3}]')$$, 'stocks new items');
select is((select string_agg(name || ' ' || quantity || unit, ', ' order by name) from public.pantry_items),
  'Eggs 12.00pieces, Rice 5.00kg, Tomato paste 3.00tins', 'items are created with their units');

select lives_ok($$select public.adjust_pantry('[{"name":"rice","unit":"kg","delta":2}]')$$, 'names match ignoring case');
select is((select quantity from public.pantry_items where name = 'Rice'), 7.00, 'buying adds to stock');

select throws_ok($$select public.adjust_pantry('[{"name":"Rice","unit":"g","delta":500}]')$$, '23514', null,
  'a different unit is refused, never mixed');

select lives_ok($$select public.adjust_pantry('[{"name":"Eggs","delta":-20}]')$$, 'using more than you have…');
select is((select quantity from public.pantry_items where name = 'Eggs'), 0.00, '…floors at zero');

select lives_ok($$select public.adjust_pantry('[{"name":"Rice","set":1.5}]')$$, 'a stock-take sets the exact amount');
select is((select quantity from public.pantry_items where name = 'Rice'), 1.50, 'quantity is what was counted');

create temp table cooked as select public.cook_meal('Jollof', '[
  {"name":"Rice","quantity":0.5,"unit":"kg"},{"name":"tomato paste","quantity":1,"unit":"tins"},{"name":"Pepper","quantity":3,"unit":"pieces"}]',
  null, null) as r;
select is((select quantity from public.pantry_items where name = 'Rice'), 1.00, 'cooking uses up ingredients');
select is((select r->'missing' from cooked), '["Pepper"]'::jsonb, 'ingredients not in the pantry are reported, not fatal');
select is((select count(*)::int from public.meals where name = 'Jollof'), 1, 'the meal is recorded');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.pantry_items union all select 1 from public.meals$$, 'intruder sees no pantry or meals');

select * from finish();
rollback;
