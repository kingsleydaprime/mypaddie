Read docs/BLUEPRINT.md fully before doing anything.

We're building MyPaddie, a private life-coaching system. Today is Day 1 of the build plan: the engine only. No UI, no MCP server yet.

Stack: TypeScript, Supabase (Postgres with row-level security), and a rules engine as a pure, framework-free module with unit tests.

Tasks:
1. Propose the repo structure and ask me about anything ambiguous before writing code.
2. Write the SQL migrations for the schema in the blueprint, with row-level security so only the owner can read their rows.
3. Build the rules engine: weighted XP split across pillars (weights sum to 100), deductions only for ignored needs, late-completion reduced XP, and strict/curious/soft mode computed from recent slips, skipped needs, and overrides.
4. Build the money stage logic (audit, deficit, surplus) and the 50/30/20 waterfall proposal.
5. Write tests for every rule in the blueprint, including edge cases.

Done means: migrations apply cleanly, all tests pass, and you've summarized what's built and what's left for Day 2.

Remember to load necessary skills when doing this...

@AGENTS.md
