-- Pausing a task keeps the time already spent on it. started_at is the
-- current stretch (null while paused); spent_minutes is the stretches before
-- it. Done = spent_minutes + the current stretch. A habit's new day starts at 0
-- (spawn_occurrence doesn't copy it, so it takes the default).

alter table public.tasks
  add column spent_minutes integer not null default 0 check (spent_minutes >= 0);
