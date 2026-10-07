-- People, knowing yourself, your library and favourites, class timetables,
-- habits that end, feedback, and usage counts.

-- ─── Habits can end: RRULE UNTIL=YYYYMMDD (inclusive, local date) ───────────
-- Same rule as occursOn() in src/features/tasks/recurrence.ts.
create or replace function private.recurs_on(p_rule text, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (substring(upper(p_rule) from 'UNTIL=(\d{8})') is null
      or p_day <= to_date(substring(upper(p_rule) from 'UNTIL=(\d{8})'), 'YYYYMMDD'))
    and case
      when upper(p_rule) like '%FREQ=DAILY%' then true
      when upper(p_rule) like '%FREQ=WEEKLY%' then
        left(to_char(p_day, 'DY'), 2) = any (string_to_array(substring(upper(p_rule) from 'BYDAY=([A-Z,]+)'), ','))
      else false
    end;
$$;
revoke all on function private.recurs_on(text, date) from public;

-- ─── Class timetables ───────────────────────────────────────────────────────
-- A class is a repeating time block tied to its course (tasks.course_id), ending
-- with the semester. Classes aren't "habits" for plan limits.
alter table public.courses add column semester_start date, add column semester_end date,
  add constraint semester_in_order check (semester_end is null or semester_start is null or semester_end >= semester_start);
alter table public.tasks add column course_id uuid, add column location text check (length(location) <= 120);
alter table public.tasks add foreign key (course_id, user_id) references public.courses (id, user_id) on delete set null (course_id);
create index tasks_course_user_idx on public.tasks (course_id, user_id);

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
  select * into template from public.tasks where series_id = p_series_id order by occurs_on desc limit 1;
  if not found then
    return null;
  end if;
  insert into public.tasks (
    user_id, item_id, title, base_xp, due_at, recurrence, is_non_negotiable,
    series_id, occurs_on, duration_minutes, reminders, skill_id, reminder_note,
    fun_activity_id, topic, commitment_id, course_id, location
  ) values (
    template.user_id, template.item_id, template.title, template.base_xp, p_due_at,
    template.recurrence, template.is_non_negotiable, p_series_id, p_occurs_on,
    template.duration_minutes, template.reminders, template.skill_id, template.reminder_note,
    template.fun_activity_id, template.topic, template.commitment_id, template.course_id, template.location
  )
  on conflict (series_id, occurs_on) do nothing
  returning id into new_id;
  if new_id is not null then
    insert into public.task_pillars (task_id, user_id, pillar, weight)
      select new_id, user_id, pillar, weight from public.task_pillars where task_id = template.id;
  end if;
  return new_id;
end;
$$;
revoke all on function public.spawn_occurrence(uuid, date, timestamptz) from public, anon;
grant execute on function public.spawn_occurrence(uuid, date, timestamptz) to authenticated;

-- ─── People ─────────────────────────────────────────────────────────────────
create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  relation text not null default 'friend'
    check (relation in ('family', 'partner', 'friend', 'colleague', 'classmate', 'mentor', 'mentee', 'boss', 'client', 'neighbour', 'church', 'other')),
  -- In their words: "my sister", "my manager at Acme", "my secondary school best friend".
  who text check (length(who) <= 200),
  notes text check (length(notes) <= 2000),
  birthday date,
  -- Reach out at least every N days; null = no rhythm.
  reach_out_every_days integer check (reach_out_every_days between 1 and 730),
  -- Things to talk about next time ("ask about her exams").
  topics text[] not null default '{}',
  close boolean not null default false,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index people_name_per_user on public.people (user_id, lower(name));

create table public.people_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null,
  at timestamptz not null default now(),
  how text not null default 'chat' check (how in ('call', 'text', 'visit', 'chat', 'video', 'other')),
  note text check (length(note) <= 1000),
  task_id uuid,
  foreign key (person_id, user_id) references public.people (id, user_id) on delete cascade,
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);
create index people_contacts_person_user_idx on public.people_contacts (person_id, user_id);
create index people_contacts_task_user_idx on public.people_contacts (task_id, user_id);

-- ─── Knowing yourself ───────────────────────────────────────────────────────
create table public.self_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('strength', 'weakness', 'healing', 'pattern', 'trigger', 'good_habit', 'bad_habit', 'history')),
  title text not null check (length(trim(title)) between 1 and 200),
  detail text check (length(detail) <= 2000),
  -- How they're working on it (weaknesses, healing, bad habits).
  working_on text check (length(working_on) <= 1000),
  status text not null default 'active' check (status in ('active', 'resolved')),
  since date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index self_notes_user_kind_idx on public.self_notes (user_id, kind);

-- ─── Library and favourites ─────────────────────────────────────────────────
create table public.media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('book', 'movie', 'series', 'music', 'podcast', 'game', 'other')),
  title text not null check (length(trim(title)) between 1 and 200),
  creator text check (length(creator) <= 200),
  status text not null default 'want' check (status in ('want', 'in_progress', 'done', 'dropped')),
  rating smallint check (rating between 1 and 5),
  notes text check (length(notes) <= 2000),
  started_on date,
  finished_on date,
  created_at timestamptz not null default now()
);
create unique index media_title_per_kind on public.media (user_id, kind, lower(title));

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- "song", "food", "artist", "colour", "place", "verse"… their words, lower-case.
  category text not null check (category = lower(category) and length(trim(category)) between 1 and 40),
  value text not null check (length(trim(value)) between 1 and 200),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now()
);
create unique index favorites_per_category on public.favorites (user_id, category, lower(value));

-- ─── Feedback ───────────────────────────────────────────────────────────────
-- Written by users, read by the team in the dashboard. Users can add, not read back or edit.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 4000),
  page text check (length(page) <= 200),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['people', 'people_contacts', 'self_notes', 'media', 'favorites'] loop
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
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to authenticated;
create policy "owner can send" on public.feedback for insert to authenticated with check ((select auth.uid()) = user_id);

-- ─── Usage, counted in our own database (no third-party tracking) ───────────
-- One row per user per local day they used MyPaddie (app or AI). Nothing about what they did.
create table private.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  via text not null check (via in ('app', 'ai')),
  primary key (user_id, day, via)
);

create function public.touch_activity(p_via text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.activity_days (user_id, day, via)
  select auth.uid(), (now() at time zone private.valid_tz((select value->>'timeZone' from public.settings where user_id = auth.uid() and key = 'profile')))::date, p_via
  where auth.uid() is not null and p_via in ('app', 'ai')
  on conflict do nothing
$$;
revoke all on function public.touch_activity(text) from public, anon;
grant execute on function public.touch_activity(text) to authenticated;

-- For the team, in the SQL editor: select * from private.usage_summary();
create function private.usage_summary(p_days integer default 30)
returns table (metric text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with users as (select id, created_at from auth.users),
  recent as (select * from users where created_at > now() - make_interval(days => p_days)),
  connected as (select distinct user_id from auth.oauth_consents where revoked_at is null),
  active as (select * from private.activity_days where day > current_date - p_days)
  select 'users', count(*)::numeric from users
  union all select 'signups in period', count(*) from recent
  union all select 'users with an AI app connected', count(*) from connected
  union all select '% of all users with AI connected', round(100.0 * (select count(*) from connected) / nullif((select count(*) from users), 0), 1)
  union all select 'active today', count(distinct user_id) from private.activity_days where day = current_date
  union all select 'active in last 7 days', count(distinct user_id) from private.activity_days where day > current_date - 7
  union all select 'active via AI in last 7 days', count(distinct user_id) from private.activity_days where day > current_date - 7 and via = 'ai'
  union all select '% of period signups back the next day', round(100.0 * (
      select count(*) from recent r where exists (
        select 1 from private.activity_days a where a.user_id = r.id and a.day = (r.created_at at time zone 'UTC')::date + 1)
    ) / nullif((select count(*) from recent), 0), 1)
  union all select 'feedback in period', count(*) from public.feedback where created_at > now() - make_interval(days => p_days)
$$;
revoke all on function private.usage_summary(integer) from public;

-- Your own feedback is yours to see (and to export).
grant select on public.feedback to authenticated;
create policy "owner can read" on public.feedback for select to authenticated using ((select auth.uid()) = user_id);

-- export_all: only tables the caller may read, so a write-only table can't break the export.
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
      and has_table_privilege(format('%I.%I', c.table_schema, c.table_name), 'select')
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
