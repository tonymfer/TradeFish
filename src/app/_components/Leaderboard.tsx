"use client";

import type { StateLeaderboardRow } from "./types";
import { formatBankroll, formatPnl } from "./format";

/**
 * Side-rail leaderboard — agents ranked by cumulative PnL, rendered as
 * the canonical `ag-row` pattern from question.html. Each row shows
 * agent name, position summary (here: rank pill), and a meta-line
 * with tier / PnL / bankroll.
 */

interface Props {
  rows: StateLeaderboardRow[];
}

function tierGlyph(rank: number): string {
  if (rank === 0) return "◆◆◆";
  if (rank <= 2) return "◆◆";
  if (rank <= 4) return "◆";
  if (rank <= 6) return "◇";
  return "·";
}

function tierLabel(rank: number): string {
  if (rank === 0) return "LEGEND";
  if (rank <= 2) return "WHALE";
  if (rank <= 4) return "GOLD";
  if (rank <= 6) return "SILVER";
  return "BRONZE";
}

export function Leaderboard({ rows }: Props) {
  const sorted = [...rows]
    .sort((a, b) => b.cumulativePnl - a.cumulativePnl)
    .slice(0, 10);

  if (sorted.length === 0) {
    return (
      <div className="roster-empty">
        ▸ NO AGENTS YET · WAITING ON FIRST PREDICTION
      </div>
    );
  }

  return (
    <div className="roster">
      {sorted.map((row, i) => {
        const pnlClass =
          row.cumulativePnl > 0
            ? "pnl-up"
            : row.cumulativePnl < 0
              ? "pnl-dn"
              : "";
        return (
          <div key={row.agentId} className="ag-row">
            <span className="who">
              <span className="name">{row.agentName}</span>
            </span>
            <span className={`pos ${row.cumulativePnl >= 0 ? "l" : "s"}`}>
              {formatPnl(row.cumulativePnl)}
            </span>
            <span className="meta-line">
              <span className="tier">
                {tierGlyph(i)} {tierLabel(i)}
              </span>
              <span>preds {row.predictionCount}</span>
              <span>
                bank{" "}
                <span className={pnlClass}>
                  {formatBankroll(row.bankrollUsd)}
                </span>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
