# Roadmap

What's planned after the four-day build, in rough order. Each line is a
feature slice; the reasoning lives in DECISIONS.md once it's built.

## Now: Day 3 — the phone app
- [x] App shell, login gate, Today (top three only)
- [x] Quests: browse and add across all five tiers
- [x] Money: stage, buckets, quick log, flags for bad calls
- [x] Stats: pillars and levels, behind a tap
- [x] Paddie tab: shortcut to the chat apps, nudge switch, sign out
- [x] Push notifications via `pg_cron` (the database decides who to nudge; no admin key)

## Next
- [x] **Academic pillar** (11 pillars). Coursework → academic; DSA/LeetCode → skills.
- [x] **Edit tasks**: `update_task` (edit / cancel one day / stop a habit). App UI for it comes with Today.
- [x] **Time blocks and capacity.** Durations, clash check ("you have Standup
  at 09:00–10:00"), daily capacity (default 6h, editable, date-range periods).
- [x] **Reminder ladder**: evening before, 09:00 on the day, 30 and 10 minutes before.
- [x] **Becomes a must-do later** (`must_from`).
- [x] **delete_task** for mistakes (tasks with no history).
- [x] **Learning log.** Skills, sessions (topic, minutes, count, confidence),
  1 XP / 5 min to the skill's pillar, streaks, spaced-repetition review by
  confidence; Learning section on Stats.
- [ ] Link a task to a skill so completing "LeetCode 1h" logs the session too.
- [ ] Review topics surface in the morning brief / get_today.
- [x] **Workout plans.** Training days become weekly tasks; today's workout with
  last time's numbers; logs, personal bests; Training on Stats.
- [x] **Pantry and meals.** Stock with units and low levels, shopping list,
  cook_meal uses ingredients up, meal history; Pantry page off Money.
- [ ] Workout screen in the app (today's exercises, log sets with taps).
- [ ] Pantry editing in the app (it's chat-only for now).
- [ ] `plan_day` (deferred from Day 2), built on time blocks + pantry.

## Known gaps
- Dead push subscriptions aren't pruned yet: `/api/push` reports them as
  `gone`, but nothing deletes them (the route has no DB access by design).
  A small cron step reading `net._http_response` can do it.
- Quiet hours (22:00–07:00), brief (08:00), evening reminder (20:00) and morning
  reminder (09:00) times are fixed; move to `settings`.
- Capacity only counts the first day of a new habit, not every day it recurs.
- Edit tasks from the app (tool exists; UI doesn't).
- pgTAP doesn't run against the hosted project yet (see DECISIONS.md).
