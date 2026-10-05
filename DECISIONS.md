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

### Known gap: pgTAP doesn't run against the hosted project yet
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
