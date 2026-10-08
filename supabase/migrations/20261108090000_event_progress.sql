-- Events can be in progress. A timed event is in progress from its start
-- (or from when they started it early: started_at) until it ends — worked out
-- from the time, nothing stored for the automatic part. All-day and yearly
-- events (birthdays) aren't started or finished: marking a yearly one done
-- would end it for every year.
alter table public.events add column started_at timestamptz;

-- When a timed event starts, it takes over: a task that's running is paused
-- (its time so far kept, as pause_task does) and they're told. Once per event
-- — the marker is a level-7 event nudge — so resuming the task during the
-- meeting sticks. Not if they started the event themselves (that pauses the
-- task there and then).
create function private.pause_for_events(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent jsonb;
begin
  with clock as (
    select * from private.user_clock(p_now)
  ),
  starting as (
    select e.id, e.user_id, e.title, (e.starts_at at time zone c.tz)::date as day
    from public.events e
    join clock c on c.user_id = e.user_id
    where e.status = 'upcoming' and not e.all_day and not e.yearly and e.started_at is null
      and e.starts_at <= p_now and p_now - e.starts_at < interval '10 minutes'
      and not exists (select 1 from private.nudges n where n.event_id = e.id and n.level = 7)
  ),
  marked as (
    insert into private.nudges (user_id, event_id, kind, level, day, occurs_on, sent_at)
    select user_id, id, 'event', 7, day, day, p_now from starting
    on conflict do nothing
    returning user_id, event_id
  ),
  paused as (
    update public.tasks t
      set spent_minutes = t.spent_minutes + case
            when p_now - t.started_at <= interval '12 hours' then greatest(1, round(extract(epoch from p_now - t.started_at) / 60))::integer
            else 0 end,
          started_at = null
    from marked m
    where t.user_id = m.user_id and t.status = 'pending' and t.started_at is not null
    returning t.user_id, t.title, m.event_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'event', 'level', 7, 'title', e.title, 'eventId', e.id, 'items', jsonb_build_array(p.title)
    )), '[]'::jsonb)
  into sent
  from paused p
  join public.events e on e.id = p.event_id
  join clock c on c.user_id = p.user_id
  join public.push_subscriptions s on s.user_id = p.user_id
  -- The pause always happens; the message follows quiet hours like any other.
  where not private.is_quiet(c.local_time, c.quiet_start, c.quiet_end);
  return sent;
end;
$$;
revoke all on function private.pause_for_events(timestamptz) from public;

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
  paused jsonb;
begin
  perform private.prune_dead_subscriptions();
  perform private.spawn_today();
  -- Before the push check: an event starting pauses the running task whether or not pushes are set up.
  paused := private.pause_for_events();
  if url is null or secret is null then
    return;
  end if;
  payload := private.collect_nudges() || private.collect_application_nudges() || private.collect_fun_nudges()
          || private.collect_review_nudges() || private.collect_close_out_nudges() || private.collect_leave_nudges()
          || paused;
  payload := private.apply_holds(payload, now());
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
revoke all on function private.send_nudges() from public;
