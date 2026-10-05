begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

create temp table p as select public.save_workout_plan('PPL', '[
  {"name":"Push","weekdays":"MO,TH","start_time":"18:00","duration_minutes":60,
   "exercises":[{"name":"Bench press","sets":3,"reps":"8","weight_kg":40},{"name":"Dips","sets":3,"reps":"AMRAP"}]},
  {"name":"Legs","weekdays":"SA","exercises":[{"name":"Squat","sets":4,"reps":"6-8","weight_kg":60},{"name":"Plank","sets":3,"seconds":45}]}
]'::jsonb) as id;

select is((select count(*)::int from public.workout_days), 2, 'saves the training days');
select is((select string_agg(name || ':' || position, ',' order by day_id, position) from public.workout_exercises
  where day_id = (select id from public.workout_days where name = 'Push')), 'Bench press:0,Dips:1', 'exercises keep their order');
select is((select duration_minutes from public.workout_days where name = 'Legs'), 60, 'duration defaults to 60');
select is((select reps from public.workout_exercises where name = 'Squat'), '6-8', 'rep ranges are kept as written');

select throws_ok($$insert into public.workout_days (plan_id, name, weekdays) values ((select id from p), 'Bad', 'Monday')$$,
  '23514', null, 'weekdays must look like MO,TH');

update public.workout_plans set is_active = true where id = (select id from p);
select throws_ok($$insert into public.workout_plans (name, is_active) values ('Other', true)$$, '23505', null, 'only one plan can be active');

select isnt(public.record_workout((select id from public.workout_days where name = 'Push'), null, null, 55, 4::smallint, 'good pump',
  '[{"exercise":"Bench press","sets":3,"reps":8,"weight_kg":42.5},{"exercise":"Dips","sets":3,"reps":12}]'::jsonb), null, 'logs a workout');
select is((select string_agg(exercise || ' ' || coalesce(weight_kg::text, '-'), ', ' order by position) from public.workout_entries),
  'Bench press 42.50, Dips -', 'entries are stored in order');

delete from public.workout_plans where id = (select id from p);
select is((select count(*)::int from public.workout_exercises), 0, 'deleting a plan removes its days and exercises');
select is((select count(*)::int from public.workout_logs where day_id is null), 1, '…but keeps the workout history');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select 1 from public.workout_logs union all select 1 from public.workout_entries$$, 'intruder sees no workouts');

select * from finish();
rollback;
