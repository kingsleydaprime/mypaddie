-- The close-out push carries the day in numbers (done, slipped, XP) and
-- tomorrow's first three, so it reads as an evening summary on its own.

create or replace function private.collect_close_out_nudges(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent jsonb;
begin
  with sched as (
    select c.*, private.setting_time(s.value, 'closeAt', '21:30') as close_at,
           coalesce((s.value->>'closeOut')::boolean, true) as close_on
    from private.user_clock(p_now) c
    left join public.settings s on s.user_id = c.user_id and s.key = 'schedule'
  ),
  candidates as (
    select sc.user_id, sc.today, sc.tz,
      (select count(*) from public.tasks t
        where t.user_id = sc.user_id and t.status = 'pending'
          and coalesce((t.due_at at time zone sc.tz)::date, t.occurs_on) <= sc.today)::int as open_count
    from sched sc
    where sc.close_on
      and sc.local_time >= sc.close_at
      and not private.is_quiet(sc.local_time, sc.quiet_start, sc.quiet_end)
      and not exists (select 1 from public.day_closes d where d.user_id = sc.user_id and d.day = sc.today)
      and not exists (select 1 from private.nudges n where n.user_id = sc.user_id and n.kind = 'close_out' and n.day = sc.today)
      -- Something was due today, or is still open from before. Habits without a
      -- time have only a day (occurs_on).
      and exists (select 1 from public.tasks t where t.user_id = sc.user_id
                    and (coalesce((t.due_at at time zone sc.tz)::date, t.occurs_on) = sc.today
                         or (t.status = 'pending' and coalesce((t.due_at at time zone sc.tz)::date, t.occurs_on) < sc.today)))
  ),
  -- The day in numbers: done, slipped and XP today (undos net out in the ledger).
  numbers as (
    select c.user_id,
      (select count(*) from public.tasks t where t.user_id = c.user_id and t.status = 'done'
         and (t.done_at at time zone c.tz)::date = c.today)::int as done,
      (select count(*) from public.slips sl where sl.user_id = c.user_id
         and (sl.at at time zone c.tz)::date = c.today)::int as slipped,
      (select coalesce(sum(x.amount), 0) from public.xp_log x where x.user_id = c.user_id
         and (x.at at time zone c.tz)::date = c.today)::int as xp
    from candidates c
  ),
  -- Tomorrow: one-offs due then, plus habits whose rule says tomorrow (their
  -- rows may not exist yet — the job only creates today's). Must-dos first,
  -- then by time, then any-time.
  tomorrow as (
    select x.user_id, x.title, x.at, x.must
    from (
      select c.user_id, t.title, nullif(to_char(t.due_at at time zone c.tz, 'HH24:MI'), '23:59') as at, t.is_non_negotiable as must
      from candidates c
      join public.tasks t on t.user_id = c.user_id
      where t.series_id is null and t.status = 'pending' and (t.due_at at time zone c.tz)::date = c.today + 1
      union all
      select h.user_id, h.title, h.at, h.must
      from (
        select distinct on (t.series_id) c.user_id, t.title, t.recurrence,
          nullif(to_char(t.due_at at time zone c.tz, 'HH24:MI'), '23:59') as at, t.is_non_negotiable as must, c.today
        from candidates c
        join public.tasks t on t.user_id = c.user_id
        where t.series_id is not null and t.recurrence is not null
        order by t.series_id, t.occurs_on desc
      ) h
      where private.recurs_on(h.recurrence, h.today + 1)
    ) x
  ),
  top3 as (
    select user_id,
      (array_agg(coalesce(at || ' ', '') || title order by must desc, at nulls last, title))[1:3] as items,
      count(*)::int as total
    from tomorrow
    group by user_id
  ),
  recorded as (
    insert into private.nudges (user_id, kind, level, day, occurs_on, sent_at)
    select user_id, 'close_out', 1, today, today, p_now from candidates
    on conflict do nothing
    returning user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'close_out', 'level', c.open_count, 'title', null,
      'items', coalesce(to_jsonb(t3.items), '[]'::jsonb),
      'summary', jsonb_build_object('done', nb.done, 'slipped', nb.slipped, 'xp', nb.xp, 'tomorrow', coalesce(t3.total, 0))
    )), '[]'::jsonb)
  into sent
  from recorded r
  join candidates c on c.user_id = r.user_id
  join numbers nb on nb.user_id = r.user_id
  left join top3 t3 on t3.user_id = r.user_id
  join public.push_subscriptions s on s.user_id = r.user_id;
  return sent;
end;
$$;
