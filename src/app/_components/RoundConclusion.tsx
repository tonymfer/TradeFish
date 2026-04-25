"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo } from "react";
import type { RoundDetail } from "./types";

type Props = {
  round: RoundDetail;
  onDone: () => void;
};

const TOTAL_MS = 6000;
const REDUCED_MS = 1200;

export function RoundConclusion({ round, onDone }: Props) {
  const reduced = useReducedMotion();
  const stats = useMemo(() => computeConsensus(round), [round]);

  useEffect(() => {
    const t = setTimeout(onDone, reduced ? REDUCED_MS : TOTAL_MS);
    return () => clearTimeout(t);
  }, [onDone, reduced]);

  const question =
    (round as RoundDetail & { questionText?: string | null }).questionText ??
    `Will $${round.asset.toUpperCase()} close above its open price in the next ${round.timeframeSec}s?`;

  const open = (round.openPriceCents ?? 0) / 100;
  const close = (round.closePriceCents ?? 0) / 100;
  const deltaPct =
    open > 0 ? ((close - open) / open) * 100 : 0;
  const moved = close >= open ? "UP" : "DOWN";
  const moveColor = close >= open ? "#9af0a8" : "#f08aa0";

  const verdict =
    stats.consensus == null
      ? { label: "SPLIT — NO CONSENSUS", color: "#e8d57a" }
      : stats.consensusRight
        ? { label: "CONSENSUS WAS RIGHT", color: "#9af0a8" }
        : { label: "CONSENSUS WAS WRONG", color: "#f08aa0" };

  const longPct = stats.totalVotes > 0
    ? Math.round((stats.longCount / stats.totalVotes) * 100)
    : 0;
  const shortPct = stats.totalVotes > 0
    ? Math.round((stats.shortCount / stats.totalVotes) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={overlay}
    >
      <div style={frame}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          style={eyebrow}
        >
          ▸ ROUND CLOSED · R-{round.id.slice(0, 6).toUpperCase()}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          style={questionStyle}
        >
          {`"${question}"`}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.3 }}
          style={voteHeader}
        >
          THE SWARM VOTED
        </motion.div>

        <div style={voteBlock}>
          <VoteRow
            label="LONG"
            count={stats.longCount}
            pct={longPct}
            color="#9af0a8"
            delay={1.2}
            reduced={reduced ?? false}
          />
          <VoteRow
            label="SHORT"
            count={stats.shortCount}
            pct={shortPct}
            color="#f08aa0"
            delay={1.5}
            reduced={reduced ?? false}
          />
          {stats.holdCount > 0 && (
            <VoteRow
              label="HOLD"
              count={stats.holdCount}
              pct={
                stats.totalVotes > 0
                  ? Math.round((stats.holdCount / stats.totalVotes) * 100)
                  : 0
              }
              color="#9aa3b0"
              delay={1.8}
              reduced={reduced ?? false}
            />
          )}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.4, duration: 0.4 }}
          style={priceMoveBlock}
        >
          <div style={priceMoveLabel}>MARKET MOVED</div>
          <div style={priceMoveLine}>
            <span style={priceMoveSide}>
              ${open.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            </span>
            <span style={{ ...priceMoveArrow, color: moveColor }}>→</span>
            <span style={{ ...priceMoveSide, color: moveColor }}>
              ${close.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            </span>
            <span style={{ ...priceMovePct, color: moveColor }}>
              {close >= open ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(2)}%
            </span>
          </div>
          <div style={priceMoveSubLabel}>
            {round.asset.toUpperCase()} CLOSED {moved}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 3.4, duration: 0.45, ease: "easeOut" }}
          style={{ ...verdictStyle, borderColor: verdict.color, color: verdict.color }}
        >
          {verdict.label}
        </motion.div>

        {stats.winnerName && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 4.4, duration: 0.4 }}
            style={winnerLine}
          >
            <span style={winnerLabel}>▸ TOP AGENT</span>
            <span style={winnerName}>{stats.winnerName}</span>
            <span
              style={{
                ...winnerPnl,
                color: (stats.winnerPnl ?? 0) >= 0 ? "#9af0a8" : "#f08aa0",
              }}
            >
              {(stats.winnerPnl ?? 0) >= 0 ? "+" : ""}
              ${(stats.winnerPnl ?? 0).toFixed(2)}
            </span>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 5.0, duration: 0.3 }}
          style={footer}
        >
          NEXT ROUND OPENING…
        </motion.div>
      </div>
    </motion.div>
  );
}

function VoteRow({
  label,
  count,
  pct,
  color,
  delay,
  reduced,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
  delay: number;
  reduced: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.3 }}
      style={voteRow}
    >
      <span style={{ ...voteLabel, color }}>{label}</span>
      <div style={voteBarTrack}>
        <motion.div
          initial={{ width: reduced ? `${pct}%` : 0 }}
          animate={{ width: `${pct}%` }}
          transition={{
            delay: delay + 0.1,
            duration: reduced ? 0 : 0.7,
            ease: "easeOut",
          }}
          style={{ ...voteBarFill, background: color }}
        />
      </div>
      <span style={voteCount}>
        {count} <span style={votePct}>· {pct}%</span>
      </span>
    </motion.div>
  );
}

type Consensus = {
  longCount: number;
  shortCount: number;
  holdCount: number;
  totalVotes: number;
  consensus: "LONG" | "SHORT" | null;
  consensusRight: boolean;
  winnerName: string | null;
  winnerPnl: number | null;
};

function computeConsensus(round: RoundDetail): Consensus {
  const trades = round.settledTrades ?? [];
  const preds = round.predictions ?? [];

  // Count from settledTrades if present, else from predictions.
  const source = trades.length > 0 ? trades : preds;
  const longCount = source.filter((p) => p.direction === "LONG").length;
  const shortCount = source.filter((p) => p.direction === "SHORT").length;
  const holdCount = source.filter((p) => p.direction === "HOLD").length;
  const totalVotes = longCount + shortCount + holdCount;

  let consensus: "LONG" | "SHORT" | null = null;
  if (longCount > shortCount) consensus = "LONG";
  else if (shortCount > longCount) consensus = "SHORT";

  const open = round.openPriceCents ?? 0;
  const close = round.closePriceCents ?? open;
  const moved: "LONG" | "SHORT" = close >= open ? "LONG" : "SHORT";
  const consensusRight = consensus !== null && consensus === moved;

  let winnerName: string | null = null;
  let winnerPnl: number | null = null;
  if (trades.length > 0) {
    const top = [...trades].sort((a, b) => b.pnlUsd - a.pnlUsd)[0];
    if (top) {
      winnerName = top.agentName;
      winnerPnl = top.pnlUsd;
    }
  }

  return {
    longCount,
    shortCount,
    holdCount,
    totalVotes,
    consensus,
    consensusRight,
    winnerName,
    winnerPnl,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background:
    "radial-gradient(ellipse at center, rgba(8,17,31,0.97) 0%, rgba(2,6,12,0.99) 70%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  color: "var(--fg, #f0e9e1)",
  padding: 32,
};

const frame: React.CSSProperties = {
  width: "min(960px, 100%)",
  display: "flex",
  flexDirection: "column",
  gap: 24,
};

const eyebrow: React.CSSProperties = {
  fontSize: 14,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--cyan, #a8d8e8)",
};

const questionStyle: React.CSSProperties = {
  fontSize: 28,
  lineHeight: 1.25,
  color: "var(--fg, #f0e9e1)",
  letterSpacing: "0.01em",
  fontStyle: "italic",
  opacity: 0.92,
};

const voteHeader: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--fg-faint, #6a7585)",
  marginTop: 8,
};

const voteBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const voteRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "84px 1fr 120px",
  alignItems: "center",
  gap: 16,
  fontSize: 18,
};

const voteLabel: React.CSSProperties = {
  letterSpacing: "0.18em",
  fontWeight: 600,
};

const voteBarTrack: React.CSSProperties = {
  height: 14,
  background: "rgba(255,255,255,0.06)",
  borderRadius: 2,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.08)",
};

const voteBarFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 2,
};

const voteCount: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  color: "var(--fg, #f0e9e1)",
};

const votePct: React.CSSProperties = {
  color: "var(--fg-faint, #6a7585)",
  fontSize: 14,
};

const priceMoveBlock: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  borderTop: "1px solid rgba(168, 216, 232, 0.18)",
  borderBottom: "1px solid rgba(168, 216, 232, 0.18)",
  padding: "20px 0",
};

const priceMoveLabel: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--fg-faint, #6a7585)",
};

const priceMoveLine: React.CSSProperties = {
  display: "flex",
  gap: 18,
  alignItems: "baseline",
  fontVariantNumeric: "tabular-nums",
};

const priceMoveSide: React.CSSProperties = {
  fontSize: 38,
  letterSpacing: "0.02em",
};

const priceMoveArrow: React.CSSProperties = {
  fontSize: 30,
};

const priceMovePct: React.CSSProperties = {
  fontSize: 24,
  marginLeft: "auto",
};

const priceMoveSubLabel: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--fg-faint, #6a7585)",
};

const verdictStyle: React.CSSProperties = {
  marginTop: 16,
  alignSelf: "center",
  fontSize: 28,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  padding: "16px 32px",
  border: "2px solid",
  borderRadius: 4,
  background: "rgba(0,0,0,0.35)",
};

const winnerLine: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 18,
  fontSize: 18,
  marginTop: 8,
};

const winnerLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.22em",
  color: "var(--cyan, #a8d8e8)",
};

const winnerName: React.CSSProperties = {
  letterSpacing: "0.06em",
  color: "var(--fg, #f0e9e1)",
};

const winnerPnl: React.CSSProperties = {
  marginLeft: "auto",
  fontVariantNumeric: "tabular-nums",
  fontSize: 22,
};

const footer: React.CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  letterSpacing: "0.3em",
  textTransform: "uppercase",
  color: "var(--fg-faint, #6a7585)",
  textAlign: "center",
};
