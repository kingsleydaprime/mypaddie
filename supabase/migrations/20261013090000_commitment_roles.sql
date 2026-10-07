-- Role history for commitments: Member (Sep 2025 – Mar 2026) → Secretary (since Mar 2026).
-- commitments.title stays the current role; every role, with its dates, lives here.

create table public.commitment_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  commitment_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 120),
  starts_on date,
  -- null = the current role.
  ends_on date,
  notes text check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (commitment_id, user_id) references public.commitments (id, user_id) on delete cascade,
  constraint role_ends_after_start check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index commitment_roles_commitment_user_idx on public.commitment_roles (commitment_id, user_id);
-- At most one current role per commitment.
create unique index commitment_roles_one_current on public.commitment_roles (commitment_id) where ends_on is null;

alter table public.commitment_roles enable row level security;
revoke all on public.commitment_roles from anon, authenticated;
grant select, insert, update, delete on public.commitment_roles to authenticated;
create policy "owner can read" on public.commitment_roles for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can insert" on public.commitment_roles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner can update" on public.commitment_roles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner can delete" on public.commitment_roles for delete to authenticated using ((select auth.uid()) = user_id);

-- Every existing commitment starts with its current title as its first role.
insert into public.commitment_roles (user_id, commitment_id, title, starts_on, ends_on)
select c.user_id, c.id, c.title, c.starts_on,
       case when c.status = 'ended' then greatest(coalesce(c.ends_on, current_date), coalesce(c.starts_on, c.ends_on, current_date)) end
from public.commitments c;
