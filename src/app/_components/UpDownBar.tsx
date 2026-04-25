"use client";

import type { StateOpenRound } from "./types";
import { clamp, formatUsd, secondsLeft } from "./format";
import { LiveDot, Panel } from "./Panel";

type Props = {
  round: StateOpenRound | null;
  now: number;
};

export function UpDownBar({ round, now }: Props) {
  const predictions = round?.predictions ?? [];
  const longs = predictions.filter((p) => p.direction === "LONG").length;
  const shorts = predictions.filter((p) => p.direction === "SHORT").length;
  const holds = predictions.filter((p) => p.direction === "HOLD").length;
  const decisive = longs + shorts;
  // 50/50 baseline when no decisive votes; tilt as agents pile on.
  const longShare = decisive === 0 ? 0.5 : longs / decisive;
  const longPct = clamp(longShare * 100, 0, 100);
  const shortPct = 100 - longPct;
  const tipped = decisive >= 3 && (longShare >= 0.6 || longShare <= 0.4);

  const remaining = round
    ? secondsLeft(round.openedAt, round.timeframeSec, now)
    : 0;
  const total = round?.timeframeSec ?? 300;
  const elapsedPct = clamp(((total - remaining) / total) * 100, 0, 100);

  return (
    <Panel
      title="Open Round"
      badge={
        <span className="text-[10px] font-semibold tracking-[0.18em] text-zinc-300">
          {round ? round.asset : "—"}
        </span>
      }
      right={
        round ? (
          <span className="flex items-center gap-2">
            <LiveDot on={round.status === "open"} />
            {round.status.toUpperCase()} · {formatTimeLeft(remaining)}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <LiveDot on={false} />
            WAITING
          </span>
        )
      }
    >
      <div className="grid grid-cols-3 gap-3 px-4 pt-4">
        <Stat label="Open price" value={round ? formatUsd(round.openPriceCents) : "—"} />
        <Stat label="Predictions" value={String(predictions.length)} />
        <Stat label="HOLD" value={String(holds)} tone="amber" />
      </div>

      <div className="px-4 pb-4 pt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <span>
            <span className="text-lime-300">LONG {longs}</span>
            {decisive > 0 ? (
              <span className="ml-2 text-zinc-500">{longPct.toFixed(0)}%</span>
            ) : null}
          </span>
          <span className="text-zinc-600">vs</span>
          <span>
            {decisive > 0 ? (
              <span className="mr-2 text-zinc-500">{shortPct.toFixed(0)}%</span>
            ) : null}
            <span className="text-rose-300">{shorts} SHORT</span>
          </span>
        </div>
        <div className="relative h-10 overflow-hidden rounded border border-zinc-800 bg-zinc-900">
          <div
            className="absolute inset-y-0 left-0 bg-lime-400/20 transition-[width] duration-700 ease-out"
            style={{ width: `${longPct}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-rose-400/20 transition-[width] duration-700 ease-out"
            style={{ width: `${shortPct}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-px bg-zinc-100 transition-[left] duration-700 ease-out"
            style={{ left: `${longPct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tracking-[0.2em] text-zinc-200">
            {decisive === 0
              ? "AWAITING POSITIONS"
              : tipped
                ? `LEAN ${longShare >= 0.6 ? "LONG" : "SHORT"}`
                : "CONTESTED"}
          </div>
        </div>

        <div className="mt-3 h-1 w-full overflow-hidden rounded bg-zinc-900">
          <div
            className="h-full bg-zinc-600 transition-[width] duration-700 ease-out"
            style={{ width: `${elapsedPct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <span>opened {formatRelative(round?.openedAt, now)}</span>
          <span>{formatTimeLeft(remaining)} left</span>
        </div>
      </div>
    </Panel>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber";
}) {
  const valueColor = tone === "amber" ? "text-amber-300" : "text-zinc-100";
  return (
    <div className="rounded border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${valueColor}`}>{value}</div>
    </div>
  );
}

function formatTimeLeft(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelative(iso: string | undefined, now: number): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  return `${m}m ago`;
}
