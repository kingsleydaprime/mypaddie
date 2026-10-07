-- The sign-up page checks an invite before sending anyone to Google or their
-- inbox, and ties an open code to the email they'll sign up with. That's what
-- lets an open code work with Google, whose sign-up can't carry the code: the
-- hook then admits that email.
--
-- A code tied by the host stays tied. One tied by claiming can be claimed
-- again (a typo in the email shouldn't burn the invite).

alter table public.invites add column bound_by_claim boolean not null default false;

create function public.claim_invite(p_code text, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  inv public.invites%rowtype;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return 'bad_email';
  end if;
  select * into inv from public.invites i where i.code = v_code;
  if not found or inv.revoked_at is not null then
    return 'invalid';
  end if;
  if inv.used_at is not null then
    return 'used';
  end if;
  if inv.expires_at <= now() then
    return 'expired';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return 'has_account';
  end if;
  if inv.email is not null and inv.email <> v_email and not inv.bound_by_claim then
    return 'other_email';
  end if;
  update public.invites set email = v_email, bound_by_claim = (inv.email is null or inv.bound_by_claim)
    where id = inv.id;
  return 'ok';
end;
$$;
revoke all on function public.claim_invite(text, text) from public;
grant execute on function public.claim_invite(text, text) to anon, authenticated;
