-- Day 2 write functions: idempotent, atomic, and RLS-scoped.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.items (id, tier, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'need', 'Rhapsody');
insert into public.tasks (id, item_id, title, base_xp, due_at, recurrence, series_id, occurs_on) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Read Rhapsody', 10,
   '2026-10-05 06:00:00+00', 'FREQ=DAILY', 'cccccccc-0000-0000-0000-000000000001', '2026-10-05');
insert into public.task_pillars (task_id, pillar, weight) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'spiritual', 70),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'character', 30);

-- ── spawn_occurrence ───────────────────────────────────────────────────────
select isnt(
  public.spawn_occurrence('cccccccc-0000-0000-0000-000000000001', '2026-10-06', '2026-10-06 06:00:00+00'),
  null, 'spawns tomorrow''s row'
);
select is(
  public.spawn_occurrence('cccccccc-0000-0000-0000-000000000001', '2026-10-06', '2026-10-06 06:00:00+00'),
  null, 'spawning the same day twice does nothing the second time'
);
select is(
  (select count(*)::int from public.tasks where series_id = 'cccccccc-0000-0000-0000-000000000001'),
  2, 'exactly one row per day'
);
select is(
  (select sum(weight)::int from public.task_pillars tp join public.tasks t on t.id = tp.task_id
    where t.occurs_on = '2026-10-06'),
  100, 'the new row copies the pillar weights'
);
select is(
  (select title || '|' || base_xp || '|' || item_id from public.tasks where occurs_on = '2026-10-06'),
  'Read Rhapsody|10|aaaaaaaa-0000-0000-0000-000000000001', 'the new row copies title, XP and item'
);
select is(
  public.spawn_occurrence('99999999-0000-0000-0000-000000000000', '2026-10-06', null),
  null, 'an unknown series spawns nothing'
);

-- ── complete_task ──────────────────────────────────────────────────────────
select is(
  public.complete_task('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-05 05:50:00+00',
    '[{"pillar":"spiritual","amount":7,"reason":"completion"},{"pillar":"character","amount":3,"reason":"completion"}]'),
  '{"result": "completed", "xp_rows": 2}'::jsonb, 'completes and pays'
);
select is(
  (select status || '|' || done_at from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'done|2026-10-05 05:50:00+00', 'task is marked done at the given time'
);
select is(
  public.complete_task('bbbbbbbb-0000-0000-0000-000000000001', now(),
    '[{"pillar":"spiritual","amount":7,"reason":"completion"}]'),
  '{"result": "already_done"}'::jsonb, 'a retry reports already_done'
);
select is(
  (select sum(amount)::int from public.xp_log), 10, 'and pays nothing more'
);
select is(
  (select count(*)::int from public.xp_log where task_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     and at = '2026-10-05 05:50:00+00'),
  2, 'entries are forced onto this task and dated at completion'
);

-- ── award_xp ───────────────────────────────────────────────────────────────
select is(
  public.award_xp('[{"task_id":"bbbbbbbb-0000-0000-0000-000000000001","pillar":"spiritual","amount":7,"reason":"completion"},
                    {"pillar":"financial","amount":2,"reason":"transaction_logged"}]'),
  1, 'award_xp skips the duplicate and inserts the rest'
);
select is((select xp from public.pillars where name = 'financial'), 2::bigint, 'pillar totals follow');

-- ── Another user ───────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is(
  public.complete_task((select 'bbbbbbbb-0000-0000-0000-000000000001'::uuid), now(), '[]'),
  '{"result": "not_found"}'::jsonb, 'intruder cannot complete Kingsley''s task (looks not found)'
);
select is(
  public.spawn_occurrence('cccccccc-0000-0000-0000-000000000001', '2026-10-07', null),
  null, 'intruder cannot spawn rows in Kingsley''s series'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.award_xp('[]')$$, '42501', null, 'anon cannot call the functions'
);

select * from finish();
rollback;
