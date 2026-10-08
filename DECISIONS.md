# Decisions

Why MyPaddie is built the way it is. One entry per non-obvious call: what was
chosen, what else was on the table, and why.

## 2026-10-05 — Day 1 (engine)

### One Next.js app, feature-based folders
`src/features/{xp,mode,money}` hold logic, types and tests together; `src/shared`
holds the vocabulary, config and time helpers. Next.js is scaffolded now (UI comes
Day 3) so the engine is written in its permanent home. Day 2's MCP server can be
a route handler in the same app — one deploy instead of two.
Rule: `src/features/*` never imports Next.js or Supabase. Each feature is plain
data in, plain data out.

### The engine never reads the clock
Every function takes `now`. That makes "late", "ignored", "the last 7 days" and
"day 31 of the audit" testable with fixed dates, and means the engine behaves
identically whether called from the MCP server, the PWA or a cron job.

### Bun for packages and tests
`bun test` is built in and Jest-compatible, so no test framework dependency.
Considered Vitest (the original default); dropped once Bun was chosen.

### Days are Africa/Lagos calendar days
"Ignored", streak windows and the audit clock all count local calendar days,
not 24-hour blocks or UTC days. A need due at 07:00 isn't "ignored" until its
local day has fully ended — there's the rest of the day to recover.

### XP: integers, split by largest remainder
XP is whole numbers. Splitting 10 XP 34/33/33 gives 4/3/3 — the leftover point
goes to the largest fractional remainder (ties: larger weight, then pillar order).
Parts always sum to the total; nothing is lost or invented to rounding.

### XP rules (defaults, all in `src/shared/config.ts`)
- Late (done after `due_at`) pays 50%, however late. Rewards never round to 0.
- Ignored need deducts 50% of base XP, split by the same weights.
- A need is protected from the deduction by an **accepted** slip. `slips.accepted`
  has no default so the caller must decide.
- Only needs can deduct. Wants, goals, wishes, dreams and loose chores never do.
- Goal completion 2×, dream milestone 3×, wish happening +50 flat.
- Logging any transaction: +2 Financial, no matter what was bought.

### Who decides a slip's reason is valid: Paddie, with a repeat-rule backstop
Options were (a) the AI judges, (b) a fixed rule, (c) both. Chose (c).
`judgeSlip` lets Paddie judge first; then the 3rd time the same reason is given
for the same habit within 7 days, it's an excuse regardless. The rule can only
turn a yes into a no. "Same reason" compares Paddie's short `why_category` when
both slips have one, else normalised text (case, punctuation and spacing ignored)
— exact text alone would miss "tired" vs "I was tired.".
Why both: an AI can be talked round by a good story; a counter can't, but a
counter alone can't tell a real emergency from a lazy morning.

### Mode precedence
Override > low-HP day (soft) > repeated slip or 3+ ignored needs in 3 days
(strict) > curious. A rough day beats repeated slips because rough isn't
slacking. "Go easy on me" expires at local midnight; "no mercy" lasts until
switched off. `computeMode` returns the *reasons* as well as the mode so the AI
picks its tone from facts.
"Same slip" means the same recurring item (Rhapsody every day is many task rows
but one habit), falling back to the task id.

### Money stage uses fixed 30-day periods, not a rolling window
First tried a rolling "last 30 days" window. A test caught that a monthly
salary slides out of a rolling window and the stage would flip deficit/surplus
from one day to the next. Now: periods counted from the first logged
transaction (period 1 = audit), and the stage comes from the last *complete*
period. It holds for 30 days at a time, and the first verdict after the audit
equals what the audit measured.
Also: "unsure" counts as a need (overestimating needs is the safer mistake), and
needs exactly equal to income is surplus.

### Deficit: fund floors first, then comfort
Pass 1 funds each need's floor in priority order; pass 2 tops up to comfortable.
Everything important gets its cheapest honest version before anything gets
comfort. Reports `gap` (comfortable), `floorGap` and `hiddenWants`.

### Money is bigint whole naira
No floats anywhere near money. Kobo was considered and skipped: nothing in a
personal budget needs it.

### Database invariants live in the database
- Composite `(id, user_id)` foreign keys: a row can only point at a parent owned
  by the same user, even if someone guesses an id. Plain RLS doesn't stop that,
  because FK checks bypass RLS.
- Weights sum to 100 via a *deferred* constraint trigger, checked at commit so
  three inserts in one transaction can build up to 100.
- `xp_log` is an append-only ledger (select + insert only). `pillars.xp` is
  derived from it by trigger and is read-only to clients, so totals can't drift.
- Partial unique indexes make XP idempotent: a retried completion can't pay twice.
- Explicit grants to `authenticated` only, nothing to `anon`. Supabase stops
  auto-exposing new tables to the Data API from 2026-10-30.

### Added to the blueprint schema
`tasks.base_xp`, `tasks.title`, `items.priority`, `items.floor_amount` /
`comfortable_amount`, `slips.accepted`, `xp_log.item_id`, and a `checkins` table
(daily energy 1–5) because soft mode needs mood data the blueprint didn't store.

## 2026-10-05 — Day 2 (connector)

### Claude signs in *as you*: Supabase Auth is the OAuth server
Claude's connectors speak OAuth 2.1 + PKCE; Supabase Auth now is an OAuth 2.1
server (beta, all plans). So connecting Claude means logging into MyPaddie and
clicking Allow; Claude gets an ordinary Supabase token for your user, and every
tool call runs under the same RLS the pgTAP tests prove.
Considered: a static secret token (claude.ai connectors want OAuth), or the MCP
server holding the service-role key (one leaked key = every table, RLS bypassed).
Result: **no secret key exists anywhere in this app.**

### Claude uses a client we registered, not automatic registration
Checked the project's auth metadata: Supabase supports PKCE but not Claude's
"published identity" (CIMD), and dynamic client registration (DCR) would let
anyone who finds the URL register clients. So one **public** OAuth client named
"Claude" is registered by hand (redirects: claude.ai and claude.com
`/api/mcp/auth_callback`), no secret (PKCE replaces it), and DCR stays **off**.
This reverses the earlier "enable DCR" step.

### Email + password, sign-ups disabled
One user. Magic links were rejected because Supabase's built-in email sender is
rate-limited to a few per hour. Disabling sign-ups means nobody else can even
create an account to try.

### Catch-up on demand, not a nightly job
`get_today` first creates due recurring rows and applies ignored-need
deductions, then answers. Idempotent at the database level (unique
`(series_id, occurs_on)`, partial unique indexes on `xp_log`, `on conflict do
nothing`), so repeated or simultaneous calls are harmless. Avoids a cron job and
the admin key it would need. Day 3's push notifications will need a scheduler
anyway; revisit then.
Missed days are backfilled (up to 7) so an unopened app doesn't erase ignored
needs; the cap stops a long absence becoming a wall of deductions.

### Writes go through three database functions
`complete_task` (mark done + pay XP in one transaction), `award_xp` (insert,
skip duplicates), `spawn_occurrence` (copy a habit onto a new day). All
`security invoker`, so RLS applies. They exist because the REST API can't do
multi-statement transactions or `on conflict do nothing` on a partial index.
Considered making XP writes server-only so the client can't award itself
points: not worth it for a one-user app (you'd only be cheating yourself).

### Our own recurrence subset instead of the `rrule` library
Only `FREQ=DAILY` and `FREQ=WEEKLY;BYDAY=…` — all habits need. Anything else is
rejected loudly. One less dependency, ~60 lines, fully tested.

### MCP layer
`mcp-handler` 2.x (MCP SDK v2, spec 2026-07-28) in a Next.js route at
`/api/mcp`. Tools live in their feature (`*.tools.ts`), DB access in
`*.repo.ts`, rules stay pure. Every tool result includes `mode`. Protected
resource metadata is served path-specific
(`/.well-known/oauth-protected-resource/api/mcp`) so the advertised resource is
exactly the endpoint Claude connects to.

### Composite foreign keys get composite indexes
Supabase's advisor flagged the `(…_id, user_id)` foreign keys as unindexed:
the single-column indexes didn't cover the pair. Replaced with composite ones.

### ~~Known gap: pgTAP doesn't run against the hosted project yet~~ — resolved below
`supabase test db --linked` fails with `function plan(integer) does not exist`
— the CLI's remote runner can't reach the schema pgTAP lives in (probably a
privilege issue for its login role). The same migrations pass all 38 pgTAP
tests on Supabase's Postgres image locally, and the hosted advisor reports RLS
on every table with nothing exposed. Revisit before adding new policies.

## 2026-10-05 — Remaining tools

### Five tools beyond the blueprint's list
`add_task` (an item like a daily reading habit needs a schedulable task),
`set_mode` (overrides existed in the engine but nothing could set one),
`log_checkin` (soft mode needs energy data), `accept_split` (a proposal is
only a proposal until accepted), `save_identity`/`activate_identity`
("several versions, switch between them").

### The don't-buy-this check
First matching rule wins: need in disguise → yes; deficit → no; this month's
needs not covered → no; over the wants bucket → no; serves a goal → yes;
asked again ≥24h after a "wait" → yes; otherwise wait 24h. The audit has no
budgets, so only the need/goal/wait rules apply there. The AI judges "need in
disguise" and "serves a goal"; the engine judges the money. The 24-hour clock
starts at the *first* wait, so re-asking doesn't restart it.

### Bad money calls are flagged after the fact, never penalised
`log_transaction` returns `flags` for a want bought in deficit, before needs
are covered, or beyond the wants bucket, and the AI points it out. Logging
still pays XP — the blueprint is explicit that honest logging is never
punished. Nothing is flagged during the judgement-free audit.

### Buckets are envelopes, not bank balances
Spending draws down its envelope (wants → wants, everything else → needs),
floored at zero. Income reaches buckets only through `accept_split`, which
can apply once per income entry (`transactions.split_applied_at` is the guard)
and must add up to the income exactly. The emergency buffer target defaults
to one month of needs.

### Levels: 100·(n−1)² XP to reach level n
100 → 2, 400 → 3, 900 → 4. Early levels come fast, later ones mean something.

### `plan_day` deferred
Meals, chore batching and fun blocks need real data to design well (Day 4).
`get_today`'s top three covers "what next" until then.

### An 11th pillar: academic
Coursework and studying for school, separate from `skills` (DSA, LeetCode,
craft). Appended last in both the Postgres enum and `PILLARS`, because pillar
order breaks ties when splitting XP — inserting it mid-list would silently
change existing splits. A test now fails if the TypeScript lists and the
database enums ever drift apart.

### Editing tasks
`update_task`: edits apply to the given day and every later pending day of a
habit (new days copy the latest row, so that's also "from now on"). `cancel`
skips one occurrence without penalty — a decision isn't ignoring it. `stop`
cancels what's open and dissolves the series, keeping past rows as history.
Done tasks are frozen: their XP is in the append-only ledger.

## 2026-10-05 — Day 3 (phone app)

### The PWA reuses the repos the AI tools use
Screens call the same `*.repo.ts` functions as the MCP tools (completeTask,
logTransaction, acceptSplit, loadStats…), through a cookie session that is the
same RLS identity. The app and the AI can't disagree.

### Push: the database decides, the app only words and sends
Vercel's free plan runs cron once a day — useless for escalating nudges — so
`pg_cron` (every 10 minutes) is the scheduler. It creates today's habit rows,
decides which nudges are due (`private.collect_nudges`, recorded in
`private.nudges` so none repeat), and POSTs them to `/api/push` with a shared
secret from Vault. The route has no database access. Rejected: having the
route load data itself, which needs the service-role key on Vercel.
Cost: the recurrence rule exists in SQL (`private.recurs_on`) as well as
TypeScript; both are tested against the same cases.
This also closes the hole in "catch up on demand": habit rows now exist each
morning even if the app wasn't opened.
Rules: quiet 22:00–07:00; brief from 08:00 once a day; non-negotiables up to
4 escalating nudges an hour apart; ordinary tasks one "did you do it?".

### Nudges every minute, bundled, with heads-ups for timed tasks
The first live run sent 18 notifications at once (≈9 overdue non-negotiables ×
2 subscribed devices). Three changes:
- `pg_cron` runs every minute, so a nudge lands within a minute of the due time
  (was up to 10). Cheap: one small query; the app is only called when there's
  something to send.
- 3+ overdue items for one device in the same run become one notification
  ("4 things need you: … Pick one."). Heads-ups bundle separately; the brief
  never bundles. Done in TypeScript (`bundle.ts`), after the database decides.
- A heads-up 15 minutes before any pending task with a time, once per task.
Each rule now counts only nudges of its own kind: otherwise a heads-up
suppressed the later check-in and restarted the escalation clock — caught
while writing the SQL, pinned by a test.

## 2026-10-05 — Time blocks, capacity, reminders

### Capacity is a hard limit; clashes are not
Your rule: when a day is full, nothing more goes on it. Committed time = the
durations of that day's *open* tasks (30 min if unknown), so finishing work
frees room — that's the "unless I finished early" exception, made continuous.
Today's room is also capped by the time left before 22:00. There's no
"add it anyway" for capacity; the only lever is `set_capacity`, a deliberate
change (default 6h, plus date-range periods like exams that override it).
Clashes (overlapping time blocks) *can* be overridden after confirmation —
double-booking is sometimes deliberate.

### Reminder ladder instead of one heads-up
One-off timed tasks: evening before (20:00), 09:00 on the day (if it's more
than 45 min away), 30 and 10 minutes before. Habits: only 10 minutes before —
otherwise a daily habit reminds every evening forever. Per-task override via
`reminders`. Simultaneous reminders bundle ("Tomorrow: Standup 09:00 · …").

### Tasks can become non-negotiable later
`must_from`: from that moment a task ranks and escalates like a must-do, even
before it's due — for replying someone, updating the boss. Escalation now
resets daily (the nudge key includes the day), so a must-do spanning two days
is chased on both.

### delete_task only for mistakes
A task with XP or slips is part of the record (and the XP ledger is
append-only), so it can only be cancelled or stopped. Tasks with no history
can be deleted.

## 2026-10-05 — Learning log

### Skills and sessions, not just tasks
A task says *what to do*; a session records *what was learned* (topic,
minutes, count + unit, confidence, notes). Skills are created on first
mention ("DSA" = "dsa": unique on `lower(name)`; a simultaneous create is
caught by the index and reuses the winner's row). Each skill has one pillar —
`skills` for DSA/LeetCode, `academic` for coursework — and can link to a goal.

### XP: 1 per 5 minutes, to the skill's pillar
45 min = 9 XP, comparable to a normal task (10). At least 1, at most 60 per
session. Idempotent per session, like tasks (`xp_log.learning_session_id`).

### Spaced repetition by confidence
A topic's latest confidence sets when it's due again: 1→1 day, 2→2, 3→4,
4→7, 5→14. Simple Leitner-style intervals rather than an SM-2 algorithm —
enough to bring shaky topics back soon and solid ones later, explainable in
one line.

## 2026-10-05 — Workouts and pantry

### Training days are tasks
Activating a plan turns each training day into a weekly recurring task, so
Today, reminders, capacity, clashes, nudges and XP all apply without a second
scheduling system. Replacing the plan stops the old plan's tasks. Logging a
workout completes today's training task (that's what pays XP: physical 50 /
mental 30 / emotional 20); an unplanned workout becomes a one-off task done on
the spot. XP only ever flows through tasks, so it stays idempotent.

### Time blocks are on time all day
Found while building workouts: a training task is due at its *start* (18:00),
so logging it at 19:05 counted as late and paid half XP. Now a task with a
duration is late only after its day ends; a task without one (a deadline)
is still late after its due time. `lateAfter()` in the XP engine.

### Personal bests
Heavier wins; at equal weight more reps win; holds compare seconds,
bodyweight compares reps. A first attempt isn't a "best" — nothing to beat.

### Pantry: one unit per item, no conversions
Common spellings normalise (kilograms → kg, can → tins, derica → cups); a
different unit for an existing item is refused rather than silently mixed —
the AI converts. Stock floors at zero. Cooking with an ingredient that isn't
logged reports it as missing instead of failing. No XP for meals or pantry
bookkeeping: eating is the food task's job.

## 2026-10-05 — Identity, events, planning

### "Who I'm becoming" is loaded every chat
The blueprint says the profile is loaded into every chat; until now the AI
only saw it if it thought to ask. `get_today` (the first call of every chat)
now returns it, the server instructions say to coach toward it, and any
connected AI can edit it in place (`update_identity`) or save a new version.

### Events are separate from tasks
A task is something you *do*; an event is something you *attend or remember*.
Attention comes from two facts — important? close (≤ 7 days)? — giving
prepare-now / plan-ahead / fit-in / someday. Birthdays and anniversaries
repeat yearly (29 Feb → 28 Feb in other years; same logic in TS and SQL,
tested on the same cases). Timed events block time: they clash with tasks
and count against capacity. Events are never *refused* for clashing — you go
to the wedding — clashes are reported. Preparation is a task, created ahead
with `prep`, so it gets the whole task machinery.
Reminders: a week ahead (important), the evening before, the morning of
(important, and birthdays), 30 minutes before (timed) — once per occurrence.

### plan_day is a proposal; habits aren't re-timed by it
Fixed blocks stay; meals within an hour of their usual time; tasks by
priority with 5-minute buffers; chores (≤ 5 XP) batched after the work; the
biggest gap after the work is free time. Today's undated tasks join only
while capacity allows. Accepting writes times through `updateTask` (clash and
capacity re-checked). A recurring habit's time is *not* written: each new
day copies the latest row, so planning one day would silently re-time the
habit forever.

### Practice tasks log time, not extra XP
A task can be linked to a skill (`tasks.skill_id`). Completing it records a
learning session for its duration (30 min if unknown) — so hours and streaks
count — but with no XP: the task already paid it, and paying twice would make
linked tasks worth double. Topics due for review appear in get_today and as one
quiet line on Today; the push brief stays task-only because it's assembled in
SQL and the review schedule lives in TypeScript.

### Schedule settings, per user, validated as a whole
Quiet hours (may cross midnight), brief time, evening/morning reminder times,
event "close" days and meals live in one `schedule` setting merged over
defaults. The nudge job now applies each user's own quiet hours instead of one
global check. A change is validated as a whole: a reminder time inside quiet
hours is refused with the reason, because it would silently never arrive.
Malformed stored values fall back to defaults in both TS and SQL, so a bad
setting can't break the nudge job. "Time left today" and the planner end at
the start of quiet hours (or at midnight if quiet hours start after it).

### Custom reminder notes
A task or event can carry `reminder_note` (≤ 200 chars). The notification's
title still says *when*; the note becomes the body. On escalations the note
goes under Paddie's firm line rather than replacing it. The SQL change was
generated from the previous collect_nudges by a script that inserts one
payload line, so the 150-line function wasn't re-typed by hand.

### App screens call the same repos as the tools
Task edit, Events and Plan my day reuse updateTask/deleteTask, addEvent and
proposeDay/acceptDay. addEvent lives in its own file (`add-event.ts`) because
it needs tasks.repo, and tasks.repo needs events.repo — keeping it out of
events.repo avoids a circular import.

### Workout and pantry screens
The workout screen pre-fills each exercise with the plan's *target* and shows
last time's numbers beside it — the target is what you meant to do, last
time is what to beat; you only change what differed. Rep targets like "8-12"
pre-fill as 8, "AMRAP" stays blank. Pantry −/+ steps by unit (1 piece/tin,
0.5 kg/l, 100 g/ml); every change goes through adjustPantry, so the
one-unit-per-item rule protects the app exactly as it protects the AI.

## 2026-10-05 — Balance, voiding, purchase interest

### Balance is real money; buckets are envelopes
Balance = opening balance + everything in − everything out, ignoring voided
entries. It's separate from the buckets (budget labels). "Set balance"
records an `opening` entry the first time and an `adjustment` after that, so
the number can always be reconciled with the real account. Opening and
adjustment entries never count as income or spending — otherwise starting
with ₦85k would look like ₦85k income and wreck the audit.

### Mistakes are voided, not deleted
A voided transaction stays on the record with its reason but stops counting
everywhere; its bucket money goes back and its logging XP is reversed (or
log-then-delete would be free XP). Narration and category are editable;
amount and need/want tag aren't, because they already moved bucket money —
void and re-log instead. Income already split into buckets can't be voided
yet (unwinding a split is its own problem).

### Purchase checks: change your mind, keep the record
`interest`: interested / not_interested / bought. Not-interested checks sink
and grey out but stay visible — the record of what he almost bought is the
point.

## 2026-10-05 — Infrastructure

### pgTAP on the hosted project, safely
`supabase test db --linked` can't see pgTAP's functions there, though pgTAP
works. `scripts/test-db-hosted.ts` (`bun run db:test:hosted`) runs each suite
through `supabase db query --linked` instead, replacing the ending with a
statement that *raises an error carrying the counts* (planned / ran /
failed, from pgTAP's `__tcache__`). An error always aborts the transaction,
so nothing a test inserts can be committed to the real database — the safe
failure mode. Proved locally first, including a deliberately failing case.
Running against real data exposed a test isolation bug: collect_nudges and
spawn_today see *every* user, so assertions now look only at the test's own
devices and rows.

### Dead subscriptions are pruned by the nudge job
/api/push reports 404/410 endpoints as `gone`; pg_net keeps the responses.
Each run reads the last 30 minutes of responses (skipping non-JSON) and
deletes those subscriptions. The route itself still has no database access.

### Habits count on every day they happen
Future habit days don't exist as rows yet (they're created each morning), and
"any time" habit rows weren't counted at all. Day loading now includes both:
any-time rows, and projected occurrences from each habit's latest row. So
capacity, clashes, "how full is Tuesday" and planning ahead all see habits,
and a new habit is checked against its next 14 days, not just the first.

## 2026-10-05 — Applications

### Deadlines keep their own time zone
A deadline is entered exactly as published (date, time, IANA zone) and
stored as an instant, so DST is handled by the zone database: "23:59 New
York" is 04:59 Lagos in October but 05:59 in November — the test suite
itself caught that mistake in my own expectation. Misspelt zones are refused
rather than read as UTC. The app shows the deadline in his time and as
published.

### Aim early: a target date
Reminders and requirement tasks aim at a target (default 3 days before the
deadline, per application), because portals crash and references are late.
"Past target" is its own state — the deadline may still be open.

### Requirements are tasks
Each requirement becomes a task due on the target that turns must-do 2 days
before it, so it shows on Today and gets nudged. Completing the task ticks
the requirement; ticking the requirement completes the task (paying XP). If
the target day is full, the requirement is saved and the refusal reported.
Submitting (or any closed status) cancels open requirement tasks; changing the
deadline moves them.

### Their own reminder collector
14/7/3/1/0 days before the target listing what's still missing, a Monday
"apply soon" for rolling deadlines, and a results-day check. It's a separate
function beside collect_nudges (left untouched), joined in send_nudges.
Application notifications are never bundled: deadlines are rare and specific.

## 2026-10-05 — Updates and Google Calendar

### Updates: tasks plus a "since the last one" marker
An update (recipient, channel, topic, optional format) is carried by a task —
recurring for regular ones, reminded the morning of and 30 minutes before.
`draft_update` returns what was actually done since the last one sent
(completed tasks, learning by skill, workouts, application milestones; update
tasks themselves excluded) and the AI writes it in his format, using only
what fits the topic. An empty digest is reported as empty — never padded with
invented work. `mark_update_sent` logs it, moves the marker, and completes
that day's task.

### Google Calendar: read-only iCal import, not two-way sync
The private iCal URL needs no Google OAuth (whose testing-mode refresh
tokens expire every 7 days, and whose calendar scope needs verification).
Because the server fetches a user-supplied URL, it accepts only
`https://calendar.google.com/calendar/ical/…​.ics` (SSRF), refuses redirects,
times out at 15 s and caps the feed at 5 MB. The link is a secret: never
returned in full. ical.js does RRULE expansion, EXDATEs, moved occurrences
and VTIMEZONEs; floating times mean Lagos, not the server's zone. Each
occurrence is a row keyed by UID + recurrence id; re-sync upserts title/time
only, so his own `important` and cancellations survive, and removes what
Google removed. Sync happens when Today loads (at most every 30 minutes),
on demand, and on connect; failures are recorded and shown, not thrown.

## 2026-10-05 — App shell, routes, one colour

### One accent: gold
Gold is the brand and the only accent (actions, progress, the active tab,
the balance card). Green and red appear only where they mean something —
money in / done, money out / overdue — never as decoration. Light mode uses
a deeper gold (#8f6000): the original measured 2.95:1 under white text and
2.72:1 as text, below WCAG AA's 4.5:1; the new one is 5.47:1 and 5.05:1.

### Public site at /, the app at /app
`(marketing)` holds the public landing page with its own layout; the app
lives under `(app)/app/*` with the tab bar. Login falls back to /app, the
manifest starts at /app, notifications open /app. Moved with a script that
only rewrote a bare "/" where it meant "home" (not in the root layout type,
a URL check, or a base64 decoder), then verified by the typecheck.

### Navigation and Settings
Quests · Money · Home (raised, centre) · Stats · Settings. "Paddie" became
Settings: profile ("Who I'm becoming", edited by him — edit in place, save as
a new version, or switch), nudges, schedule, Google Calendar, chat links,
sign out. The AI reads the same profile every chat but doesn't own it.

## 2026-10-06 — Fun list and courses

### Fun is its own list, not wishes or memories
A wish is something not done yet ("learn to drive"); fun is a menu you come
back to. Memories are free text, which can't be filtered by "free", "fits 90
minutes" or "low energy". So `fun_activities` holds a title, rough cost,
minutes, energy and company, plus `times_done` / `last_done_at`.

### Doing fun is a task, like an unplanned workout
`log_fun` creates an undated task and completes it on the spot, so XP flows
through the one idempotent path (10 base: emotional 50 / social 50 with
people, emotional 70 / mental 30 alone). An undated task skips the capacity
check — the fun already happened. Planned fun is a task with
`fun_activity_id`; completing it marks the activity done. Removing an activity
keeps its tasks (and XP) and clears the link. Something not on the list yet is
added to it when logged, so the list grows from real life.

### Suggestions fit money, mood and time; least recent first
Excluded: longer than the free gap; anything that costs money in a deficit;
more than what's left for wants (no limit during the audit — it has no
budgets); high energy on a soft day. Then least recently done first (variety),
cheaper first on a tie; on a soft day low-energy leads. Used by `list_fun`,
`get_today` (ideas only once today's quests are done or fun is overdue — never
pushed otherwise), the free slot of `plan_day`, and the Fun page.

### The fun nudge: after N days, at most every 3 days
Schedule settings `funEveryDays` (default 7, 0 = off) and `funAt` (17:00,
refused inside quiet hours like every reminder). Its own collector beside the
others, never bundled. "Days without fun" counts from the latest fun, or from
when the list was started — a new list shouldn't read as "forever". At most one
every 3 days: fun reminders that nag become another chore.

### A course is an academic skill with a syllabus
`courses` points at a skill (one each), so study time, topic confidence and
spaced repetition reuse the learning log instead of a second system. Topic
status is derived, not stored: never practised = to start, confidence ≥ 4 =
solid, otherwise learning (studied but never rated is *not* solid). Topics
match learning sessions by title, case-insensitively.

### Exams are events, assignments are tasks
Sat in person (exam, test, quiz, presentation, lab) → an important event of
the new kind `exam`: it blocks time, clashes are reported, the event reminder
ladder applies. Handed in (assignment, project) → a task due on the day that
turns must-do 2 days before, like an application requirement. Marking an
assignment done completes its task (XP). Moving a date replaces the event or
task; done work is never touched.

### Study plans: proposal first, but Paddie may book directly
`propose_study_plan` → `accept_study_plan`, like `plan_day`. Order: topics an
exam/test/quiz in the next 14 days covers that aren't solid (before it,
sooner exam and shakier topic first), then reviews due in the window, then new
topics in syllabus order (one per course per day). Each topic once; at most
`max_per_day` sessions and never more than the day's free capacity. Exam topics
that can't fit before the exam are returned as `unplaced` so the AI says so.
Topics already booked as open study tasks aren't proposed again. Kingsley is
also fine with Paddie creating study tasks itself: `add_task` takes `skill` +
`topic`, and `complete_task` takes `confidence` so the topic's review date
updates.

### Outlines: the AI reads them; the app takes pasted lines
A shared outline (text or PDF) is parsed by the AI into one `add_course` call.
The app's form takes topics one per line and keeps "Week 3: …" as the week.

### Fixed: habits lost their details after the first day
`spawn_occurrence` still copied only the Day 1 columns, so a habit's later
days lost their duration (a training block became a deadline and paid half
XP when logged after its start), reminders, skill link and reminder note.
Found while adding `topic` and `fun_activity_id`; it now copies all of them
(not `must_from`, which is one moment). Pinned by pgTAP.

### Fixed: export_all only exported the first twelve tables
It listed the Day 1 tables by hand, so learning, workouts, events,
applications and the rest were missing from "your data is never trapped". It
now walks every public table with a `user_id`, still as the caller (RLS).

## 2026-10-07 — Commitments, weekly load, promises

### Commitments group what they put on the calendar
A job, role, membership or team is a `commitments` row (kind, role, org,
priority core / important / optional, status). Its regular sessions —
team training, rehearsals, shifts, personal training — are recurring tasks
with `commitment_id`, so they block time, get reminders and pay XP for
showing up (default pillars by kind; a session can override, e.g. choir →
spiritual). One-offs — a competition, an election — are events with
`commitment_id`. Pausing or ending a commitment stops its sessions and
cancels its open tasks so the time comes back; past sessions stay as history.

### Weekly load: advice, not a refusal
Daily capacity stays a hard limit. The week is advice: the next 7 days'
scheduled minutes (from the days themselves, so it agrees with the daily
check — habits projected, events included) plus each commitment's
unscheduled estimate (`extra_minutes_per_week`, for freelance work and admin),
against the 7 days' capacity. Room below 80 %, tight up to 100 %, overloaded
above. When it isn't room — now, or after a proposed addition
(`check_load(adding_hours_per_week)`) — it lists what to drop: optional before
important, biggest relief first, core never; `enough` marks where dropping gets
back to room. The AI weighs those against "Who I'm becoming"; he decides.
Kingsley chose advice over a hard stop. Hours come from both the scheduled
sessions and his estimate, as he asked.

### Promises cost XP when broken; keeping late earns back half
A promise (person, what, due) is carried by a task: Today, reminders,
must-do from the morning before. Kept on its day: +15 (character 60 /
relationships 40). Not kept, released or renegotiated by the end of its day:
broken, −15 (the full amount, `brokenPromisePenalty` = 1), charged once against
its task by the same catch-up that charges ignored needs. Its task stays open:
keeping it afterwards pays the usual late half (+8), so broken-then-kept nets
about −50 % — Kingsley's rule. Renegotiating (a new date, after telling them)
only works while the day hasn't ended; "they let me off" in time costs
nothing. Kept late before catch-up ran still counts as broken: the rule looks
at when it was kept, not when the app noticed. Two or more broken promises to
the same person in 90 days is surfaced as a pattern.

### A promise is recorded even when its day is full
Capacity refuses new work on a full day, but a promise already exists. If its
day is full the task goes on undated (still a must-do from the day before)
and the full day is reported — a reason to renegotiate or drop something, not
to lose track of the promise.

## 2026-10-08 — Multi-user, part 1: each user's own time zone and currency

### The rules read the signed-in user's config, set once per request
Every rule used to default to `DEFAULT_CONFIG` (Lagos, naira). Now defaults
are `currentConfig()`: the request loads the user's profile once (settings key
`profile`: name, time zone, currency, voice) and everything below it reads
that. Two carriers, because Next renders server components outside the
caller's async flow: AsyncLocalStorage (MCP route, server actions) and a
per-render React `cache` cell (server components). `requireDb()` and the MCP
route set it; nothing else has to remember to pass a config.
Considered: threading `config` through every call (~40 files, and nothing
would stop a call site forgetting — the defaults would quietly be Lagos).
The resolver is *registered* by the server module so the rule files, which
browser forms import too, stay free of Node-only code.

### A forgotten path fails loudly, except in production
If a server path runs a rule without loading the user, `currentConfig()`
throws in development (so it shows up the first time the page is opened),
logs once and uses the defaults in production, and returns the defaults in
tests. Verified by loading every app page and calling the MCP tools as a
New York user on a dev server: all on New York time, money in pounds.

### No zone = Lagos; a broken zone = UTC
An account with no profile yet (Kingsley's, today) keeps Lagos, so nothing
shifts under it. A saved zone that isn't valid falls back to UTC — the middle
of the world's zones — at Kingsley's call. Saving an invalid zone is refused
anyway; the fallback is a safety net in both TypeScript and SQL.

### The scheduler works per user, too
`private.user_clock(now)` gives each user's zone, local time, local date and
schedule in one place. `collect_nudges`, the application and fun collectors
and `spawn_today` use it instead of one global Lagos clock, so briefs,
reminders, quiet hours and new habit rows all follow each user's day;
`nudges.day` is the user's date. pgTAP walks a Lagos, a New York and a
broken-zone user through the same morning.

### Money is whole units of the user's currency
Amounts stay integers; only display changes. `formatMoney` uses the user's
currency (narrow symbol: ₦, £, $, GH₵…); browser forms are handed it by their
page, since there's no request context in the browser. Parsing strips any
symbol, not just ₦.

### Voice is a setting; Naija is the default
`profile.voice`: `naija` (the original deadpan narrator with Naija banter) or
`neutral` (the same coach in plain English). The server instructions describe
both and `get_today` returns `you` (name, voice), so one MCP server serves
everyone. Tool descriptions say "the user" / "their" instead of "Kingsley" /
"his" — "the user" keeps every verb agreeing, which "they" wouldn't have.

### Onboarding gates Home only
A profile without `onboardedAt` is sent from `/app` to `/welcome` (name, time
zone — the device's is suggested — currency, voice). Only Home redirects:
every other page already works on the defaults, and a deep link from a
notification shouldn't bounce someone into a form.

## 2026-10-09 — Multi-user, part 2: invite-only sign-up

### The gate is Supabase's "Before User Created" hook
It runs for every way an account can be created — password, email link,
Google — and can refuse with a message, so no sign-up path can skip it and
there's still no admin key. `public.hook_before_user_created` admits a sign-up
with a valid invite code (sent as user metadata `invite_code`) or an email
that was invited; everyone else gets "MyPaddie is invite-only for now". A
trigger on `auth.users` marks the invite used once the account exists.
Signing in to an existing account never touches it.

### Codes, optionally tied to an email
Google sign-up can't carry a code, so an invite can name an email: that email
gets in by any method, no code needed. An email-bound code only works for that
email. Codes are 8 characters without look-alikes (no 0/O, 1/I/L), not
case-sensitive, used once, valid 30 days, revocable while unused.

### Invites are handed out deliberately
`create_invite()` checks a per-user allowance (`private.invite_allowances`, no
row = 0): the clients can't insert invites directly. Revoking an unused
invite gives the slot back. Opening up later is one UPDATE (give everyone an
allowance) or turning the hook off.

### Accepted race
Two people signing up with the same open code at the same instant could both
pass the hook before the trigger marks it used. Harmless at this scale (one
extra account you invited anyway); tied-to-email invites don't have it.

## 2026-10-10 — Multi-user, part 3: sign-in and sign-up screens

### Three ways in, one gate
Google, an emailed link, or a password — for signing in (`/login`) and for
joining (`/signup`). The invite hook is the gate for all of them; the pages
only make it pleasant.

### The sign-up page claims the invite first
`claim_invite(code, email)` (callable signed out) checks the code and ties an
open one to the email typed. Two reasons: mistakes ("used", "expired", "for a
different email", "you already have an account") are explained on the page
instead of surfacing as a refusal from Google; and Google sign-up, which can't
carry a code, is then admitted by email. A code tied by claiming can be
re-claimed (a typo shouldn't burn it); one the host tied to an email can't be
taken by anyone else.

### Email links verify a token hash, not a PKCE code
Links go to `/auth/confirm?token_hash=…&type=…`, which works on any device —
people open these emails on their phone after asking on a laptop. A PKCE code
exchange only works in the browser that asked. Google uses `/auth/callback`
(code exchange), which is fine: it starts and ends in the same browser.
Supabase's email templates have to point at `/auth/confirm` for this.

### "Sign in with a link" never creates an account
`shouldCreateUser: false` on /login; only /signup (with an invite) creates
accounts. Both link forms answer the same way whether or not the email has an
account, so they can't be used to find out who's a member.

### Error text is never echoed from the URL
Errors come back as `?error=<kind>&message=…`. Only the invite hook's own
messages are shown verbatim; everything else becomes a fixed line.

### Seen while testing: accounts created by an admin skip the hook
Creating a user from the Supabase dashboard (or the admin API) doesn't go
through sign-up, so the invite hook doesn't run. That's the escape hatch for
adding someone by hand.

## 2026-10-10 — Multi-user, phase 2: connect your AI with one URL

### Dynamic client registration on — the reason it was off no longer holds
Day 2 kept DCR off so strangers couldn't register clients, and registered
"Claude" by hand. With open (invite-gated) sign-up that's moot: a registered
client can do nothing until a signed-in user approves it on our consent page.
Now Claude or ChatGPT registers itself when someone pastes
`/api/mcp`; nothing is set up per app. The hand-registered client keeps
working.

### The consent page judges by where access goes, not by name
Anyone can register a client called "Claude". The redirect address can't be
faked, so `describeDestination()` classifies it: Claude / ChatGPT / Gemini by
their real hosts (subdomains included; look-alikes like `claude.ai.evil.com`
or `user@host` tricks are not), a program on this computer (localhost), an
unknown site, or unsafe (plain http elsewhere, nonsense). Known apps: one-tap
Allow. Unknown or local: a red warning naming the real destination, and Allow
only after ticking "I started this myself, just now". Unsafe: Deny only. The
approve action re-checks all of this on the server.

### Connected apps, and disconnecting
Settings → Connect your AI shows the address to paste, short steps for Claude
and ChatGPT, and the apps with access (Supabase's `listGrants`). Disconnect
(`revokeGrant`) withdraws consent and kills that app's refresh tokens; its
current access token lives until it expires (an hour).

### Verified end to end
A script does what Claude does from just the URL: 401 → resource metadata →
authorization server metadata → register → authorize with PKCE → our consent
page → Allow → code → token → `get_today` as that user; then Settings lists
it, disconnecting kills the refresh token, and a look-alike "Claude" gets the
warning, can't be allowed without the tick, and leaves with access_denied.

## 2026-10-11 — Invites switch, plans, and phase 3 (safety)

### Switches live in the database
`private.app_config`: `invites_required` (off for now — Kingsley shares the
link with a few people), `default_plan` (`free`), `payments_enabled` (off).
One SQL line flips each; no redeploy. The invite hook and pages read the
switch, so turning invites back on restores the whole flow, codes and all.

### Plans without payments
Free / Plus / Pro, defined in one file (`src/features/plans/plans.ts`):
limits (AI apps 1/3/∞, habits, courses, commitments, applications, fun list)
and features (study plans, weekly load advice, Calendar import; Pro adds
Paddie's own chat when it exists). Prices in USD and NGN, yearly = 10 months,
students half. Everyone starts on Free and switches in Settings → Plan with
one tap while nothing is charged; once `payments_enabled` is on, only Free can
be chosen there and paid plans come from a payment (Paystack, later).
Kingsley first wanted Pro as the default, then chose Free.

### Limits are checked where things are created, on the server
`requireRoom` / `requireFeature` throw a `PlanLimitError` whose message says
what, how many, and where to upgrade — shown as is by the AI and by the app's
forms. What's never capped: Today, one-off tasks, XP, money, nudges, export,
deleting your account. Logging fun past the list cap still counts (it just
isn't added to the list). The AI-app limit is checked on the consent page and
again on approval; reconnecting an app you already allowed doesn't count.

### Isolation is tested across the whole schema
`isolation.test.sql` doesn't list tables: it checks every public table has
RLS, anon has no table grants, every policy uses `auth.uid()`, anon can run
only `claim_invite` and `signup_settings`, `private` is closed, every
SECURITY DEFINER function pins `search_path`, and a second user sees zero of
the first user's rows in every readable table (and that the check walked 30+
tables, and that the first user does see their own). A new table that forgets
RLS fails it without anyone writing a test for it.

### Deleting your account without an admin key
`delete_my_account()` deletes the caller's `auth.users` row — only
`auth.uid()`, never a parameter — and every ON DELETE CASCADE takes their data
(and AI sessions and grants) with it. Tested: nothing with their id is left in
any table, nobody else's data is touched. The app asks for the phrase "delete
my account", signs out, and goes home.

### Export is one file
`/app/export` downloads `export_all()` (every table of theirs, as them, under
RLS) as JSON.

### Rate limit on the AI endpoint
300 tool calls per user per 10 minutes, counted in Postgres
(`rate_hit`, fixed windows, old rows cleared as it goes) — generous for chat,
a wall for a runaway loop. Over it: HTTP 429 with a plain message. Sign-up,
email and sign-in limits are Supabase Auth's own.

### Privacy policy and terms: plain drafts
Written to match what the app actually does (processors, no master key, the
rights you can exercise from Settings), naming the NDPA complaint route.
Drafts — to be reviewed before strangers sign up. Contact address in
`src/shared/legal/legal.ts`.

## 2026-10-12 — Public pages and the (auth) group

### Auth pages share one layout, URLs unchanged
`/login`, `/signup`, `/reset-password`, `/welcome`, `/auth/*` and
`/oauth/consent` live in the `(auth)` route group with one layout: the mark
back home, a centred column, Privacy and Terms. A route group doesn't change
URLs, so Supabase's redirect URLs, the email templates and Claude's consent
path all still point at the same places. `signOut` moved to
`src/features/auth/sign-out.ts` (the settings page imported it from a route
folder).

### Pricing reads the same plans.ts the app enforces
The public pricing table renders `PLAN_INFO` and `priceFor()`, so the price
on the website and the limit in the app can't disagree. Limits are worded with
`limitText()` ("1 course", "3 courses"), which also fixes the plan-limit
messages.

### Marketing copy says what it is now
Home: the hook, how it works in three steps (account → connect your AI → ask
"what's today?"), what it does (including load, promises, school, fun), the
privacy promise, and a pricing band. About: the "paddy" idea and the
principles from the blueprint, with Spectroniq Limited as the face — no
personal details on public pages. Checked at 390 px in headless Firefox.

## 2026-10-13 — Role history, and telling the AI what it can do

### Roles are history, not a field
`commitment_roles` keeps every role a commitment has had, with dates; the
commitment's title is just the current one. "Role changed" (`new_role`)
closes the current role the day before the new one starts; a "change" dated
on or before the current role's start is a correction and just renames it
(so a typo doesn't create history). Ending the commitment closes its role.
One current role per commitment is a unique index. Existing commitments were
backfilled with their title as the first role, unknown start dates left
unknown rather than invented. Month names come from a fixed list — runtimes
disagree on "Sep" vs "Sept".

### The AI checks before it says "I can't"
Testing with ChatGPT, it told Kingsley it couldn't do things it has tools for.
Three layers, because not every AI app honours server instructions: the
instructions now name the areas and say to check first; `what_can_paddie_do`
lists every tool by area with the user's plan; and `get_today` (the first
call of every chat) carries a one-line tip pointing at it. The list is built
by wrapping `registerTool` as the server starts, so it can't drift from the
real tools.

### Plan changes need no reconnect
The plan is read on every tool call (it's in the per-request user context),
and the tool list is the same on every plan — a tool outside the plan answers
with what's needed. Switching Free → Pro applies to the very next message.

### Signed in? The public site says "Open app", and /login moves you on
The marketing header checks the session on the server (`isSignedIn()`), so a
signed-in visitor sees one "Open app" button and never a flash of "Sign in".
Cost: the public pages render per request instead of as static files — small
pages, and the proxy already touches the session on every request. `/login`
and `/signup` redirect a signed-in visitor: `/login` to its `next` (so an AI
app's sign-in bounce carries straight on to the consent screen; `safeNext`
still keeps it on this site), `/signup` to the app. `/reset-password` stays
open: a reset link signs you in first.

## 2026-10-14 — Timetables, people, knowing yourself, library, lists, first run

### Habits can end
Repeating tasks take `UNTIL=YYYYMMDD` (inclusive, local date): a semester's
classes, "gym until exams". Both rule engines learned it — `occursOn()` in
TypeScript and `private.recurs_on()` in SQL — so every path that creates
habit days (catch-up, the morning job, projections) respects it at once.

### A timetable is classes on a course
`set_timetable` takes every class (course, kind, days, start–end, venue)
plus the last day of classes. Each class is a weekly block linked to its
course (`tasks.course_id`), ending with the semester. Classes are *fixed*:
never refused for a full day or a clash — you have to be there — so the
result names weekdays already over capacity from classes alone instead.
They don't count as habits for plan limits. Setting a course's classes
replaces its old ones. Missing courses are created — all or nothing: if the
plan can't fit every new course, nothing changes and the message names them
(caught by the end-to-end test, which first created one course and failed on
the second).

### People
Who each person is to you (in your words), notes, birthday (onto the
calendar, yearly), a reach-out rhythm, things to talk about, and a contact
log. Logging contact pays Relationships/Social XP through a task done on the
spot (5, or 8 for a call/visit), resets the clock and clears topics covered.
Who's due: most overdue first, close people ahead. `get_today` carries one or
two names with something to talk about; open promises show against the
person by name.

### Knowing yourself
`self_notes`: strengths, weak spots, things they're healing from, patterns,
triggers, good habits, habits to break, history — each with how they're
working on it, and resolved when it's behind them. `get_today` carries only
the kinds that change what good advice looks like (patterns, triggers, weak
spots, habits to break, healing) so the AI can say "you tend to…" — the
instructions say kindly, never to shame.

### Library, favourites, and lists
Media (book, film, series, music, podcast, game; want / on it / done; rating)
matched by kind + title, so "I finished Atomic Habits" updates rather than
duplicates. Favourites by category in their words ("Favourite Songs" →
`song`). Lists are theirs to define — any title, items ticked off, progress as
done/total; "just a list" hides progress. A list titled "Bucket list" pays
the wish bonus (+50) the first time an item is ticked; `done_at` survives an
untick so re-ticking never pays twice.

### The first ten minutes
Welcome is step 1 of 4; then Connect your AI (the address, Claude and
ChatGPT steps), Reminders (the nudge switch, and on iPhone the "Add to Home
Screen" step without which web push can't work), and "Empty your head" with
copyable first messages. Every step can be skipped.

### Bot protection, feedback, usage — all first-party
Cloudflare Turnstile on sign-up and the email/password forms (Google does its
own checks); dormant until `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set, enforced
by Supabase Auth once its secret is set. Feedback goes to `public.feedback`
(users can add and read their own). Usage is one row per user per day per way
in (`private.activity_days`, app or AI) — nothing about what they did — and
`private.usage_summary()` turns it into sign-ups, AI connection rate, actives
and next-day return for the team, from the SQL editor. No third-party
analytics.

### export_all reads only what you may read
A write-only table (feedback, before users could read their own) broke the
export; it now skips any table the caller can't select, qualified by its own
schema.

## 2026-10-16 — Reviews, themes, achievements, routines, decisions; the app's feel

### Reviews: the facts first, then the questions
`prepare_review` builds a digest of what actually happened in the week, month,
quarter or year — done, XP by pillar, XP lost to ignored needs and broken
promises, slips and reasons, money in/out, study, workouts, people, bucket
ticks, achievements, energy, decisions, the theme, and what *last* review
said to change — and the AI runs the review as a conversation, then saves
answers and a report. Weeks run Monday–Sunday. A review is owed from the
period's last day for a grace (week 2 days, month 3, quarter 7, year 14).
The reminder fires on Sunday evening for the week and on the last day of a
month for the month — or the quarter / year when they end too (biggest wins),
only if not written, once a day, at their evening time.

### Themes are seasons
A theme for a year, quarter or month ("Month of Mercies") with *focus* and
*not now*. That's the "seasons" idea without a separate concept. `get_today`
carries them; the AI pushes back when something on *not now* comes up.

### Achievements are derived, recorded once
Counted from what's already recorded (tasks, the longest run on any habit,
workouts, study time, savings, promises kept on time, bucket ticks, contacts,
reviews, fun, levels) — no new tracking. Each is stored once with its date and
what earned it; +25 XP through a task done on the spot; announced in
`get_today` and on Today the first time only. Examples stay generic in code —
"30 days in a row on one habit" names whichever habit did it.

### Routines collapse on Today
A routine's steps are ordinary habits (XP and reminders per step), linked by
`routine_id`/`routine_step`. Today shows one item — "Morning routine · next:
Brush (2/5)" — at the rank of its most urgent step; Done completes the next
step. It counts as one habit for plan limits. Steps are timed back to back
from the start time.

### Decisions come back for review
A decision with why and what you expect, and a review date (default 30 days)
that puts "Review: …" on Today; the verdict (worked / partly / didn't)
completes it.

### The app's feel, globally
Tailwind v4's preflight leaves buttons on the default cursor; the base layer
restores the pointer for everything pressable, adds a small hover brighten
and press squeeze (skipped for disabled controls and reduced motion), and a
visible focus ring. One-tap forms (Did it, Talked today, ticks…) got
`SubmitButton` — disabled with a spinner while saving — via a codemod over
every `<form action={serverAction}>` without its own pending state (43
buttons). App pages have a loading skeleton.

### Redirects moved into the proxy
The loading skeleton makes pages stream, which turned `redirect()` inside a
page into a refresh after a second — signed-out visitors briefly saw the app.
The proxy now decides the two that matter before streaming: no session on
`/app/*` → sign-in (307), and a profile without `onboardedAt` opening Home →
`/welcome`. Page-level checks stay as a backup.

### Fixed: server actions ran on the default user settings
Found from a screenshot: Allow on the consent screen bounced back
(`confirm=needed`) for someone on Pro with an AI app already connected. The
page showed their real plan; the action behind the button saw Free. Cause:
`AsyncLocalStorage.enterWith()` inside an awaited helper (`requireDb` →
`enterUser`) doesn't carry back to the caller after the helper returns, and
pages hid it because they also read a per-render React cache that actions
don't have. So every server action ran its rules on the defaults — Free plan,
Lagos time, naira. Now the request enters an empty holder synchronously at
the start (before any await, so it belongs to the caller) and loading fills it.
A unit test shaped like an action reproduces the bug (it fails on the old
code) and checks two concurrent actions don't see each other's user; the
consent test now approves a second app on Pro through the real button.

### Only the pressed button spins
In a form with several submit buttons (Deny / Allow) `SubmitButton` spins only
the one whose name/value was submitted; the others just go disabled.

### Values, trends and experiments
Values are a short ranked list in the user's words, replaced as a whole (they
get edited together). They ride along in `get_today`; the tool text tells the
AI to name a clash with a big choice once and never preach, and to help name
values by asking rather than suggesting. Check-ins grew mood, sleep and
screen time; energy became optional (a check-in must say something), and
logging merges into the day so sleep in the morning and mood at night don't
overwrite each other. Mode and reviews ignore days without energy. Trends
reuse data that's already there (workouts, study, spending, promises) instead
of asking for more logging, compare the last 2 weeks with the 4 before (a
5% / 0.1 dead zone counts as steady), and say whether the move is the better
way. Experiments compare the watched line before and during over equal
windows (at least 7 days before), and refuse to call it with fewer than 3
logged days on either side. The verdict is the user's; numbers only inform it.

### Items can be edited, finished, paused, dropped and deleted
An audit of the tool list (2026-10-07) found items were add-and-list only,
and that the goal (2×) and wish (+50) bonuses existed in the engine but
nothing ever paid them. `complete_item` now does, in one transaction like
`complete_task`. An item has no pillar weights of its own, so the bonus goes
where its tasks' effort went (their weights added up and scaled back to 100);
with no tasks, the AI asks which pillars it served (the app asks for one).
The goal bonus is 2× the last finished task's base XP, or 2× 10 with none.
Done can be reopened for mistakes, and the ledger's existing one-bonus-per-item
index means finishing again never pays twice. Needs, wants and dreams pay
nothing for being ticked off (a dream pays through milestones, coming later).
Delete is only for mistakes: anything with tasks or XP behind it is dropped
instead, so history stays. Moving a need to another tier clears its amounts
instead of failing the constraint.

Fixed on the way: the add-quest form failed for needs and goals, because
fields hidden for a tier aren't in the form data and the schema required them.

### Undo reverses, never deletes
A mis-tapped complete_task, log_fun, log_workout or learning session can be
undone. The XP ledger stays a record: the original rows get `reversed_at`
and one negative `undo` row per pillar is written, so the pillar trigger
(insert-only) nets them to zero and history shows both. The "pay once"
unique index now ignores reversed rows, so a task undone and later really
done pays again. Only earnings (`completion`, `late_completion`, `learning`)
can be reversed — never a deduction or a bonus — and a reversed mark can't be
lifted (RLS `with check`). Clients get a column-level `update (reversed_at)`
grant; that's no new risk, since they can already insert XP rows.

The undo also rolls back what completing set off: the workout log, the fun
count and last-done date, a kept promise, an application requirement, practice
time logged from the task. A planned task goes back to pending; one that only
existed to record something after the fact (undated, not a habit, created and
done within 2 minutes — log_fun, an off-plan workout) is cancelled, so no
phantom pending task is left. A learning session is deleted after its XP is
reversed, so streaks, hours and review dates read as if it never happened.

The tool is two-step: without an id it lists the last 48 hours and changes
nothing, so the AI confirms the right one by name before undoing. In the app,
"N done today" on Today opens Done recently, with Undo on each.

### Routines are edited in place
`update_routine` renames, removes, adds, reorders and retimes steps without
rebuilding: each step stays its own habit, so its history and streak survive.
The plan (which steps, what order, what time) is a pure function; the order
must name every remaining step once, and removing every step is refused (stop
the routine instead). Times are re-laid back to back from the start, through
`update_task` on each step's next open day, which carries forward.

### Money guardrails: caps, bills, money owed
**Caps** are per category per month, in the user's own words, matched in any
case. Unlike the wants bucket, a cap counts every tag (it's their rule), and it
holds during the audit too. check_purchase takes an optional category and says
no past what's left (rule 5, after the bucket rules, before "serves a goal");
log_transaction adds an `over_cap` flag. Flags still never cost XP.

**Bills** keep their own schedule instead of extending the habit engine to
monthly rules (that would touch the TypeScript planner, the SQL `recurs_on`
and spawning). Each due date is one fixed "Pay: …" task, so the reminder
ladder works unchanged; `fixed` skips capacity because a bill can't be moved
to make room. Months count from the first due date (`anchor_on`), so a bill on
the 31st lands on 28/29 Feb and comes back to the 31st. Paying is one RPC:
compare-and-set on `next_due`, then `record_transaction`, so the spend and the
move happen together.

The compare-and-set wasn't enough on its own. A smoke run showed a second
`pay_bill` call reading the already-advanced bill and paying next month too:
the guard protected one due date, not the intent. Now a payment within half a
period of the last one is refused as `recently_paid` unless `ahead` is said
explicitly; the app's button sends the due date it showed (`forDue`) instead.

**Money owed** both ways, with partial repayments that can't exceed what's
left (checked in the RPC under a row lock). Borrowing, lending and repaying
move real money as a new transaction kind, `loan`: the balance changes, but
it's never income (no split proposal) or spending (no stage, bucket or flags).
A due date makes a task: "Pay back …" is a must-do; "Ask … about the …" isn't.

Known gap: undoing a bill's "Pay: …" task doesn't void its transaction; void
it separately.

### The evening close-out
`close_day` works in two steps, like plan_day: first the picture (done, still
open with the options each allows, tomorrow's tasks/events/bills/free time,
check-in fields missing), then the decisions. Each open task is moved, dropped
or owned as a slip, but not every option fits every task: a **need can't be
dropped** (skipping a need is a slip, judged like any other, so the close-out
can't become a way round the ignored-need deduction), and a **habit's missed
day can't be moved** (tomorrow has its own row). Something carried 3+ days is
called out: shrink it or drop it, rather than move it again.

Closing pays +5 XP (character, mental) once a day, whatever the day was like:
the habit of closing is what's rewarded. A second close the same day updates
the win/note and pays nothing (`day_closes` is unique per day).

Slips use the same rules as log_slip, now in `slips.repo.ts` (moved out of the
tool). In chat the AI judges the reason; in the app nobody does, so reasons are
picked from a list where the real ones (sick, emergency, no power or data,
plans changed by someone else) are accepted and the rest (tired, no time,
forgot, didn't feel like it) are recorded honestly but don't protect a need.

The evening push comes at `closeAt` (default 21:30, between the 20:00
reminders and 22:00 quiet hours; `closeOut` switches it off), once, only if
the day isn't closed and something was due today or is still open. Its level
carries the open count for the message. Closing from the app records the
decisions as they're tapped, so the day's summary counts are only filled when
the AI closes it in one go.

`export_data` doesn't push the whole JSON through chat: it gives the signed-in
download link and record counts, and returns one part's rows (up to 500) on request.

### Meal planning
Recipes are a table of their own, and also learned: cook_meal with
ingredients saves a new dish as a recipe (any meal slot until told otherwise),
so planning gets better just by logging what was cooked. Ingredients use the
pantry's units, and an ingredient in a different unit counts as missing —
the pantry deliberately does no conversions.

`propose_meals` is read-only, like plan_day. For each open slot (the meals in
their schedule, from today's still-ahead ones), in time order, it ranks
suitable recipes by: makeable from what's left → not eaten or planned in the
last 2 days → eaten longest ago → fewest missing → name. Each pick reserves its
ingredients, so a later slot sees what's really left and two meals don't both
count on the same rice. Stock ranks above variety (eating beans twice in three
days beats a plan you can't cook), with one hard rule found in a smoke run:
**never the same dish twice in a day** — the slot is left open and reported
instead. The shopping list adds up what the whole plan is short.

`accept_meals` saves any dish name (a recipe isn't required); a planned slot is
replaced, a cooked one never. cook_meal ticks today's planned slot by name.
Planned dishes name the meal slots in Plan my day ("Lunch: Jollof") and ride
along in get_today.

### Where I am: statuses hold pushes, and held pushes come later
A status (with friends, out, at work, in class, deep work, sleeping, worship,
commuting, resting, other) always has an end, at most 16 hours away, so a
forgotten one can't silence Paddie for days. One is active at a time; setting
a new one ends the last. Each has a hold:
- **all** (sleeping, in class, worship, deep work, phone-free windows): nothing arrives.
- **soft** (with friends, out, at work, commuting, resting): only what's coming
  up — reminders, heads-ups, events, and "time to head out".
- **none** ("Busy"/other): just information for the AI.

Priority: a status they set beats a running class (a cancelled lecture),
which beats a phone-free window. A class is a timetable task (course + repeat)
whose block contains now, so "in class" needs no tapping.

**Held means delayed, not dropped.** Every collector records what it sends
with `sent_at = now()`, and all of them run in one transaction, so `now()` is
the same value for all of them. `private.apply_holds` deletes those records for
held users before anything is posted, which makes each collector find the same
nudge on the next minute's run. It goes out once the hold ends, if it still
applies; a reminder for something already over expires naturally. This needed
no change to any of the five collectors. The cost is that held users are
re-collected every minute, which is cheap.

**Leave nudges**: while with friends, out or at work, a timed task or event
starting within the status's lead (default 30 minutes) gets one "Time to head
out — Standup at 18:20". (Event leave nudges use level 0 so they fit the
existing event index without colliding with reminder levels.)

**Phone-free windows** are minutes after quiet hours end and before they
start. They hold like quiet hours, and like quiet hours, a reminder time inside
one is refused at save with where to move it — clearer than a brief that
silently arrives late.

The rules live twice: `status.ts` (Today, get_today, set_status) and
`private.holds` (the send job). The pgTAP test pins the SQL side to the same
cases as the unit tests.

### Undo covers slips
A slip logged by mistake (wrong task, or it was done after all) is deleted,
not reversed: it has no ledger, and mode, stats, reviews and the
repeat-excuse rule should read as if it never happened. Its task goes back to
pending unless another slip still explains it — so if it was a need whose day
is over, the ignored-need deduction applies, because the slip was the only
thing protecting it. `set_mode` (tone) now points to `set_status` (where they
are), since the two were easy to confuse.

### Eleven pillars, on purpose
The Gamified Life has ten stats; MyPaddie has eleven because Academic was split
from Skills (2026-10-05). Code, both blueprints and the stats tools all say
eleven; only the book says ten. Merging back would rewrite every coursework
task's XP history, so it stays unless decided deliberately. Noted in the
blueprint so the difference reads as a choice.

### The life map judges, it doesn't ask
Seven areas — body, mind, money, people, faith, work & school, fun — cover all
eleven pillars exactly once (a unit test checks it). Each area is judged only
from what's already logged: trends, XP in the last 14 days against the 28
before (halved, to compare like with like), money state, people due, days
since fun. Thresholds are few and plain (sleep under 6h, mood ≤ 2.5, five slips
in two weeks, three people due, two weeks without fun). Any problem means
"attention"; "unknown" means nothing is logged, never "fine". It names one
focus area — the most problems, then the least XP — because the blueprint's
rule is fewer decisions, not a dashboard of everything wrong.

### Milestones and moments
A **milestone** sits under a goal or dream and pays 3× its base XP (the last
finished task's, as for goals) to the pillars its tasks feed, once ever:
`xp_log.milestone_id` with a unique index, so reopening and hitting again pays
nothing, while each milestone on the same dream pays. A **moment** is a life
event (graduated, first job, moving) with what came before and after, in their
words, and no XP. A dated moment in the past is recorded as having happened.
The timeline puts what happened first (oldest first), then what's planned
(overdue, ahead, someday), and gives each entry its neighbours, so "what came
before" exists even when they never wrote it.

### Tasks can be for a role or a course; classes are flagged, not guessed
`add_task` and `update_task` take `commitment` and `course` (null unlinks),
and the app's task page has a "For" picker (one at a time: picking a role
clears the course). A course-linked task is for admin and one-offs — an exam
form, a group meeting; study on a topic still goes through the study plan,
which logs study time through the course's skill.

Until now "a repeating task linked to a course" *meant* a timetable class,
and three things relied on that: the timetable view, the "in class" push hold,
and the habit limit (classes don't count). Letting any task link to a course
would have turned a weekly study group into a class that silences Paddie. So
classes now carry `tasks.is_class`, set only by set_timetable, copied by
`spawn_occurrence`, and backfilled exactly (only the timetable had set
`course_id` on repeating rows). A class stays locked to its course in the app.

### The close-out push is the evening summary
Rather than a fourth evening push, the close-out (21:30) carries the summary:
"Today: 4 done, 1 slipped, 2 open · +35 XP" and "Tomorrow: 09:00 Standup,
06:00 Pray, Read +2 more". The numbers come from the same day the user lives
in (their time zone): tasks done, slips, and net XP (undos already net out in
the ledger). Tomorrow lists must-dos first, then by time, then any-time — and
includes habits worked out from their repeat rule, because the nightly job
only creates today's rows. A push without a summary (sent by an older job)
still gets the old wording, so the database and the site can deploy in either
order.

### A new habit starts on its first real day
Found while testing course links: a new habit's first row was always created
on its start date (default today), whether or not its rule included that day —
so a Tuesday habit set up on a Wednesday got a stray Wednesday that showed on
Today, took Wednesday's capacity, and could become a slip. And the capacity
check always included today, where only the minutes left before quiet hours
count, so a habit set up in the evening could be refused because of a day it
didn't even happen on.

Now `firstOccurrence` picks the first day, from the start date on (never in
the past), that the rule includes; if that's today and its time has passed it
moves to the next. An any-time habit counts as due when the day ends (quiet
hours start), so one set up at 23:30 starts tomorrow. The capacity and clash
check only looks at the days it really happens. A routine picks its first day
once from its start time, so all its steps start together. Existing habits
and one-off tasks are unchanged.

### Tasks and Others replace Quests and Stats in the tab bar
Routines were only reachable from a row of chips at the top of Quests, and a
routine set up after its start time only appears on Today from its first day,
so a new one could be impossible to find. Quests also mixed two jobs: the
needs/wants/goals/wishes/dreams list, and a launcher for every other screen.

The bar is now Tasks · Money · Home · Others · Settings. **Tasks** is
everything you do: today's open tasks, each routine (today's progress, or the
day and time it next starts), habits outside routines, and one-offs in the
next week. **Others** (`/app/more`) is a grouped list of every other screen,
Stats included. Stats left the bar because it's something you look at
occasionally, not every day. Considered: keeping Stats and squeezing a sixth
tab in (too cramped on a phone), and putting routines on Today only (Today is
deliberately "the three things that matter now", not a catalogue).

The tier list became **Life list**: "Quests" read like tasks, which is now
what the Tasks tab is. Its URL stays `/app/quests`. Renaming it would mean
redirects and touching every link and server action for no gain the user
can see.

"When does this habit next happen" is worked out in `tasks/overview.ts` as
pure code: the earliest open row from today, otherwise the first day its rule
gives after the latest row. It reuses `firstOccurrence`, so it agrees with how
habits are created.

### Making a routine is all or nothing
A routine was saved first, then each step was created as its own habit. A
step can be refused (its day is over capacity, or it clashes), and that
refusal was recorded but never acted on: the tool still said "created". You
got a routine with some or none of its steps, which then never showed
anywhere (an Evening routine did exactly this, twice). Now the first refused
step undoes the whole routine (its step rows, then the routine) and the
result says which step and why, so Paddie has to tell you. A same-named
routine with no steps, left over from before this fix, is taken over rather
than blocking the name. Editing a routine reports any step it couldn't add
in `notAdded` instead of listing it as added. Considered: checking every
step's room before inserting anything. That duplicates `createTask`'s
capacity and clash logic, and each step must count the ones before it anyway,
so undo-on-refusal is simpler and stays in step with how habits are checked.

### Two limits: work hours and the waking day
The 6h capacity counted every open task, so a 2h morning routine took a third
of the day's work hours before any work was planned, and an evening routine
was refused. But capacity was always meant as a focus budget, and brushing,
a bath, prayer or a workout aren't work. Not counting them at all would bring
back what "Habits count on every day they happen" fixed: you could book 6h of
work plus 4h of routines plus travel, and nothing would warn you the day
doesn't fit.

So a day has two limits. **Work** (study, projects, admin, one-offs) is held
to the capacity setting, as before. **Self-care** doesn't use those hours. And
**everything together** has to fit the waking day: from when quiet hours end
to when they start (07:00 → 22:00 by default, 15h). A refusal says which
limit it hit (`full: "work"` or `"day"`).

Self-care is a flag on each task (`tasks.is_self_care`), not a guess. Routine
steps and workouts start as self-care and everything else starts as work;
you can switch any task on its page, or ask Paddie. Considered: deciding by
pillar (physical/spiritual = self-care), but studying for a theology exam or
training for a competition breaks that. Considered: "anything in a routine",
but a workout isn't in a routine and is still self-care. The migration marks
existing routine steps, planned workout days and logged workouts. New habit
days copy the flag (`spawn_occurrence`). The weekly load measures work only,
since it's measured against work hours.

Events take the same flag (`events.is_self_care`). Social events, birthdays,
anniversaries and weddings start as self-care; meetings, appointments,
deadlines, exams and "other" start as work. Kind alone would get
appointments wrong (a doctor's visit is self-care, a visa interview isn't),
so it's only the default, and any event can be switched. Changing an event's
kind brings the new kind's default unless self-care is set in the same edit.
Imported Google Calendar events come in as meetings or "other", so they start
as work.

### In progress is a start time; a checklist lives inside the task
You wanted to mark a task as being done right now, and to tick off parts of
one. **In progress** is `tasks.started_at`, not a new status: every capacity,
reminder, overdue and ignored-need rule reads "pending", and a started task is
still pending, so none of them had to learn a new state. Starting quiets
*that task's* reminders only (`collect_nudges` skips started rows); other
must-dos still nudge, by your choice. A started task goes to the top of Today.
Done reports how long it took (Start → Done), and a study task logs that real
time as practice instead of the planned duration. A start left running over
12 hours is treated as forgotten, not as time spent. Undo keeps the start
time: tapping Done by mistake puts it back in progress. **Pause** keeps the time
already spent (`spent_minutes` banks each stretch; `started_at` is the
current one, null while paused), its reminders come back, and starting again
resumes. A stretch left running for half a day isn't banked.

A **checklist** is `tasks.checklist` (up to 30 steps of text plus a tick), not
a table of subtasks. Steps aren't scheduled, paid or reminded on their own, so
rows would only add joins. XP stays on the task. Ticking the last step offers
Done but doesn't press it, by your choice, because some tasks have steps that
aren't the whole thing. Rewording a list keeps ticks on steps whose words
didn't change. A habit's next day copies the steps unticked
(`spawn_occurrence`). Considered: a status set (to do / in progress / done)
like a project board. It makes you maintain a board, which is what the
blueprint says not to build.

Task lists now show what a task is for (its commitment or course).

### "Any time" ends when quiet hours start
An any-time task (stored as 23:59, or a habit day with no time at all) used
to be on time until midnight, or forever for an untimed habit. Your rule: the
day's tasks belong before quiet hours. So any time now ends when quiet hours
start (`anyTimeEndsAt`). Done after that it's late (the late share of XP,
still worth doing), and Today shows it as overdue, including yesterday's that
spilled over. Time blocks (tasks with a duration) are on time until the same
moment. A task with a real time ("submit by 23:00") keeps it. Missing a need
(the deduction) is still judged when the calendar day ends, as for timed
tasks: the late part of the evening is for recovering, not for losing points.
The 23:59 marker stays in the database; only how it's read changed.

### Task priority: high, normal, low (normal by default)
Any-time tasks had nothing to sort by, so an important one and a trivial one
tied (in effect, alphabetical). `tasks.priority` is high, normal or low,
normal by default, and most tasks never change. On Today it orders tasks
*inside* each group (must-dos, needs, the rest) before time does: high
first, low below everything else in its group. Must-do still outranks it,
because must-do means "this has to happen" and priority means "this matters
more than its neighbours". The morning brief's top three rank the same way.
A habit's next day keeps its priority.

Considered: a single Important toggle (like events). It can only push things
up; it can't say "nice-to-have, put it last", which matters as much for a
pile of any-time tasks. The usual risk with levels, everything drifting to
"high", comes from being asked to choose every time. So nothing asks: the
default is normal, and Paddie only sets a level when you say something
matters more or less. It's a field on add_task and update_task (like must-do
and self-care), not a tool of its own.
