-- Pantry stock and meal history.

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  quantity numeric(10, 2) not null default 0 check (quantity >= 0),
  -- One unit per item, normalised by the app (kg, g, l, ml, pieces, tins…). No conversions.
  unit text not null check (length(trim(unit)) > 0),
  category text not null default 'other',
  -- At or below this, it's on the shopping list.
  low_at numeric(10, 2) check (low_at >= 0),
  updated_at timestamptz not null default now()
);
create unique index pantry_items_name_per_user on public.pantry_items (user_id, lower(name));

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- [{name, quantity, unit}] as used, kept even if the pantry item is later deleted.
  ingredients jsonb not null default '[]'::jsonb,
  notes text,
  at timestamptz not null default now()
);
create index meals_user_at_idx on public.meals (user_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['pantry_items', 'meals'] loop
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

-- ─── adjust_pantry: several stock changes in one transaction ────────────────
-- p_changes: [{name, unit, delta? | set?, category?, low_at?}]
--   delta: add (positive) or use (negative), floored at 0; creates the item if new.
--   set:   the exact amount now (a stock-take).
-- A unit that differs from the item's stored unit is an error, never mixed.
create function public.adjust_pantry(p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c jsonb;
  item public.pantry_items%rowtype;
  result jsonb := '[]'::jsonb;
begin
  for c in select * from jsonb_array_elements(p_changes) loop
    select * into item from public.pantry_items where lower(name) = lower(trim(c->>'name')) for update;

    if not found then
      insert into public.pantry_items (name, quantity, unit, category, low_at)
        values (trim(c->>'name'),
                greatest(0, coalesce((c->>'set')::numeric, (c->>'delta')::numeric, 0)),
                c->>'unit',
                coalesce(c->>'category', 'other'),
                (c->>'low_at')::numeric)
        returning * into item;
    else
      if c ? 'unit' and lower(c->>'unit') <> lower(item.unit) then
        raise exception '% is stored in %, not %', item.name, item.unit, c->>'unit' using errcode = 'check_violation';
      end if;
      update public.pantry_items set
        quantity = case
          when c ? 'set' then greatest(0, (c->>'set')::numeric)
          else greatest(0, quantity + coalesce((c->>'delta')::numeric, 0)) end,
        category = coalesce(c->>'category', category),
        low_at = case when c ? 'low_at' then (c->>'low_at')::numeric else low_at end,
        updated_at = now()
      where id = item.id
      returning * into item;
    end if;

    result := result || jsonb_build_object('name', item.name, 'quantity', item.quantity, 'unit', item.unit);
  end loop;
  return result;
end;
$$;

-- ─── cook_meal: record the meal and use up its ingredients ──────────────────
-- Ingredients not in the pantry are reported back as `missing`, not errors:
-- you can cook with something you never logged.
create function public.cook_meal(p_name text, p_ingredients jsonb, p_notes text, p_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meal_id uuid;
  i jsonb;
  missing jsonb := '[]'::jsonb;
  used jsonb := '[]'::jsonb;
begin
  insert into public.meals (name, ingredients, notes, at)
    values (p_name, coalesce(p_ingredients, '[]'::jsonb), p_notes, coalesce(p_at, now()))
    returning id into meal_id;

  for i in select * from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) loop
    if exists (select 1 from public.pantry_items where lower(name) = lower(trim(i->>'name'))) then
      used := used || public.adjust_pantry(jsonb_build_array(jsonb_build_object(
        'name', i->>'name', 'unit', i->>'unit', 'delta', -1 * (i->>'quantity')::numeric)));
    else
      missing := missing || to_jsonb(i->>'name');
    end if;
  end loop;

  return jsonb_build_object('meal_id', meal_id, 'used', used, 'missing', missing);
end;
$$;

revoke all on function public.adjust_pantry(jsonb) from public, anon;
revoke all on function public.cook_meal(text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.adjust_pantry(jsonb) to authenticated;
grant execute on function public.cook_meal(text, jsonb, text, timestamptz) to authenticated;
