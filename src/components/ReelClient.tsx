"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * /reel highlights carousel.
 *
 * Fetches GET /api/highlights?limit=5 once on mount. Auto-cycles every
 * 6s, pauses on hover/focus, supports ←/→ keyboard nav, and shows a
 * dot indicator. Operator-console aesthetic — design-system tokens
 * only (--cream, --cyan, --long, --short, --line, --font-pixel,
 * --font-mono). Each highlight card is a settled round narrated as:
 *
 *     question  →  open/close prices + signed Δ%  →  winner / loser
 *     →  link out to /rounds/{roundId}.
 */

const AUTO_MS = 6000;

type TradeHighlight = {
  agentName: string;
  agentId: string;
  pnlUsd: number;
  direction: "LONG" | "SHORT" | "HOLD";
  positionSizeUsd: number;
};

type Highlight = {
  roundId: string;
  asset: string;
  openedAt: string;
  settledAt: string;
  openPriceCents: number;
  closePriceCents: number;
  deltaPct: number; // signed
  predictionCount: number;
  settledTradeCount: number;
  biggestWin: TradeHighlight | null;
  biggestLoss: TradeHighlight | null;
};

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDeltaPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "±";
  const abs = Math.abs(pct);
  return `${sign}${abs.toFixed(2)}%`;
}

function formatPnl(usd: number): string {
  const sign = usd > 0 ? "+" : usd < 0 ? "−" : "±";
  const abs = Math.abs(usd);
  // Whole dollars at this scale; reel is glanceable, not forensic.
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

function timeframeFromIsos(openedAt: string, settledAt: string): number {
  const a = new Date(openedAt).getTime();
  const b = new Date(settledAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 300;
  // Round to nearest 60s. The API doesn't ship timeframeSec on highlights,
  // and settledAt − openedAt is the closest approximation.
  const sec = Math.max(60, Math.round((b - a) / 1000 / 60) * 60);
  return sec;
}

function deltaCls(pct: number): "long" | "short" | "" {
  if (pct > 0) return "long";
  if (pct < 0) return "short";
  return "";
}

function dirCls(dir: TradeHighlight["direction"]): "long" | "short" | "hold" {
  if (dir === "LONG") return "long";
  if (dir === "SHORT") return "short";
  return "hold";
}

export function ReelClient() {
  const [items, setItems] = useState<Highlight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const indexRef = useRef(0);

  // Fetch once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/highlights?limit=5", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setError(`status ${res.status}`);
          return;
        }
        const json = (await res.json()) as { highlights?: Highlight[] };
        const list = Array.isArray(json.highlights) ? json.highlights : [];
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "fetch failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const count = items?.length ?? 0;

  // Keep ref in sync so the interval closure reads the latest index.
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const next = useCallback(() => {
    if (count === 0) return;
    setIndex((i) => (i + 1) % count);
  }, [count]);

  const prev = useCallback(() => {
    if (count === 0) return;
    setIndex((i) => (i - 1 + count) % count);
  }, [count]);

  // Auto-cycle.
  useEffect(() => {
    if (paused || count <= 1) return;
    const handle = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, AUTO_MS);
    return () => {
      window.clearInterval(handle);
    };
  }, [paused, count]);

  // Keyboard nav.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [next, prev]);

  const current = items && count > 0 ? items[Math.min(index, count - 1)] : null;

  const eyebrow = useMemo(() => {
    if (items === null) return "LOADING";
    if (count === 0) return "EMPTY";
    return "HIGHLIGHTS";
  }, [items, count]);

  return (
    <div
      className="reel-shell"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="reel-topbar">
        <Link href="/" className="reel-back">
          ← BACK
        </Link>
        <div className="reel-eyebrow">
          <span className="dot">▣</span>
          {eyebrow}
        </div>
        <div className="reel-counter">
          {count > 0 ? `${index + 1} / ${count}` : `0 / 0`}
        </div>
      </div>

      <div className="reel-stage" aria-live="polite">
        {items === null && <ReelSkeleton />}
        {items !== null && error && <ReelError msg={error} />}
        {items !== null && !error && count === 0 && <ReelEmpty />}
        {current && <ReelCard highlight={current} />}
      </div>

      {count > 1 && (
        <div className="reel-dots" role="tablist" aria-label="reel slides">
          {items!.map((h, i) => (
            <button
              key={h.roundId}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`slide ${i + 1}`}
              className={`reel-dot${i === index ? " active" : ""}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}

      <div className="reel-foot">
        auto-cycle · 6s · keyboard ← →
        {paused ? " · paused" : ""}
      </div>

      <ReelStyles />
    </div>
  );
}

function ReelCard({ highlight }: { highlight: Highlight }) {
  const tf = timeframeFromIsos(highlight.openedAt, highlight.settledAt);
  const deltaSign = deltaCls(highlight.deltaPct);

  return (
    <article className="reel-card">
      <div className="reel-card-question">
        Will <span className="hl">{highlight.asset}</span> close above its open
        price in <span className="hl">{tf}s</span>?
      </div>

      <div className="reel-card-prices">
        <div className="price-cell">
          <div className="price-label">OPEN</div>
          <div className="price-value">
            {formatCents(highlight.openPriceCents)}
          </div>
        </div>
        <div className="price-arrow" aria-hidden="true">
          →
        </div>
        <div className="price-cell">
          <div className="price-label">CLOSE</div>
          <div className="price-value">
            {formatCents(highlight.closePriceCents)}
          </div>
        </div>
        <div className={`delta-chip${deltaSign ? ` ${deltaSign}` : ""}`}>
          {formatDeltaPct(highlight.deltaPct)}
        </div>
      </div>

      <div className="reel-card-trades">
        {highlight.biggestWin ? (
          <TradeRow tag="BIGGEST WIN" trade={highlight.biggestWin} kind="win" />
        ) : (
          <div className="trade-row empty">no settled trades</div>
        )}
        {highlight.biggestLoss && (
          <TradeRow
            tag="BIGGEST LOSS"
            trade={highlight.biggestLoss}
            kind="loss"
          />
        )}
      </div>

      <div className="reel-card-meta">
        <span>{highlight.predictionCount} predictions</span>
        <span aria-hidden>·</span>
        <span>{highlight.settledTradeCount} settled</span>
      </div>

      <div className="reel-card-cta">
        <Link href={`/rounds/${highlight.roundId}`} className="reel-cta">
          VIEW ROUND →
        </Link>
      </div>
    </article>
  );
}

function TradeRow({
  tag,
  trade,
  kind,
}: {
  tag: string;
  trade: TradeHighlight;
  kind: "win" | "loss";
}) {
  return (
    <div className={`trade-row ${kind}`}>
      <span className="trade-tag">{tag}</span>
      <Link href={`/agents/${trade.agentId}`} className="trade-name">
        {trade.agentName}
      </Link>
      <span className={`trade-dir ${dirCls(trade.direction)}`}>
        {trade.direction}
      </span>
      <span className={`trade-pnl ${kind === "win" ? "long" : "short"}`}>
        {formatPnl(trade.pnlUsd)}
      </span>
    </div>
  );
}

function ReelSkeleton() {
  return (
    <article className="reel-card skeleton" aria-busy="true">
      <div className="reel-card-question">
        <span className="sk sk-line" />
        <span className="sk sk-line short" />
      </div>
      <div className="reel-card-prices">
        <div className="price-cell">
          <div className="price-label">OPEN</div>
          <div className="price-value">
            <span className="sk sk-num" />
          </div>
        </div>
        <div className="price-arrow" aria-hidden="true">
          →
        </div>
        <div className="price-cell">
          <div className="price-label">CLOSE</div>
          <div className="price-value">
            <span className="sk sk-num" />
          </div>
        </div>
        <div className="delta-chip">
          <span className="sk sk-chip" />
        </div>
      </div>
      <div className="reel-card-trades">
        <div className="trade-row">
          <span className="sk sk-line" />
        </div>
        <div className="trade-row">
          <span className="sk sk-line" />
        </div>
      </div>
    </article>
  );
}

function ReelEmpty() {
  return (
    <article className="reel-card empty-card">
      <div className="reel-empty-eyebrow">▸ NO SETTLED ROUNDS YET</div>
      <p className="reel-empty-body">
        The reel will populate once rounds settle. Open the arena to watch
        agents commit positions.
      </p>
      <div className="reel-card-cta">
        <Link href="/arena" className="reel-cta">
          ENTER ARENA →
        </Link>
      </div>
    </article>
  );
}

function ReelError({ msg }: { msg: string }) {
  return (
    <article className="reel-card empty-card">
      <div className="reel-empty-eyebrow">▸ COULD NOT LOAD HIGHLIGHTS</div>
      <p className="reel-empty-body">{msg}</p>
      <div className="reel-card-cta">
        <Link href="/" className="reel-cta">
          ← BACK HOME
        </Link>
      </div>
    </article>
  );
}

/**
 * Inline styles via styled-jsx-free tag — keeps reel CSS scoped without
 * extending globals.css. Tokens-only; no hex values.
 */
function ReelStyles() {
  return (
    <style>{`
      .reel-page {
        min-height: 100vh;
        background: var(--bg-0);
      }
      .reel-shell {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: 28px 40px 24px;
        gap: 28px;
      }
      .reel-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
      }
      .reel-back {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--fg-faint);
        text-decoration: none;
        transition: color var(--t-fast);
      }
      .reel-back:hover {
        color: var(--cream);
      }
      .reel-eyebrow {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.32em;
        color: var(--cyan);
        text-transform: uppercase;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .reel-eyebrow .dot {
        color: var(--cyan);
      }
      .reel-counter {
        font-family: var(--font-pixel);
        font-size: 14px;
        letter-spacing: 0.18em;
        color: var(--cream);
      }

      .reel-stage {
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 0;
      }

      .reel-card {
        width: 100%;
        max-width: 920px;
        border: 1px solid var(--line-strong);
        background: var(--surface);
        padding: 48px 52px;
        display: flex;
        flex-direction: column;
        gap: 36px;
        position: relative;
      }
      .reel-card::before,
      .reel-card::after {
        content: "";
        position: absolute;
        width: 14px;
        height: 14px;
        border: 1px solid var(--cyan);
      }
      .reel-card::before {
        top: -1px;
        left: -1px;
        border-right: none;
        border-bottom: none;
      }
      .reel-card::after {
        bottom: -1px;
        right: -1px;
        border-left: none;
        border-top: none;
      }

      .reel-card-question {
        font-family: var(--font-pixel);
        font-size: 36px;
        line-height: 1.15;
        color: var(--cream);
        letter-spacing: 0.02em;
      }
      .reel-card-question .hl {
        color: var(--cyan);
      }

      .reel-card-prices {
        display: flex;
        align-items: center;
        gap: 28px;
        flex-wrap: wrap;
      }
      .price-cell {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .price-label {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .price-value {
        font-family: var(--font-pixel);
        font-size: 40px;
        color: var(--cream);
        letter-spacing: 0.02em;
      }
      .price-arrow {
        font-family: var(--font-pixel);
        font-size: 32px;
        color: var(--fg-faint);
      }
      .delta-chip {
        margin-left: auto;
        padding: 12px 18px;
        border: 1px solid var(--line-strong);
        font-family: var(--font-pixel);
        font-size: 28px;
        letter-spacing: 0.04em;
        color: var(--cream);
        background: var(--bg-1);
      }
      .delta-chip.long {
        color: var(--long);
        border-color: var(--long);
        background: var(--long-bg);
      }
      .delta-chip.short {
        color: var(--short);
        border-color: var(--short);
        background: var(--short-bg);
      }

      .reel-card-trades {
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-top: 1px dashed var(--line);
        border-bottom: 1px dashed var(--line);
        padding: 18px 0;
      }
      .trade-row {
        display: grid;
        grid-template-columns: 130px 1fr 70px 110px;
        gap: 18px;
        align-items: baseline;
      }
      .trade-row.empty {
        grid-template-columns: 1fr;
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.18em;
        color: var(--fg-faint);
        text-transform: uppercase;
        text-align: center;
      }
      .trade-tag {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .trade-name {
        font-family: var(--font-pixel);
        font-size: 16px;
        letter-spacing: 0.04em;
        color: var(--cream);
        text-decoration: none;
        border-bottom: 1px dashed transparent;
        transition: color var(--t-fast), border-color var(--t-fast);
      }
      .trade-name:hover {
        color: var(--cyan);
        border-bottom-color: var(--cyan);
      }
      .trade-dir {
        font-family: var(--font-pixel);
        font-size: 12px;
        letter-spacing: 0.16em;
        text-align: center;
        padding: 2px 8px;
        border: 1px solid var(--line);
      }
      .trade-dir.long {
        color: var(--long);
        border-color: var(--long);
      }
      .trade-dir.short {
        color: var(--short);
        border-color: var(--short);
      }
      .trade-dir.hold {
        color: var(--hold);
        border-color: var(--hold);
      }
      .trade-pnl {
        font-family: var(--font-pixel);
        font-size: 18px;
        letter-spacing: 0.04em;
        text-align: right;
      }
      .trade-pnl.long {
        color: var(--long);
      }
      .trade-pnl.short {
        color: var(--short);
      }

      .reel-card-meta {
        display: flex;
        gap: 12px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }

      .reel-card-cta {
        display: flex;
        justify-content: flex-end;
      }
      .reel-cta {
        font-family: var(--font-pixel);
        font-size: 13px;
        letter-spacing: 0.2em;
        color: var(--bg-0);
        background: var(--cyan);
        padding: 10px 18px;
        text-decoration: none;
        text-transform: uppercase;
        transition: background var(--t-fast);
      }
      .reel-cta:hover {
        background: var(--cyan-bright);
      }

      .reel-dots {
        display: flex;
        gap: 8px;
        justify-content: center;
      }
      .reel-dot {
        width: 10px;
        height: 10px;
        background: transparent;
        border: 1px solid var(--line-strong);
        padding: 0;
        cursor: pointer;
        transition: background var(--t-fast), border-color var(--t-fast);
      }
      .reel-dot:hover {
        border-color: var(--cyan);
      }
      .reel-dot.active {
        background: var(--cyan);
        border-color: var(--cyan);
      }

      .reel-foot {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--fg-faintest);
        text-align: center;
      }

      .empty-card {
        align-items: flex-start;
      }
      .reel-empty-eyebrow {
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--cyan);
      }
      .reel-empty-body {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 14px;
        line-height: 1.7;
        color: var(--fg-dim);
        max-width: 540px;
      }

      .skeleton .sk {
        display: inline-block;
        background: var(--surface-2);
        border: 1px solid var(--line);
        animation: reel-pulse 1.4s ease-in-out infinite;
      }
      .sk-line {
        width: 60%;
        height: 18px;
        margin: 6px 0;
      }
      .sk-line.short {
        width: 32%;
      }
      .sk-num {
        width: 140px;
        height: 36px;
      }
      .sk-chip {
        width: 110px;
        height: 36px;
      }
      @keyframes reel-pulse {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 0.95; }
      }

      @media (max-width: 720px) {
        .reel-shell {
          padding: 20px 18px 18px;
          gap: 18px;
        }
        .reel-card {
          padding: 28px 22px;
          gap: 24px;
        }
        .reel-card-question {
          font-size: 24px;
        }
        .price-value {
          font-size: 28px;
        }
        .delta-chip {
          font-size: 20px;
          margin-left: 0;
        }
        .reel-card-prices {
          gap: 14px;
        }
        .trade-row {
          grid-template-columns: 90px 1fr 64px 90px;
          gap: 10px;
        }
        .trade-name {
          font-size: 13px;
        }
      }
    `}</style>
  );
}
