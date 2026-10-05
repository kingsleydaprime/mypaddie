# Roadmap

What's planned after the four-day build, in rough order. Each line is a
feature slice; the reasoning lives in DECISIONS.md once it's built.

## Now: Day 3 — the phone app
- [x] App shell, login gate, Today (top three only)
- [x] Quests: browse and add across all five tiers
- [ ] Money: stage, buckets, quick log, flags for bad calls
- [ ] Stats: pillars and levels, behind a tap
- [ ] Paddie tab: shortcut to the chat apps
- [ ] Push notifications via `pg_cron` (the database decides who to nudge; no admin key)

## Next
- [x] **Academic pillar** (11 pillars). Coursework → academic; DSA/LeetCode → skills.
- [x] **Edit tasks**: `update_task` (edit / cancel one day / stop a habit). App UI for it comes with Today.
- [ ] **Time blocks and capacity.** Tasks get an estimated duration.
  - Conflicts: "you already have a meeting at 9:00–10:00".
  - Capacity: refuses new work when today/this week is full, unless you're
    ahead (finished early).
- [ ] **Learning log.** Skill, topic, minutes, notes; pays skills/academic XP;
  Stats shows time per skill.
- [ ] **Workout plans.** Each training day's exercises (sets, reps), and a log of
  what was actually done.
- [ ] **Pantry and meals.** What's in stock; the AI suggests meals from it;
  shopping and cooking update it. Groundwork for meal proposals.
- [ ] `plan_day` (deferred from Day 2), built on time blocks + pantry.

## Known gaps
- pgTAP doesn't run against the hosted project yet (see DECISIONS.md).
