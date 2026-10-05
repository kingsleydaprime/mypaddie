-- Day 2: recurring tasks and the write functions the MCP tools call.
--
-- "Catch up on demand" (see DECISIONS.md) means get_today may run the same
-- writes many times, possibly twice at once (phone + Claude). Every write
-- here is therefore idempotent: running it again changes nothing.

-- ─── Recurring tasks ────────────────────────────────────────────────────────
-- A recurring habit is one task row per day it occurs. Rows of the same habit
-- share a series_id; occurs_on is the local day the row is for.

alter table public.tasks
  add column series_id uuid,
  add column occurs_on date,
  add constraint recurring_rows_have_series
    check ((recurrence is null) = (series_id is null)),
  add constraint series_rows_have_a_day
    check ((series_id is null) = (occurs_on is null)),
  -- One row per habit per day, even if two requests spawn it at once.
  add constraint one_occurrence_per_day unique (series_id, occurs_on);

create index tasks_series_idx on public.tasks (user_id, series_id, occurs_on desc);

-- ─── award_xp: insert XP rows, skipping any already awarded ─────────────────
-- Exists because the REST API can't say "on conflict do nothing" against the
-- partial unique indexes on xp_log. SECURITY INVOKER: RLS still applies.

create function public.award_xp(p_entries jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.xp_log (task_id, item_id, pillar, amount, reason, note, at)
  select e.task_id, e.item_id, e.pillar, e.amount, e.reason, e.note, coalesce(e.at, now())
  from jsonb_to_recordset(p_entries) as e(
    task_id uuid, item_id uuid, pillar public.pillar, amount integer,
    reason public.xp_reason, note text, at timestamptz
  )
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ─── complete_task: mark done and pay XP in one transaction ─────────────────
-- Before this, "mark done" and "write XP" were two requests: a dropped
-- connection between them left a done task with no XP. The engine computes
-- the entries; this only stores them. Safe to retry: a second call sees the
-- task already done and pays nothing.

create function public.complete_task(p_task_id uuid, p_done_at timestamptz, p_entries jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status public.task_status;
  awarded integer;
begin
  update public.tasks
    set status = 'done', done_at = p_done_at
    where id = p_task_id and status in ('pending', 'skipped');

  if not found then
    select status into current_status from public.tasks where id = p_task_id;
    return jsonb_build_object(
      'result', case
        when current_status is null then 'not_found'   -- missing, or not yours (RLS)
        when current_status = 'done' then 'already_done'
        else current_status::text
      end
    );
  end if;

  -- Force every entry onto this task, whatever the caller sent.
  awarded := public.award_xp((
    select coalesce(jsonb_agg(e || jsonb_build_object('task_id', p_task_id, 'at', p_done_at)), '[]'::jsonb)
    from jsonb_array_elements(p_entries) as e
  ));
  return jsonb_build_object('result', 'completed', 'xp_rows', awarded);
end;
$$;

-- ─── spawn_occurrence: create a habit's row for one day ─────────────────────
-- Copies the series' latest row (title, XP, flags, pillar weights) onto a new
-- day. Returns the new id, or null if that day already exists.

create function public.spawn_occurrence(p_series_id uuid, p_occurs_on date, p_due_at timestamptz)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  template public.tasks%rowtype;
  new_id uuid;
begin
  select * into template from public.tasks
    where series_id = p_series_id
    order by occurs_on desc
    limit 1;
  if not found then
    return null;
  end if;

  insert into public.tasks (
    user_id, item_id, title, base_xp, due_at, recurrence, is_non_negotiable,
    series_id, occurs_on
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on
  )
  on conflict (series_id, occurs_on) do nothing
  returning id into new_id;

  if new_id is not null then
    insert into public.task_pillars (task_id, user_id, pillar, weight)
      select new_id, user_id, pillar, weight
      from public.task_pillars where task_id = template.id;
  end if;
  return new_id;
end;
$$;

-- Functions are executable by PUBLIC by default. Only signed-in users.
revoke all on function public.award_xp(jsonb) from public, anon;
revoke all on function public.complete_task(uuid, timestamptz, jsonb) from public, anon;
revoke all on function public.spawn_occurrence(uuid, date, timestamptz) from public, anon;
grant execute on function public.award_xp(jsonb) to authenticated;
grant execute on function public.complete_task(uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.spawn_occurrence(uuid, date, timestamptz) to authenticated;
