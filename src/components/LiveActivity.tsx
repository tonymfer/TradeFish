"use client";

import { useEffect, useState } from "react";
import type { StateEvent, StateResponse } from "../app/_components/types";

/**
 * Streaming agent-activity log shown in the onboarding section.
 * Polls GET /api/state every 2s and renders the last MAX_ROWS entries
 * from `recentEvents`, mapped onto the row layout (ts/who/msg/pos/pnl).
 *
 * BE serializes recentEvents.message as pre-rendered strings — we parse
 * them here for the per-type fields the row layout cares about. The
 * regex shapes mirror src/app/api/state/route.ts at the time of T30.
 */

interface ActivityRow {
  key: string;
  ts: string;
  who: string;
  msg: string;
  pos: string;
  posCls: "long" | "short" | "hold" | "";
  pnl: string;
  pnlCls: "up" | "down" | "";
}

const MAX_ROWS = 8;
const POLL_MS = 2000;

// Positional regex groups (ES2017 target — no named groups).
//   PRED_RE:    [1]=who [2]=dir [3]=asset [4]=size
//   OPENED_RE:  [1]=asset [2]=price
//   SETTLED_RE: [1]=asset [2]=open [3]=close
//   REG_RE:     [1]=who
const PRED_RE = /^(.+?)\s+(LONG|SHORT|HOLD)\s+(\S+)\s+@\s+\$([0-9]+(?:\.[0-9]+)?)/i;
const OPENED_RE = /opened on\s+(\S+)\s+@\s+(\$[0-9,.]+|\?)/i;
const SETTLED_RE =
  /settled on\s+(\S+):\s+(\$[0-9,.]+|\?)\s+→\s+(\$[0-9,.]+|\?)/i;
const REG_RE = /^(.+?)\s+registered$/i;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function dirCls(dir: string): "long" | "short" | "hold" {
  if (dir === "LONG") return "long";
  if (dir === "SHORT") return "short";
  return "hold";
}

function eventToRow(event: StateEvent, index: number): ActivityRow {
  const ts = fmtTs(event.ts);
  const key = `${event.ts}-${event.type}-${index}`;
  const msg = event.message ?? "";

  if (event.type === "prediction.posted") {
    const m = PRED_RE.exec(msg);
    if (m) {
      const who = m[1].trim().toUpperCase();
      const dir = m[2].toUpperCase() as "LONG" | "SHORT" | "HOLD";
      const asset = m[3];
      const size = Number(m[4]);
      return {
        key,
        ts,
        who,
        msg: `${dir} ${asset} · open position`,
        pos: `${dir}${dir === "HOLD" ? "" : ` $${size.toFixed(0)}`}`,
        posCls: dirCls(dir),
        pnl: "—",
        pnlCls: "",
      };
    }
    return {
      key,
      ts,
      who: "AGENT",
      msg: truncate(msg, 60),
      pos: "—",
      posCls: "",
      pnl: "—",
      pnlCls: "",
    };
  }

  if (event.type === "round.settled") {
    const m = SETTLED_RE.exec(msg);
    const close = m ? m[3] : "?";
    return {
      key,
      ts,
      who: "ROUND",
      msg: `settled @ ${close}`,
      pos: "—",
      posCls: "",
      pnl: "",
      pnlCls: "",
    };
  }

  if (event.type === "round.opened") {
    const m = OPENED_RE.exec(msg);
    const open = m ? m[2] : "?";
    return {
      key,
      ts,
      who: "ROUND",
      msg: `opened @ ${open}`,
      pos: "—",
      posCls: "",
      pnl: "",
      pnlCls: "",
    };
  }

  if (event.type === "agent.registered") {
    const m = REG_RE.exec(msg);
    const who = m ? m[1].trim() : "AGENT";
    return {
      key,
      ts,
      who: "NEW",
      msg: `${who} registered`,
      pos: "JOIN",
      posCls: "",
      pnl: "",
      pnlCls: "",
    };
  }

  return {
    key,
    ts,
    who: "—",
    msg: truncate(msg, 60),
    pos: "—",
    posCls: "",
    pnl: "",
    pnlCls: "",
  };
}

export function LiveActivity() {
  const [rows, setRows] = useState<ActivityRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as StateResponse;
        if (cancelled) return;
        const events = (json.recentEvents ?? []).slice(0, MAX_ROWS);
        // recentEvents is sorted newest-first by BE; reverse so newest
        // sits at the bottom of the rendered tape (matches the prior
        // append-style feel and reads top-to-bottom chronologically).
        const next = events.map(eventToRow).reverse();
        setRows(next);
      } catch {
        // Swallow — keep last-known rows on transient errors.
      }
    }

    tick();
    const handle = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, []);

  return (
    <div className="activity-rows" aria-live="polite" aria-atomic="false">
      {rows.length === 0 ? (
        <div className="activity-row" aria-hidden="true">
          <span className="ts">--:--</span>
          <span className="who">…</span>
          <span className="msg">connecting to /api/state</span>
          <span className="pos">—</span>
          <span className="pnl">—</span>
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="activity-row">
            <span className="ts">{row.ts}</span>
            <span className="who">{row.who}</span>
            <span className="msg">{row.msg}</span>
            <span className={`pos${row.posCls ? ` ${row.posCls}` : ""}`}>
              {row.pos}
            </span>
            <span className={`pnl${row.pnlCls ? ` ${row.pnlCls}` : ""}`}>
              {row.pnl || "—"}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
