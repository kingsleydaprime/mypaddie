-- "Where I am right now": a status with an end time that holds pushes, a class
-- that's running doing the same, phone-free windows, and "time to head out"
-- nudges while out. The rules mirror src/features/status/status.ts.

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('with_friends', 'out', 'at_work', 'in_class', 'deep_work', 'sleeping', 'worship', 'commuting', 'resting', 'other')),
  note text check (length(note) <= 200),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  -- Cleared before its end.
  ended_at timestamptz,
  -- "Time to head out" this many minutes before something starts.
  leave_lead_minutes integer not null default 30 check (leave_lead_minutes between 5 and 180),
  unique (id, user_id),
  constraint status_ends_after_start check (ends_at > started_at),
  constraint status_at_most_16h check (ends_at <= started_at + interval '16 hours')
);
create index statuses_user_active_idx on public.statuses (user_id, ends_at desc) where ended_at is null;

alter table public.statuses enable row level security;
revoke all on public.statuses from anon, authenticated;
grant select, insert, update, delete on public.statuses to authenticated;
create policy "owner can read" on public.statuses for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can insert" on public.statuses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner can update" on public.statuses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner can delete" on public.statuses for delete to authenticated using ((select auth.uid()) = user_id);

-- ─── holds: who shouldn't be pushed right now, and how much ─────────────────
-- 'all' = nothing arrives; 'soft' = only what's coming up. A status they set
-- beats a class (a cancelled lecture), which beats a phone-free window.
create function private.holds(p_now timestamptz default now())
returns table (user_id uuid, hold text, kind text, lead integer)
language sql
stable
set search_path = ''
as $$
  -- Pick the winner first, then drop "none": a "Busy" status they set still
  -- beats the timetable, it just holds nothing.
  select w.user_id, w.hold, w.kind, w.lead from (
  select distinct on (h.user_id) h.user_id, h.hold, h.kind, h.lead
  from (
    select s.user_id,
      case when s.kind in ('in_class', 'deep_work', 'sleeping', 'worship') then 'all'
           when s.kind in ('with_friends', 'out', 'at_work', 'commuting', 'resting') then 'soft'
           else 'none' end as hold,
      s.kind, s.leave_lead_minutes as lead, 1 as priority, s.started_at as since
    from public.statuses s
    where s.ended_at is null and s.started_at <= p_now and s.ends_at > p_now
    union all
    select t.user_id, 'all', 'in_class', null, 2, t.due_at
    from public.tasks t
    where t.course_id is not null and t.recurrence is not null and t.status <> 'cancelled'
      and t.due_at <= p_now and t.due_at + make_interval(mins => coalesce(t.duration_minutes, 60)) > p_now
    union all
    select c.user_id, 'all', 'phone_free', null, 3, null
    from private.user_clock(p_now) c
    left join public.settings st on st.user_id = c.user_id and st.key = 'schedule'
    cross join lateral (select private.setting_int(st.value, 'phoneFreeMorning', 0) as am,
                               private.setting_int(st.value, 'phoneFreeEvening', 0) as pm) w
    where (w.am > 0 and private.is_quiet(c.local_time, c.quiet_end, (c.quiet_end + make_interval(mins => w.am))::time))
       or (w.pm > 0 and private.is_quiet(c.local_time, (c.quiet_start - make_interval(mins => w.pm))::time, c.quiet_start))
  ) h
  order by h.user_id, h.priority, h.since desc nulls last
  ) w
  where w.hold <> 'none'
$$;
revoke all on function private.holds(timestamptz) from public;

-- ─── "Time to head out" ─────────────────────────────────────────────────────
alter table private.nudges drop constraint nudges_kind_check;
alter table private.nudges add constraint nudges_kind_check
  check (kind in ('nudge', 'checkin', 'brief', 'headsup', 'reminder', 'event', 'application', 'fun', 'review', 'close_out', 'leave'));

-- While with friends, out or at work: a timed task or an event starting within
-- the status's lead time gets one nudge. (Event leave nudges use level 0, which
-- event reminders never do, so they share the event index safely.)
create function private.collect_leave_nudges(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent jsonb;
begin
  with away as (
    select h.user_id, h.lead, c.tz, c.today, c.local_time, c.quiet_start, c.quiet_end
    from private.holds(p_now) h
    join private.user_clock(p_now) c on c.user_id = h.user_id
    where h.kind in ('with_friends', 'out', 'at_work')
      and not private.is_quiet(c.local_time, c.quiet_start, c.quiet_end)
  ),
  candidates as (
    select a.user_id, t.id as task_id, null::uuid as event_id, t.title, t.due_at as starts, a.tz, a.today, 1 as level
    from away a
    join public.tasks t on t.user_id = a.user_id
    where t.status = 'pending' and t.due_at > p_now and t.due_at <= p_now + make_interval(mins => a.lead)
      -- 23:59 is "any time that day", not a start time.
      and to_char(t.due_at at time zone a.tz, 'HH24:MI') <> '23:59'
    union all
    select a.user_id, null, e.id, e.title, o.at, a.tz, a.today, 0
    from away a
    join public.events e on e.user_id = a.user_id
    cross join lateral (select private.event_occurrence(e.starts_at, e.yearly, a.today, a.tz) as at) o
    where e.status = 'upcoming' and not e.all_day and o.at > p_now and o.at <= p_now + make_interval(mins => a.lead)
  ),
  recorded as (
    insert into private.nudges (user_id, task_id, event_id, kind, level, day, occurs_on, sent_at)
    select user_id, task_id, event_id, 'leave', level, today, today, p_now from candidates
    on conflict do nothing
    returning user_id, task_id, event_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'leave', 'level', 1, 'taskId', c.task_id, 'eventId', c.event_id, 'title', c.title,
      'due', to_char(c.starts at time zone c.tz, 'HH24:MI'), 'items', null
    )), '[]'::jsonb)
  into sent
  from recorded r
  join candidates c on c.user_id = r.user_id and c.task_id is not distinct from r.task_id and c.event_id is not distinct from r.event_id
  join public.push_subscriptions s on s.user_id = r.user_id;
  return sent;
end;
$$;
revoke all on function private.collect_leave_nudges(timestamptz) from public;

-- ─── send_nudges: collect, then hold back what a status says to hold ────────
-- Every collector records what it sends with sent_at = now() (one transaction,
-- one now()). For a held user, those records are deleted again before sending,
-- so the same nudge is found and tried on the next minute's run — it arrives
-- once the hold ends (if it still applies), instead of being lost.
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
  payload := private.collect_nudges() || private.collect_application_nudges() || private.collect_fun_nudges()
          || private.collect_review_nudges() || private.collect_close_out_nudges() || private.collect_leave_nudges();
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

-- Split out so it can be tested without the vault or the network.
create function private.apply_holds(p_payload jsonb, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept jsonb;
begin
  -- Forget this run's records for held users, except what a soft hold lets through.
  delete from private.nudges n
  using private.holds(p_now) h
  where n.user_id = h.user_id and n.sent_at = p_now
    and (h.hold = 'all' or n.kind not in ('reminder', 'headsup', 'event', 'leave'));

  select coalesce(jsonb_agg(p), '[]'::jsonb) into kept
  from jsonb_array_elements(p_payload) p
  left join public.push_subscriptions s on s.endpoint = p->>'endpoint'
  left join private.holds(p_now) h on h.user_id = s.user_id
  where h.user_id is null
     or (h.hold = 'soft' and p->>'kind' in ('reminder', 'headsup', 'event', 'leave'));
  return kept;
end;
$$;
revoke all on function private.apply_holds(jsonb, timestamptz) from public;
