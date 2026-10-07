-- Deleting your own account, and per-user rate limits for the AI endpoint.

-- ─── Delete my account ──────────────────────────────────────────────────────
-- No admin key exists in this app, so the database does it: the caller's
-- auth.users row goes, and every table's ON DELETE CASCADE takes their data
-- with it (sessions and AI app grants live in auth.* and cascade too).
-- Only ever the caller: auth.uid(), never a parameter.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ─── Rate limits ────────────────────────────────────────────────────────────
-- Fixed windows per user and bucket. The MCP route calls rate_hit() once per
-- request; over the limit it answers 429. Rows older than a day are cleared as
-- they go, so the table stays tiny.
create table private.rate_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, bucket, window_start)
);

create function public.rate_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  win timestamptz;
  n integer;
begin
  if me is null then
    return false;
  end if;
  win := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_counters (user_id, bucket, window_start, hits)
    values (me, p_bucket, win, 1)
  on conflict (user_id, bucket, window_start) do update set hits = private.rate_counters.hits + 1
  returning hits into n;
  delete from private.rate_counters where user_id = me and window_start < now() - interval '1 day';
  return n <= p_limit;
end;
$$;
revoke all on function public.rate_hit(text, integer, integer) from public, anon;
grant execute on function public.rate_hit(text, integer, integer) to authenticated;
