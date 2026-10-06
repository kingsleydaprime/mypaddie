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
- [x] Edit tasks from the app (tap a task on Today).
- [x] Workout screen: today's session with last time's numbers, log with taps, new bests.
- [x] Balance card (OPay-style), set balance, history, void, edit narration,
  purchase checks: not interested / interested again.
- [x] Pantry editing: −/+ by unit, edit amount/low level/category, add, remove.
- [x] `plan_day` / `accept_day_plan`: fixed blocks, meals, tasks by priority,
  batched chores, free time; respects capacity.
- [x] **Events**: meetings, birthdays, weddings… important × close; yearly
  repeats; reminder ladder; block time for clashes and capacity; prep tasks.
- [x] **Who I'm becoming**: in every get_today; `update_identity`; on Paddie tab.
- [x] Events page (grouped, add, cancel) and "Plan my day" (timeline + accept).
- [x] Custom reminder notes on tasks and events.
- [x] Schedule settings: quiet hours, brief, evening/morning reminder times,
  event "close" days, meals — per user, in the nudge job, capacity and planner.

## Later (ideas, 2026-10-05)
- [x] **Applications**: deadline in its own time zone, target date, requirements
  → tasks, pipeline, own reminder ladder; Quests → Applications.
- [x] **Updates**: recipient, channel, topic, format, cadence; `draft_update` from
  what was actually done since the last one; Quests → Updates.
- [x] **Google Calendar import** via the private iCal URL (read-only), synced on
  open, keeps his own flags; Paddie → Google Calendar.

## Done: infrastructure
- [x] Hosted pgTAP via `bun run db:test:hosted` (always rolled back).
- [x] Dead push subscriptions pruned by the nudge job.
- [x] Habits counted on every day they occur (capacity, clashes, planning).

## Next: MyPaddie for everyone (planned 2026-10-06)

Anyone signs up, connects their AI, and gets their own Paddie, hosted at
**mypaddie.spectroniqlimited.com**. The data layer is already per user
(`user_id` + RLS on every table, composite `(id, user_id)` foreign keys,
per-user settings and nudges, the AI signs in as the user), so most of the
work is around it. Each phase reverses a "one user" call in DECISIONS.md,
which gets a new entry when it changes.

### Phase 1: sign-up and onboarding
- [ ] Turn sign-ups on. Google sign-in and/or magic links, with a real email
  provider (e.g. Resend) as custom SMTP. Supabase's built-in sender is
  rate-limited to a few emails an hour, the reason magic links were rejected.
- [ ] First-run onboarding: display name, time zone, currency, quiet hours,
  "Who I'm becoming". Seed nothing personal.
- [ ] **Per-user time zone.** Days are Africa/Lagos everywhere today:
  `src/shared/config.ts` and seven SQL migrations (nudges, events,
  applications, reminders, schedule). Move it into each user's settings and
  pass it through the engine and `collect_nudges`.
- [ ] **Per-user currency.** Money is whole naira (`bigint`) and the UI prints
  ₦. Keep whole units, store a currency code per user, and format from it.
- [ ] Remove "Kingsley / his" from the MCP server instructions
  (`src/app/api/mcp/route.ts`) and tool descriptions. `get_today` returns the
  user's display name and the AI uses that.
- [ ] Domain: point mypaddie.spectroniqlimited.com at Vercel; update the
  Supabase site URL, redirect URLs and OAuth authorization path.

### Phase 2: connect your AI without a hand-registered client
- [ ] Today one OAuth client per AI app is registered by hand, and dynamic
  client registration (DCR) is off so strangers can't register clients.
  With open sign-ups that reason goes away: a registered client still can't
  read anything without a user signing in and clicking Allow. Turn DCR on,
  or use Claude's published client identity (CIMD) if Supabase supports it
  by then, so users only paste `https://mypaddie.spectroniqlimited.com/api/mcp`.
- [ ] Settings → "Connect your AI": the URL to copy, steps for Claude and
  ChatGPT, the list of connected apps with a revoke button.

### Phase 3: safety before strangers
- [ ] Two-user pgTAP suites: user B can't read, change or reference user A's
  rows in every table, RPC and the nudge job.
- [ ] Rate limits on `/api/mcp`, sign-up and calendar sync; size limits on
  free-text fields.
- [ ] Revisit "XP writes from the client are fine" (DECISIONS, Day 2): still
  harmless while nothing is compared between users; must change before any
  leaderboard or sharing.
- [ ] Delete my account (the cascades already exist) and export my data
  (`export_all` exists; add a button).
- [ ] Privacy policy and terms: this is money and life data.
- (Already done: the calendar import only fetches `calendar.google.com`
  iCal URLs, with no redirects, a timeout and a size cap.)

### Phase 4: hosting for real users
- [ ] Paid plans: Vercel Hobby is non-commercial; Supabase Free pauses idle
  projects.
- [ ] Load-test the every-minute nudge job with a few thousand fake users;
  index what `collect_nudges` filters on.
- [ ] Error monitoring and an uptime check on `/api/mcp` and `/api/push`.

## Ideas for later
- Separate money accounts (OPay, bank, cash).
- Two-way calendar sync (needs Google OAuth + verification).
- Undo an income split, so split income can be voided.
- Push for calendar events imported only on app open: sync from the scheduler too.

## Known gaps
- Voiding income that's already been split into buckets (needs a split undo).
- One balance for everything; separate accounts (OPay, bank, cash) later.
- Edit/delete events and meals from the app (chat only for now).
