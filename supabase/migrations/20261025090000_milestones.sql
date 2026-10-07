-- Milestones and the life timeline. A milestone sits under a goal or dream and
-- pays 3× when hit (once — the ledger checks); a moment is a big life event,
-- past or planned, with what came before and after, and no XP.

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'milestone' check (kind in ('milestone', 'moment')),
  item_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  -- Planned for (or, for a moment that happened, when).
  on_date date,
  status text not null default 'planned' check (status in ('planned', 'achieved', 'dropped')),
  achieved_on date,
  -- What life looked like before, and what changed after. In their words.
  before text check (length(before) <= 1000),
  after text check (length(after) <= 1000),
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete set null (item_id),
  constraint milestone_needs_an_item check (kind = 'moment' or item_id is not null),
  constraint achieved_on_matches_status check ((status = 'achieved') = (achieved_on is not null))
);
create index milestones_user_date_idx on public.milestones (user_id, coalesce(achieved_on, on_date));
create index milestones_item_user_idx on public.milestones (item_id, user_id);

alter table public.milestones enable row level security;
revoke all on public.milestones from anon, authenticated;
grant select, insert, update, delete on public.milestones to authenticated;
create policy "owner can read" on public.milestones for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can insert" on public.milestones for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner can update" on public.milestones for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner can delete" on public.milestones for delete to authenticated using ((select auth.uid()) = user_id);

-- Each milestone pays once, ever (dream_milestone rows per item may repeat — one per milestone).
alter table public.xp_log add column milestone_id uuid;
alter table public.xp_log add foreign key (milestone_id, user_id) references public.milestones (id, user_id) on delete set null (milestone_id);
create index xp_log_milestone_user_idx on public.xp_log (milestone_id, user_id);
create unique index xp_log_once_per_milestone on public.xp_log (milestone_id, pillar, reason) where milestone_id is not null;

create or replace function public.award_xp(p_entries jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.xp_log (task_id, item_id, learning_session_id, milestone_id, pillar, amount, reason, note, at)
  select e.task_id, e.item_id, e.learning_session_id, e.milestone_id, e.pillar, e.amount, e.reason, e.note, coalesce(e.at, now())
  from jsonb_to_recordset(p_entries) as e(
    task_id uuid, item_id uuid, learning_session_id uuid, milestone_id uuid, pillar public.pillar, amount integer,
    reason public.xp_reason, note text, at timestamptz
  )
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ─── achieve_milestone: mark it and pay, in one go, once ────────────────────
create function public.achieve_milestone(p_id uuid, p_on date, p_entries jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m public.milestones%rowtype;
  awarded integer;
begin
  update public.milestones set status = 'achieved', achieved_on = p_on
    where id = p_id and status = 'planned'
    returning * into m;
  if not found then
    select * into m from public.milestones where id = p_id;
    return jsonb_build_object('result', case when m.id is null then 'not_found' else 'already_' || m.status end);
  end if;
  awarded := public.award_xp((
    select coalesce(jsonb_agg(e || jsonb_build_object('milestone_id', p_id, 'item_id', m.item_id, 'task_id', null)), '[]'::jsonb)
    from jsonb_array_elements(p_entries) as e));
  return jsonb_build_object('result', 'achieved', 'xp_rows', awarded);
end;
$$;
revoke all on function public.achieve_milestone(uuid, date, jsonb) from public, anon;
grant execute on function public.achieve_milestone(uuid, date, jsonb) to authenticated;
