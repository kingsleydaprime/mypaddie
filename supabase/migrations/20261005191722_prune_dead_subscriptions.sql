-- Dead push subscriptions: when a phone uninstalls the app, the push service
-- answers 404/410 and /api/push reports that endpoint in `gone`. pg_net keeps
-- those responses for a few hours; each run of the nudge job now reads the
-- recent ones and deletes the dead subscriptions, so nothing keeps sending to
-- a device that no longer exists.

-- Response bodies are untrusted text: anything that isn't JSON is skipped.
create function private.try_jsonb(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::jsonb;
exception when others then
  return null;
end;
$$;

create function private.prune_dead_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.push_subscriptions
  where endpoint in (
    select jsonb_array_elements_text(private.try_jsonb(r.content) -> 'gone')
    from net._http_response r
    where r.created > now() - interval '30 minutes'
      and r.status_code = 200
      and jsonb_typeof(private.try_jsonb(r.content) -> 'gone') = 'array'
  );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- send_nudges: as before, plus pruning first.
create or replace function private.send_nudges()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'mypaddie_push_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'mypaddie_push_secret');
  payload jsonb;
begin
  perform private.prune_dead_subscriptions();
  perform private.spawn_today();
  if url is null or secret is null then
    return;
  end if;
  payload := private.collect_nudges();
  if jsonb_array_length(payload) > 0 then
    perform net.http_post(
      url := url,
      body := jsonb_build_object('nudges', payload),
      headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
      timeout_milliseconds := 10000
    );
  end if;
end;
$$;

revoke all on function private.try_jsonb(text) from public;
revoke all on function private.prune_dead_subscriptions() from public;
revoke all on function private.send_nudges() from public;
