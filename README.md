# MyPaddie

A private life coach that runs your day like a game — and keeps you honest about your time, habits and money. One user, one database, any AI.

You talk to it through Claude, ChatGPT or Gemini (it's an [MCP](https://modelcontextprotocol.io) server), and glance at it through an installable phone app. Both go through the same rules engine, so XP, coaching mode and money never disagree.

> "Here are the 3 things that matter right now. Do one."

## What it does

- **Today**: only the top three things, in a narrator's voice set by your current coaching mode (curious / strict / soft — computed from your slips, ignored needs and energy, and your override always wins).
- **XP across 11 pillars**: every task splits its XP by weight (largest-remainder rounding, so nothing is lost). Late still earns; only *ignored* needs cost.
- **Capacity and time blocks**: a day has a capacity (default 6h); a task that would overflow it is refused. Tasks and timed events can't silently clash.
- **Nudges**: escalating reminders for must-dos, a reminder ladder (evening before → morning → 30 → 10 min), event and application deadlines — decided in Postgres every minute, respecting your quiet hours.
- **Money**: a 30-day audit, then deficit or surplus from real numbers; a 50/30/20 waterfall proposal for income; a "don't buy this" check; bad spends flagged but never penalised.
- **Learning, workouts, pantry, events, applications, updates**: spaced-repetition review by confidence, personal bests, meal ideas from what's in stock, birthdays that repeat, deadlines kept in their own time zone, and "draft my update" from what you actually did.
- **Fun list**: things you enjoy, suggested when you've earned a break or gone too long without one — only what fits your free time, money and mood. "Did it" pays XP.
- **Courses**: syllabus topics (to start / learning / solid), exams as events, assignments as tasks, and study sessions proposed from what's coming up and what's shaky. Paste an outline and the AI fills it in.
- **Google Calendar import** (read-only, via the private iCal feed) so real meetings count.

## Architecture

```
Claude / ChatGPT / Gemini ──OAuth 2.1 + PKCE──┐
                                               ├─► Next.js on Vercel ──► rules engine (pure TS) ──► Supabase Postgres (RLS)
Phone PWA ─────────cookie session──────────────┘        ▲                                              │
                                                        └──── /api/push ◄── pg_cron (every minute) ─────┘
```

- **No admin key anywhere.** The AI signs in *as you* through Supabase Auth's OAuth 2.1 server; every query runs under row-level security. The push route has no database access at all — the database decides who to nudge and posts to it with a shared secret from Vault.
- **Rules are pure functions** (`src/features/*/*.ts`): plain data in, plain data out, no I/O, no clock — `now` is always passed in. Repositories (`*.repo.ts`) do the I/O; MCP tools (`*.tools.ts`) and app screens both call the repositories.
- **Feature-based layout**: each feature folder holds its rules, tests, repository, tools and UI.
- **Invariants live in the database**: composite `(id, user_id)` foreign keys (RLS alone doesn't stop cross-user references), a deferred trigger for "weights sum to 100", an append-only XP ledger with read-only totals, partial unique indexes for idempotent XP.

Every non-obvious choice — and the bugs that changed a design — is in [DECISIONS.md](DECISIONS.md). The product blueprint is in [docs/BLUEPRINT.md](docs/BLUEPRINT.md); what's next is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

Next.js 16 · TypeScript · Supabase (Postgres 17, Auth, Vault, pg_cron, pg_net) · MCP SDK v2 + mcp-handler · Bun · Tailwind v4 · web-push · ical.js

## Testing

```bash
bun run test              # ~430 unit tests: the rules engine, with fixed clocks
bun run typecheck && bun run lint
bun run db:test           # pgTAP: RLS, constraints, functions, the nudge scheduler
bun run db:test:hosted    # the same pgTAP suites against the real project — always rolled back
```

The scheduler tests walk through whole days (`collect_nudges(p_now)` takes the time as a parameter), including quiet hours across midnight, DST in other zones, and leap-day birthdays.

`db:test:hosted` runs each suite through the Management API with its ending replaced by a statement that raises an error carrying the results — an error always aborts the transaction, so nothing a test inserts can be committed to the real database.

## Running it

1. Supabase project → `bunx supabase link` → `bunx supabase db push`.
2. Copy `.env.example` to `.env.local` and fill it in; the same variables go in Vercel.
3. Supabase → Authentication: disable sign-ups, add your user, enable the OAuth server with authorization path `/oauth/consent`, register an OAuth client per AI app (callback URL from that app).
4. Push notifications: [docs/PUSH-SETUP.md](docs/PUSH-SETUP.md).
5. `bun run dev`.
