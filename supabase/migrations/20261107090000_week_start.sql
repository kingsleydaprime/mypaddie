-- Their week can start on Sunday (schedule `weekStart`), so the weekly review
-- comes on the evening of their week's last day: Saturday for a Sunday week,
-- Sunday for a Monday week (the default, as before). The week reviewed is
-- the seven days ending that evening, either way.
create or replace function private.collect_review_nudges(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent jsonb;
begin
  with sched as (
    select c.*, coalesce(st.value->>'weekStart', 'monday') as week_start
    from private.user_clock(p_now) c
    left join public.settings st on st.user_id = c.user_id and st.key = 'schedule'
  ),
  due as (
    select sc.user_id, sc.today,
      case
        when sc.today = (date_trunc('year', sc.today) + interval '1 year - 1 day')::date then 'year'
        when sc.today = (date_trunc('quarter', sc.today) + interval '3 months - 1 day')::date then 'quarter'
        when sc.today = (date_trunc('month', sc.today) + interval '1 month - 1 day')::date then 'month'
        -- The last day of their week: Saturday (6) for a Sunday week, Sunday (7) for a Monday one.
        when extract(isodow from sc.today) = case sc.week_start when 'sunday' then 6 else 7 end then 'week'
      end as period
    from sched sc
    where sc.local_time >= sc.evening_at
      and not private.is_quiet(sc.local_time, sc.quiet_start, sc.quiet_end)
  ),
  candidates as (
    select d.* from due d
    where d.period is not null
      and not exists (
        select 1 from public.reviews r where r.user_id = d.user_id and r.period = d.period
          and r.starts_on = case d.period
            when 'week' then d.today - 6
            when 'month' then date_trunc('month', d.today)::date
            when 'quarter' then date_trunc('quarter', d.today)::date
            else date_trunc('year', d.today)::date end)
      and not exists (select 1 from private.nudges n where n.user_id = d.user_id and n.kind = 'review' and n.day = d.today)
  ),
  recorded as (
    insert into private.nudges (user_id, kind, level, day, occurs_on, sent_at)
    select user_id, 'review', case period when 'week' then 1 when 'month' then 2 when 'quarter' then 3 else 4 end, today, today, p_now
    from candidates
    on conflict do nothing
    returning user_id, level
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'review', 'level', r.level, 'title', to_char(c.today, 'FMMonth YYYY'), 'items', null
    )), '[]'::jsonb)
  into sent
  from recorded r
  join candidates c on c.user_id = r.user_id
  join public.push_subscriptions s on s.user_id = r.user_id;
  return sent;
end;
$$;
revoke all on function private.collect_review_nudges(timestamptz) from public;
revoke all on function private.send_nudges() from public;
revoke all on function private.collect_review_nudges(timestamptz) from public;
