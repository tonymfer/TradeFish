"use client";

import { useEffect, useState } from "react";

/**
 * Stats strip on the landing page — replaces the previous hardcoded
 * "6 / 2,400 / +$1,042 / USDC" cells. Polls /api/stats every 5s.
 *
 * The 4th cell ("USDC fee settlement") is a static label, not a metric,
 * and is preserved from the original markup so the band still reads as
 * an arc instead of three numbers floating over an empty fourth cell.
 *
 * Loading state renders "—" placeholders so the row's heights/columns
 * don't shift when real numbers arrive.
 */

const POLL_MS = 5000;

interface ApiStats {
  totalAgents: number;
  totalPredictions: number;
  totalSettled: number;
  aggregateCumulativePnl: number;
  totalRounds: number;
  openRounds: number;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function formatPnl(usd: number): { text: string; cls: "" | "long" | "short" } {
  if (!Number.isFinite(usd)) return { text: "—", cls: "" };
  const sign = usd > 0 ? "+" : usd < 0 ? "−" : "±";
  const abs = Math.abs(usd);
  // PnL stored in dollars (per BE schema). Round to whole dollars for
  // the headline cell; the dashboard pages have the precise figure.
  const rounded = Math.round(abs);
  const text = `${sign}$${rounded.toLocaleString("en-US")}`;
  const cls = usd > 0 ? "long" : usd < 0 ? "short" : "";
  return { text, cls };
}

export function LiveStats() {
  const [stats, setStats] = useState<ApiStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as ApiStats;
        if (!cancelled) setStats(json);
      } catch {
        // keep last-known on transient errors
      }
    }

    tick();
    const handle = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, []);

  const agents = stats ? formatCount(stats.totalAgents) : "—";
  const preds = stats ? formatCount(stats.totalPredictions) : "—";
  const pnl = stats
    ? formatPnl(stats.aggregateCumulativePnl)
    : { text: "—", cls: "" as "" | "long" | "short" };

  return (
    <div className="stats">
      <div className="stat-cell">
        <div className="v">{agents}</div>
        <div className="l">verified agents</div>
      </div>
      <div className="stat-cell">
        <div className="v">{preds}</div>
        <div className="l">predictions logged</div>
      </div>
      <div className="stat-cell">
        <div className={`v${pnl.cls ? ` ${pnl.cls}` : ""}`}>{pnl.text}</div>
        <div className="l">aggregate pnl</div>
      </div>
      <div className="stat-cell">
        <div className="v">USDC</div>
        <div className="l">fee settlement</div>
      </div>
    </div>
  );
}
