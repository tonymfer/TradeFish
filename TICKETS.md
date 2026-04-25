# TradeFish Hackathon Tickets

3-hour ship. 10 tickets. Critical path: T1 → T3 → T5 → T7 → T10.

Source of truth for what each ticket means: `docs/DESIGN.md`. Source of truth for what each agent does: `agents/{HEAD,BE,FE,AG}.md`.

## How agents use this file

1. Find highest-priority ticket where `status: pending` AND `agent: {YOUR_AGENT}` AND every `blockedBy` ticket is `status: done`.
2. Edit this file: change `status: pending` → `status: in_progress`, set `claimed_by: {YOUR_BRANCH}`. Commit `chore(tickets): claim T#`. Push.
3. Implement per Acceptance.
4. Commit + push to your branch. Open PR to `main` titled `feat({agent}): T# {short}`.
5. Head merges. Head marks `status: done` on merge.
6. Loop: pick the next eligible ticket.

If no eligible ticket (all blocked or done), report `STATUS: WAITING` and check back in 3-5 min.

## Conventions

- Branches: `be/main`, `fe/main`, `ag/main`. Head works on `main`.
- Commit prefix: `feat(be):`, `feat(fe):`, `feat(ag):`, `chore(...)`, `fix(...)`.
- Never edit files outside your owned paths (see ROLE.md). If you must, open a PR and call it out.
- Run `bun run typecheck` before opening PR. Don't break the build.
- If you hit a blocker that needs a different agent's work, leave a `# BLOCKED_BY: T#` comment in the relevant file and escalate via TICKETS.md (set `blocked_by_runtime: T#`).

---

## T1 — DB schema (SQLite + Drizzle)
- agent: be
- status: pending
- blockedBy: []
- estimate: 20m
- files: `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `package.json`, `.gitignore`
- libs: `drizzle-orm`, `better-sqlite3`, `drizzle-kit` (devDep)
- acceptance:
  - 5 tables: `agents (id, name, ownerEmail, apiKey, bankrollUsd default 1000, cumulativePnl default 0, createdAt)`, `rounds (id, asset default 'BTC', status enum 'open'/'settling'/'settled', timeframeSec default 300, openedAt, settledAt, openPriceCents, closePriceCents)`, `predictions (id, agentId, roundId, direction enum 'LONG'/'SHORT'/'HOLD', confidence, positionSizeUsd, thesis text, sourceUrl text, entryPriceCents, createdAt)`, `paper_trades (id, predictionId, agentId, roundId, exitPriceCents, pnlUsd, settledAt)`, `oracle_snapshots (id, asset, priceCents, fetchedAt, source)`.
  - Drizzle schema exports + migrations applied to `.data/tradefish.db` (gitignored).
  - `bun run db:push` creates schema cleanly on a fresh checkout.
  - Export `db` from `src/db/client.ts`.

## T2 — Pyth Hermes BTC price
- agent: be
- status: pending
- blockedBy: [T1]
- estimate: 25m
- files: `src/lib/oracle/pyth.ts`, `src/lib/oracle/index.ts`
- acceptance:
  - `getBtcPrice()` fetches from `https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`.
  - Returns `{ priceCents: number, fetchedAt: Date, source: 'pyth' }`. Pyth returns a price with an `expo` field (typically -8); convert to cents (multiply by 10^(2+expo)).
  - 5s in-memory cache to avoid hammering Pyth.
  - Persists each fetch into `oracle_snapshots`.
  - Throws on error (no fallback in P0).

## T3 — Round scheduler
- agent: be
- status: pending
- blockedBy: [T1, T2]
- estimate: 30m
- files: `src/lib/scheduler/index.ts`, `src/lib/scheduler/round.ts`, `src/app/api/scheduler/tick/route.ts`
- acceptance:
  - Function `openNewRound()` opens a new BTC round with `openedAt = now`, `openPriceCents = await getBtcPrice()`. Status `open`.
  - Function `settleRound(roundId)` snapshots `closePriceCents = await getBtcPrice()`, sets `status = 'settled'`, `settledAt = now`. Triggers per-prediction settlement (delegates to T6 worker).
  - Route `POST /api/scheduler/tick` (called externally e.g. by Vercel cron OR by a setInterval in dev): if no open round exists, open one; if open round has been alive ≥ `timeframeSec`, settle it.
  - In dev, register a `setInterval(tickFn, 10000)` in instrumentation.ts so rounds open/settle without external cron.

## T4 — POST /api/agents/register
- agent: be
- status: pending
- blockedBy: [T1]
- estimate: 20m
- files: `src/app/api/agents/register/route.ts`, `src/lib/api/auth.ts`
- acceptance:
  - Body `{ name: string, ownerEmail: string }`. Returns `{ agentId, apiKey, bankrollUsd: 1000 }`.
  - apiKey = random 32-byte hex. Stored in `agents.apiKey`.
  - Helper `requireAgent(req)` reads `Authorization: Bearer <apiKey>` and returns the agent or 401.
  - Per-IP rate limit: 5/min via in-memory map (good enough for hackathon).

## T5 — POST /api/rounds/{id}/predict
- agent: be
- status: pending
- blockedBy: [T1, T2, T3, T4]
- estimate: 25m
- files: `src/app/api/rounds/[id]/predict/route.ts`
- acceptance:
  - Auth via `requireAgent`.
  - Body `{ direction: 'LONG'|'SHORT'|'HOLD', confidence: 0..100, positionSizeUsd: 10..1000, thesis: string (max 1500), sourceUrl: string }`.
  - Validate: round exists, status `open`, agent has not already predicted (one prediction per agent per round in P0; defer decision-changes), agent.bankrollUsd >= positionSizeUsd, sourceUrl looks like a URL (regex, no HEAD-check in P0).
  - Snapshots `entryPriceCents = await getBtcPrice()`. Inserts prediction. Decrements agent bankroll by positionSizeUsd (held until settlement).
  - Returns `{ predictionId, entryPriceCents }`.
  - 409 on duplicate prediction; 422 on validation fail.

## T6 — Settlement worker
- agent: be
- status: pending
- blockedBy: [T1, T2, T3, T5]
- estimate: 30m
- files: `src/lib/settlement/index.ts` (called from T3's `settleRound`)
- acceptance:
  - For each prediction in the settling round: compute `pnlUsd = positionSizeUsd × (closePriceCents - entryPriceCents) / entryPriceCents × directionSign` (where directionSign is +1 LONG, -1 SHORT, 0 HOLD).
  - Insert paper_trade row.
  - Update agent.bankrollUsd: credit back positionSizeUsd + pnlUsd. Update agent.cumulativePnl += pnlUsd.
  - Atomic per round (transaction).

## T7 — Home page (UP/DOWN bar + leaderboard + event tape)
- agent: fe
- status: pending
- blockedBy: [T5]
- estimate: 50m
- files: `src/app/page.tsx`, `src/app/_components/UpDownBar.tsx`, `src/app/_components/Leaderboard.tsx`, `src/app/_components/EventTape.tsx`, `src/app/api/state/route.ts`
- acceptance:
  - Polls `GET /api/state` every 2s. State payload: `{ openRound: {id, asset, openedAt, openPriceCents, predictions: [{agentName, direction, positionSizeUsd, thesis, sourceUrl, entryPriceCents}]}, leaderboard: [{agentName, cumulativePnl, bankrollUsd, predictionCount}], recentEvents: [{type, message, ts}] }`.
  - UP/DOWN bar: shows raw vote share among `openRound.predictions`. LONG count vs SHORT count, HOLD shown separately. Animated tilt.
  - Leaderboard: top 10 agents by cumulativePnl, descending. Show name, PnL (green/red), bankroll.
  - Event tape: scrollable list of last 20 events (round opened, prediction posted, round settled with PnL).
  - Operator-console aesthetic: dark theme, monospace font, dense spacing.

## T8 — Question detail page
- agent: fe
- status: pending
- blockedBy: [T5]
- estimate: 40m
- files: `src/app/rounds/[id]/page.tsx`, `src/app/api/rounds/[id]/route.ts`
- acceptance:
  - Page at `/rounds/{id}`. Polls `GET /api/rounds/{id}` every 2s.
  - Shows: large UP/DOWN bar at top, then chronological timeline of predictions below (each prediction = card with agent name, direction badge, size, thesis text, sourceUrl as clickable link, entry price, time-since-post).
  - On settlement, show closing animation + each agent's PnL.

## T9 — Seed agents (4 personas, Haiku 4.5)
- agent: ag
- status: pending
- blockedBy: [T4, T5]
- estimate: 50m
- files: `src/seed-agents/index.ts`, `src/seed-agents/personas.ts`, `src/seed-agents/loop.ts`, `package.json` (script `bun run agents`)
- acceptance:
  - On first run, registers 4 agents via `POST /api/agents/register`: "Smart Money Maxi", "Reasoning Owl", "Momentum Bro", "Contrarian Cat". Persists API keys to `.data/seed-agent-keys.json` (gitignored).
  - Loop: every 60-90s (jittered), each agent calls Pyth via `getBtcPrice` (or via Anthropic-facing tool prompt that includes the current price), generates a prediction via Claude Haiku 4.5 with persona-specific system prompt, and POSTs to current open round.
  - Each persona has distinct prompt instructing thesis voice + a curated list of 5 hardcoded source URLs the agent picks from.
  - Cost cap: simple `_dailySpendCents` counter; halt at $5000 cents/day.

## T10 — Vercel deploy + smoke test
- agent: ag
- status: pending
- blockedBy: [T7, T8, T9]
- estimate: 25m
- files: `vercel.json`, `.env.example`, `README.md` (deploy section)
- acceptance:
  - Deployed to a public Vercel URL.
  - Env vars set: `ANTHROPIC_API_KEY`, `DATABASE_URL` (or stick with bundled SQLite via fly volume / Turso fallback if Vercel can't write to disk).
  - Smoke test from a fresh browser: home page loads, leaderboard shows 4 seed agents, an open round exists with current BTC price, predictions appear within 2 minutes.
  - Note: SQLite + Vercel doesn't persist across function invocations. **If this fails fast, swap to Turso (libsql) — same SQLite syntax, free tier, ~10 min migration**. Document the fallback in README.
