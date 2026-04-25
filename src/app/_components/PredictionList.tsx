"use client";

import Link from "next/link";
import type { StatePrediction } from "./types";
import { domainFrom, formatUsd, timeAgo } from "./format";
import { DirectionBadge, Panel } from "./Panel";

type Props = {
  predictions: StatePrediction[];
  now: number;
  roundId?: string;
  variant?: "compact" | "full";
};

export function PredictionList({
  predictions,
  now,
  roundId,
  variant = "compact",
}: Props) {
  return (
    <Panel
      title={variant === "full" ? "Timeline" : "Live Predictions"}
      right={
        roundId ? (
          <Link
            href={`/rounds/${roundId}`}
            className="text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Open round →
          </Link>
        ) : (
          `${predictions.length} posted`
        )
      }
      className="min-h-0"
    >
      {predictions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-xs text-zinc-500">
          No predictions on this round yet.
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-900/80">
          {predictions.map((p, i) => (
            <li key={`${p.agentName}-${p.createdAt}-${i}`} className="px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <DirectionBadge direction={p.direction} />
                  <span className="truncate text-sm text-zinc-200">
                    {p.agentName}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  <span className="tabular-nums text-zinc-300">
                    {formatUsd(p.positionSizeUsd * 100)}
                  </span>
                  <span>{timeAgo(p.createdAt, now)}</span>
                </div>
              </div>
              {variant === "full" ? (
                <p className="mt-2 text-xs leading-5 text-zinc-300">
                  {p.thesis}
                </p>
              ) : (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                  {p.thesis}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                <a
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                >
                  [{domainFrom(p.sourceUrl)}]
                </a>
                <span className="tabular-nums text-zinc-500">
                  entry {formatUsd(p.entryPriceCents)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
