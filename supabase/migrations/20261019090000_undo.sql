-- Undo for mis-taps: a completed task (including fun and workouts, which are
-- completed tasks) and a learning session. The ledger stays append-only in
-- spirit: nothing is deleted. The original rows are marked reversed and a
-- matching negative 'undo' row is written, so history shows both.

alter type public.xp_reason add value if not exists 'undo';

alter table public.xp_log add column reversed_at timestamptz;

-- Reversed rows no longer count for "pay once", so a task undone and then
-- really done later pays again. The undo rows are marked reversed too, so
-- they never block anything either.
drop index public.xp_log_once_per_task_reason;
create unique index xp_log_once_per_task_reason
  on public.xp_log (task_id, pillar, reason) where task_id is not null and reversed_at is null;

-- Marking a row reversed is the only edit allowed, and it can't be taken back.
-- (Clients can already insert their own XP rows — DECISIONS.md "XP writes from
-- the client are fine" — so this adds no new way to cheat.)
grant update (reversed_at) on public.xp_log to authenticated;
create policy "owner can mark reversed" on public.xp_log
  for update to authenticated
  using ((select auth.uid()) = user_id and reversed_at is null)
  with check ((select auth.uid()) = user_id and reversed_at is not null);

-- ─── reverse_xp: reverse a set of ledger rows ───────────────────────────────
-- Security invoker, so RLS limits it to the caller's rows. Writes one undo row
-- per pillar (the net of what's being reversed), then marks the originals.
-- Only earnings can be reversed — never a deduction (ignored need, broken
-- promise) or a bonus — so calling it directly can't erase a penalty.
create function public.reverse_xp(p_ids uuid[], p_note text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  total integer;
begin
  insert into public.xp_log (task_id, item_id, learning_session_id, pillar, amount, reason, note, reversed_at)
  select max(task_id::text)::uuid, max(item_id::text)::uuid, max(learning_session_id::text)::uuid,
         pillar, -sum(amount)::integer, 'undo', p_note, now()
  from public.xp_log
  where id = any(p_ids) and reversed_at is null and reason in ('completion', 'late_completion', 'learning')
  group by pillar
  having sum(amount) <> 0;

  select coalesce(sum(amount), 0) into total from public.xp_log
    where id = any(p_ids) and reversed_at is null and reason in ('completion', 'late_completion', 'learning');
  update public.xp_log set reversed_at = now()
    where id = any(p_ids) and reversed_at is null and reason in ('completion', 'late_completion', 'learning');
  return total;
end;
$$;
revoke all on function public.reverse_xp(uuid[], text) from public, anon;
grant execute on function public.reverse_xp(uuid[], text) to authenticated;

-- ─── undo_task ──────────────────────────────────────────────────────────────
-- Back to pending (or cancelled, for a task that only existed to record
-- something after the fact). Reverses the completion XP and whatever the
-- completion set off: the workout log, the fun count, application
-- requirements, a kept promise, practice time logged from the task.
create function public.undo_task(p_task_id uuid, p_cancel boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.tasks%rowtype;
  reversed integer;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if t.status <> 'done' then return jsonb_build_object('result', 'not_done', 'status', t.status); end if;

  reversed := public.reverse_xp(
    array(select id from public.xp_log where task_id = p_task_id and reason in ('completion', 'late_completion') and reversed_at is null),
    'undo: ' || t.title);

  update public.tasks
    set status = case when p_cancel then 'cancelled'::public.task_status else 'pending'::public.task_status end,
        done_at = null
    where id = p_task_id;

  delete from public.workout_logs where task_id = p_task_id;
  update public.application_requirements set done = false where task_id = p_task_id;
  update public.promises set status = 'open', kept_at = null where task_id = p_task_id and status = 'kept';
  update public.promises set kept_at = null where task_id = p_task_id and status = 'broken';
  if t.skill_id is not null then
    delete from public.learning_sessions
      where skill_id = t.skill_id and at = t.done_at and notes = 'From task: ' || t.title;
  end if;
  if t.fun_activity_id is not null then
    update public.fun_activities f
      set times_done = greatest(f.times_done - 1, 0),
          last_done_at = (select max(done_at) from public.tasks
                          where fun_activity_id = t.fun_activity_id and status = 'done' and id <> p_task_id)
      where f.id = t.fun_activity_id;
  end if;

  return jsonb_build_object('result', case when p_cancel then 'cancelled' else 'undone' end,
                            'title', t.title, 'xp', -reversed);
end;
$$;
revoke all on function public.undo_task(uuid, boolean) from public, anon;
grant execute on function public.undo_task(uuid, boolean) to authenticated;

-- ─── undo_learning ──────────────────────────────────────────────────────────
-- Reverses a session's XP and removes the session (streaks, review dates and
-- hours then read as if it never happened). The ledger keeps both rows.
create function public.undo_learning(p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.learning_sessions%rowtype;
  reversed integer;
begin
  select * into s from public.learning_sessions where id = p_session_id for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  reversed := public.reverse_xp(
    array(select id from public.xp_log where learning_session_id = p_session_id and reversed_at is null),
    'undo: learning ' || coalesce(s.topic, '') || ' (' || s.minutes || ' min)');
  delete from public.learning_sessions where id = p_session_id;
  return jsonb_build_object('result', 'undone', 'minutes', s.minutes, 'topic', s.topic, 'xp', -reversed);
end;
$$;
revoke all on function public.undo_learning(uuid) from public, anon;
grant execute on function public.undo_learning(uuid) to authenticated;
