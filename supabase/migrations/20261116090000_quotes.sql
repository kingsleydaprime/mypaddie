-- Quotes: lines that keep them going, shown one a day on Home. Built-in quotes
-- live in code (src/features/quotes/quotes.ts); these are their own, added in
-- the app or through chat, and shown more often than the built-in ones.

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(trim(text)) between 1 and 500),
  author text check (length(author) <= 120),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index quotes_user_idx on public.quotes (user_id, created_at);
-- The same quote twice is a mistake, not a preference (any case, any spacing at the ends).
create unique index quotes_user_text_idx on public.quotes (user_id, lower(trim(text)));

alter table public.quotes enable row level security;
revoke all on public.quotes from anon, authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
create policy "owner can read" on public.quotes for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can insert" on public.quotes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner can update" on public.quotes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner can delete" on public.quotes for delete to authenticated using ((select auth.uid()) = user_id);
