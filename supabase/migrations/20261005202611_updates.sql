-- Updates: things he owes someone — a weekly report to a manager, a progress
-- note to a mentor, a spreadsheet to keep current. Each is a task (so it's on
-- Today and reminded); a log of what was sent lets the next draft start where
-- the last one ended.

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient text not null check (length(trim(recipient)) > 0),
  channel text not null default 'other'
    check (channel in ('email', 'whatsapp', 'slack', 'spreadsheet', 'call', 'meeting', 'other')),
  -- What the update covers, so the draft picks the right work.
  about text not null check (length(trim(about)) > 0),
  -- How he likes it written, e.g. "3 bullets: done, next, blockers".
  format text,
  -- The task that carries it (a recurring habit for regular updates).
  task_id uuid,
  active boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);
create index updates_task_user_idx on public.updates (task_id, user_id);

create table public.update_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  update_id uuid not null,
  sent_at timestamptz not null default now(),
  -- What was actually sent (optional), for reference and tone next time.
  content text,
  foreign key (update_id, user_id) references public.updates (id, user_id) on delete cascade
);
create index update_log_update_user_idx on public.update_log (update_id, user_id, sent_at desc);

do $$
declare t text;
begin
  foreach t in array array['updates', 'update_log'] loop
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

-- ─── record_update_sent: log it and move the "since" marker, together ───────
create function public.record_update_sent(p_update_id uuid, p_content text, p_at timestamptz)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.updates set last_sent_at = coalesce(p_at, now()) where id = p_update_id;
  if not found then return 'not_found'; end if;
  insert into public.update_log (update_id, content, sent_at) values (p_update_id, nullif(trim(p_content), ''), coalesce(p_at, now()));
  return 'logged';
end;
$$;

revoke all on function public.record_update_sent(uuid, text, timestamptz) from public, anon;
grant execute on function public.record_update_sent(uuid, text, timestamptz) to authenticated;
