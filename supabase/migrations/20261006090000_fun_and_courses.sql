-- Fun list and courses.
--
-- Fun: a menu of things he enjoys (cost, time, energy, company). Doing one is
-- a task (so XP stays in one place); a nudge arrives when it's been too long
-- since any fun.
--
-- Courses: an academic skill with a syllabus (topics) and assessments. Exams
-- and tests become events (you attend them); assignments become tasks (you do
-- them). Study tasks carry the topic they cover, so completing one records a
-- learning session for that topic and the review schedule picks it up.

-- ─── fun_activities ─────────────────────────────────────────────────────────
create table public.fun_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  notes text check (length(notes) <= 500),
  -- Rough cost in whole naira; 0 = free.
  cost bigint not null default 0 check (cost >= 0),
  -- Roughly how long it takes; null = flexible.
  minutes integer check (minutes between 5 and 1440),
  energy text not null default 'medium' check (energy in ('low', 'medium', 'high')),
  company text not null default 'either' check (company in ('solo', 'together', 'either')),
  active boolean not null default true,
  times_done integer not null default 0 check (times_done >= 0),
  last_done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index fun_activities_title_per_user on public.fun_activities (user_id, lower(title));

-- A task that is (or was) a fun activity: completing it counts as doing it.
alter table public.tasks add column fun_activity_id uuid;
alter table public.tasks add foreign key (fun_activity_id, user_id)
  references public.fun_activities (id, user_id) on delete set null (fun_activity_id);
create index tasks_fun_user_idx on public.tasks (fun_activity_id, user_id);

-- ─── courses ────────────────────────────────────────────────────────────────
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The academic skill its study time and topic confidence are recorded under.
  skill_id uuid not null,
  code text check (length(trim(code)) between 1 and 20),
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (length(description) <= 2000),
  semester text,
  lecturer text,
  units smallint check (units between 0 and 30),
  target_grade text,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (skill_id),
  foreign key (skill_id, user_id) references public.skills (id, user_id) on delete cascade
);
create index courses_skill_user_idx on public.courses (skill_id, user_id);

create table public.course_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  notes text check (length(notes) <= 1000),
  -- Which week of the semester it's taught, if the outline says.
  week smallint check (week between 1 and 30),
  position integer not null default 0,
  unique (id, user_id),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade
);
create unique index course_topics_title_per_course on public.course_topics (course_id, lower(title));
create index course_topics_course_user_idx on public.course_topics (course_id, user_id);

-- Composite foreign keys need (id, user_id) to be unique on the parent; events didn't have it yet.
alter table public.events add constraint events_id_user_id_key unique (id, user_id);

create table public.course_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null,
  kind text not null check (kind in ('exam', 'test', 'quiz', 'assignment', 'project', 'presentation', 'lab', 'other')),
  title text not null check (length(trim(title)) between 1 and 200),
  due_at timestamptz,
  -- Share of the final grade, if known.
  weight_pct smallint check (weight_pct between 0 and 100),
  -- Topic titles it covers; empty = the whole course so far.
  topics text[] not null default '{}',
  -- As written ("17/20", "A", "68%").
  score text,
  done boolean not null default false,
  -- Sat in person → an event; handed in → a task. One or the other (or neither, when undated).
  event_id uuid,
  task_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade,
  foreign key (event_id, user_id) references public.events (id, user_id) on delete set null (event_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);
create index course_assessments_course_user_idx on public.course_assessments (course_id, user_id);
create index course_assessments_event_user_idx on public.course_assessments (event_id, user_id);
create index course_assessments_task_user_idx on public.course_assessments (task_id, user_id);

-- A study task names the topic it covers (feeds the learning session on completion).
alter table public.tasks add column topic text check (length(topic) <= 200);

-- Exams are events you attend.
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('meeting', 'social', 'birthday', 'anniversary', 'wedding', 'appointment', 'deadline', 'exam', 'other'));

-- ─── RLS: owner only, same shape as every other table ───────────────────────
do $$
declare t text;
begin
  foreach t in array array['fun_activities', 'courses', 'course_topics', 'course_assessments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "owner can read" on public.%I for select to authenticated using ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "owner can delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)$p$, t);
  end loop;
end;
$$;

-- ─── Fun nudge ──────────────────────────────────────────────────────────────
alter table private.nudges drop constraint nudges_kind_check;
alter table private.nudges add constraint nudges_kind_check
  check (kind in ('nudge', 'checkin', 'brief', 'headsup', 'reminder', 'event', 'application', 'fun'));
create unique index nudges_fun_per_day on private.nudges (user_id, day) where kind = 'fun';

-- "N days without fun" (schedule: funEveryDays, default 7; 0 = off), at
-- funAt (default 17:00), outside quiet hours. At most once every 3 days, so it
-- reminds without becoming another chore. Only for users with a fun list; a
-- new list counts from when it was made, not from "never". Suggests the three
-- active activities done least recently.
create function private.collect_fun_nudges(p_now timestamptz default now())
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
  with sched as (
    select u.id as user_id,
      private.setting_time(s.value, 'quietStart', '22:00') as quiet_start,
      private.setting_time(s.value, 'quietEnd', '07:00') as quiet_end,
      private.setting_time(s.value, 'funAt', '17:00') as fun_at,
      private.setting_int(s.value, 'funEveryDays', 7) as every_days
    from auth.users u
    left join public.settings s on s.user_id = u.id and s.key = 'schedule'
  ),
  fun as (
    select f.user_id,
      (coalesce(max(f.last_done_at), min(f.created_at)) at time zone 'Africa/Lagos')::date as since
    from public.fun_activities f
    group by f.user_id
    having bool_or(f.active)
  ),
  candidates as (
    select f.user_id, today - f.since as days
    from fun f
    join sched sc on sc.user_id = f.user_id
    where sc.every_days > 0
      and today - f.since >= sc.every_days
      and local_time >= sc.fun_at
      and not private.is_quiet(local_time, sc.quiet_start, sc.quiet_end)
      and not exists (
        select 1 from private.nudges n
        where n.user_id = f.user_id and n.kind = 'fun' and n.day > today - 3
      )
  ),
  recorded as (
    insert into private.nudges (user_id, kind, level, day, occurs_on, sent_at)
    select user_id, 'fun', 1, today, today, p_now from candidates
    on conflict do nothing
    returning user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'kind', 'fun', 'level', 1, 'title', null,
      'days', c.days,
      'items', (select coalesce(jsonb_agg(x.title), '[]'::jsonb) from (
                 select a.title from public.fun_activities a
                 where a.user_id = r.user_id and a.active
                 order by a.last_done_at asc nulls first, a.cost asc, a.title
                 limit 3) x)
    )), '[]'::jsonb)
  into sent
  from recorded r
  join candidates c on c.user_id = r.user_id
  join public.push_subscriptions s on s.user_id = r.user_id;

  return sent;
end;
$$;

-- send_nudges: as before, with the fun nudge in the same batch.
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
  payload := private.collect_nudges() || private.collect_application_nudges() || private.collect_fun_nudges();
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

revoke all on function private.collect_fun_nudges(timestamptz) from public;
revoke all on function private.send_nudges() from public;

-- ─── export_all: every table of his, not just the first twelve ──────────────
-- The original listed the Day 1 tables by hand, so everything added since
-- (learning, workouts, events, applications…) was missing from the export.
-- Now it walks every public table with a user_id. Still SECURITY INVOKER: RLS
-- means it can only ever return the caller's rows.
create or replace function public.export_all() returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  t text;
  rows jsonb;
  result jsonb := jsonb_build_object('exported_at', now());
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(x), ''[]''::jsonb) from public.%I x', t) into rows;
    result := result || jsonb_build_object(t, rows);
  end loop;
  return result;
end;
$$;
revoke all on function public.export_all() from public, anon;
grant execute on function public.export_all() to authenticated;

-- ─── spawn_occurrence: copy everything a habit is, not just the Day 1 columns ─
-- Bug fix. It still copied only the original columns, so from the second day
-- a habit lost its duration (a training block turned into a deadline and paid
-- half XP when logged after its start), its reminders, its skill link (no
-- practice time recorded) and its reminder note. Now those come along, plus
-- the new fun/topic links. must_from is not copied: it's one moment, not a
-- daily rule.
create or replace function public.spawn_occurrence(p_series_id uuid, p_occurs_on date, p_due_at timestamptz)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  template public.tasks%rowtype;
  new_id uuid;
begin
  select * into template from public.tasks
    where series_id = p_series_id
    order by occurs_on desc
    limit 1;
  if not found then
    return null;
  end if;

  insert into public.tasks (
    user_id, item_id, title, base_xp, due_at, recurrence, is_non_negotiable,
    series_id, occurs_on, duration_minutes, reminders, skill_id, reminder_note,
    fun_activity_id, topic
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on,
    template.duration_minutes, template.reminders, template.skill_id, template.reminder_note,
    template.fun_activity_id, template.topic
  )
  on conflict (series_id, occurs_on) do nothing
  returning id into new_id;

  if new_id is not null then
    insert into public.task_pillars (task_id, user_id, pillar, weight)
      select new_id, user_id, pillar, weight
      from public.task_pillars where task_id = template.id;
  end if;
  return new_id;
end;
$$;
revoke all on function public.spawn_occurrence(uuid, date, timestamptz) from public, anon;
grant execute on function public.spawn_occurrence(uuid, date, timestamptz) to authenticated;
