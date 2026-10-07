# MyPaddie

A life coach that lives in the AI you already use. Tell it once — the assignment, the promise, the gym, the budget — and give your attention to the one thing in front of you; it reminds you when something else needs you.

You talk to it through Claude or ChatGPT (it's an [MCP](https://modelcontextprotocol.io) server — paste one URL) and glance at it through an installable phone app. Both go through the same rules engine, so XP, coaching mode and money never disagree. Live at [mypaddie.spectroniqlimited.com](https://mypaddie.spectroniqlimited.com): anyone can sign up (invite-only is one switch away); Free / Plus / Pro plans, nothing charged yet.

> "Here are the 3 things that matter right now. Do one."

## What it does

- **Today**: only the top three things, in a narrator's voice set by your current coaching mode (curious / strict / soft — computed from your slips, ignored needs and energy, and your override always wins).
- **XP across 11 pillars**: every task splits its XP by weight (largest-remainder rounding, so nothing is lost). Late still earns; only *ignored* needs cost.
- **Capacity and time blocks**: a day has a capacity (default 6h); a task that would overflow it is refused. Tasks and timed events can't silently clash.
- **Nudges**: escalating reminders for must-dos, a reminder ladder (evening before → morning → 30 → 10 min), event and application deadlines — decided in Postgres every minute, respecting your quiet hours.
- **Money**: a 30-day audit, then deficit or surplus from real numbers; a 50/30/20 waterfall proposal for income; a "don't buy this" check; bad spends flagged but never penalised.
- **Learning, workouts, pantry, events, applications, updates**: spaced-repetition review by confidence, personal bests, meal ideas from what's in stock, birthdays that repeat, deadlines kept in their own time zone, and "draft my update" from what you actually did.
- **Commitments and load**: jobs, roles, groups and teams with their trainings and meetings; "your plate is full — pause this?" before you take on more.
- **Promises**: who, what, by when. Kept on time earns XP; broken costs it, and keeping it late only earns back half.
- **Fun list**: things you enjoy, suggested when you've earned a break or gone too long without one — only what fits your free time, money and mood. "Did it" pays XP.
- **Courses**: syllabus topics (to start / learning / solid), exams as events, assignments as tasks, and study sessions proposed from what's coming up and what's shaky. Paste an outline and the AI fills it in.
- **Timetables**: send a photo of your timetable; every class becomes a weekly block that stops when the semester ends.
- **People**: who matters, what they are to you, things to talk about, a reach-out rhythm — Paddie tells you who's due a call.
- **About me**: strengths, weak spots, patterns, triggers, habits, what you're healing from — so advice fits *you* ("you tend to overcommit before exams…").
- **Library, favourites and lists**: books, films, music; your favourite things; and any list you like, ticked off with progress — your bucket list pays +50 XP a tick.
- **Google Calendar import** (read-only, via the private iCal feed) so real meetings count.

## Architecture

```
Claude / ChatGPT ─────────OAuth 2.1 + PKCE────┐
                                               ├─► Next.js on Vercel ──► rules engine (pure TS) ──► Supabase Postgres (RLS)
Phone PWA ─────────cookie session──────────────┘        ▲                                              │
                                                        └──── /api/push ◄── pg_cron (every minute) ─────┘
```

- **No admin key anywhere.** The AI signs in *as you* through Supabase Auth's OAuth 2.1 server (it registers itself; the consent screen judges by where access really goes); every query runs under row-level security. The push route has no database access at all — the database decides who to nudge and posts to it with a shared secret from Vault. Even deleting your account is a database function that can only delete the caller.
- **Every request runs as its user**: their time zone, currency, voice and plan are loaded once per request and every rule reads them — a forgotten path fails loudly in development.
- **Rules are pure functions** (`src/features/*/*.ts`): plain data in, plain data out, no I/O, no clock — `now` is always passed in. Repositories (`*.repo.ts`) do the I/O; MCP tools (`*.tools.ts`) and app screens both call the repositories.
- **Feature-based layout**: each feature folder holds its rules, tests, repository, tools and UI.
- **Invariants live in the database**: composite `(id, user_id)` foreign keys (RLS alone doesn't stop cross-user references), a deferred trigger for "weights sum to 100", an append-only XP ledger with read-only totals, partial unique indexes for idempotent XP.

Every non-obvious choice — and the bugs that changed a design — is in [DECISIONS.md](DECISIONS.md). The product blueprint is in [docs/BLUEPRINT.md](docs/BLUEPRINT.md); what's next is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

Next.js 16 · TypeScript · Supabase (Postgres 17, Auth, Vault, pg_cron, pg_net) · MCP SDK v2 + mcp-handler · Bun · Tailwind v4 · web-push · ical.js

## Testing

```bash
bun run test              # ~560 unit tests: the rules engine, with fixed clocks
bun run typecheck && bun run lint
bun run db:test           # pgTAP: RLS (checked across the whole schema), constraints, functions, the nudge scheduler
bun run db:test:hosted    # the same pgTAP suites against the real project — always rolled back
```

The scheduler tests walk through whole days (`collect_nudges(p_now)` takes the time as a parameter), including quiet hours across midnight, users in different time zones, DST, and leap-day birthdays. `isolation.test.sql` checks the whole schema at once — every table locked to its owner, nothing for signed-out visitors — so a new table that forgets RLS fails without anyone writing a test for it.

`db:test:hosted` runs each suite through the Management API with its ending replaced by a statement that raises an error carrying the results — an error always aborts the transaction, so nothing a test inserts can be committed to the real database.

## Running it

1. Supabase project → `bunx supabase link` → `bunx supabase db push`.
2. Copy `.env.example` to `.env.local` and fill it in; the same variables go in Vercel.
3. Supabase → Authentication:
   - URL configuration: your site URL, and `https://<your-domain>/**` in redirect URLs.
   - Hooks: *Before User Created* → `public.hook_before_user_created` (the invite switch lives in `private.app_config`).
   - OAuth Server: on, authorization path `/oauth/consent`, dynamic client registration on.
   - Providers: email (with custom SMTP, e.g. Resend) and Google; email templates link to `/auth/confirm` with `token_hash` (see DECISIONS).
   - Optional: CAPTCHA with Cloudflare Turnstile (and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
4. Push notifications: [docs/PUSH-SETUP.md](docs/PUSH-SETUP.md).
5. `bun run dev`. Usage for the team: `select * from private.usage_summary();` in the SQL editor.
