# Paddie Blueprint

Oct 5, 2026 · updated Oct 16, 2026 to match what's built · @Kingsley Ihemelandu Chukwudi

> **Public version.** The system design is complete; personal details (real figures, habits, wishes, the identity profile) have been replaced with generic examples. The real ones live in the app's own database, not in this repo.

> **Status (Oct 16, 2026).** The four-day build is done, and MyPaddie is now open to anyone at mypaddie.spectroniqlimited.com: sign-up (invite-only is one switch away), per-user time zone, currency and voice, Free/Plus/Pro plans (nothing charged yet), one-URL AI connection, and the extras that came after (learning, workouts, pantry, events, applications, updates, Google Calendar import, fun, courses and timetables, commitments with role history, promises, people, about me, library, lists, reviews, themes, achievements, routines, decisions). 104 MCP tools. The reasoning behind each choice is in [DECISIONS.md](../DECISIONS.md); what's next, including a multi-user version, is in [ROADMAP.md](ROADMAP.md).

## Vision and principles

Paddie is a private system that runs your life as a game, knows when to be strict or soft, and keeps you honest about your time, habits and money. It started as one person's coach; now anyone can have their own Paddie, each in their own locked-down corner of the same database (see "For everyone" below).

**Core principle: reduce decision fatigue, don't create another life to manage.** Paddie's default screen and voice say "Here are the 3 things that matter right now. Do one." It never opens with a stats briefing. The numbers (pillar XP, weights, trends) are all there for when you go looking, but they are never pushed at you.

- **Person first.** It talks to you as Kingsley, not as a job title. Roles like student or engineer are just items on the calendar.
- **You define who you're becoming.** Paddie coaches toward your description and never lectures about whether it is the right one.
- **Firm about the action, funny about the situation.** The joke never replaces the instruction.
- **Effort earns XP.** Trying and failing still scores. Only ignoring something costs points.
- **You stay in control.** Meals, money splits and plans are proposals you accept, tweak or reject.
- **Honest over agreeable.** It is allowed to say no, including "don't buy this".
- **Your data stays yours.** It lives in your own database, is exportable, and works with any AI that connects to it.

Paddie is not a plain to-do list and not a moral coach. Arete stays separate.

## The Gamified Life engine

Everything you do or want is sorted into one of five tiers, and every task feeds one or more of eleven pillars with XP.

### Five tiers

| Tier | What it is | How paddie treats it | Points |
| --- | --- | --- | --- |
| Needs | Items and activities you can't live without: food, school fees, data, transport, sleep, exercise, brushing | Non-negotiable. Funded first, pestered until done | Skipping loses points |
| Wants | Items, e.g. an iPhone | Goes through the don't-buy-this check | No XP for buying |
| Goals | Items or activities with a target and a deadline, e.g. a target GPA this semester | Actively tracked and broken into daily tasks | XP for progress, bonus on completion |
| Wishes | Things you'd love but aren't working toward yet: learn to drive, learn to draw, travel somewhere new | Side quests with zero guilt. A wish becomes a goal once it gets a deadline and a first action | Bonus XP when it happens, no penalty when it doesn't |
| Dreams | Very big, scary goals | Broken down into goals and kept in view | Milestone XP |

### Eleven pillars

Spiritual, Mental, Physical, Financial, Emotional, Social, Character, Skills, Creativity, Relationships, Academic.

Academic (coursework, studying for school) was added after the first build and is separate from Skills (DSA, LeetCode, craft). It sits last because pillar order breaks ties when XP is split.

### Weighted XP

One task can feed several pillars. Each task carries pillar weights that add up to 100%, so a 100 XP task is split instead of counted once per pillar. Example: exercise might be Physical 50%, Mental 30%, Emotional 20%. Weights are editable, and paddie suggests them when you add a task.

XP is whole numbers, split by largest remainder, so the parts always add up to the total. Levels: reaching level *n* takes 100·(n−1)² XP (100 → level 2, 400 → 3, 900 → 4).

### Gains and deductions

- Any honest attempt earns XP, win or lose. That is the core of the Gamified Life.
- Late still counts. Doing a missed need late earns reduced XP (50%), so recovering fast beats dwelling. A time block (a task with a duration) is on time all day; a deadline is late after its time.
- Points are deducted only for ignoring a need (50% of its XP, once its local day has ended), not for trying and failing. An accepted slip protects it.
- Logging a dumb purchase honestly still earns XP (+2 Financial for any transaction), so you never hide spending from paddie.
- Wishes never deduct.
- Bonuses: goal completion 2×, dream milestone 3×, a wish happening +50.
- Learning sessions earn 1 XP per 5 minutes to the skill's pillar.
- Promises: kept on their day +15 (Character, Relationships). Broken (not kept, released or renegotiated by the end of the day) −15; keeping it afterwards earns back half, so about −50% net.

Every gain and deduction is an append-only ledger entry, and the same completion can never pay twice.

## Daily flow

Paddie runs your day in a loop: brief you, check in, escalate on the non-negotiables, and make room for fun.

1. **Morning brief.** The first open of the day wakes the app and shows the 3 things that matter right now, with the rest one tap away. Because of the phone-free rule below, this brief is a scripted notification at the 2-hour mark, or sent the night before.
2. **Time-aware check-ins.** Once a task's time has passed, paddie asks "did you do it?" instead of just showing it as overdue.
3. **Non-negotiables escalate.** Daily essentials such as a morning routine, minimal exercise, brushing, bathing, language practice and food get nudged repeatedly through the day, and each nudge is firmer than the last, until done.
4. **Normal quests get one reminder.** Work, school and side projects get reminded, not nagged.
5. **Meals.** Paddie proposes what to eat and when. You accept or reject.
6. **Chores.** Washing plates, tidying the room, washing clothes and trimming flowers are low-XP tasks, batched into slots so they don't clutter the day.
7. **Situational nudges.** If you say you're with friends and something is due, paddie says "get up and leave, don't wait."
8. **Fun counts.** When your quests are done, paddie pushes you to go enjoy yourself. Rest is part of the game.
9. **Evening review.** A short wrap: what you did, XP earned, what carries over.

### How it's built

- **Nudges** are decided in Postgres every minute (`pg_cron`) and respect your quiet hours (default 22:00–07:00). Non-negotiables get up to 4 escalating nudges an hour apart; ordinary tasks get one "did you do it?". Three or more at once are bundled into one notification.
- **Reminder ladder** for timed one-off tasks: the evening before, 09:00 on the day, then 30 and 10 minutes before. Habits get only the 10-minute reminder. A task can carry its own reminder note.
- **Must-do later.** A task can become non-negotiable from a set time (`must_from`), e.g. "reply to X" turning urgent tomorrow.
- **Time blocks and capacity.** Tasks can have a time and duration. A day has a capacity (default 6h, with date-range periods such as exam weeks); a task that would overflow it is refused. Clashes are reported and can be overridden on purpose.
- **Plan my day** (`plan_day`) proposes a timeline: fixed blocks, meals near their usual time, tasks by priority, chores batched after the work, free time in the biggest gap. Nothing changes until you accept it.
- **Meals** come from the pantry: stock with units and low levels, a shopping list, meal ideas from what's in stock, and cooking that uses ingredients up.
- **Schedule settings** (quiet hours, brief time, reminder times, meals, the fun nudge) are per user and validated as a whole, so a reminder can't be set inside quiet hours.
- **Fun counts, for real.** Once today's quests are done, or after 7 days without fun (editable; 0 = off), paddie suggests something from your fun list that fits your free time, money and mood. The nudge comes at 17:00 at most every 3 days, so it never becomes a chore.

### Phone-free windows

The rule is no phone for the first 2 hours of the day and the last hour. A web app cannot block your phone, it can only nudge you. Real blocking needs Android's built-in Focus mode or Bedtime mode (or a native app later). Paddie's job is accountability: it asks whether you held the window and logs it. The morning brief arrives at the end of the first window, not before it.

Not built yet: quiet hours keep nudges out of the night, but there's no "did you hold the window?" check.

## Money system

Paddie handles money in three stages, and moves between them based on your real numbers, not guesses.

### Stage 1: Audit mode (first 30 days of logging)

Your needs figure and income are both rough estimates at the start, so the first month is an audit.

- No budgets and no judgement. Logging earns XP.
- Every entry is tagged need, want, or "not sure". For food and similar items, paddie asks "basic version or the extra?" and splits it.
- Logging takes one tap: amount, category, done. Backfilling at the end of the day is allowed.
- At day 30 paddie shows your real needs, real wants, the gap or surplus, and the top three places money leaked.

Stages are counted in fixed 30-day periods from the first logged transaction, and the stage comes from the last complete period, so a monthly salary can't flip it from day to day. "Not sure" counts as a need (overestimating needs is the safer mistake).

### Stage 2: Deficit mode (needs exceed income)

- Income fills needs in priority order until it runs out. Savings and wants get nothing, and paddie says so plainly.
- It shows the gap as one number, e.g. needs 200k, income 160k, gap 40k.
- The gap becomes a goal with two levers: raise income or lower needs. Each lever turns into quests.
- Each need carries two figures, **floor** (the cheapest honest way to meet it) and **comfortable** (what you spend now), so hidden wants inside "needs" become visible.

Every need gets its floor before any need gets comfort.

### Stage 3: Surplus mode (income covers needs)

When income covers needs, every new income entry proposes this waterfall, and you accept, tweak or reject it:

1. Needs are paid first.
2. An emergency buffer is filled before any investing.
3. The remainder is split by default into 50% savings and investments, 30% wants, 20% flexible (needs that come up unexpectedly, and family support).

The percentages are editable settings, not rules. Open question: is the 20% bucket for family support, for surprise needs, or both?

The emergency buffer target defaults to one month of needs. Buckets are envelopes (budget labels): income reaches them only when you accept a split, and spending draws down its envelope.

### Balance

Separate from the buckets, the balance is real money: an opening balance plus everything in minus everything out. "Set balance" records an adjustment so it can always be matched to your real account. Mistakes are voided, not deleted: a voided entry stays on the record, stops counting everywhere, and its XP is reversed. Amounts are whole naira.

### The don't-buy-this check

When you say "I want to buy X", paddie checks four things and answers yes, wait 24 hours, or no:

- Are this month's needs covered?
- How much is left in the wants bucket?
- Is X really a want, or a need in disguise?
- Does X serve any goal you've set?

Non-essential purchases get a 24-hour wait by default.

The first rule that matches wins: need in disguise → yes; deficit → no; needs not covered → no; over the wants bucket → no; serves a goal → yes; asked again 24h after a "wait" → yes; otherwise wait. The AI judges "need in disguise" and "serves a goal"; the engine judges the money. A bad call that goes ahead anyway is flagged when you log it, never penalised. Checks keep a history and can be marked not interested, interested again, or bought.

## Modes and the slip protocol

When you slip, paddie is firm first, curious second, then gets you moving again. It never gives you an excuse and never lets you stay down.

### The slip protocol

1. **Name it plainly.** "You skipped your morning reading. Noted." No drama, no guilt pile.
2. **Ask why as a data question.** "What happened? One line." A reason is logged so patterns show up. An excuse is a reason used to skip the next step, and paddie doesn't accept that part.
3. **Ask for the smallest next action.** "Two minutes. Open it now." Doing it late still earns XP.

Paddie judges whether a reason is accepted, with a backstop: the third time the same reason is given for the same habit within 7 days, it's an excuse regardless.

### How paddie picks a mode

| Situation | Mode | What it does |
| --- | --- | --- |
| First slip or a one-off | Curious and light | Asks why, then resets |
| Same slip repeated | Strict | "Third time. The reason hasn't changed, so the plan has to. What's different?" |
| Low-HP day (tired, stressed, rough day) | Soft | Smaller recovery step. A rough day is not the same as slacking |
| You say "no mercy mode" | Strictest | No softening until you switch it off |
| You say "go easy on me" | Softest | Lower bar for the day |

The mode is computed by the rules engine from your recent data (skipped needs, repeated slips, logged mood) and returned with every tool result, so the AI adjusts its tone from facts rather than guessing. Your override always wins.

Precedence: override > low-HP day (a check-in with energy 2/5 or lower) > strict (a repeated slip, or 3+ ignored needs in 3 days) > curious. "Go easy on me" ends at midnight; "no mercy" lasts until switched off. The mode comes back with its reasons.

### Learning your challenges

You don't have to define your challenges upfront. Logged reasons build a pattern over time, and paddie surfaces it: "most of your skipped mornings follow late nights. Want to talk about it?" You can accept or ignore that. You can also add challenges yourself in your own words at any point.

## Persona and voice

Paddie sounds like a deadpan game narrator with a big-brother streak: it describes your day with a straight face, is firm about the action, and finds the circumstances absurd.

- It narrates situations like a game log or a nature documentary.
- The joke never replaces the instruction. Humour sits on top of the structure.
- It laughs with you at how ridiculous a situation is, never at you when you're genuinely struggling.
- Naija-friendly and relaxed, with banter, but not a caricature. (A per-user setting: "naija", the default, or "neutral" — the same coach in plain English.)

Examples of the voice:

- "Quest log update: Hero woke up, opened phone within 4 minutes, and is now 40 minutes into a video about a man restoring a rusty knife. The knife is looking great. Your morning reading is not. Put the phone down."
- "Financial report: needs cost more than income. The economy has chosen violence. Good news, you now have a clear enemy and a 30-day audit. Log that jollof."
- "Slip detected. Reason? 'I was tired.' Accepted as evidence, rejected as a verdict. Two minutes, go."

### Draft persona instructions

Paste this into a Claude Project's instructions (or ChatGPT custom instructions) and refine it as you go. The MCP server also sends short instructions of its own (call get_today first, follow the mode, coach toward the profile), so this is about voice.

```
You are Paddie, Kingsley's personal coach and friend. Treat him as a person first, never as a job title.

Voice: deadpan game narrator with a big-brother streak. Funny about circumstances, firm about actions. The joke never replaces the instruction.

Reduce decision fatigue. Default to the 3 things that matter right now and ask him to do one. Never open with stats or XP maths unless he asks.

At the start of each chat, call get_today to load today's quests, stats, money status and current mode, then follow the mode it returns (strict, curious, or soft). Kingsley can override: "no mercy mode" or "go easy on me".

When he slips: name it plainly, ask why in one line, then ask for the smallest next action. Accept reasons, never accept excuses as a way to skip the next step.

When he wants to buy something, call check_purchase and give a clear yes, wait 24 hours, or no.

Coach him toward whatever is in his "Who I'm becoming" profile. Do not moralise about that profile.

Be honest, not agreeable. Push back when a plan or purchase doesn't serve his stated goals. Praise only what is earned.

If he seems to be in real distress, drop the jokes and the game framing and just be a steady, kind presence.
```

## Who I'm becoming

The "Who I'm becoming" profile is the part of the system you write yourself, and paddie measures your choices against it. Nothing is built in: whatever you describe is what it coaches toward.

### How the profile works

- It is loaded into every chat and editable anytime, because the person you're aiming at will change.
- You can keep several versions and switch, e.g. "this month I'm working on X".
- Paddie praises choices that fit it, pushes back on ones that don't, and does not debate whether the profile is the right one.

As built: `get_today` returns the active profile, so every chat sees it. You can edit it in place, save a new version or switch versions in Settings, and any connected AI can do the same when you ask (`update_identity`, `save_identity`, `activate_identity`).

### What paddie does with it

- **Goals.** Reminds you of your goals and feeds you quotes that fit your mood.
- **Keeps you from going soft.** Checks you when you're slacking or people-pleasing.
- **Boundaries.** Teaches you to say no and practises with you: "someone asks X, what do you say?"
- **Books.** Helps you get value from what you read with recall questions, short summaries, and "what will you actually do with this?"

### Fill this in when you're ready

- [ ] How he walks into a room and how he talks
- [ ] What he always does and what he never does
- [ ] What he says no to
- [ ] How he treats money, relationships, friends and his own time
- [ ] Who he is at his best, and the version you're leaving behind

## Beyond the original plan

These were added after the four-day plan, each because a real day needed it.

- **Learning log.** Skills (each feeding one pillar, optionally tied to a goal) and sessions with topic, minutes, count, confidence and notes. Streaks, and spaced repetition by confidence (1 → review in 1 day, 2 → 2, 3 → 4, 4 → 7, 5 → 14). A task linked to a skill logs a session when completed.
- **Workouts.** A plan's training days become weekly tasks, so reminders, capacity and XP apply. Today's workout shows the target and last time's numbers; personal bests are tracked.
- **Pantry and meals.** See daily flow.
- **Events.** Meetings, birthdays, weddings: important × close (≤ 7 days) decides how loudly paddie brings them up. Birthdays repeat yearly. Timed events block time. Preparation becomes a task.
- **Applications.** Deadlines kept in their own time zone, a target date (default 3 days early), requirements that become tasks, a pipeline, and their own reminder ladder.
- **Updates owed.** Regular updates to people (recipient, channel, topic, format, cadence); `draft_update` writes from what you actually did since the last one, never padded.
- **Google Calendar import.** Read-only, through the calendar's private iCal link (no Google sign-in needed). Synced when Today loads; your own flags survive a re-sync.
- **Timetables.** Send a photo of your timetable: every class becomes a weekly block tied to its course, ending when the semester does (repeating tasks can now end: "gym until exams"). Classes are fixed — never refused for a full day — and don't count as habits.
- **Role history.** A commitment keeps every role you've held there, with dates: Member (Sep 2025 – Mar 2026) → Secretary (since Mar 2026).
- **People.** Who each person is to you, notes, birthdays (on the calendar), a reach-out rhythm, things to talk about. "Talked today" earns Relationships XP; Paddie names who's due a check-in.
- **About me.** Strengths, weak spots, what you're healing from (and how), patterns, triggers, good habits and habits to break, history. The AI keeps the advice-relevant ones in mind every chat — kindly, never to shame.
- **Library, favourites and lists.** Books, films, series, music, podcasts and games; your favourite things; and any list you like, ticked off with a percentage. A bucket-list tick pays +50, like a wish coming true.
- **Reviews and themes.** Weekly, monthly, quarterly and yearly reviews written from what actually happened, with the questions that matter (what did I avoid? what drained me? what changes next?). Year and month themes — "Month of Mercies" — with what to focus on and what this season says no to.
- **Achievements, routines, decisions.** Achievements earned from what you've done (a 30-day streak, first savings, 100 workouts), recorded once with the date. Routines show on Today as one item with the next step. Decisions come back for review: did it work?
- **Fun list.** Things you enjoy, with rough cost, time, energy and company. "Did it" pays XP (emotional, plus social with people). Suggestions skip what you can't afford (only free fun in a deficit), what doesn't fit the gap, and high-energy fun on a soft day, and favour what you haven't done in a while. Free time in Plan my day comes with an idea.
- **Courses.** Code, title, lecturer, units, target grade, the syllabus (topics, with weeks) and assessments. Share an outline and the AI fills it all in. Exams and tests become important events; assignments become tasks that turn must-do 2 days before. Each topic is to start, learning or solid, from the confidence you give after studying it. Paddie proposes study sessions (exam prep first, then reviews due, then new topics) that fit your daily capacity, and books the ones you accept. It can also create study tasks directly.
- **Commitments.** Jobs (full-time, part-time, freelance, internship), roles (volunteer, campus ambassador, academic lead), memberships (a students' union, the church choir) and teams. Each has a priority (core, important, optional); its regular sessions (team training, rehearsals, personal training) are recurring tasks, and competitions or meetings are events tied to it. Pausing or ending one gives the time back.
- **Weekly load.** The next 7 days plus unscheduled hours against the week's capacity: room, tight (80%+) or overloaded (over 100%). Before you take on something new, paddie checks, and if your plate is full it says so and suggests what to pause (optional first, never core), measured against "Who I'm becoming". Advice only; you decide.
- **Promises.** Who, what, by when. On Today, a must-do from the day before. Tell them in time and move the date, or they let you off, and nothing is lost; patterns ("two broken promises to the same person") are named.

## For everyone

What changed to let anyone have their own Paddie. Details and reasons are in DECISIONS.md.

- **Sign-up**: Google, an emailed link, or a password. Invite-only is a switch (off for now); with it on, a Supabase "before user created" hook admits only a valid code or an invited email. Bot protection with Cloudflare Turnstile.
- **First ten minutes**: name, time zone, currency and voice → connect your AI (one URL) → turn on reminders (on iPhone, "Add to Home Screen" first) → "empty your head" into Paddie.
- **Your own clock and money**: every rule and the nudge job run on each user's time zone; money shows in their currency. No zone saved = Lagos; a broken one = UTC.
- **Connect your AI**: paste one URL into Claude or ChatGPT; the app registers itself. The consent screen judges by where access really goes, not by the name an app gives itself.
- **Plans**: Free, Plus ($10 / ₦7,500) and Pro ($20 / ₦15,000), yearly at two months free, students half. Free caps things like habits, courses and AI apps; Plus adds study plans, weekly load advice and Calendar import; Pro adds unlimited AI apps and Paddie's own chat when it lands. Nothing is charged yet (Paystack later).
- **Safety**: every table locked to its owner, checked across the whole schema by a test; rate limits on the AI endpoint; download everything or delete your account from Settings; a privacy policy and terms.
- **Public site**: home, pricing, about, privacy, terms; the header shows "Open app" when you're signed in.

## Architecture

Paddie is a rules engine and database with two ways in: an AI connector for chat, and a phone app for logging and nudges.

```
Claude / ChatGPT / Gemini ──OAuth 2.1 + PKCE──┐
                                               ├─► Next.js on Vercel ──► rules engine (pure TS) ──► Supabase Postgres (RLS)
Phone PWA ─────────cookie session──────────────┘        ▲                                              │
                                                        └──── /api/push ◄── pg_cron (every minute) ─────┘
```

The AI chat calls the MCP server and the phone app calls the app API, but both go through the same rules engine, so XP, modes and money stages never disagree.

- **Storage:** Supabase Postgres, with login and row-level security so only you can read your rows.
- **Hosting:** one Next.js app on Vercel serves the MCP server (`/api/mcp`), the phone app (`/app`) and a public landing page (`/`).
- **Security:** the AI signs in *as you* through Supabase Auth's OAuth 2.1 server (PKCE, a hand-registered client per AI app). No admin key exists anywhere in the app: every query runs under row-level security. The push route has no database access; the database decides who to nudge and calls it with a shared secret.
- **Portability:** the same MCP server works with any AI that supports MCP connectors.
- **Rules are pure functions:** plain data in, plain data out, no clock (`now` is always passed in). Tested with ~460 unit tests plus pgTAP suites for the database.

## Data schema

The database has 45 tables (plus five private ones the API can't reach), all in Postgres (Supabase), and every row belongs to you through row-level security.

| Table | Key fields | Purpose |
| --- | --- | --- |
| items | id, tier (need/want/goal/wish/dream), title, target, deadline, status | Everything you do or want, sorted by tier |
| tasks | id, item\_id, due\_at, recurrence, is\_non\_negotiable, status, done\_at | Daily and scheduled work, including chores and meals |
| task\_pillars | task\_id, pillar, weight | Splits a task's XP across pillars, weights sum to 100 |
| pillars | name, xp, level, hp | Your eleven stats and their current state |
| xp\_log | id, task\_id, pillar, amount, reason, at | Every XP gain or deduction |
| slips | id, task\_id, why, tone\_used, at | Logged reasons that feed pattern detection |
| transactions | id, amount, direction, category, tag (need/want/unsure), floor\_or\_comfortable, at | Every dime in and out |
| buckets | name, target\_pct, balance | Needs, buffer, savings and investments, wants, flexible |
| purchase\_checks | id, item, price, verdict, decided\_at | History of don't-buy-this decisions |
| memories | id, category, text, source, at | Facts and patterns paddie should remember |
| identity\_profiles | id, name, text, is\_active | The "Who I'm becoming" versions |
| settings | key, value | Split percentages, quiet hours, phone-free windows, mode overrides |

Added since the first schema:

| Table | Purpose |
| --- | --- |
| checkins | Daily energy (1–5), which drives soft mode |
| skills, learning\_sessions | The learning log |
| workout\_plans, workout\_days, workout\_exercises, workout\_logs, workout\_entries | Training plans and what was actually lifted |
| pantry\_items, meals | Stock and meal history |
| events | Events, including ones imported from Google Calendar |
| applications, application\_requirements | Applications and their checklists |
| updates, update\_log | Updates owed and when each was sent |
| push\_subscriptions | Devices that receive nudges |
| fun\_activities | The fun list: cost, minutes, energy, company, times done, last done |
| people, people\_contacts | People in your life and when you were last in touch |
| self\_notes | Strengths, weak spots, healing, patterns, triggers, habits, history |
| media, favorites | Your library, and your favourite things |
| lists, list\_items | Lists you define, ticked off with progress |
| commitment\_roles | Every role held at a commitment, with dates |
| invites, user\_plans, feedback | Invites, chosen plan, feedback to the team |
| commitments | Jobs, roles, memberships and teams: kind, role, org, priority, status, unscheduled hours; tasks and events link to them |
| promises | To whom, what, by when, status (open, kept, released, broken), renegotiations, its task |
| courses, course\_topics, course\_assessments | Courses (each with its own academic skill), their syllabus, and tests/exams/assignments linked to events or tasks |
| private.nudges | Every nudge sent, so none repeat (not reachable from the API) |

Tasks also gained a title, base XP, duration, `must_from`, a reminder note, an optional skill link, a topic (study tasks) and a fun-activity link; items gained priority and floor/comfortable amounts; transactions gained void and split markers. The rules that matter are enforced by the database itself: composite `(id, user_id)` foreign keys so a row can't point at someone else's, a commit-time check that weights sum to 100, and a read-only XP ledger.

A single `export_all` function dumps every table to JSON so your data is never trapped.

## MCP tool list

The connector exposes 104 tools — `what_can_paddie_do` lists them all, grouped, with the user's plan. Each one returns the current mode, so the AI always knows how strict to be.

| Area | Tools |
| --- | --- |
| Today | get\_today: the top 3, non-negotiables, overdue, money status, mode, review topics, the "Who I'm becoming" profile |
| Tasks | add\_task (optionally linked to a skill + topic, or a fun activity), update\_task, complete\_task (weighted XP, late handling, topic confidence), delete\_task (mistakes only) |
| Capacity | get\_capacity, set\_capacity |
| Planning | plan\_day, accept\_day\_plan |
| Items | add\_item (with suggested pillar weights), list\_items |
| Slips and mode | log\_slip, set\_mode, log\_checkin |
| Money | log\_transaction, list\_transactions, edit\_transaction, void\_transaction, set\_balance, get\_money\_status, propose\_split, accept\_split, check\_purchase, update\_purchase\_check |
| Stats | get\_stats |
| Memory | save\_memory, recall\_memory |
| Identity | get\_identity, save\_identity, update\_identity, activate\_identity |
| Learning | log\_learning, get\_learning, update\_skill |
| Workouts | set\_workout\_plan, get\_workout, log\_workout, get\_training |
| Pantry | get\_pantry, update\_pantry, cook\_meal |
| Events | add\_event, update\_event, list\_events |
| Applications | add\_application, list\_applications, update\_application, update\_requirement |
| Updates | add\_update, list\_updates, change\_update, draft\_update, mark\_update\_sent |
| Calendar | connect\_calendar, sync\_calendar, disconnect\_calendar |
| Settings | get\_settings, update\_settings |
| Fun | list\_fun (with suggestions that fit now), add\_fun, update\_fun, log\_fun |
| Commitments | add\_commitment (with regular sessions), list\_commitments, update\_commitment, check\_load (before taking on more) |
| Promises | add\_promise, list\_promises, update\_promise (kept, released, renegotiate) |
| People | list\_people, add\_person, update\_person, log\_contact |
| About me | get\_self, add\_self\_note, update\_self\_note |
| Library and lists | get\_library, save\_media, save\_favorite, get\_lists, create\_list, update\_list |
| Profile and help | get\_profile, update\_profile, what\_can\_paddie\_do |
| Courses | set\_timetable, add\_course (from an outline), list\_courses, update\_course, update\_assessment, propose\_study\_plan, accept\_study\_plan |

Authentication is OAuth 2.1 with PKCE. It never runs authless, because it returns your money and personal data.

## Mobile UI

The app is designed phone-first as an installable web app (PWA) on Android, with a bottom tab bar, big thumb-friendly buttons and one-tap logging. Desktop simply centres the same layout. Gold is the single accent colour; green and red appear only where they mean something (money in / done, money out / overdue).

| Tab | What's on it |
| --- | --- |
| Quests | Needs, wants, goals, wishes and dreams, with tier filters and an add button. Me & people (People, About me, Library, Lists), Commitments, Promises, Courses, Fun list, Applications and Updates live here |
| Money | Balance card, current stage, buckets, the gap in deficit mode, quick log, history with void and edit, purchase checks. Pantry lives here |
| Home (centre) | The 3 things that matter right now, with a button to do one. Everything else is one tap away, plus Plan my day, Events and today's workout |
| Stats | The eleven pillars and levels, learning and training. The numbers live here, behind a tap, and are never pushed at you on Home |
| Settings | "Who I'm becoming", nudges on/off, schedule, Google Calendar, links to open Claude or ChatGPT, sign out |

Notifications are scheduled pushes decided by the database (non-negotiable nudges, check-ins, reminders, the morning brief), so they work even when no AI chat is open.

## Build plan and open questions

The plan was four days, with the rules engine first and the PWA last. All four are done.

1. **Day 1: engine.** ✅ Supabase project, schema, row-level security, and the rules engine for XP, deductions and strict/soft mode.
2. **Day 2: connector.** ✅ MCP server with the tool list above, deployed on a public host with OAuth. Added in Claude's connector settings.
3. **Day 3: PWA.** ✅ Bottom-tab mobile UI, one-tap logging, and scheduled push notifications for non-negotiables, check-ins and the morning brief.
4. **Day 4: seed and tune.** In progress. The test data was cleared on Oct 6, 2026 so real use starts from zero. Load your brain dump into memories and items, write your "Who I'm becoming" profile, paste the persona instructions into a Claude Project, and test a full day on your phone.

The Free plan allows one custom connector, so this keeps working after Pro ends.

### Open questions

- [ ] Is the 20% bucket for family support, surprise needs, or both?
- [ ] Do connectors work inside Claude's voice mode? Test it on day 2.
- [ ] Which exact notification times for the morning brief and phone-free windows?
- [ ] Does ChatGPT's connector support suit you as a backup brain? Not yet checked.
- [ ] Write your "Who I'm becoming" profile.
- [ ] Reuse any of Arete's engine later? Decide after paddie has run on your life for a few weeks.
- [ ] A "did you hold the phone-free window?" check-in (not built).
