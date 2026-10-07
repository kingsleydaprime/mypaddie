-- Undo a slip logged by mistake (wrong task, or it was done after all). A slip
-- has no ledger of its own, so it's deleted: mode, stats, reviews and the
-- repeat-excuse rule should all read as if it never happened. Its task goes
-- back from 'skipped' to 'pending' unless another slip still explains it.
create function public.undo_slip(p_slip_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.slips%rowtype;
  title text;
begin
  delete from public.slips where id = p_slip_id returning * into s;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  select t.title into title from public.tasks t where t.id = s.task_id;
  update public.tasks set status = 'pending'
    where id = s.task_id and status = 'skipped'
      and not exists (select 1 from public.slips o where o.task_id = s.task_id);
  return jsonb_build_object('result', 'undone', 'title', title, 'why', s.why, 'wasAccepted', s.accepted);
end;
$$;
revoke all on function public.undo_slip(uuid) from public, anon;
grant execute on function public.undo_slip(uuid) to authenticated;
