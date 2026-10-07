-- Invite-only sign-up.
--
-- An invite is a short code, optionally tied to an email. A new account is
-- allowed only with a valid code (sent as user metadata `invite_code` by the
-- sign-up form) or an email that was invited — the second path is what makes
-- Google sign-in work, since an OAuth sign-up can't carry a code.
--
-- Enforced by Supabase Auth's "Before User Created" hook, which runs for every
-- sign-up method. The invite is marked used by a trigger once the account
-- actually exists. Creating invites goes through create_invite(), which checks
-- the creator's allowance (default 0: invites are handed out deliberately).

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Tied to one email (lower-case), or null = anyone with the code.
  email text check (email is null or email = lower(email)),
  note text check (length(note) <= 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create index invites_created_by_idx on public.invites (created_by);
create index invites_email_idx on public.invites (email) where email is not null;

-- Who may create invites, and how many. No row = 0.
create table private.invite_allowances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  allowance integer not null check (allowance >= 0)
);

-- Read your own invites and revoke them; creating goes through create_invite().
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
grant select, update (revoked_at) on public.invites to authenticated;
create policy "creator can read" on public.invites for select to authenticated using ((select auth.uid()) = created_by);
create policy "creator can revoke" on public.invites for update to authenticated
  using ((select auth.uid()) = created_by and used_at is null)
  with check ((select auth.uid()) = created_by);

-- ─── Creating an invite ─────────────────────────────────────────────────────
-- 8 characters without look-alikes (no 0/O, 1/I/L), from the random bits of a v4 UUID.
create function private.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(uuid_send(gen_random_uuid()), i) % 31) + 1, 1), '')
  from generate_series(0, 7) i
$$;

create function public.create_invite(p_email text default null, p_note text default null)
returns table (code text, invites_left integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  allowed integer;
  used integer;
  new_code text;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  allowed := coalesce((select a.allowance from private.invite_allowances a where a.user_id = me), 0);
  -- Revoked invites give the slot back; used and pending ones count.
  used := (select count(*) from public.invites i where i.created_by = me and i.revoked_at is null);
  if used >= allowed then
    raise exception 'no invites left' using errcode = 'P0001', hint = format('allowance %s, used %s', allowed, used);
  end if;
  for attempt in 1..5 loop
    new_code := private.new_invite_code();
    begin
      insert into public.invites (code, created_by, email, note)
        values (new_code, me, nullif(lower(trim(p_email)), ''), nullif(trim(p_note), ''));
      exit;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;
  return query select new_code, allowed - used - 1;
end;
$$;
revoke all on function public.create_invite(text, text) from public, anon;
grant execute on function public.create_invite(text, text) to authenticated;

create function public.invites_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    coalesce((select a.allowance from private.invite_allowances a where a.user_id = auth.uid()), 0)
    - (select count(*)::int from public.invites i where i.created_by = auth.uid() and i.revoked_at is null))
$$;
revoke all on function public.invites_left() from public, anon;
grant execute on function public.invites_left() to authenticated;

-- ─── The gate ───────────────────────────────────────────────────────────────
-- The invite that admits this sign-up, if any: by code (and the code's email,
-- if it has one, must match), else by invited email.
create function private.admitting_invite(p_email text, p_code text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select i.id from public.invites i
  where i.used_at is null and i.revoked_at is null and i.expires_at > now()
    and (
      (p_code is not null and i.code = p_code and (i.email is null or i.email = p_email))
      or (p_email is not null and i.email = p_email)
    )
  order by (i.code = p_code) desc nulls last, i.created_at
  limit 1
$$;

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  email text := nullif(lower(trim(event->'user'->>'email')), '');
  code text := nullif(upper(trim(event->'user'->'user_metadata'->>'invite_code')), '');
begin
  if coalesce((event->'user'->>'is_anonymous')::boolean, false) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'MyPaddie needs a real account — anonymous sign-ins are off.'));
  end if;
  if private.admitting_invite(email, code) is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', case when code is null
        then 'MyPaddie is invite-only for now. Ask whoever told you about it for an invite code.'
        else 'That invite code isn''t valid — it may be used, expired, or for a different email.' end));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.admitting_invite(text, text) to supabase_auth_admin;

-- Once the account exists, its invite is used up.
create function private.consume_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite uuid := private.admitting_invite(
    nullif(lower(trim(new.email)), ''),
    nullif(upper(trim(new.raw_user_meta_data->>'invite_code')), ''));
begin
  if invite is not null then
    update public.invites set used_at = now(), used_by = new.id where id = invite;
  end if;
  return new;
end;
$$;
create trigger consume_invite after insert on auth.users
  for each row execute function private.consume_invite();

revoke all on function private.new_invite_code() from public;
revoke all on function private.admitting_invite(text, text) from public;
revoke all on function private.consume_invite() from public;
