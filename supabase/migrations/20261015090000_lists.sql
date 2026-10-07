-- Lists they make themselves: a bucket list, gift ideas, places to visit,
-- things to buy for school. Items can be ticked off; progress is done / total.

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  description text check (length(description) <= 500),
  -- Show "7 of 20 · 35%"? Off for lists that aren't about finishing (gift ideas).
  show_progress boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index lists_title_per_user on public.lists (user_id, lower(title));

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid not null,
  text text not null check (length(trim(text)) between 1 and 300),
  note text check (length(note) <= 1000),
  done boolean not null default false,
  done_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (list_id, user_id) references public.lists (id, user_id) on delete cascade
);
create index list_items_list_user_idx on public.list_items (list_id, user_id);

do $$
declare t text;
begin
  foreach t in array array['lists', 'list_items'] loop
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
