-- The evening close-out: one row per closed day, a small XP for the habit of
-- closing it, and an evening push when the day hasn't been closed.

alter type public.xp_reason add value if not exists 'day_closed';

create table public.day_closes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  win text check (length(win) <= 500),
  note text check (length(note) <= 1000),
  -- What was decided, for the weekly review: { moved, dropped, slipped, done }.
  summary jsonb not null default '{}'::jsonb,
  closed_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, day)
);

alter table public.day_closes enable row level security;
revoke all on public.day_closes from anon, authenticated;
grant select, insert, update, delete on public.day_closes to authenticated;
create policy "owner can read" on public.day_closes for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can insert" on public.day_closes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner can update" on public.day_closes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner can delete" on public.day_closes for delete to authenticated using ((select auth.uid()) = user_id);

-- ─── close_day: record the close and pay for it, once per day ───────────────
-- A second close the same day updates the win/note/summary but pays nothing.
create function public.close_day(p_day date, p_win text, p_note text, p_summary jsonb, p_xp jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted boolean;
begin
  insert into public.day_closes (day, win, note, summary)
    values (p_day, nullif(trim(p_win), ''), nullif(trim(p_note), ''), coalesce(p_summary, '{}'::jsonb))
    on conflict (user_id, day) do nothing;
  inserted := found;
  if inserted then
    perform public.award_xp((
      select coalesce(jsonb_agg(e || jsonb_build_object('note', 'closed ' || p_day)), '[]'::jsonb)
      from jsonb_array_elements(p_xp) as e));
  else
    update public.day_closes
      set win = coalesce(nullif(trim(p_win), ''), win),
          note = coalesce(nullif(trim(p_note), ''), note),
          summary = summary || coalesce(p_summary, '{}'::jsonb)
      where day = p_day;
  end if;
  return jsonb_build_object('result', case when inserted then 'closed' else 'updated' end);
end;
$$;
revoke all on function public.close_day(date, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.close_day(date, text, text, jsonb, jsonb) to authenticated;

-- ─── The evening push ───────────────────────────────────────────────────────
alter table private.nudges drop constraint nudges_kind_check;
alter table private.nudges add constraint nudges_kind_check
  check (kind in ('nudge', 'checkin', 'brief', 'headsup', 'reminder', 'event', 'application', 'fun', 'review', 'close_out'));
create unique index nudges_close_out_per_day on private.nudges (user_id, day) where kind = 'close_out';

-- At the user's close-out time (schedule.closeAt, default 21:30; closeOut=false
-- turns it off), if today isn't closed and something was due today or is
-- still open from before. The title carries how many are open.
create function private.collect_close_out_nudges(p_now timestamptz default now())
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
    select sc.user_id, sc.today,
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
  recorded as (
    insert into private.nudges (user_id, kind, level, day, occurs_on, sent_at)
    select user_id, 'close_out', 1, today, today, p_now from candidates
    on conflict do nothing
    returning user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'close_out', 'level', c.open_count, 'title', null, 'items', null
    )), '[]'::jsonb)
  into sent
  from recorded r
  join candidates c on c.user_id = r.user_id
  join public.push_subscriptions s on s.user_id = r.user_id;
  return sent;
end;
$$;
revoke all on function private.collect_close_out_nudges(timestamptz) from public;

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
          || private.collect_review_nudges() || private.collect_close_out_nudges();
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
