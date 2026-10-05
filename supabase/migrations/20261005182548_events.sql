-- Events: things you attend or remember (meetings, parties, birthdays,
-- anniversaries, weddings) — separate from tasks, which are things you do.
-- Important × close decides how hard they're surfaced.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  kind text not null default 'other'
    check (kind in ('meeting', 'social', 'birthday', 'anniversary', 'wedding', 'appointment', 'deadline', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at > starts_at),
  all_day boolean not null default false,
  important boolean not null default false,
  -- Birthdays, anniversaries: repeats on the same date every year.
  yearly boolean not null default false,
  person text,
  location text,
  notes text,
  status text not null default 'upcoming' check (status in ('upcoming', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);
create index events_user_starts_idx on public.events (user_id, starts_at);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;
create policy "owner can read" on public.events for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can insert" on public.events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner can update" on public.events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner can delete" on public.events for delete to authenticated using ((select auth.uid()) = user_id);

-- ─── Next occurrence ────────────────────────────────────────────────────────
-- A one-off event occurs at starts_at. A yearly one occurs on the same local
-- date this year, or next year once this year's has passed. 29 February
-- falls on the 28th in non-leap years. Mirrors nextOccurrence() in
-- src/features/events/events.ts.
create function private.event_occurrence(p_starts timestamptz, p_yearly boolean, p_today date)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  local_start timestamp := p_starts at time zone 'Africa/Lagos';
  d date := local_start::date;
  y integer := extract(year from p_today)::integer;
  occ date;
begin
  if not p_yearly or d >= p_today then
    return p_starts;
  end if;
  for attempt in 0..1 loop
    begin
      occ := make_date(y + attempt, extract(month from d)::integer, extract(day from d)::integer);
    exception when datetime_field_overflow then
      occ := make_date(y + attempt, 2, 28);
    end;
    if occ >= p_today then
      return (occ + local_start::time) at time zone 'Africa/Lagos';
    end if;
  end loop;
  return null; -- unreachable: next year's date is always ≥ today
end;
$$;
revoke all on function private.event_occurrence(timestamptz, boolean, date) from public;

-- ─── Nudge bookkeeping for events ───────────────────────────────────────────
alter table private.nudges
  add column event_id uuid references public.events (id) on delete cascade,
  add column occurs_on date;
alter table private.nudges drop constraint nudges_kind_check;
alter table private.nudges add constraint nudges_kind_check
  check (kind in ('nudge', 'checkin', 'brief', 'headsup', 'reminder', 'event'));
-- Each event reminder once per occurrence — a birthday is reminded every year.
create unique index nudges_event_level_occurrence on private.nudges (event_id, level, occurs_on) where event_id is not null;
create index nudges_event_idx on private.nudges (event_id);

-- ─── collect_nudges, v4: tasks as before, plus events ───────────────────────
-- Event reminders (kind 'event', level):
--   1 within the week (2–7 days out, from 09:00)    important only
--   2 the evening before, from 20:00                 all
--   3 the morning of, from 09:00                     important, and birthdays/anniversaries
--   4 30 minutes before                              timed events
create or replace function private.collect_nudges(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_time time := (p_now at time zone 'Africa/Lagos')::time;
  today date := (p_now at time zone 'Africa/Lagos')::date;
  sent jsonb;
begin
  if local_time >= '22:00' or local_time < '07:00' then
    return '[]'::jsonb;
  end if;

  with open_tasks as (
    select t.*,
      (t.is_non_negotiable or (t.must_from is not null and t.must_from <= p_now)) as must,
      (t.due_at at time zone 'Africa/Lagos')::date as due_day,
      coalesce(t.reminders, case when t.series_id is not null then array['10'] else array['eve', 'morning', '30', '10'] end) as ladder
    from public.tasks t
    where t.status = 'pending'
  ),
  escalations as (
    select t.user_id, t.id as task_id, null::uuid as event_id, 'nudge'::text as kind,
           (coalesce(max(n.level), 0) + 1)::smallint as level, null::date as occurs_on
    from open_tasks t
    left join private.nudges n on n.task_id = t.id and n.kind = 'nudge' and n.day = today
    where t.must
      and ((t.due_at <= p_now and t.due_day = today)
           or (t.must_from <= p_now and (t.due_at is null or t.due_day >= today)))
    group by t.user_id, t.id
    having coalesce(max(n.level), 0) < 4
       and (max(n.sent_at) is null or max(n.sent_at) <= p_now - interval '60 minutes')
  ),
  checkins as (
    select t.user_id, t.id, null::uuid, 'checkin'::text, 1::smallint, null::date
    from open_tasks t
    where not t.must and t.due_at <= p_now and t.due_day = today
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'checkin')
  ),
  reminders as (
    select t.user_id, t.id, null::uuid, 'reminder'::text, r.level, null::date
    from open_tasks t
    cross join lateral (values
      (1::smallint, 'eve',     local_time >= '20:00' and t.due_day = today + 1),
      (2::smallint, 'morning', local_time >= '09:00' and t.due_day = today and t.due_at - p_now > interval '45 minutes'),
      (3::smallint, '30',      t.due_at > p_now and t.due_at - p_now <= interval '30 minutes' and t.due_at - p_now > interval '10 minutes'),
      (4::smallint, '10',      t.due_at > p_now and t.due_at - p_now <= interval '10 minutes')
    ) as r(level, name, due_now)
    where t.due_at is not null
      and r.due_now
      and r.name = any (t.ladder)
      and not exists (select 1 from private.nudges n where n.task_id = t.id and n.kind = 'reminder' and n.level = r.level)
  ),
  event_days as (
    select e.*, o.occ_at, (o.occ_at at time zone 'Africa/Lagos')::date as occ_day
    from public.events e
    cross join lateral (select private.event_occurrence(e.starts_at, e.yearly, today) as occ_at) o
    where e.status = 'upcoming'
  ),
  event_reminders as (
    select e.user_id, null::uuid, e.id, 'event'::text, r.level, e.occ_day
    from event_days e
    cross join lateral (values
      (1::smallint, e.important and local_time >= '09:00' and e.occ_day - today between 2 and 7),
      (2::smallint, local_time >= '20:00' and e.occ_day = today + 1),
      (3::smallint, (e.important or e.yearly) and local_time >= '09:00' and e.occ_day = today
                    and (e.all_day or e.occ_at - p_now > interval '45 minutes')),
      (4::smallint, not e.all_day and e.occ_at > p_now and e.occ_at - p_now <= interval '30 minutes')
    ) as r(level, due_now)
    where r.due_now
      and not exists (select 1 from private.nudges n where n.event_id = e.id and n.level = r.level and n.occurs_on = e.occ_day)
  ),
  briefs as (
    select u.user_id, null::uuid, null::uuid, 'brief'::text, 1::smallint, null::date
    from (select distinct user_id from public.push_subscriptions) u
    where local_time >= '08:00'
      and not exists (select 1 from private.nudges n where n.user_id = u.user_id and n.kind = 'brief' and n.day = today)
  ),
  candidates as (
    select * from escalations
    union all select * from checkins
    union all select * from reminders
    union all select * from event_reminders
    union all select * from briefs
  ),
  recorded as (
    insert into private.nudges (user_id, task_id, event_id, kind, level, day, occurs_on, sent_at)
    select user_id, task_id, event_id, kind, level, today, occurs_on, p_now from candidates
    on conflict do nothing
    returning user_id, task_id, event_id, kind, level, occurs_on
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', r.kind, 'level', r.level, 'taskId', r.task_id, 'eventId', r.event_id,
      'title', coalesce(t.title, ev.title),
      'due', case
        when t.id is not null then to_char(t.due_at at time zone 'Africa/Lagos', 'HH24:MI')
        when ev.id is not null and not ev.all_day then
          to_char(private.event_occurrence(ev.starts_at, ev.yearly, today) at time zone 'Africa/Lagos', 'HH24:MI')
      end,
      'eventKind', ev.kind,
      'person', ev.person,
      'days', case when r.occurs_on is not null then r.occurs_on - today end,
      'items', case when r.kind = 'brief' then (
        select coalesce(jsonb_agg(x.title), '[]'::jsonb) from (
          select title from public.tasks
          where user_id = r.user_id and status = 'pending'
            and (due_at is null or (due_at at time zone 'Africa/Lagos')::date = today)
          order by (is_non_negotiable or coalesce(must_from <= p_now, false)) desc, due_at nulls last
          limit 3
        ) x) end
    )), '[]'::jsonb)
  into sent
  from recorded r
  join public.push_subscriptions s on s.user_id = r.user_id
  left join public.tasks t on t.id = r.task_id
  left join public.events ev on ev.id = r.event_id;

  return sent;
end;
$$;

revoke all on function private.collect_nudges(timestamptz) from public;
