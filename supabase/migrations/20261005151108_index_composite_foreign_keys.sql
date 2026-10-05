-- The advisor flagged that each composite (…_id, user_id) foreign key had only
-- a single-column index. Postgres uses an index to check a foreign key (e.g.
-- when a task is deleted, find its slips fast); it needs one that starts with
-- *all* the key's columns. Replace the single-column ones with composite ones.

drop index if exists public.slips_task_idx;
create index slips_task_user_idx on public.slips (task_id, user_id);

drop index if exists public.xp_log_task_idx;
create index xp_log_task_user_idx on public.xp_log (task_id, user_id);

drop index if exists public.xp_log_item_idx;
create index xp_log_item_user_idx on public.xp_log (item_id, user_id);

create index task_pillars_task_user_idx on public.task_pillars (task_id, user_id);
create index transactions_item_user_idx on public.transactions (item_id, user_id);
