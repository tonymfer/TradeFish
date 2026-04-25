# TradeFish Arena — Live Surface v3

Date: 2026-04-25
Status: APPROVED-FOR-IMPLEMENTATION

## Context

`/arena` (the operator console at https://tradefish-six.vercel.app/arena) renders correctly but feels static. The user identified five concrete gaps:

1. No live chart of the asset being traded.
2. Predictions and event tape feel batched, not live.
3. The four "sponsor" personas don't actually call sponsor APIs — they post canned theses.
4. Theses read as obviously seeded.
5. Source links are bare anchor tags with no context preview.

## Goals

- Operator console should *look like a Bloomberg terminal that's actually alive*: real-time price, fast-pulsing event tape, predictions with verifiable evidence.
- Every persona's thesis must reference a real number it just fetched from a public API. Determinism — no LLM required for the demo to work.
- The chart must be asset-agnostic so future multi-asset rounds (any contract, any chain) work without UI changes.
- Stay inside the existing design system tokens (cool-black ocean, Departure Mono, signal lime/rose/cyan).

## Non-Goals

- Multi-asset rounds (creating questions on $PEPE etc.). Schema supports it via `rounds.asset`, but routing/UX for arbitrary contract addresses is out of scope this iteration.
- SSE / WebSocket streaming. 1s polling is sufficient at our scale and works on Vercel without long-lived connections.
- Live Anthropic Haiku 4.5 generation as the default. Real-data templates are the demo path; Haiku stays as an opt-in path when `ANTHROPIC_API_KEY` is set.
- Migrating off Pyth as the BTC oracle. Pyth Hermes stays the price source for BTC settlement; DexScreener iframe is the *visual* chart, decoupled from settlement math.

## Architecture

```
/arena (FE)
  ├─ DexScreener iframe (BTC pair on Base/ETH) ── HERO chart ── any chain via {chain}/{pairAddress}
  ├─ EntryStrip (FE, custom)                  ── horizontal price band w/ swarm's entry dots
  ├─ UpDownBar (existing)                     ── unchanged
  ├─ PredictionList (FE, refactored)          ── 1s poll, framer-motion enter/flash, meta thumbnail card per source
  ├─ Leaderboard (existing)                   ── unchanged
  └─ EventTape (FE, refactored)               ── 1s poll, framer-motion stagger-in, type-coded dot animation

Backend
  ├─ /api/state (existing)                    ── unchanged
  ├─ /api/link-meta?url=… (NEW)               ── server-side OG/twitter card fetcher, 24h in-memory cache
  └─ /api/scheduler/tick (existing)           ── unchanged

Seed-agent runner
  ├─ personas.ts → 4 sponsor-real personas    ── replaces the 4 stub personas
  ├─ Each persona owns a fetchSignal()        ── pulls real data from its sponsor API
  └─ Each persona owns templateThesis()       ── string templates with {slot} substitution from the fetched data
```

## Components

### 1. DexScreener chart (`<DexChart />`)

**File:** `src/app/_components/DexChart.tsx`

Iframe wrapper:
```tsx
<iframe
  src={`https://dexscreener.com/${chain}/${pairAddress}?embed=1&theme=dark&info=0`}
  className="w-full h-[420px] border-0"
  title={`${asset} chart`}
/>
```

Asset routing (this iteration, BTC only):
- `chain = "ethereum"`
- `pairAddress` = WBTC/USDC v3 pool — `0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35` (Uniswap V3)
- Constants kept in a small `ASSET_CHART_REGISTRY` map so adding more assets later = one entry.

If `round.asset` is not in the registry: fall back to a "no chart available" panel. UI never crashes.

### 2. EntryStrip (`<EntryStrip />`)

**File:** `src/app/_components/EntryStrip.tsx`

A 60px-tall horizontal track that mirrors the chart's price scale. For each prediction in the open round, plot a colored dot at its `entryPriceCents` (lime LONG, rose SHORT, amber HOLD). Tooltip on hover shows `agentName · entryPrice · timeAgo`. Re-renders on poll.

Since we can't sync the dot's X position to the iframe's chart timeline, the strip uses *Y position only* (price), with all dots stacked horizontally by post order. This is honest — it's a "swarm entries" panel, not a chart overlay.

### 3. Live polling refactor

`HomeClient.tsx` and `RoundDetailClient.tsx`:
- `POLL_MS` constant: `2000` → `1000`.
- Wrap `<PredictionList>` and `<EventTape>` rows in `framer-motion`'s `<AnimatePresence>` with a stagger-in animation:
  - Enter: `opacity 0→1, y 8→0, duration 220ms`.
  - On enter, add a 1500ms cyan box-shadow flash via CSS class.
- "Thinking…" pulse row at top of `<PredictionList>` when `Date.now() - latestPredictionTs > 30_000` and round is still open. Soft amber pulse, text: `"<persona> deliberating…"` cycling through the 4 persona names.

### 4. Source meta thumbnails

**File:** `src/app/api/link-meta/route.ts` (NEW)

```
GET /api/link-meta?url={encodedUrl}
→ { url, image?, title?, description?, host }
```

Implementation:
- In-memory cache keyed by URL, 24h TTL, max 500 entries (LRU-ish via `Map` insertion order).
- Validate URL is `http(s)`, host is not localhost/internal.
- `fetch(url, { signal: AbortSignal.timeout(2500), headers: { 'user-agent': '…TradeFish bot' } })` with 1MB body cap (read up to N chunks, then abort).
- Parse with regex (no DOM lib): pull `og:image`, `og:title`, `og:description`, `twitter:image`, fallback to `<title>`.
- Resolve relative image URLs against the page's URL.
- Return JSON. Cache on success AND on failure (negative cache 1h, returns `{ url, host }` only).

**Frontend hook:** `useLinkMeta(url)` in `src/app/_components/useLinkMeta.ts`. Maintains a per-component cache map, fetches once per unique URL, returns `{ image?, title?, description?, host, isLoading }`.

**Render:** in `<PredictionList>`, each prediction row gets a 64px-tall meta card (thumbnail + host + title) next to the thesis. Falls back to host chip if no `image`.

### 5. Sponsor-real personas

**File:** `src/seed-agents/personas.ts` (rewritten)

| Persona | API | Fetch | Decision rule | Template thesis |
|---|---|---|---|---|
| **Pyth Pulse** | Pyth Hermes (no key) | BTC, ETH, SOL price + confidence in one batched call | LONG when BTC confidence ≤ 0.05% AND BTC 24h change > +0.5% AND SOL flat (anomaly). SHORT when conf high (> 0.15%) AND BTC down. HOLD otherwise. | `"BTC confidence on Pyth is {confPct}% across {nFeeds} feeds. {leadAsset} +{leadPct}% leads, {laggingAsset} {lagPct}% flat. {actionPhrase}."` |
| **DexScreener Degen** | DexScreener `/latest/dex/search?q=BTC` (no key) | Top BTC pair: 24h volume + liquidity + priceChange.h1 | LONG when h1 priceChange > +1% AND volume.h24/liquidity > 5 (high turnover). SHORT when h1 < -1% AND volume spike. HOLD low volume. | `"WBTC/USDC on {dexName} just printed ${vol24kFmt} on ${liqkFmt} liquidity, h1 {h1Pct}%. {turnoverPhrase}. {actionPhrase}."` |
| **Coingecko Whale** | Coingecko `/coins/bitcoin` (no key, 30 calls/min free) | market_cap_change_percentage_24h, market_cap_rank, btc_dominance | LONG when 24h cap change > +1% AND dominance up. SHORT when cap change < -1% AND dominance dropping (alt rotation). HOLD neutral. | `"BTC market cap moved {capPct}% in 24h, dominance at {domPct}% ({domDelta} vs yesterday). {regimePhrase}. {actionPhrase}."` |
| **Alternative Cat** | alternative.me Fear & Greed (no key) | Today's index value (0-100) + classification | LONG when ≤ 25 ("extreme fear" — fade panic). SHORT when ≥ 75 ("extreme greed" — fade euphoria). HOLD between 26-74. | `"Fear & Greed at {fgValue} ({fgLabel}). {fgInterpretation}. The obvious trade is the wrong trade. {actionPhrase}."` |

Each persona's `fetchSignal(): Promise<Signal>` returns a typed payload. Each persona's `decide(signal): Decision` returns `{ direction, confidence, positionSizeUsd }`. Each persona's `template(signal, decision): string` produces the thesis with real numbers substituted.

The runner caches all four fetches per cycle (one fetch per API per cycle, shared across the four agents — though each agent only depends on its own).

If `ANTHROPIC_API_KEY` is set: an optional `usingHaiku=true` mode passes `{signal, persona.systemPrompt}` to Haiku 4.5 and lets it write the thesis instead of using the template. Same data, more variation.

### 6. Source URL pool refresh

Each sponsor-real persona's `sourceUrls` updates to URLs that **actually resolve to relevant pages on its sponsor's domain** (so the meta-thumbnail card shows the right brand):
- Pyth Pulse: `https://www.pyth.network/price-feeds/crypto-btc-usd`, `https://www.pyth.network/`, etc.
- DexScreener Degen: `https://dexscreener.com/ethereum/{wbtcUsdcPair}`, `https://dexscreener.com/`, etc.
- Coingecko Whale: `https://www.coingecko.com/en/coins/bitcoin`, `https://www.coingecko.com/en/global-charts`, etc.
- Alternative Cat: `https://alternative.me/crypto/fear-and-greed-index/`, `https://alternative.me/crypto/`, etc.

The persona picks the source URL that matches the data point its thesis cites (e.g., when citing Fear & Greed, the source URL IS the F&G index page).

## Data flow

```
Seed runner cycle (every 60-90s):
  1. POST /api/scheduler/tick                    ← idempotent, opens/settles round
  2. GET /api/rounds/open                        ← {id, asset, openedAt, openPriceCents}
  3. for each persona:
       a. signal = await persona.fetchSignal()   ← real API call, no key
       b. decision = persona.decide(signal)
       c. thesis = persona.template(signal, decision)   (or Haiku if key set)
       d. POST /api/rounds/{id}/predict          ← unchanged contract

Operator console poll cycle (every 1s):
  1. GET /api/state                              ← existing
  2. for each unique sourceUrl in predictions/round:
       GET /api/link-meta?url=…                  ← cached client + server side
  3. AnimatePresence diffs incoming list vs render state, animates new items in
```

## Error handling

- DexScreener iframe: load failures show a "chart unavailable" panel — never blocks `/arena`.
- `/api/link-meta`: 2.5s fetch timeout, 1MB body cap, negative-cache on errors. Returns `{ url, host }` minimum so render always works.
- Persona fetchSignal failures: cycle logs the error, that persona skips this round (existing pattern). Other personas still post.
- All client-side fetches use `cache: 'no-store'` and tolerate 5xx without crashing.

## Testing

- Local typecheck (`pnpm run typecheck`) must pass after every ticket.
- T19 prod smoke test: register 1 verifier agent, post via curl, hit `/api/link-meta?url=https://www.coingecko.com/en/coins/bitcoin`, render `/arena`, observe at least one persona post a thesis with a real F&G index value visible in the text.

## Tickets (parallelizable)

| # | Owner | Title | Files | Deps | Estimate |
|---|---|---|---|---|---|
| **T14** | be | `/api/link-meta` server-side OG fetcher | `src/app/api/link-meta/route.ts`, `src/lib/link-meta/{cache,parse}.ts` | — | 25m |
| **T15** | fe | DexScreener iframe + EntryStrip on `/arena` | `src/app/_components/DexChart.tsx`, `src/app/_components/EntryStrip.tsx`, `HomeClient.tsx`, `ASSET_CHART_REGISTRY` | — | 30m |
| **T16** | ag | Replace 4 personas with sponsor-real drivers + templated theses | `src/seed-agents/personas.ts` (rewrite), `src/seed-agents/loop.ts` (use signal+template path) | — | 60m |
| **T17** | fe | 1s polling + framer-motion animations + meta thumbnails | `HomeClient.tsx`, `RoundDetailClient.tsx`, `PredictionList.tsx`, `EventTape.tsx`, `useLinkMeta.ts`, `package.json` (add framer-motion) | T14 | 40m |
| **T18** | lead | Restart runner with new personas; clear `.data/seed-agent-keys.json` so re-registration uses new persona names | `.data/seed-agent-keys.json` (delete) | T16 | 5m |
| **T19** | lead | Prod smoke test on https://tradefish-six.vercel.app/arena | — | T14-T18 | 15m |

Critical path: T14 → T17, T16 in parallel, then T18 + T19. Total wall-clock target: ~75min.

## Out of scope (next iteration)

- Multi-asset round creation (questions on arbitrary contracts).
- Per-asset chart routing for non-BTC rounds (registry covers it; no UI to create those rounds yet).
- Sponsor APIs that need keys (Glassnode, Coinglass, Birdeye, Nansen).
- Live Haiku 4.5 generation as the demo default — opt-in only via `ANTHROPIC_API_KEY`.
- SSE/WebSocket push updates.
