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
- [x] Link a task to a skill so completing "LeetCode 1h" logs the session too.
- [x] Review topics surface in get_today and on Today (not in the push brief: that's built in SQL).
- [x] **Workout plans.** Training days become weekly tasks; today's workout with
  last time's numbers; logs, personal bests; Training on Stats.
- [x] **Pantry and meals.** Stock with units and low levels, shopping list,
  cook_meal uses ingredients up, meal history; Pantry page off Money.
- [ ] Workout screen in the app (today's exercises, log sets with taps).
- [ ] Pantry editing in the app (it's chat-only for now).
- [x] `plan_day` / `accept_day_plan`: fixed blocks, meals, tasks by priority,
  batched chores, free time; respects capacity.
- [x] **Events**: meetings, birthdays, weddings… important × close; yearly
  repeats; reminder ladder; block time for clashes and capacity; prep tasks.
- [x] **Who I'm becoming**: in every get_today; `update_identity`; on Paddie tab.
- [ ] Events in the app (list + add), and a "Plan my day" button on Today.
- [ ] "Close" (7 days) and meal times as settings.

## Later (ideas, 2026-10-05)
- [ ] **Applications** (jobs, scholarships…): link, org, deadline, requirements
  checklist → tasks, pipeline status, deadline reminders.
- [ ] **Updates** (to a manager, a person, a spreadsheet): recipient + channel +
  cadence on top of tasks; `draft_update` from what was done since the last one.
- [ ] **Google Calendar import** via the private iCal URL (read-only, no Google
  OAuth): imported events count for clashes, capacity, reminders and plan_day.

## Known gaps
- Dead push subscriptions aren't pruned yet: `/api/push` reports them as
  `gone`, but nothing deletes them (the route has no DB access by design).
  A small cron step reading `net._http_response` can do it.
- Quiet hours (22:00–07:00), brief (08:00), evening reminder (20:00) and morning
  reminder (09:00) times are fixed; move to `settings`.
- Capacity only counts the first day of a new habit, not every day it recurs.
- Edit tasks from the app (tool exists; UI doesn't).
- pgTAP doesn't run against the hosted project yet (see DECISIONS.md).
