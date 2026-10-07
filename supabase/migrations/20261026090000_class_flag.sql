-- Any task can be for a course now (an exam form, a group meeting), so "a
-- repeating task linked to a course" no longer means "a class". Classes get an
-- explicit flag; the timetable, the "in class" hold and the habit limit read it.

alter table public.tasks add column is_class boolean not null default false;
-- Until now only the timetable set course_id, and only on repeating rows: exact.
update public.tasks set is_class = true where course_id is not null and recurrence is not null;
create index tasks_class_user_due_idx on public.tasks (user_id, due_at) where is_class;

-- A habit's new day copies the flag with everything else.
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
    fun_activity_id, topic, commitment_id, course_id, location, routine_id, routine_step, is_class
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on,
    template.duration_minutes, template.reminders, template.skill_id, template.reminder_note,
    template.fun_activity_id, template.topic, template.commitment_id, template.course_id, template.location,
    template.routine_id, template.routine_step, template.is_class
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

-- Holds: a running class is one flagged as a class, not any course-linked task.
create or replace function private.holds(p_now timestamptz default now())
returns table (user_id uuid, hold text, kind text, lead integer)
language sql
stable
set search_path = ''
as $$
  -- Pick the winner first, then drop "none": a "Busy" status they set still
  -- beats the timetable, it just holds nothing.
  select w.user_id, w.hold, w.kind, w.lead from (
  select distinct on (h.user_id) h.user_id, h.hold, h.kind, h.lead
  from (
    select s.user_id,
      case when s.kind in ('in_class', 'deep_work', 'sleeping', 'worship') then 'all'
           when s.kind in ('with_friends', 'out', 'at_work', 'commuting', 'resting') then 'soft'
           else 'none' end as hold,
      s.kind, s.leave_lead_minutes as lead, 1 as priority, s.started_at as since
    from public.statuses s
    where s.ended_at is null and s.started_at <= p_now and s.ends_at > p_now
    union all
    select t.user_id, 'all', 'in_class', null, 2, t.due_at
    from public.tasks t
    where t.is_class and t.status <> 'cancelled'
      and t.due_at <= p_now and t.due_at + make_interval(mins => coalesce(t.duration_minutes, 60)) > p_now
    union all
    select c.user_id, 'all', 'phone_free', null, 3, null
    from private.user_clock(p_now) c
    left join public.settings st on st.user_id = c.user_id and st.key = 'schedule'
    cross join lateral (select private.setting_int(st.value, 'phoneFreeMorning', 0) as am,
                               private.setting_int(st.value, 'phoneFreeEvening', 0) as pm) w
    where (w.am > 0 and private.is_quiet(c.local_time, c.quiet_end, (c.quiet_end + make_interval(mins => w.am))::time))
       or (w.pm > 0 and private.is_quiet(c.local_time, (c.quiet_start - make_interval(mins => w.pm))::time, c.quiet_start))
  ) h
  order by h.user_id, h.priority, h.since desc nulls last
  ) w
  where w.hold <> 'none'
$$;
