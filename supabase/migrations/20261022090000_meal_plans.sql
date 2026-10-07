-- Meal planning: recipes (saved, or learned from cooked meals) and a plan of
-- which recipe goes in which meal slot on which day.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  -- [{name, quantity, unit}] in pantry units.
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  -- Meal names it suits, lowercase ("breakfast", "lunch"); empty = any meal.
  slots text[] not null default '{}',
  minutes integer check (minutes between 1 and 600),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index recipes_name_per_user on public.recipes (user_id, lower(trim(name)));

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  -- The meal's name from their schedule ("Lunch").
  slot text not null check (length(trim(slot)) between 1 and 30),
  recipe_id uuid,
  -- Kept even if the recipe is deleted later.
  name text not null check (length(trim(name)) between 1 and 100),
  status text not null default 'planned' check (status in ('planned', 'cooked', 'skipped')),
  meal_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete set null (recipe_id)
);
create unique index meal_plans_one_per_slot on public.meal_plans (user_id, day, lower(slot));
create index meal_plans_recipe_user_idx on public.meal_plans (recipe_id, user_id);

-- meals didn't have the composite key yet; the plan points at the meal it became.
alter table public.meals add constraint meals_id_user_key unique (id, user_id);
alter table public.meal_plans add foreign key (meal_id, user_id) references public.meals (id, user_id) on delete set null (meal_id);
create index meal_plans_meal_user_idx on public.meal_plans (meal_id, user_id);

do $$
declare
  t text;
begin
  foreach t in array array['recipes', 'meal_plans'] loop
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
