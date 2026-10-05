-- Workout plans and logs. A plan's training days become recurring tasks
-- (workout_days.series_id), so scheduling, reminders, capacity and XP all go
-- through the task system that already exists.

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index workout_plans_one_active on public.workout_plans (user_id) where is_active;

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  -- Weekdays as in a recurrence rule: 'MO,TH'.
  weekdays text not null check (weekdays ~ '^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$'),
  start_time time,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 300),
  -- The recurring task series created for this day when the plan is active.
  series_id uuid,
  position integer not null default 0,
  unique (id, user_id),
  foreign key (plan_id, user_id) references public.workout_plans (id, user_id) on delete cascade
);
create index workout_days_plan_user_idx on public.workout_days (plan_id, user_id);
create index workout_days_series_idx on public.workout_days (series_id);

-- What the plan prescribes.
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  sets integer check (sets between 1 and 50),
  -- Free text so ranges work: '8', '8-12', 'AMRAP'.
  reps text,
  weight_kg numeric(6, 2) check (weight_kg >= 0),
  seconds integer check (seconds > 0),
  notes text,
  position integer not null default 0,
  foreign key (day_id, user_id) references public.workout_days (id, user_id) on delete cascade
);
create index workout_exercises_day_user_idx on public.workout_exercises (day_id, user_id);

-- What was actually done.
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_id uuid,
  task_id uuid,
  at timestamptz not null default now(),
  duration_minutes integer check (duration_minutes between 1 and 600),
  -- How it felt, 1 (awful) – 5 (great).
  feel smallint check (feel between 1 and 5),
  notes text,
  unique (id, user_id),
  foreign key (day_id, user_id) references public.workout_days (id, user_id) on delete set null (day_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);
create index workout_logs_user_at_idx on public.workout_logs (user_id, at desc);
create index workout_logs_day_user_idx on public.workout_logs (day_id, user_id);
create index workout_logs_task_user_idx on public.workout_logs (task_id, user_id);

create table public.workout_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_id uuid not null,
  exercise text not null check (length(trim(exercise)) > 0),
  sets integer check (sets between 1 and 50),
  reps integer check (reps between 1 and 1000),
  weight_kg numeric(6, 2) check (weight_kg >= 0),
  seconds integer check (seconds > 0),
  position integer not null default 0,
  foreign key (log_id, user_id) references public.workout_logs (id, user_id) on delete cascade
);
create index workout_entries_log_user_idx on public.workout_entries (log_id, user_id);
create index workout_entries_exercise_idx on public.workout_entries (user_id, lower(exercise));

do $$
declare t text;
begin
  foreach t in array array['workout_plans', 'workout_days', 'workout_exercises', 'workout_logs', 'workout_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "owner can read" on public.%I for select to authenticated using ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)$p$, t);
  end loop;
end;
$$;

-- ─── save_workout_plan: a plan, its days and exercises, in one go ───────────
-- p_days: [{name, weekdays, start_time, duration_minutes, exercises: [{name, sets, reps, weight_kg, seconds, notes}]}]
-- Returns the plan id. Activation (and the tasks it creates) happens in the app,
-- because it goes through the task engine's clash and capacity checks.
create function public.save_workout_plan(p_name text, p_days jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  plan_id uuid;
  d jsonb;
  d_id uuid;
  d_pos integer := 0;
begin
  insert into public.workout_plans (name) values (p_name) returning id into plan_id;
  for d in select * from jsonb_array_elements(p_days) loop
    insert into public.workout_days (plan_id, name, weekdays, start_time, duration_minutes, position)
      values (plan_id, d->>'name', d->>'weekdays', (d->>'start_time')::time,
              coalesce((d->>'duration_minutes')::integer, 60), d_pos)
      returning id into d_id;
    insert into public.workout_exercises (day_id, name, sets, reps, weight_kg, seconds, notes, position)
      select d_id, e->>'name', (e->>'sets')::integer, e->>'reps', (e->>'weight_kg')::numeric,
             (e->>'seconds')::integer, e->>'notes', (ord - 1)::integer
      from jsonb_array_elements(coalesce(d->'exercises', '[]'::jsonb)) with ordinality as x(e, ord);
    d_pos := d_pos + 1;
  end loop;
  return plan_id;
end;
$$;

-- ─── record_workout: a log and its entries, in one go ───────────────────────
create function public.record_workout(
  p_day_id uuid, p_task_id uuid, p_at timestamptz, p_duration integer, p_feel smallint, p_notes text, p_entries jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  log_id uuid;
begin
  insert into public.workout_logs (day_id, task_id, at, duration_minutes, feel, notes)
    values (p_day_id, p_task_id, coalesce(p_at, now()), p_duration, p_feel, p_notes)
    returning id into log_id;
  insert into public.workout_entries (log_id, exercise, sets, reps, weight_kg, seconds, position)
    select log_id, e->>'exercise', (e->>'sets')::integer, (e->>'reps')::integer, (e->>'weight_kg')::numeric,
           (e->>'seconds')::integer, (ord - 1)::integer
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) with ordinality as x(e, ord);
  return log_id;
end;
$$;

revoke all on function public.save_workout_plan(text, jsonb) from public, anon;
revoke all on function public.record_workout(uuid, uuid, timestamptz, integer, smallint, text, jsonb) from public, anon;
grant execute on function public.save_workout_plan(text, jsonb) to authenticated;
grant execute on function public.record_workout(uuid, uuid, timestamptz, integer, smallint, text, jsonb) to authenticated;
