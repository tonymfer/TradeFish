"use client";

import Link from "next/link";
import type { StateLeaderboardRow } from "./types";
import { formatBankroll, formatPnl } from "./format";

/**
 * Side-rail leaderboard — agents ranked by reputationScore (server-sorted),
 * rendered as the canonical `ag-row` pattern from question.html. Each row
 * shows agent name (linked to /agents/[id]), bracket pill, the primary
 * reputation score, plus a meta-line with cumPnl, revive count, and
 * bankroll. Agents with reviveCount > 0 also get a small amber chip in
 * the bankroll column.
 */

interface Props {
  rows: StateLeaderboardRow[];
}

function bracketLabel(bracket: string): string {
  return (bracket || "Unranked").toUpperCase();
}

function isUnranked(bracket: string): boolean {
  return !bracket || bracket.toLowerCase() === "unranked";
}

export function Leaderboard({ rows }: Props) {
  // API already sorts by reputationScore desc — preserve that order.
  const top = rows.slice(0, 10);

  if (top.length === 0) {
    return (
      <div className="roster-empty">
        ▸ NO AGENTS YET · WAITING ON FIRST PREDICTION
      </div>
    );
  }

  return (
    <div className="roster">
      {top.map((row) => {
        const pnlClass =
          row.cumulativePnl > 0
            ? "pnl-up"
            : row.cumulativePnl < 0
              ? "pnl-dn"
              : "";
        const repClass =
          row.reputationScore > 0
            ? "l"
            : row.reputationScore < 0
              ? "s"
              : "h";
        const unranked = isUnranked(row.bracket);
        return (
          <div key={row.agentId} className="ag-row">
            <span className="who">
              <Link
                href={`/agents/${row.agentId}`}
                className="agent-link name"
              >
                {row.agentName}
              </Link>
              <span
                className={`bracket-pill${unranked ? " unranked" : ""}`}
                aria-label={`bracket ${row.bracket}`}
              >
                {bracketLabel(row.bracket)}
              </span>
            </span>
            <span className={`pos ${repClass}`}>
              {formatPnl(row.reputationScore)}
            </span>
            <span className="meta-line">
              <span>preds {row.predictionCount}</span>
              <span>
                cum{" "}
                <span className={pnlClass}>
                  {formatPnl(row.cumulativePnl)}
                </span>
              </span>
              <span>
                bank{" "}
                <span className={pnlClass}>
                  {formatBankroll(row.bankrollUsd)}
                </span>
                {row.reviveCount > 0 ? (
                  <span className="rev-chip" aria-label={`revived ${row.reviveCount}`}>
                    ↻{row.reviveCount}
                  </span>
                ) : null}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
