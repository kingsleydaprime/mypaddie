# Paddie Blueprint

Oct 5, 2026 · @Kingsley Ihemelandu Chukwudi

> **Public version.** The system design is complete; personal details (real figures, habits, wishes, the identity profile) have been replaced with generic examples. The real ones live in the app's own database, not in this repo.

## Vision and principles

Paddie is a private system that runs your life as a game, knows when to be strict or soft, and keeps you honest about your time, habits and money. It is built for one user: you.

**Core principle: reduce decision fatigue, don't create another life to manage.** Paddie's default screen and voice say "Here are the 3 things that matter right now. Do one." It never opens with a stats briefing. The numbers (pillar XP, weights, trends) are all there for when you go looking, but they are never pushed at you.

- **Person first.** It talks to you as Kingsley, not as a job title. Roles like student or engineer are just items on the calendar.
- **You define who you're becoming.** Paddie coaches toward your description and never lectures about whether it is the right one.
- **Firm about the action, funny about the situation.** The joke never replaces the instruction.
- **Effort earns XP.** Trying and failing still scores. Only ignoring something costs points.
- **You stay in control.** Meals, money splits and plans are proposals you accept, tweak or reject.
- **Honest over agreeable.** It is allowed to say no, including "don't buy this".
- **Your data stays yours.** It lives in your own database, is exportable, and works with any AI that connects to it.

Paddie is not a public product (Arete stays separate), not a plain to-do list, and not a moral coach.

## The Gamified Life engine

Everything you do or want is sorted into one of five tiers, and every task feeds one or more of ten pillars with XP.

### Five tiers

| Tier | What it is | How paddie treats it | Points |
| --- | --- | --- | --- |
| Needs | Items and activities you can't live without: food, school fees, data, transport, sleep, exercise, brushing | Non-negotiable. Funded first, pestered until done | Skipping loses points |
| Wants | Items, e.g. an iPhone | Goes through the don't-buy-this check | No XP for buying |
| Goals | Items or activities with a target and a deadline, e.g. a target GPA this semester | Actively tracked and broken into daily tasks | XP for progress, bonus on completion |
| Wishes | Things you'd love but aren't working toward yet: learn to drive, learn to draw, travel somewhere new | Side quests with zero guilt. A wish becomes a goal once it gets a deadline and a first action | Bonus XP when it happens, no penalty when it doesn't |
| Dreams | Very big, scary goals | Broken down into goals and kept in view | Milestone XP |

### Ten pillars

Spiritual, Mental, Physical, Financial, Emotional, Social, Character, Skills, Creativity, Relationships.

### Weighted XP

One task can feed several pillars. Each task carries pillar weights that add up to 100%, so a 100 XP task is split instead of counted once per pillar. Example: exercise might be Physical 50%, Mental 30%, Emotional 20%. Weights are editable, and paddie suggests them when you add a task.

### Gains and deductions

- Any honest attempt earns XP, win or lose. That is the core of the Gamified Life.
- Late still counts. Doing a missed need late earns reduced XP, so recovering fast beats dwelling.
- Points are deducted only for ignoring a need, not for trying and failing.
- Logging a dumb purchase honestly still earns XP, so you never hide spending from paddie.
- Wishes never deduct.

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

### Phone-free windows

The rule is no phone for the first 2 hours of the day and the last hour. A web app cannot block your phone, it can only nudge you. Real blocking needs Android's built-in Focus mode or Bedtime mode (or a native app later). Paddie's job is accountability: it asks whether you held the window and logs it. The morning brief arrives at the end of the first window, not before it.

## Money system

Paddie handles money in three stages, and moves between them based on your real numbers, not guesses.

### Stage 1: Audit mode (first 30 days of logging)

Your needs figure and income are both rough estimates at the start, so the first month is an audit.

- No budgets and no judgement. Logging earns XP.
- Every entry is tagged need, want, or "not sure". For food and similar items, paddie asks "basic version or the extra?" and splits it.
- Logging takes one tap: amount, category, done. Backfilling at the end of the day is allowed.
- At day 30 paddie shows your real needs, real wants, the gap or surplus, and the top three places money leaked.

### Stage 2: Deficit mode (needs exceed income)

- Income fills needs in priority order until it runs out. Savings and wants get nothing, and paddie says so plainly.
- It shows the gap as one number, e.g. needs 200k, income 160k, gap 40k.
- The gap becomes a goal with two levers: raise income or lower needs. Each lever turns into quests.
- Each need carries two figures, **floor** (the cheapest honest way to meet it) and **comfortable** (what you spend now), so hidden wants inside "needs" become visible.

### Stage 3: Surplus mode (income covers needs)

When income covers needs, every new income entry proposes this waterfall, and you accept, tweak or reject it:

1. Needs are paid first.
2. An emergency buffer is filled before any investing.
3. The remainder is split by default into 50% savings and investments, 30% wants, 20% flexible (needs that come up unexpectedly, and family support).

The percentages are editable settings, not rules. Open question: is the 20% bucket for family support, for surprise needs, or both?

### The don't-buy-this check

When you say "I want to buy X", paddie checks four things and answers yes, wait 24 hours, or no:

- Are this month's needs covered?
- How much is left in the wants bucket?
- Is X really a want, or a need in disguise?
- Does X serve any goal you've set?

Non-essential purchases get a 24-hour wait by default.

## Modes and the slip protocol

When you slip, paddie is firm first, curious second, then gets you moving again. It never gives you an excuse and never lets you stay down.

### The slip protocol

1. **Name it plainly.** "You skipped your morning reading. Noted." No drama, no guilt pile.
2. **Ask why as a data question.** "What happened? One line." A reason is logged so patterns show up. An excuse is a reason used to skip the next step, and paddie doesn't accept that part.
3. **Ask for the smallest next action.** "Two minutes. Open it now." Doing it late still earns XP.

### How paddie picks a mode

| Situation | Mode | What it does |
| --- | --- | --- |
| First slip or a one-off | Curious and light | Asks why, then resets |
| Same slip repeated | Strict | "Third time. The reason hasn't changed, so the plan has to. What's different?" |
| Low-HP day (tired, stressed, rough day) | Soft | Smaller recovery step. A rough day is not the same as slacking |
| You say "no mercy mode" | Strictest | No softening until you switch it off |
| You say "go easy on me" | Softest | Lower bar for the day |

The mode is computed by the rules engine from your recent data (skipped needs, repeated slips, logged mood) and returned with every tool result, so the AI adjusts its tone from facts rather than guessing. Your override always wins.

### Learning your challenges

You don't have to define your challenges upfront. Logged reasons build a pattern over time, and paddie surfaces it: "most of your skipped mornings follow late nights. Want to talk about it?" You can accept or ignore that. You can also add challenges yourself in your own words at any point.

## Persona and voice

Paddie sounds like a deadpan game narrator with a big-brother streak: it describes your day with a straight face, is firm about the action, and finds the circumstances absurd.

- It narrates situations like a game log or a nature documentary.
- The joke never replaces the instruction. Humour sits on top of the structure.
- It laughs with you at how ridiculous a situation is, never at you when you're genuinely struggling.
- Naija-friendly and relaxed, with banter, but not a caricature.

Examples of the voice:

- "Quest log update: Hero woke up, opened phone within 4 minutes, and is now 40 minutes into a video about a man restoring a rusty knife. The knife is looking great. Your morning reading is not. Put the phone down."
- "Financial report: needs cost more than income. The economy has chosen violence. Good news, you now have a clear enemy and a 30-day audit. Log that jollof."
- "Slip detected. Reason? 'I was tired.' Accepted as evidence, rejected as a verdict. Two minutes, go."

### Draft persona instructions

Paste this into a Claude Project's instructions (or ChatGPT custom instructions) and refine it as you go.

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

## Architecture

Paddie is a rules engine and database with two ways in: an AI connector for chat, and a phone app for logging and nudges.

&#91;embedded content: architecture · 2 clients, 1 engine, 1 database\]

The AI chat calls the MCP server and the phone app calls the app API, but both go through the same rules engine, so XP, modes and money stages never disagree.

- **Storage:** Supabase Postgres, with login and row-level security so only you can read your rows.
- **Hosting:** the MCP server must be publicly reachable, e.g. on Cloudflare Workers or Vercel, because Claude connects from Anthropic's cloud.
- **Security:** OAuth or a secret token, never authless. Only the data each chat needs is returned to the AI.
- **Portability:** the same MCP server should also work with ChatGPT or another AI that supports MCP.

## Data schema

The database has about twelve tables, all in Postgres (Supabase), and every row belongs to you through row-level security.

| Table | Key fields | Purpose |
| --- | --- | --- |
| items | id, tier (need/want/goal/wish/dream), title, target, deadline, status | Everything you do or want, sorted by tier |
| tasks | id, item\_id, due\_at, recurrence, is\_non\_negotiable, status, done\_at | Daily and scheduled work, including chores and meals |
| task\_pillars | task\_id, pillar, weight | Splits a task's XP across pillars, weights sum to 100 |
| pillars | name, xp, level, hp | Your ten stats and their current state |
| xp\_log | id, task\_id, pillar, amount, reason, at | Every XP gain or deduction |
| slips | id, task\_id, why, tone\_used, at | Logged reasons that feed pattern detection |
| transactions | id, amount, direction, category, tag (need/want/unsure), floor\_or\_comfortable, at | Every dime in and out |
| buckets | name, target\_pct, balance | Needs, buffer, savings and investments, wants, flexible |
| purchase\_checks | id, item, price, verdict, decided\_at | History of don't-buy-this decisions |
| memories | id, category, text, source, at | Facts and patterns paddie should remember |
| identity\_profiles | id, name, text, is\_active | The "Who I'm becoming" versions |
| settings | key, value | Split percentages, quiet hours, phone-free windows, mode overrides |

A single `export_all` function dumps every table to JSON so your data is never trapped.

## MCP tool list

The connector exposes about a dozen tools. Each one returns the current mode, so the AI always knows how strict to be.

| Tool | What it does |
| --- | --- |
| get\_today | Today's quests, non-negotiables, what's overdue, money status, current mode |
| complete\_task | Marks a task done, awards weighted XP, handles late completion |
| add\_item | Adds a need, want, goal, wish or dream, with suggested pillar weights |
| list\_items | Lists items by tier and status |
| log\_slip | Records a skipped task and the reason you gave |
| log\_transaction | Records money in or out with category and need/want tag |
| get\_money\_status | Returns the current stage (audit, deficit, surplus), buckets and gap |
| propose\_split | Proposes how a new income entry is divided, for you to accept or change |
| check\_purchase | Runs the don't-buy-this check and returns yes, wait 24 hours, or no |
| get\_stats | Returns the ten pillars, levels and recent XP |
| save\_memory / recall\_memory | Stores and retrieves facts and patterns about you |
| get\_identity | Returns the active "Who I'm becoming" profile |
| plan\_day | Proposes a schedule from tasks, meals, chores and fun, for you to accept or change |

Authentication is OAuth or a secret token. Do not run it authless, because it returns your money and personal data.

## Mobile UI

The app is designed phone-first as an installable web app (PWA) on Android, with a bottom tab bar, big thumb-friendly buttons and one-tap logging. Desktop simply centres the same layout.

| Tab | What's on it |
| --- | --- |
| Today | The 3 things that matter right now, with a button to do one. Everything else (full list, meals, chores) is one tap away |
| Quests | Needs, goals, wishes and dreams, with tier filters and an add button |
| Money | Current stage, buckets, the gap in deficit mode, quick-log button, purchase check history |
| Stats | The ten pillars as a live dashboard, XP trend, slips and patterns. The numbers live here, behind a tap, and are never pushed at you on Today |
| Paddie | A shortcut that opens the Claude or ChatGPT app, since chat lives there in the connector plan |

Notifications are scheduled pushes from the rules engine (non-negotiable nudges, check-ins, the morning brief), so they work even when no AI chat is open.

## Build plan and open questions

The plan is four days, with the rules engine first and the PWA last. Use the remaining Pro days to have Claude generate the code.

1. **Day 1: engine.** Supabase project, schema, row-level security, and the rules engine for XP, deductions and strict/soft mode.
2. **Day 2: connector.** MCP server with the tool list above, deployed on a public host with OAuth or a secret token. Add it in Claude's connector settings on the web, then test it from your phone. Start with two tools to confirm the connector beta works, then add the rest.
3. **Day 3: PWA.** Bottom-tab mobile UI, one-tap logging, and scheduled push notifications for non-negotiables, check-ins and the morning brief.
4. **Day 4: seed and tune.** Load your brain dump into memories and items, write your "Who I'm becoming" profile, paste the persona instructions into a Claude Project, and test a full day on your phone.

The Free plan allows one custom connector, so this keeps working after Pro ends.

### Open questions

- [ ] Is the 20% bucket for family support, surprise needs, or both?
- [ ] Do connectors work inside Claude's voice mode? Test it on day 2.
- [ ] Which exact notification times for the morning brief and phone-free windows?
- [ ] Does ChatGPT's connector support suit you as a backup brain? Not yet checked.
- [ ] Write your "Who I'm becoming" profile.
- [ ] Reuse any of Arete's engine later? Decide after paddie has run on your life for a few weeks.
