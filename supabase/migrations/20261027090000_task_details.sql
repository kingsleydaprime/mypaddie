-- Tasks get details: steps, links, what "done" looks like. Separate from the
-- reminder note, which is the push notification's wording.

alter table public.tasks add column details text check (length(details) <= 2000);

-- A habit's new day keeps its details (a routine step's how-to carries forward).
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
    fun_activity_id, topic, commitment_id, course_id, location, routine_id, routine_step, is_class, details
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on,
    template.duration_minutes, template.reminders, template.skill_id, template.reminder_note,
    template.fun_activity_id, template.topic, template.commitment_id, template.course_id, template.location,
    template.routine_id, template.routine_step, template.is_class, template.details
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
