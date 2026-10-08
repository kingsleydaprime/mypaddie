-- The "already paused for this event" marker must outlive a hold. apply_holds
-- forgets every nudge recorded in this run (sent_at = now) for someone on a
-- full hold (deep work, in class, sleeping…), so the message can be sent once
-- the hold ends. That's right for a message, wrong for the marker: the pause
-- itself already happened. Forgotten, it's recreated a minute later and
-- pauses a task they'd deliberately resumed. Recorded a moment before this
-- run, the clean-up leaves it alone.
create or replace function private.pause_for_events(p_now timestamptz default now())
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
    -- Not this run's timestamp, so apply_holds' clean-up of held messages leaves the marker.
    select user_id, id, 'event', 7, day, day, p_now - interval '1 millisecond' from starting
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
