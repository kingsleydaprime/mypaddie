-- Learning log: the skills you're learning and every session spent on them.

alter type public.xp_reason add value if not exists 'learning';

-- ─── skills ─────────────────────────────────────────────────────────────────
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- Where its XP goes: 'skills' for DSA/LeetCode, 'academic' for coursework, …
  pillar public.pillar not null default 'skills',
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  -- Optional: the goal this skill serves.
  item_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete set null (item_id)
);
-- "DSA" and "dsa" are the same skill.
create unique index skills_name_per_user on public.skills (user_id, lower(name));
create index skills_item_user_idx on public.skills (item_id, user_id);

-- ─── learning_sessions ──────────────────────────────────────────────────────
create table public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  skill_id uuid not null,
  topic text,
  minutes integer not null check (minutes between 1 and 720),
  -- "3 problems", "2 chapters": a number and what it counts.
  count integer check (count >= 0),
  unit text,
  -- How solid it feels afterwards, 1–5. Drives when the topic is due for review.
  confidence smallint check (confidence between 1 and 5),
  notes text,
  at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (skill_id, user_id) references public.skills (id, user_id) on delete cascade,
  constraint unit_needs_count check (unit is null or count is not null)
);
create index learning_sessions_user_at_idx on public.learning_sessions (user_id, at desc);
create index learning_sessions_skill_user_idx on public.learning_sessions (skill_id, user_id);

-- ─── RLS: owner only, same shape as every other table ───────────────────────
do $$
declare t text;
begin
  foreach t in array array['skills', 'learning_sessions'] loop
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

-- ─── XP for a session can be paid once ──────────────────────────────────────
alter table public.xp_log add column learning_session_id uuid;
alter table public.xp_log add foreign key (learning_session_id, user_id)
  references public.learning_sessions (id, user_id) on delete set null (learning_session_id);
create index xp_log_learning_user_idx on public.xp_log (learning_session_id, user_id);
create unique index xp_log_once_per_learning_session
  on public.xp_log (learning_session_id, pillar, reason) where learning_session_id is not null;

-- award_xp now understands learning_session_id too.
create or replace function public.award_xp(p_entries jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.xp_log (task_id, item_id, learning_session_id, pillar, amount, reason, note, at)
  select e.task_id, e.item_id, e.learning_session_id, e.pillar, e.amount, e.reason, e.note, coalesce(e.at, now())
  from jsonb_to_recordset(p_entries) as e(
    task_id uuid, item_id uuid, learning_session_id uuid, pillar public.pillar, amount integer,
    reason public.xp_reason, note text, at timestamptz
  )
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ─── record_learning: the session and its XP, together ──────────────────────
create function public.record_learning(
  p_skill_id uuid, p_topic text, p_minutes integer, p_count integer, p_unit text,
  p_confidence smallint, p_notes text, p_at timestamptz, p_xp jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_id uuid;
begin
  insert into public.learning_sessions (skill_id, topic, minutes, count, unit, confidence, notes, at)
    values (p_skill_id, nullif(trim(p_topic), ''), p_minutes, p_count, nullif(trim(p_unit), ''),
            p_confidence, p_notes, coalesce(p_at, now()))
    returning id into session_id;
  perform public.award_xp((
    select coalesce(jsonb_agg(e || jsonb_build_object('learning_session_id', session_id, 'at', coalesce(p_at, now()))), '[]'::jsonb)
    from jsonb_array_elements(p_xp) as e
  ));
  return session_id;
end;
$$;

revoke all on function public.record_learning(uuid, text, integer, integer, text, smallint, text, timestamptz, jsonb) from public, anon;
grant execute on function public.record_learning(uuid, text, integer, integer, text, smallint, text, timestamptz, jsonb) to authenticated;
