"use client";

import type { Direction, StatePrediction } from "./types";
import { formatUsd, timeAgo } from "./format";

type Props = {
  predictions: StatePrediction[];
  openPriceCents: number;
  now: number;
};

const DOT_SIZE = 10;
const STRIP_HEIGHT = 60;
const PAD_Y = 8;

export function EntryStrip({ predictions, openPriceCents, now }: Props) {
  // Derive price-axis range from prediction entries + open price, with a small
  // 5% margin so dots don't kiss the top/bottom rails. With no predictions yet,
  // the open-price baseline still renders centered.
  const prices = predictions
    .map((p) => p.entryPriceCents)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (openPriceCents > 0) prices.push(openPriceCents);

  const minPrice = prices.length ? Math.min(...prices) : openPriceCents || 0;
  const maxPrice = prices.length ? Math.max(...prices) : openPriceCents || 0;
  const span = Math.max(maxPrice - minPrice, 1);
  const lo = minPrice - span * 0.05;
  const hi = maxPrice + span * 0.05;
  const range = Math.max(hi - lo, 1);

  function yFor(priceCents: number): number {
    const inner = STRIP_HEIGHT - PAD_Y * 2 - DOT_SIZE;
    const t = (hi - priceCents) / range;
    return PAD_Y + t * inner;
  }

  // Reserve some horizontal padding for axis labels at left and right.
  const LEFT_PCT = 14;
  const RIGHT_PCT = 12;
  const trackWidthPct = 100 - LEFT_PCT - RIGHT_PCT;
  function xPctFor(i: number, n: number): number {
    if (n <= 1) return LEFT_PCT + trackWidthPct / 2;
    return LEFT_PCT + (i / (n - 1)) * trackWidthPct;
  }

  const baselineY = yFor(openPriceCents) + DOT_SIZE / 2;

  return (
    <div
      className="relative w-full overflow-hidden rounded border border-zinc-800/80 bg-zinc-950/70"
      style={{ height: STRIP_HEIGHT }}
    >
      <div className="pointer-events-none absolute left-2 top-1.5 text-[9px] uppercase tracking-[0.18em] text-zinc-600">
        ▸ SWARM ENTRIES
      </div>
      <div className="pointer-events-none absolute right-2 top-1.5 text-[9px] uppercase tracking-[0.18em] text-zinc-600">
        {predictions.length} POSTED
      </div>

      {openPriceCents > 0 ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-zinc-700/70"
            style={{ top: baselineY }}
          />
          <div
            className="pointer-events-none absolute left-2 -translate-y-1/2 text-[9px] uppercase tracking-[0.18em] text-zinc-500"
            style={{ top: baselineY }}
          >
            OPEN {formatUsd(openPriceCents)}
          </div>
        </>
      ) : null}

      <div
        className="pointer-events-none absolute right-2 text-[9px] tabular-nums text-zinc-500"
        style={{ top: Math.max(yFor(hi) - 2, 0) }}
      >
        {formatUsd(hi)}
      </div>
      <div
        className="pointer-events-none absolute right-2 text-[9px] tabular-nums text-zinc-500"
        style={{ bottom: PAD_Y }}
      >
        {formatUsd(lo)}
      </div>

      {predictions.map((p, i) => {
        const xPct = xPctFor(i, predictions.length);
        const y = yFor(p.entryPriceCents);
        const tone = toneFor(p.direction);
        return (
          <div
            key={`${p.agentName}-${p.createdAt}-${i}`}
            className="group absolute"
            style={{
              left: `${xPct}%`,
              top: y,
              width: DOT_SIZE,
              height: DOT_SIZE,
              transform: "translateX(-50%)",
            }}
            title={`${p.agentName} · ${p.direction} · ${formatUsd(
              p.entryPriceCents,
            )} · ${timeAgo(p.createdAt, now)}`}
          >
            <span
              className={`block rounded-full ${tone.bg} ${tone.ring} ring-1`}
              style={{ width: DOT_SIZE, height: DOT_SIZE }}
            />
            <div
              className={`pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded border ${tone.border} bg-zinc-950/95 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-200 shadow-lg group-hover:block`}
              style={{ bottom: DOT_SIZE + 6 }}
            >
              <span className={tone.text}>{p.direction}</span>{" "}
              <span className="text-zinc-300">{p.agentName}</span>
              <span className="text-zinc-600"> · </span>
              <span className="tabular-nums text-zinc-200">
                {formatUsd(p.entryPriceCents)}
              </span>
              <span className="text-zinc-600"> · </span>
              <span className="text-zinc-500">{timeAgo(p.createdAt, now)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Tone = {
  bg: string;
  ring: string;
  border: string;
  text: string;
};

function toneFor(direction: Direction): Tone {
  if (direction === "LONG") {
    return {
      bg: "bg-lime-400",
      ring: "ring-lime-300/60",
      border: "border-lime-400/40",
      text: "text-lime-300",
    };
  }
  if (direction === "SHORT") {
    return {
      bg: "bg-rose-400",
      ring: "ring-rose-300/60",
      border: "border-rose-400/40",
      text: "text-rose-300",
    };
  }
  return {
    bg: "bg-amber-400",
    ring: "ring-amber-300/60",
    border: "border-amber-400/40",
    text: "text-amber-300",
  };
}
