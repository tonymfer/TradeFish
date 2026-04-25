"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPnl, formatUsd } from "./format";
import type { RoundDetail, RoundDetailSettledTrade } from "./types";

type Props = {
  round: RoundDetail;
  onDismiss: () => void;
};

export function RecapCard({ round, onDismiss }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const copyAttemptedRef = useRef(false);

  const { winner, biggestSwing, contrarian, deltaPct, closeStr } = useMemo(
    () => deriveRecap(round),
    [round],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  // After slide-in completes (~600ms), capture and copy.
  useEffect(() => {
    if (copyAttemptedRef.current) return;
    const t = setTimeout(async () => {
      copyAttemptedRef.current = true;
      try {
        const node = cardRef.current;
        if (!node) return;
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(node, {
          backgroundColor: "#02060c",
          scale: 1,
          useCORS: true,
          logging: false,
        });
        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/png"),
        );
        if (!blob) return;
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof window !== "undefined" &&
          "ClipboardItem" in window
        ) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2400);
        }
      } catch (err) {
        console.warn("[RecapCard] copy failed:", err);
      }
    }, 700);
    return () => clearTimeout(t);
  }, []);

  const closeColor =
    deltaPct > 0
      ? "var(--long, #7fe0a8)"
      : deltaPct < 0
        ? "var(--short, #e07560)"
        : "var(--fg, #f0e9e1)";
  const arrow = deltaPct > 0 ? "▲" : deltaPct < 0 ? "▼" : "·";

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={onDismiss}
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 9998,
        cursor: "pointer",
      }}
    >
      <div
        ref={cardRef}
        style={{
          width: 540,
          height: 540,
          background:
            "radial-gradient(120% 80% at 0% 0%, #0d1830 0%, #02060c 60%, #02060c 100%)",
          color: "var(--fg, #f0e9e1)",
          fontFamily: "var(--font-mono, ui-monospace)",
          letterSpacing: "0.04em",
          padding: 28,
          border: "1px solid rgba(168,216,232,0.32)",
          borderRadius: 4,
          boxShadow:
            "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,216,232,0.08) inset",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--cyan, #a8d8e8)",
            textTransform: "uppercase",
            opacity: 0.9,
          }}
        >
          ▸ TRADEFISH ARENA · ROUND CLOSED
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: 38,
              lineHeight: 1,
              color: "var(--cyan, #a8d8e8)",
            }}
          >
            ${round.asset.toUpperCase()}
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.4,
              color: "var(--fg-dim, #a8b8c8)",
              maxHeight: "3.6em",
              overflow: "hidden",
            }}
          >
            R-{round.id.slice(0, 8).toUpperCase()} · {round.timeframeSec}s
            horizon
          </div>
        </div>

        <div
          style={{
            fontSize: 18,
            lineHeight: 1.3,
            color: closeColor,
            borderTop: "1px solid rgba(168,216,232,0.14)",
            borderBottom: "1px solid rgba(168,216,232,0.14)",
            padding: "12px 0",
          }}
        >
          ${round.asset.toUpperCase()} closed at {closeStr}{" "}
          <span style={{ opacity: 0.85 }}>
            ({arrow}
            {Math.abs(deltaPct).toFixed(2)}%)
          </span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <StatBox
            label="WINNER"
            primary={winner ? winner.agentName : "—"}
            secondary={winner ? formatPnl(winner.pnlUsd) : "—"}
            tone={winner && winner.pnlUsd >= 0 ? "long" : "short"}
          />
          <StatBox
            label="BIGGEST SWING"
            primary={biggestSwing ? biggestSwing.agentName : "—"}
            secondary={
              biggestSwing
                ? `${formatUsd(biggestSwing.positionSizeUsd * 100)} · ${formatPnl(biggestSwing.pnlUsd)}`
                : "—"
            }
            tone="cyan"
          />
          <StatBox
            label="CONTRARIAN"
            primary={contrarian ? contrarian.agentName : "—"}
            secondary={contrarian ? formatPnl(contrarian.pnlUsd) : "—"}
            tone={contrarian ? "long" : "neutral"}
          />
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: "var(--fg-faint, #6a7a8a)",
            borderTop: "1px solid rgba(168,216,232,0.14)",
            paddingTop: 12,
          }}
        >
          <span>tradefish-six.vercel.app</span>
          <span style={{ color: "var(--cyan, #a8d8e8)" }}>
            #PumpFunForAITraders
          </span>
        </div>
      </div>

      {copied && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            fontFamily: "var(--font-mono, ui-monospace)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--long, #7fe0a8)",
            background: "rgba(2,6,12,0.85)",
            border: "1px solid rgba(127,224,168,0.4)",
            padding: "4px 8px",
            borderRadius: 2,
          }}
        >
          COPIED ✓
        </motion.div>
      )}
    </motion.div>
  );
}

function StatBox({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: string;
  secondary: string;
  tone: "long" | "short" | "cyan" | "neutral";
}) {
  const color =
    tone === "long"
      ? "var(--long, #7fe0a8)"
      : tone === "short"
        ? "var(--short, #e07560)"
        : tone === "cyan"
          ? "var(--cyan, #a8d8e8)"
          : "var(--fg, #f0e9e1)";
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: "rgba(168,216,232,0.04)",
        border: "1px solid rgba(168,216,232,0.14)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        borderRadius: 2,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--fg-faint, #6a7a8a)",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {primary}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--fg-dim, #a8b8c8)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {secondary}
      </div>
    </div>
  );
}

function deriveRecap(round: RoundDetail) {
  const trades = round.settledTrades || [];
  const close = round.closePriceCents ?? round.openPriceCents;
  const open = round.openPriceCents || 1;
  const deltaPct = ((close - open) / open) * 100;
  const closeStr = formatUsd(close);

  const winner: RoundDetailSettledTrade | null =
    trades.length > 0
      ? trades.reduce(
          (best, t) => (t.pnlUsd > best.pnlUsd ? t : best),
          trades[0],
        )
      : null;

  const biggestSwing: RoundDetailSettledTrade | null =
    trades.length > 0
      ? trades.reduce(
          (best, t) =>
            t.positionSizeUsd > best.positionSizeUsd ? t : best,
          trades[0],
        )
      : null;

  // Contrarian: minority direction among trades, AND winning (pnl > 0).
  let contrarian: RoundDetailSettledTrade | null = null;
  if (trades.length > 1) {
    const longCount = trades.filter((t) => t.direction === "LONG").length;
    const shortCount = trades.filter((t) => t.direction === "SHORT").length;
    if (longCount !== shortCount) {
      const minority = longCount < shortCount ? "LONG" : "SHORT";
      const winners = trades.filter(
        (t) => t.direction === minority && t.pnlUsd > 0,
      );
      if (winners.length > 0) {
        contrarian = winners.reduce(
          (best, t) => (t.pnlUsd > best.pnlUsd ? t : best),
          winners[0],
        );
      }
    }
  }

  return { winner, biggestSwing, contrarian, deltaPct, closeStr };
}
