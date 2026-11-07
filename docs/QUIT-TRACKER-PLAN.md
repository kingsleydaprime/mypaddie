# Plan: Quit tracker (bad habits)

Status: **decided, not built** (decisions made 2026-11-07; see the table at
the end and DECISIONS.md).

## Why

MyPaddie tracks what you *do*: tasks, habits, routines. It has nothing for
what you're trying to *stop*. For someone quitting porn, smoking, gambling,
doom-scrolling or late-night snacking, the most motivating number is how long
it's been. The app already knows a lot of the surrounding context: "habits to
break" and "triggers" in About me, slips with reasons, sleep and mood from
check-ins. It just has no clock.

## What the user gets

- **A counter per habit they're quitting.** "Project P · 12 days clean ·
  longest 31 · 94 clean days in total."
- **One-tap "I slipped".** An optional line for what led to it, and a time
  (default now, can be backdated: "last night around 1am").
- **A relapse resets the current streak only.** The longest streak and the
  total clean days stay. One bad night shouldn't erase 40 good days. That
  belief is what makes people give up.
- **Milestones.** 1, 3, 7, 14, 30, 60, 90, 180 and 365 days, each recorded
  once as an achievement with a small XP bonus.
- **Patterns.** Once there are 3+ relapses, Paddie can say "4 of your last 5
  were after midnight", the same way it already reads slips.
- **Privacy first.** It has a private display name, stays off Home unless
  chosen, and is never mentioned in a push notification.

## Shape of the data

New table `quits` (one per habit being quit):

| column | notes |
|---|---|
| `id`, `user_id` | owner RLS, the same four policies as every table |
| `title` | the real name, e.g. "Porn". Only shown on its own page |
| `alias` | optional display name, e.g. "Project P", used everywhere else |
| `kind` | `quit` (zero is the goal) or `limit` (stay under a daily cap) |
| `limit_per_day` | for `limit`: e.g. 60 or 2; null for `quit` |
| `unit` | for `limit`: `minutes` or `times`; null for `quit` |
| `on_home` | default **false** |
| `status` | `active` / `paused` / `ended`. Pausing stops the streak: resuming starts a new attempt from day 0, with longest and total kept |
| `why` | optional: "for my marriage", "to get my mornings back". Shown on a slip |
| `show_name_to_ai` | default **false**: Paddie sees only the alias (D5) |

A quit's `kind` can't change after it's created: relapses and usage mean
different things, so switching would reinterpret its history.

New table `quit_periods`: `id`, `user_id`, `quit_id`, `started_at`,
`ended_at` (null while open), `limit_per_day` (the cap it ran under). At most
one open period per quit. Pausing, ending or raising the cap closes it;
resuming or restarting opens a new one.

New table `quit_logs`: `id`, `user_id`, `quit_id`, `at` (when it happened,
can be backdated), `amount` (null for `quit`; minutes or times for `limit`,
enforced by a trigger), `note` (≤ 500 chars), `cause` (optional short label,
like a slip's category), `created_at`. For a `quit`, every log is a relapse.
For a `limit`, a log is usage.

New table `quit_milestones`: one row per milestone paid, unique on
(`quit_id`, `run_started_at`, `days`), so the same run can never be paid
twice, even by two requests at once. `xp_log.quit_id` links quit XP to its
quit; deleting a quit keeps the XP.

**Cut down (`limit`) rules:**

- Days are the user's local days (profile time zone).
- A day is **over** when that day's logged amount is **more than** the cap.
  Hitting the cap exactly is still a clean day.
- An over day counts as a relapse: the streak goes back to 0 from that day.
  Today counts as clean until it goes over.
- The streak is counted in whole clean days. A `quit` counts from the moment
  of the last relapse (shown as days, with hours on day 0).
- **A streak can't be paused.** Pausing stops it, like a relapse: resuming
  starts a new attempt from day 0. Longest and total clean days are kept.
- Raising the cap starts a new attempt (otherwise a raise would wipe past
  over days). Lowering it doesn't: the streak carries on. Either way the new
  cap applies from the day it's set, and every past day keeps the cap it ran
  under (each change opens a new period; a lowered one is marked
  `continues_run`).

**Derived, never stored:** the current streak (from max(started_at, last
relapse or over day)), the longest streak, the total clean days, and the
milestones crossed. These are pure functions in `features/quits/quits.ts`, the same
pattern as `xp.ts` and `stage.ts`, so they're unit-tested without a database.

**Link to About me:** a `bad_habit` self-note can be turned into a quit
("Start tracking this"), but the tables stay separate. A note is reflection;
a quit is a counter.

## XP

Rule of thumb: **reward honesty and progress; don't punish the slip
itself.** A tracker people stop logging to is worse than none.

- Milestones: 1d +5, 3d +10, 7d +20, 14d +30, 30d +50, 60d +60, 90d +80,
  180d +100, 365d +150. Pillar: Character 60 / Mental 40 (editable weights,
  like tasks).
- A relapse sends the counter back to day 0 and costs **0 XP**. XP already
  earned is never taken back (D1).
- Logging a relapse (or, for `limit`, logging usage): **+2 honesty XP**, at
  most once a local day per quit.
- **Milestones pay again on every attempt** (D3). After a relapse, reaching 7
  days again pays +20 again. Accepted cost: someone who slips every few days
  re-earns the 1d and 3d bonuses (+15 a cycle). It's a private coach with no
  leaderboard, so it can only be gamed against yourself.

## Coaching mode

Relapses are not ignored needs. Recommended: **don't** let relapses move the
mode to strict. Shame spirals make relapses more likely. Instead, 2+ relapses
in 3 days gives `soft` with a reason ("rough patch on Project P"), unless the
user has set "no mercy". An over day on a `limit` counts as a relapse here
(D4).

## Screens

- **Others → Quitting** (only appears once there's one): a list of counters.
  Each shows a big day number, the longest streak, and a thin bar towards the
  next milestone. One tap opens the quit's page.
- **Quit page:** the counter, an "I slipped" button (it asks once to confirm,
  then shows a short, firm-kind line, not a lecture), the `why`, a relapse
  history as a timeline (the History style), and the patterns once there are
  enough.
- **Home:** only when `on_home`: a slim line under the XP strip ("Project P ·
  day 12"). No slip button on Home, so it can't be tapped by accident or seen
  over a shoulder.
- Visual: gold for the counter and milestones, red only on the relapse
  marker in the timeline. It's the same design system as the rest of the app.

## AI tools (MCP)

- `get_quits`: list with alias, streaks, next milestone. **The real `title` is
  returned only when `show_name_to_ai` is on** for that quit (D5); otherwise
  the alias, or "a habit you're quitting" when there's no alias.
- `start_quit`, `update_quit` (alias, why, on_home, pause, end, restart).
- `log_relapse`: one quit, a time, an optional note, and an amount for
  `limit`. It returns the streak (reset, or still going if under the cap),
  what was kept (longest, total), and a pattern hint when there is one.
- Server instructions: Paddie never brings up a quit unprompted except on a
  milestone day, and then by its alias only.

## Privacy and safety

- **Owner-only RLS** on both tables. A pgTAP test proves another user sees
  nothing (the same as `quotes.test.sql`).
- **Push notifications never include a quit**, not even milestones. Pushes can
  show on a lock screen. Milestones are shown in the app, or by Paddie in chat.
- **Export (`export_data`)** includes both tables, and delete removes them.
  It's the user's data.
- **No logging of titles or notes** in server logs or error messages: errors
  say "the quit", not its name.
- Crisis line: if a relapse note signals real distress or self-harm, Paddie
  drops the coaching tone (the existing server instruction already covers
  distress). The app itself doesn't try to detect it.

## Plans (pricing)

Free includes **1 active quit** (D6), Plus and Pro unlimited. It's a
`limits.quits` entry next to `habits` in `plans.ts`, enforced by
`requireRoom`. Quitting something harmful shouldn't sit behind a paywall,
hence at least one is free.

## Build order (each a commit)

1. **Built 2026-11-07.** `quits.ts` pure functions + tests: streaks for both kinds, over days,
   totals, milestones per attempt, the honesty cap, the cap-raise rule.
2. Migration: the four tables, RLS, constraints + pgTAP tests. Update
   `database.types.ts`. **Built 2026-11-07** (`20261119090000_quits.sql`, local).
3. Repo + server actions; XP through the existing ledger (new `xp_reason`
   values `quit_milestone` and `quit_honesty`). **Built 2026-11-07**
   (`20261120090000_quit_actions.sql`, local): state changes, logs and payouts
   are Postgres functions so each happens in one transaction. Milestones are
   paid when the quit is next loaded, since they're crossed by time passing.
   The rough patch feeds the mode by alias only.
4. Screens: Others entry, list, quit page, Home line.
5. MCP tools + server-instruction wording; `what_can_paddie_do` entry.
6. Patterns ("most were after midnight") once 1–5 are in.
7. BLUEPRINT (Features, Data model, MCP tools, the XP rules) and DECISIONS.

Rough size: 1–2 days. Steps 1–4 make it usable on its own; step 5 is what
makes Paddie part of it.

## Decisions (2026-11-07)

| # | Question | Chosen |
|---|---|---|
| D1 | Does a relapse cost XP? | No. Counter back to 0, earned XP kept, +2 for logging honestly |
| D2 | Support "cut down" as well as "quit completely"? | Yes, both from the start |
| D3 | Milestones after a relapse: pay again, or once ever? | Again, on every attempt |
| D4 | Can relapses move the mode? | Only towards `soft`, never `strict` |
| D5 | Does Paddie see the real name or only the alias? | Alias by default; the real name only if turned on per quit |
| D6 | How many on Free? | 1 active, Plus/Pro unlimited |
| D7 | Does pausing freeze the streak? | No. A paused streak is a stopped streak; resuming starts from day 0 |

## Not in scope

- Blocking content or apps. A web app can't. Point to Android's built-in
  tools in the help text, as the phone-window section of the blueprint does.
- Accountability partners (sharing a streak with someone). Possible later,
  but it needs consent and sharing design MyPaddie doesn't have yet.
