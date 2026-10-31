# Plan: Quit tracker (bad habits)

Status: **proposed, not built** (2026-11-01). Decisions marked **D1…D6** need
the product owner's call before code. Recommendations are given for each.

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
| `kind` | `quit` (zero is the goal) or `limit` (under a daily cap) — **D2** |
| `limit_per_day` | for `limit`: e.g. 60 (minutes) or 1 (times); null for `quit` |
| `started_at` | when the current attempt began; counting starts here |
| `on_home` | default **false** |
| `status` | `active` / `paused` / `ended` |
| `why` | optional: "for my marriage", "to get my mornings back". Shown on a slip |

New table `quit_relapses`: `id`, `user_id`, `quit_id`, `at`, `note`
(≤ 500 chars), `trigger` (optional short label, reusing slip categories).

**Derived, never stored:** the current streak (now − max(started_at, last
relapse)), the longest streak, the total clean days, and the milestones
crossed. These are pure functions in `features/quits/quits.ts`, the same
pattern as `xp.ts` and `stage.ts`, so they're unit-tested without a database.

**Link to About me:** a `bad_habit` self-note can be turned into a quit
("Start tracking this"), but the tables stay separate. A note is reflection;
a quit is a counter.

## XP — D1

Rule of thumb: **reward honesty and progress; don't punish the slip
itself.** A tracker people stop logging to is worse than none.

- Milestones: 1d +5, 3d +10, 7d +20, 14d +30, 30d +50, 60d +60, 90d +80,
  180d +100, 365d +150. Pillar: Character 60 / Mental 40 (editable weights,
  like tasks).
- Logging a relapse: **+2 honesty XP**, at most once a day per quit.
- A relapse costs **0 XP** (recommended). Alternatives: a small −5, or a
  penalty only when it's hidden (impossible to detect, so no).
- Milestones are paid once per attempt. After a relapse, reaching 7 days
  again pays again, but only up to the previous longest streak plus new
  ground. Otherwise reset-and-repeat would farm XP. **D3**: simpler
  alternative is "each milestone pays once ever".

## Coaching mode

Relapses are not ignored needs. Recommended: **don't** let relapses move the
mode to strict. Shame spirals make relapses more likely. Instead, 2+ relapses
in 3 days gives `soft` with a reason ("rough patch on Project P"), unless the
user has set "no mercy". **D4.**

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
  returned only when the user names it in chat first** (or always?) — **D5**.
- `start_quit`, `update_quit` (alias, why, on_home, pause, end, restart).
- `log_relapse`: one quit, a time and an optional note. It returns the reset
  streak, what was kept (longest, total), and a pattern hint when there is one.
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

## Plans (pricing) — D6

Recommended: Free includes **1 active quit**, Plus and Pro unlimited. It's a
`limits.quits` entry next to `habits` in `plans.ts`, enforced by
`requireRoom`. Quitting something harmful shouldn't sit behind a paywall,
hence at least one is free.

## Build order (each a commit)

1. `quits.ts` pure functions + tests: streaks, totals, milestones, the
   repeat-milestone rule.
2. Migration: both tables, RLS, constraints + pgTAP tests. Update
   `database.types.ts`.
3. Repo + server actions; XP through the existing ledger (new `xp_reason`
   values `quit_milestone` and `quit_honesty`, which needs an enum migration).
4. Screens: Others entry, list, quit page, Home line.
5. MCP tools + server-instruction wording; `what_can_paddie_do` entry.
6. Patterns ("most were after midnight") once 1–5 are in.
7. BLUEPRINT (Features, Data model, MCP tools, the XP rules) and DECISIONS.

Rough size: 1–2 days. Steps 1–4 make it usable on its own; step 5 is what
makes Paddie part of it.

## Decisions needed

| # | Question | Recommended |
|---|---|---|
| D1 | Does a relapse cost XP? | No. +2 for logging it honestly |
| D2 | Support "cut down" (under a daily cap) as well as "quit completely"? | Yes, but ship `quit` first and add `limit` as step 8 |
| D3 | Milestones after a relapse: pay again, or once ever? | Again, but only beyond the previous best |
| D4 | Can relapses move the mode? | Only towards `soft`, never `strict` |
| D5 | Does Paddie see the real name or only the alias? | Alias by default; the real name only if the user turns it on |
| D6 | How many on Free? | 1 active, Plus/Pro unlimited |

## Not in scope

- Blocking content or apps. A web app can't. Point to Android's built-in
  tools in the help text, as the phone-window section of the blueprint does.
- Accountability partners (sharing a streak with someone). Possible later,
  but it needs consent and sharing design MyPaddie doesn't have yet.
