-- An 11th pillar: coursework and studying for school. DSA/LeetCode-style
-- practice stays under "skills". Appended last so the existing pillar order
-- (used to break ties when splitting XP) doesn't change. Mirrors PILLARS in
-- src/shared/domain.ts.
alter type public.pillar add value if not exists 'academic';

-- ─── set_task_weights: replace a task's pillar split in one transaction ─────
-- Delete-then-insert would briefly leave a task with no weights; inside one
-- function it's atomic, and the deferred trigger still checks the new set
-- sums to 100 at commit.
create function public.set_task_weights(p_task_id uuid, p_weights jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tasks where id = p_task_id) then
    raise exception 'task not found' using errcode = 'no_data_found';
  end if;
  delete from public.task_pillars where task_id = p_task_id;
  insert into public.task_pillars (task_id, pillar, weight)
    select p_task_id, w.pillar, w.weight
    from jsonb_to_recordset(p_weights) as w(pillar public.pillar, weight integer);
end;
$$;

revoke all on function public.set_task_weights(uuid, jsonb) from public, anon;
grant execute on function public.set_task_weights(uuid, jsonb) to authenticated;
