-- Two limits on a day. Work (study, projects, admin) is held to the capacity
-- setting; self-care (routines, workouts) takes time in the day but not from
-- those hours. Everything together still has to fit the waking day — that
-- check lives in the app, next to the capacity one.

alter table public.tasks add column is_self_care boolean not null default false;

-- What's already there: routine steps and workouts (planned training days,
-- and one-off sessions that were logged).
update public.tasks set is_self_care = true
where routine_id is not null
   or series_id in (select series_id from public.workout_days where series_id is not null)
   or id in (select task_id from public.workout_logs where task_id is not null);

-- A habit's new day copies the flag with everything else (as of task_details).
create or replace function public.spawn_occurrence(p_series_id uuid, p_occurs_on date, p_due_at timestamptz)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  template public.tasks%rowtype;
  new_id uuid;
begin
  select * into template from public.tasks where series_id = p_series_id order by occurs_on desc limit 1;
  if not found then
    return null;
  end if;
  insert into public.tasks (
    user_id, item_id, title, base_xp, due_at, recurrence, is_non_negotiable,
    series_id, occurs_on, duration_minutes, reminders, skill_id, reminder_note,
    fun_activity_id, topic, commitment_id, course_id, location, routine_id, routine_step, is_class, details,
    is_self_care
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on,
    template.duration_minutes, template.reminders, template.skill_id, template.reminder_note,
    template.fun_activity_id, template.topic, template.commitment_id, template.course_id, template.location,
    template.routine_id, template.routine_step, template.is_class, template.details,
    template.is_self_care
  )
  on conflict (series_id, occurs_on) do nothing
  returning id into new_id;
  if new_id is not null then
    insert into public.task_pillars (task_id, user_id, pillar, weight)
      select new_id, user_id, pillar, weight from public.task_pillars where task_id = template.id;
  end if;
  return new_id;
end;
$$;
