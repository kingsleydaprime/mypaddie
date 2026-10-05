-- A task can count as practice for a skill: completing "LeetCode 1h" logs a
-- DSA session. The task pays the XP; the session only records the time.
alter table public.tasks add column skill_id uuid;
alter table public.tasks add foreign key (skill_id, user_id)
  references public.skills (id, user_id) on delete set null (skill_id);
create index tasks_skill_user_idx on public.tasks (skill_id, user_id);
