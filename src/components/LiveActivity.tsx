"use client";

import { useEffect, useState } from "react";

/**
 * Streaming agent-activity log shown in the onboarding section.
 * Seeded with 7 deterministic rows; appends a new row every 2.4s,
 * capped at 8 rows. Pure presentational — no real data feed.
 */

interface ActivityRow {
  id: number;
  ts: string;
  who: string;
  msg: string;
  pos: string;
  posCls: "long" | "short" | "";
  pnl: string;
  pnlCls: "up" | "down" | "";
}

const SEED: ActivityRow[] = [
  {
    id: 1,
    ts: "14:02",
    who: "NANSEN",
    msg: "smart money +1,420 BTC, 60m",
    pos: "LONG 0.4",
    posCls: "long",
    pnl: "+$24",
    pnlCls: "up",
  },
  {
    id: 2,
    ts: "14:02",
    who: "BNGUN",
    msg: "liquidity ladder thinning above 64.4k",
    pos: "LONG 0.6",
    posCls: "long",
    pnl: "+$38",
    pnlCls: "up",
  },
  {
    id: 3,
    ts: "14:03",
    who: "VIRTUALS",
    msg: "contrarian-7: sentiment overheated",
    pos: "SHORT 0.3",
    posCls: "short",
    pnl: "−$12",
    pnlCls: "down",
  },
  {
    id: 4,
    ts: "14:03",
    who: "FLOCK",
    msg: "3/4 sub-agents agree LONG",
    pos: "LONG 0.5",
    posCls: "long",
    pnl: "+$31",
    pnlCls: "up",
  },
  {
    id: 5,
    ts: "14:04",
    who: "RISK",
    msg: "funding spike. recommend HOLD.",
    pos: "HOLD",
    posCls: "",
    pnl: "±$0",
    pnlCls: "",
  },
  {
    id: 6,
    ts: "14:04",
    who: "PCS",
    msg: "pool depth 2.1M USDT above mark",
    pos: "LONG 0.4",
    posCls: "long",
    pnl: "+$18",
    pnlCls: "up",
  },
  {
    id: 7,
    ts: "14:05",
    who: "CONSENSUS",
    msg: "tilt updated · LONG 67% conf",
    pos: "LONG 1.0",
    posCls: "long",
    pnl: "+$94",
    pnlCls: "up",
  },
];

const STREAM: Array<Omit<ActivityRow, "id" | "ts">> = [
  {
    who: "NANSEN",
    msg: "CEX→cold flow positive +$8.2M",
    pos: "LONG 0.5",
    posCls: "long",
    pnl: "+$42",
    pnlCls: "up",
  },
  {
    who: "BNGUN",
    msg: "mempool: 12 pending bids @ 64,250",
    pos: "LONG 0.3",
    posCls: "long",
    pnl: "+$15",
    pnlCls: "up",
  },
  {
    who: "VIRTUALS",
    msg: "twitter velocity 96th pct",
    pos: "SHORT 0.2",
    posCls: "short",
    pnl: "−$8",
    pnlCls: "down",
  },
  {
    who: "PCS",
    msg: "whale wallet 0x4f..2a accumulating",
    pos: "LONG 0.4",
    posCls: "long",
    pnl: "+$22",
    pnlCls: "up",
  },
  {
    who: "FLOCK",
    msg: "ensemble disagreement narrowing",
    pos: "LONG 0.6",
    posCls: "long",
    pnl: "+$34",
    pnlCls: "up",
  },
  {
    who: "CONSENSUS",
    msg: "updated · LONG 71% · MED risk",
    pos: "LONG 1.2",
    posCls: "long",
    pnl: "+$112",
    pnlCls: "up",
  },
];

const MAX_ROWS = 8;
const TICK_MS = 2400;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function LiveActivity() {
  const [rows, setRows] = useState<ActivityRow[]>(SEED);

  useEffect(() => {
    let nextId = SEED.length + 1;
    let streamIndex = 0;

    const tick = () => {
      const seed = STREAM[streamIndex % STREAM.length];
      streamIndex += 1;
      const now = new Date();
      const ts = `${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
      const next: ActivityRow = { id: nextId, ts, ...seed };
      nextId += 1;
      setRows((prev) => {
        const merged = [...prev, next];
        return merged.length > MAX_ROWS
          ? merged.slice(merged.length - MAX_ROWS)
          : merged;
      });
    };

    const handle = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(handle);
  }, []);

  return (
    <div className="activity-rows" aria-live="polite" aria-atomic="false">
      {rows.map((row) => (
        <div key={row.id} className="activity-row">
          <span className="ts">{row.ts}</span>
          <span className="who">{row.who}</span>
          <span className="msg">{row.msg}</span>
          <span className={`pos${row.posCls ? ` ${row.posCls}` : ""}`}>
            {row.pos}
          </span>
          <span className={`pnl${row.pnlCls ? ` ${row.pnlCls}` : ""}`}>
            {row.pnl}
          </span>
        </div>
      ))}
    </div>
  );
}
