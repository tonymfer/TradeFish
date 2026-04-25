"use client";

import type { StateOpenRound } from "./types";
import { clamp, formatUsd, secondsLeft } from "./format";

/**
 * 3-track UP/DOWN bar — the canonical question.html top-of-main widget.
 * Tracks: raw vote count, PnL-weighted (we use confidence-weighted as
 * proxy), and notional ($) exposure. Plus a firing-status countdown
 * row that pulses while the round is open.
 */

interface Props {
  round: StateOpenRound | null;
  now: number;
}

export function UpDownBar({ round, now }: Props) {
  const predictions = round?.predictions ?? [];
  const longs = predictions.filter((p) => p.direction === "LONG").length;
  const shorts = predictions.filter((p) => p.direction === "SHORT").length;
  const holds = predictions.filter((p) => p.direction === "HOLD").length;
  const total = Math.max(1, longs + shorts + holds);
  const longPct = (longs / total) * 100;
  const holdPct = (holds / total) * 100;
  const shortPct = (shorts / total) * 100;

  // Notional exposure (USD by direction).
  const notLong = predictions
    .filter((p) => p.direction === "LONG")
    .reduce((s, p) => s + p.positionSizeUsd, 0);
  const notShort = predictions
    .filter((p) => p.direction === "SHORT")
    .reduce((s, p) => s + p.positionSizeUsd, 0);
  const notTotal = Math.max(1, notLong + notShort);
  const notLongPct = (notLong / notTotal) * 100;
  const notShortPct = (notShort / notTotal) * 100;

  // PnL-weighted leans on confidence we don't have — proxy with size.
  const wLong = notLong;
  const wShort = notShort;
  const wHold = predictions
    .filter((p) => p.direction === "HOLD")
    .reduce((s, p) => s + p.positionSizeUsd, 0);
  const wTotal = Math.max(1, wLong + wShort + wHold);
  const wLongPct = (wLong / wTotal) * 100;
  const wHoldPct = (wHold / wTotal) * 100;
  const wShortPct = (wShort / wTotal) * 100;

  const remaining = round
    ? secondsLeft(round.openedAt, round.timeframeSec, now)
    : 0;
  const lean =
    wLongPct >= 60 ? "LONG" : wShortPct >= 60 ? "SHORT" : "CONTESTED";
  const needToFire =
    wLongPct < 60 && wShortPct < 60
      ? `+${(60 - Math.max(wLongPct, wShortPct)).toFixed(0)}pp`
      : "0pp";

  return (
    <div className="bar-block">
      <div className="bar-rows">
        <div className="bar-row">
          <span className="lbl">
            ▸ RAW VOTE <span className="num">{predictions.length} agents</span>
          </span>
          <div className="track">
            <div className="seg long" style={{ width: `${longPct}%` }} />
            <div className="seg hold" style={{ width: `${holdPct}%` }} />
            <div className="seg short" style={{ width: `${shortPct}%` }} />
            <div className="threshold" />
          </div>
          <span className="val">
            <span className="l">L {clamp(longPct, 0, 100).toFixed(0)}%</span> ·{" "}
            <span className="h">H {clamp(holdPct, 0, 100).toFixed(0)}%</span> ·{" "}
            <span className="s">S {clamp(shortPct, 0, 100).toFixed(0)}%</span>
          </span>
        </div>

        <div className="bar-row">
          <span className="lbl">
            ▸ SIZE-WEIGHTED <span className="num">$ × direction</span>
          </span>
          <div className="track thin">
            <div className="seg long" style={{ width: `${wLongPct}%` }} />
            <div className="seg hold" style={{ width: `${wHoldPct}%` }} />
            <div className="seg short" style={{ width: `${wShortPct}%` }} />
          </div>
          <span className="val">
            <span
              className={lean === "LONG" ? "l" : lean === "SHORT" ? "s" : ""}
            >
              {lean === "CONTESTED"
                ? "CONTESTED"
                : `${lean} · ${(lean === "LONG" ? wLongPct : wShortPct).toFixed(0)}%`}
            </span>
          </span>
        </div>

        <div className="bar-row">
          <span className="lbl">
            ▸ NOTIONAL <span className="num">$ exposure</span>
          </span>
          <div className="track expo">
            <div className="seg long" style={{ width: `${notLongPct}%` }} />
            <div className="seg short" style={{ width: `${notShortPct}%` }} />
          </div>
          <span className="val">
            <span className="l">+{formatUsd(notLong * 100)}</span> ·{" "}
            <span className="s">-{formatUsd(notShort * 100)}</span>
          </span>
        </div>
      </div>

      <div className="firing-status">
        <span className="pulse" />
        <span>
          ROUND {round?.status?.toUpperCase() ?? "WAITING"}{" "}
          {round ? (
            <>
              ▸ <span className="v">{formatTimeLeft(remaining)} LEFT</span>
            </>
          ) : null}
        </span>
        <span>·</span>
        <span>
          NEEDS <span className="v">{needToFire}</span> TO FIRE
        </span>
        <span className="clk">
          {round ? formatTimeLeft(remaining) : "--:--"}
        </span>
      </div>
    </div>
  );
}

function formatTimeLeft(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
