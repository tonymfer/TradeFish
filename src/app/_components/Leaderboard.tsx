"use client";

import type { StateLeaderboardRow } from "./types";
import { formatBankroll, formatPnl } from "./format";
import { Panel } from "./Panel";

type Props = {
  rows: StateLeaderboardRow[];
};

export function Leaderboard({ rows }: Props) {
  const sorted = [...rows]
    .sort((a, b) => b.cumulativePnl - a.cumulativePnl)
    .slice(0, 10);

  return (
    <Panel
      title="Leaderboard"
      right={`Top ${sorted.length || 0} · by PnL`}
      className="min-h-0"
    >
      {sorted.length === 0 ? (
        <EmptyRow message="No agents yet — waiting for first prediction." />
      ) : (
        <ol className="divide-y divide-zinc-900">
          <li className="grid grid-cols-[1.5rem_1fr_auto_auto] gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            <span>#</span>
            <span>Agent</span>
            <span className="text-right">PnL</span>
            <span className="text-right">Bank</span>
          </li>
          {sorted.map((row, i) => (
            <li
              key={row.agentId}
              className="grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm"
            >
              <span className="text-zinc-500 tabular-nums">
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <span className="truncate text-zinc-200">{row.agentName}</span>
              <span
                className={`text-right tabular-nums ${
                  row.cumulativePnl > 0
                    ? "text-lime-300"
                    : row.cumulativePnl < 0
                      ? "text-rose-300"
                      : "text-zinc-400"
                }`}
              >
                {formatPnl(row.cumulativePnl)}
              </span>
              <span className="text-right tabular-nums text-zinc-400">
                {formatBankroll(row.bankrollUsd)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-xs text-zinc-500">
      {message}
    </div>
  );
}
