-- Commitments (jobs, roles, memberships, teams) and promises.
--
-- A commitment groups the things it puts on the calendar: its recurring
-- sessions are tasks (trainings, rehearsals, shifts), its one-offs are events
-- (competitions, meetings). Their time, plus an estimate of unscheduled hours,
-- is what the weekly load check weighs against capacity.
--
-- A promise is to someone, about something, usually by a date. It's carried
-- by a task (so it's on Today and gets reminded); a broken one costs XP.

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('full_time', 'part_time', 'freelance', 'internship', 'volunteer', 'leadership', 'membership', 'team', 'other')),
  -- What he is there: "Campus ambassador", "Striker", "Choir member", "Backend engineer".
  title text not null check (length(trim(title)) between 1 and 120),
  org text check (length(org) <= 120),
  priority text not null default 'important' check (priority in ('core', 'important', 'optional')),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  starts_on date,
  ends_on date,
  -- Unscheduled time per week (freelance work, admin, prep), in minutes.
  extra_minutes_per_week integer not null default 0 check (extra_minutes_per_week between 0 and 10080),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint ends_after_start check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index commitments_user_status_idx on public.commitments (user_id, status);

alter table public.tasks add column commitment_id uuid;
alter table public.tasks add foreign key (commitment_id, user_id)
  references public.commitments (id, user_id) on delete set null (commitment_id);
create index tasks_commitment_user_idx on public.tasks (commitment_id, user_id);

alter table public.events add column commitment_id uuid;
alter table public.events add foreign key (commitment_id, user_id)
  references public.commitments (id, user_id) on delete set null (commitment_id);
create index events_commitment_user_idx on public.events (commitment_id, user_id);

create table public.promises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person text not null check (length(trim(person)) between 1 and 100),
  what text not null check (length(trim(what)) between 1 and 300),
  made_at timestamptz not null default now(),
  -- null = no deadline: tracked, never counted as broken.
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'kept', 'released', 'broken')),
  kept_at timestamptz,
  -- They let him off it.
  released_at timestamptz,
  -- Times the date was moved (in time, by telling them).
  renegotiations integer not null default 0 check (renegotiations >= 0),
  task_id uuid,
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);
create index promises_user_status_due_idx on public.promises (user_id, status, due_at);
create index promises_task_user_idx on public.promises (task_id, user_id);

do $$
declare t text;
begin
  foreach t in array array['commitments', 'promises'] loop
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

-- A broken promise is written to the ledger against its task, once
-- (the existing unique index on task_id + pillar + reason makes it idempotent).
alter type public.xp_reason add value if not exists 'broken_promise';

-- A habit's next day stays tied to its commitment (copies everything else as before).
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
  select * into template from public.tasks
    where series_id = p_series_id
    order by occurs_on desc
    limit 1;
  if not found then
    return null;
  end if;

  insert into public.tasks (
    user_id, item_id, title, base_xp, due_at, recurrence, is_non_negotiable,
    series_id, occurs_on, duration_minutes, reminders, skill_id, reminder_note,
    fun_activity_id, topic, commitment_id
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on,
    template.duration_minutes, template.reminders, template.skill_id, template.reminder_note,
    template.fun_activity_id, template.topic, template.commitment_id
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
revoke all on function public.spawn_occurrence(uuid, date, timestamptz) from public, anon;
grant execute on function public.spawn_occurrence(uuid, date, timestamptz) to authenticated;
