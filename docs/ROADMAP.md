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

## Done: fun and school (2026-10-06)
- [x] **Fun list**: activities with cost, time, energy and company; "did it" pays
  XP; suggestions that fit time, money and mood; an idea in Plan my day's free
  time; a nudge after N days without fun (default 7, at 17:00, at most every 3
  days). Quests → Fun list.
- [x] **Courses**: code, lecturer, units, target grade, syllabus topics with
  weeks, assessments (exams → events, assignments → tasks); topic status from
  study confidence; `propose_study_plan` / `accept_study_plan`, and study tasks
  Paddie can create directly. Quests → Courses.
- [x] Fixed: habits lost their duration, reminders and skill link after the
  first day; `export_all` missed every table added after Day 1.

## Done: commitments and promises (2026-10-07)
- [x] Role history per commitment (Member → Secretary, with dates), 2026-10-13.
- [x] `what_can_paddie_do` + instructions so AI apps check their tools before saying no.
- [x] **Commitments**: jobs, roles, memberships, teams; priority; regular
  sessions as recurring tasks; competitions/meetings as linked events; pause
  or end to free the time. Quests → Commitments.
- [x] **Weekly load**: room / tight / overloaded with drop advice, checked
  before taking on more (`check_load`); shown on the Commitments page.
- [x] **Promises**: tracked with a task; −15 when broken, half back if kept
  late; renegotiate or release in time. Quests → Promises.

## Done: people, self, library, lists, timetables (2026-10-14)
- [x] Timetables: classes per course from a photo, ending with the semester; repeating tasks can end (UNTIL).
- [x] People: who they are to you, reach-out rhythm, topics, contact log (XP), who's due in get_today.
- [x] About me: strengths, weak spots, healing, patterns, triggers, habits, history — in every chat for advice.
- [x] Library and favourites; lists of anything with progress; bucket list ticks pay +50 once.
- [x] First ten minutes: Welcome → Connect your AI → Reminders (iPhone install help) → Empty your head.
- [x] Turnstile bot protection (dormant until keys are set), feedback box, first-party usage counts.

## Done: growth (2026-10-16)
- [x] Weekly, monthly, quarterly and yearly reviews from the facts; reminder on Sunday evening / period ends.
- [x] Year, quarter and month themes with focus and not-now (seasons).
- [x] Achievements (21), derived from existing data, +25 XP each.
- [x] Routines: one item on Today, one habit for plan limits.
- [x] Decision log with review dates.
- [x] Pointer, hover and press effects; saving spinners on one-tap buttons; page loading screens.

## Done: values, trends, experiments (2026-10-17)
- [x] Values: ranked, in their words; in every chat; weighed against big choices; a review question.
- [x] Check-ins add mood, sleep and screen time (each optional, merged through the day).
- [x] Trends: eight lines week by week (sleep, energy, mood, screen time, workouts, study, spending, word kept).
- [x] Experiments: before vs during on a chosen line, a verdict, and a pattern saved to About me.

## Now: filling the gaps (audit of the tool list, 2026-10-07)
In build order. Each slice ships tools + app + tests before the next starts.
- [x] **Items: edit, complete, pause, drop, delete.** Change title, target,
  deadline, priority, amounts or tier; done pays the blueprint's bonuses
  (goal 2×, wish +50) that the engine has but nothing called.
- [ ] **Undo** a mis-tapped complete_task, log_fun, log_workout or learning
  session; XP reversed in the ledger, not deleted. Edit routines.
- [ ] **Money guardrails**: per-category spending caps (check_purchase uses
  them), recurring bills (data, subscriptions) that become tasks and
  transactions, money owed and lent.
- [ ] **Daily close-out** (sweep unfinished, ask what slipped and why, set up
  tomorrow) and `export_data` for the AI.
- [ ] **Meal plan**: `propose_meals` / `accept_meals` from the pantry, like plan_day.
- [ ] **Where I am**: a status (with friends, in class, deep work, sleeping)
  with an end time; classes set it automatically; nudges hold or say "leave
  now". Phone-free windows (first hours, last hour) as part of it.

## Later: seeing the whole life
- [ ] Life map: one view of every area (body, mind, money, people, faith, work, fun) and how each is doing.
- [ ] Milestones under goals and dreams (3× XP when hit) and a life timeline:
  the big moments, past and planned, with what came before and after.

Already covered, so not built: spiritual habits (routines + learning log),
saying no (check_load), sleep (check-ins). The 11th pillar is Academic.

## Next: MyPaddie for everyone (planned 2026-10-06)

Anyone signs up, connects their AI, and gets their own Paddie, hosted at
**mypaddie.spectroniqlimited.com**. The data layer is already per user
(`user_id` + RLS on every table, composite `(id, user_id)` foreign keys,
per-user settings and nudges, the AI signs in as the user), so most of the
work is around it. Each phase reverses a "one user" call in DECISIONS.md,
which gets a new entry when it changes.

### Phase 1: sign-up and onboarding
- [x] **Invite codes** (2026-10-09): the sign-up hook admits only a valid code
  or an invited email; allowances per user; Settings → Invite someone.
- [x] **Sign-in and sign-up screens** (2026-10-10): Google, email link and
  password; `/signup` takes the invite (pre-filled from the shared link);
  forgotten password. Email via Resend (custom SMTP).
- [ ] Turn sign-ups on in Supabase (after the email templates are in).
- [x] First-run onboarding (2026-10-08): `/welcome` asks name, time zone
  (suggests the device's), currency and voice; Settings → You edits them;
  `update_profile` / `get_profile` for the AI.
- [x] **Per-user time zone** (2026-10-08): profile setting; every rule reads
  the signed-in user's zone; the nudge job and habit rows run per user.
  Invalid zone → UTC; no zone → Lagos.
- [x] **Per-user currency** (2026-10-08): whole units, shown in their currency.
- [x] "Kingsley / his" removed from the MCP instructions and every tool
  description (2026-10-08); `get_today` returns `you` (name, voice) and the
  instructions describe both voices (Naija banter, the default, or plain English).
- [ ] Domain: point mypaddie.spectroniqlimited.com at Vercel; update the
  Supabase site URL, redirect URLs and OAuth authorization path.

### Phase 2: connect your AI without a hand-registered client
- [x] Dynamic client registration on (2026-10-10): users paste
  `https://mypaddie.spectroniqlimited.com/api/mcp` into Claude or ChatGPT.
- [x] Consent page judges by the real destination: known apps one tap,
  unknown/local apps only after "I started this myself", unsafe never.
- [x] Settings → Connect your AI: the address, steps, connected apps, disconnect.

### Phase 3: safety before strangers
- [x] Schema-wide isolation tests: RLS everywhere, nothing for anon, every
  policy on `auth.uid()`, a second user sees nothing in 30+ tables (2026-10-11).
- [x] Rate limit on `/api/mcp`: 300 calls / user / 10 min (Postgres-counted).
- [x] Export my data (`/app/export`) and delete my account (cascade, tested).
- [x] Privacy policy and terms (drafts — get them reviewed).
- [ ] Revisit "XP writes from the client are fine" before any leaderboard or sharing.
- (Already done: the calendar import only fetches `calendar.google.com` iCal URLs.)

### Plans (2026-10-11, no payments yet)
- [x] Free / Plus / Pro with limits and features; Settings → Plan, one-tap
  switch; Free is the default.
- [x] Switches in `private.app_config`: invites_required (off),
  default_plan (free), payments_enabled (off).
- [ ] Paystack checkout and webhooks; then `payments_enabled = true`.
- [ ] 14-day Plus trial for new sign-ups once payments are on.
- [ ] Student verification (school email) for half price.

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

## Ideas for later (fun and school)
- Grade estimate from assessment weights and scores ("you need 62% on the final for an A").
- Fun with specific friends: link fun to people/events ("haven't seen the guys in 3 weeks").
- A weekly "study week" push on Sunday evening with the proposed plan.

## Ideas for later (commitments and promises)
- Competition prep plan: "final in 10 days" → proposed personal training sessions, like study plans.
- Promise nudge wording of its own ("tell them now if you can't") instead of the generic task reminder.
- Resuming a paused commitment brings its old sessions back.

## Ideas for later (people and self)
- Push nudge for people due a check-in (today it's in chat and on the People page).
- Sign-in methods in Settings: attach Google to an email account with a different address.
- Plan caps for people / lists / library on Free, if they're ever needed.

## Known gaps
- Voiding income that's already been split into buckets (needs a split undo).
- One balance for everything; separate accounts (OPay, bank, cash) later.
- Edit/delete events and meals from the app (chat only for now).
