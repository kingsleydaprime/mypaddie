-- Allow updating the unit of an existing pantry item during a stock-take (set).
-- Deltas still refuse mismatched units so incremental math is never mixed.

create or replace function public.adjust_pantry(p_changes jsonb)
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
      -- Only deltas cannot mix units; a stock-take (set) replaces the measurement.
      if not (c ? 'set') and c ? 'unit' and lower(c->>'unit') <> lower(item.unit) then
        raise exception '% is stored in %, not %', item.name, item.unit, c->>'unit' using errcode = 'check_violation';
      end if;

      update public.pantry_items set
        quantity = case
          when c ? 'set' then greatest(0, (c->>'set')::numeric)
          else greatest(0, quantity + coalesce((c->>'delta')::numeric, 0)) end,
        unit = case
          when c ? 'unit' and c ? 'set' then c->>'unit'
          else unit end,
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

revoke all on function public.adjust_pantry(jsonb) from public, anon;
grant execute on function public.adjust_pantry(jsonb) to authenticated;
