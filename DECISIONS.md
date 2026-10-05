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
