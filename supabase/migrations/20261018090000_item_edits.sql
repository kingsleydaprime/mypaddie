-- Items can be edited, finished, paused, dropped and reopened. Finishing a
-- goal or a wish pays the blueprint's bonus, which the engine has had since
-- Day 1 but nothing called.

alter table public.items
  add column done_at timestamptz,
  add column status_changed_at timestamptz;
update public.items set done_at = created_at where status = 'done';
alter table public.items
  add constraint item_done_at_matches_status check ((status = 'done') = (done_at is not null));

-- ─── complete_item: mark done and pay the bonus in one transaction ──────────
-- Like complete_task: the engine computes the entries, this only stores them.
-- Safe to retry. Reopening and finishing again pays nothing the second time,
-- because the ledger allows one goal/wish bonus per item.

create function public.complete_item(p_item_id uuid, p_done_at timestamptz, p_entries jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status public.item_status;
  awarded integer;
begin
  update public.items
    set status = 'done', done_at = p_done_at, status_changed_at = now()
    where id = p_item_id and status in ('active', 'paused');

  if not found then
    select status into current_status from public.items where id = p_item_id;
    return jsonb_build_object(
      'result', case
        when current_status is null then 'not_found'
        when current_status = 'done' then 'already_done'
        else current_status::text
      end
    );
  end if;

  awarded := public.award_xp((
    select coalesce(jsonb_agg(e || jsonb_build_object('item_id', p_item_id, 'task_id', null, 'at', p_done_at)), '[]'::jsonb)
    from jsonb_array_elements(p_entries) as e
  ));
  return jsonb_build_object('result', 'completed', 'xp_rows', awarded);
end;
$$;
revoke all on function public.complete_item(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.complete_item(uuid, timestamptz, jsonb) to authenticated;
