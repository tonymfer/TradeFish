"use client";

/**
 * RecapCard
 * ---------
 * 1080×1080 tweet-styled card that slides in from the bottom-right when a
 * round flips open → settled. After the slide-in animation completes we use
 * html2canvas to copy a PNG of the card to the clipboard so the host can
 * paste straight into a tweet. Click anywhere or hit Escape to dismiss.
 *
 * The card is rendered at native 1080px and scaled down with CSS transform,
 * so the screenshot is full-resolution but the on-screen footprint stays
 * tweet-thumbnail-sized.
 */
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPnl, formatUsd } from "./format";
import type { RoundDetail } from "./types";

type Props = {
  round: RoundDetail;
  onDismiss: () => void;
};

const CARD_PX = 1080;
const SCREEN_SCALE = 0.42; // 1080 * 0.42 ≈ 453px on screen
const COPY_DELAY_MS = 600;

export function RecapCard({ round, onDismiss }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const dismissedRef = useRef(false);

  const stats = useMemo(() => computeStats(round), [round]);

  // Esc to dismiss.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-copy PNG to clipboard ~600ms after slide-in.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || !cardRef.current) return;
      try {
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(cardRef.current, {
          backgroundColor: null,
          scale: 1,
          logging: false,
          useCORS: true,
        });
        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/png"),
        );
        if (!blob) {
          if (!cancelled) setCopied("fail");
          return;
        }
        if (
          typeof ClipboardItem !== "undefined" &&
          navigator.clipboard?.write
        ) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          if (!cancelled) setCopied("ok");
        } else {
          if (!cancelled) setCopied("fail");
        }
      } catch {
        if (!cancelled) setCopied("fail");
      }
    }, COPY_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  }

  const close = stats.closeCents;
  const open = round.openPriceCents;
  const hasClose = close !== null;
  const pctChange =
    hasClose && open > 0 ? ((close - open) / open) * 100 : 0;
  const arrow = pctChange >= 0 ? "▲" : "▼";
  const arrowColor =
    pctChange >= 0 ? "var(--up, #6fcf97)" : "var(--down, #eb5757)";

  return (
    <motion.div
      style={wrapStyle}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      onClick={dismiss}
      role="button"
      aria-label="Round recap — click to dismiss"
    >
      <div style={scaleStyle}>
        <div ref={cardRef} style={cardStyle}>
          <div style={eyebrowStyle}>
            ▸ TRADEFISH ARENA · ROUND CLOSED
          </div>

          <div style={assetLineStyle}>${round.asset.toUpperCase()}</div>
          <div style={questionLineStyle}>
            {questionFromRound(round)}
          </div>

          <div style={resultLineStyle}>
            <span>${round.asset.toUpperCase()} closed at </span>
            <span style={{ color: "var(--cyan, #a8d8e8)" }}>
              {hasClose ? formatUsd(close) : "—"}
            </span>
            {hasClose && (
              <>
                {" "}
                <span style={{ color: arrowColor }}>
                  ({arrow}
                  {pctChange.toFixed(2)}%)
                </span>
              </>
            )}
          </div>

          <div style={tilesRowStyle}>
            <Tile
              label="WINNER"
              primary={stats.winner?.agentName ?? "—"}
              secondary={
                stats.winner ? formatPnl(stats.winner.pnlUsd) : "no trades"
              }
              accent={stats.winner ? "var(--up, #6fcf97)" : undefined}
            />
            <Tile
              label="BIGGEST SWING"
              primary={stats.biggestSwing?.agentName ?? "—"}
              secondary={
                stats.biggestSwing
                  ? `$${Math.round(stats.biggestSwing.positionSizeUsd).toLocaleString()} · ${formatPnl(stats.biggestSwing.pnlUsd)}`
                  : "—"
              }
            />
            <Tile
              label="CONTRARIAN"
              primary={stats.contrarian?.agentName ?? "—"}
              secondary={
                stats.contrarian
                  ? formatPnl(stats.contrarian.pnlUsd)
                  : "—"
              }
              accent={stats.contrarian ? "var(--cyan, #a8d8e8)" : undefined}
            />
          </div>

          <div style={footerStyle}>
            tradefish.app · #TradeFish
          </div>
        </div>
      </div>

      {copied === "ok" && (
        <div style={toastStyle} onClick={(e) => e.stopPropagation()}>
          COPIED ✓
        </div>
      )}
      {copied === "fail" && (
        <div
          style={{ ...toastStyle, color: "var(--down, #eb5757)" }}
          onClick={(e) => e.stopPropagation()}
        >
          COPY FAILED
        </div>
      )}
    </motion.div>
  );
}

function Tile({
  label,
  primary,
  secondary,
  accent,
}: {
  label: string;
  primary: string;
  secondary: string;
  accent?: string;
}) {
  return (
    <div style={tileStyle}>
      <div style={tileLabelStyle}>{label}</div>
      <div style={{ ...tilePrimaryStyle, color: accent ?? "var(--fg, #f0e9e1)" }}>
        {primary}
      </div>
      <div style={tileSecondaryStyle}>{secondary}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stat extraction
// ─────────────────────────────────────────────────────────────────────

type Stats = {
  winner: RoundDetail["settledTrades"][number] | null;
  biggestSwing: RoundDetail["settledTrades"][number] | null;
  contrarian: RoundDetail["settledTrades"][number] | null;
  closeCents: number | null;
};

function computeStats(round: RoundDetail): Stats {
  const trades = round.settledTrades ?? [];
  if (trades.length === 0) {
    return {
      winner: null,
      biggestSwing: null,
      contrarian: null,
      closeCents: round.closePriceCents,
    };
  }

  const winner = [...trades].sort((a, b) => b.pnlUsd - a.pnlUsd)[0] ?? null;
  const biggestSwing =
    [...trades].sort(
      (a, b) => Math.abs(b.positionSizeUsd) - Math.abs(a.positionSizeUsd),
    )[0] ?? null;

  // Contrarian = winning trade on the minority side. Ignore HOLD.
  const longCount = trades.filter((t) => t.direction === "LONG").length;
  const shortCount = trades.filter((t) => t.direction === "SHORT").length;
  let minoritySide: "LONG" | "SHORT" | null = null;
  if (longCount > 0 && shortCount > 0) {
    minoritySide = longCount < shortCount ? "LONG" : "SHORT";
  }
  const contrarian = minoritySide
    ? ([...trades]
        .filter((t) => t.direction === minoritySide && t.pnlUsd > 0)
        .sort((a, b) => b.pnlUsd - a.pnlUsd)[0] ?? null)
    : null;

  return {
    winner,
    biggestSwing,
    contrarian,
    closeCents: round.closePriceCents,
  };
}

function questionFromRound(round: RoundDetail): string {
  // The state.openRound.questionText path is canonical; RoundDetail may
  // not yet expose it (backend in flight). Fall back to the asset prompt.
  const maybe = (round as RoundDetail & { questionText?: string | null })
    .questionText;
  if (typeof maybe === "string" && maybe.trim().length > 0) return maybe;
  return `Will $${round.asset.toUpperCase()} close above its open price in the next ${round.timeframeSec}s?`;
}

// ─────────────────────────────────────────────────────────────────────
// Styles — all inline so we don't touch globals.css
// ─────────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  position: "fixed",
  right: 24,
  bottom: 24,
  zIndex: 9998,
  cursor: "pointer",
  // Native card is 1080; shrink the layout footprint via the inner scale.
  width: CARD_PX * SCREEN_SCALE,
  height: CARD_PX * SCREEN_SCALE,
};

const scaleStyle: React.CSSProperties = {
  width: CARD_PX,
  height: CARD_PX,
  transform: `scale(${SCREEN_SCALE})`,
  transformOrigin: "top left",
};

const cardStyle: React.CSSProperties = {
  width: CARD_PX,
  height: CARD_PX,
  background:
    "linear-gradient(180deg, #08111f 0%, #050a14 100%)",
  border: "2px solid rgba(168, 216, 232, 0.35)",
  borderRadius: 24,
  boxShadow:
    "0 30px 80px rgba(0,0,0,0.55), 0 0 60px rgba(168, 216, 232, 0.12)",
  padding: 72,
  display: "flex",
  flexDirection: "column",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  color: "var(--fg, #f0e9e1)",
  position: "relative",
  overflow: "hidden",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 24,
  letterSpacing: "0.18em",
  color: "var(--cyan, #a8d8e8)",
  textTransform: "uppercase",
  marginBottom: 32,
};

const assetLineStyle: React.CSSProperties = {
  fontSize: 110,
  lineHeight: 1.05,
  color: "var(--cyan, #a8d8e8)",
  letterSpacing: "0.04em",
  marginBottom: 12,
};

const questionLineStyle: React.CSSProperties = {
  fontSize: 34,
  lineHeight: 1.3,
  color: "var(--fg, #f0e9e1)",
  marginBottom: 48,
  maxWidth: "100%",
};

const resultLineStyle: React.CSSProperties = {
  fontSize: 40,
  lineHeight: 1.2,
  color: "var(--fg-dim, #a8b8c8)",
  marginBottom: 56,
};

const tilesRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 24,
  marginBottom: "auto",
};

const tileStyle: React.CSSProperties = {
  background: "rgba(168, 216, 232, 0.05)",
  border: "1px solid rgba(168, 216, 232, 0.2)",
  borderRadius: 16,
  padding: "28px 24px",
  minHeight: 220,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const tileLabelStyle: React.CSSProperties = {
  fontSize: 20,
  letterSpacing: "0.16em",
  color: "var(--fg-faint, #6a7a8a)",
};

const tilePrimaryStyle: React.CSSProperties = {
  fontSize: 36,
  lineHeight: 1.15,
  letterSpacing: "0.02em",
  wordBreak: "break-word",
};

const tileSecondaryStyle: React.CSSProperties = {
  fontSize: 24,
  color: "var(--fg-dim, #a8b8c8)",
  marginTop: "auto",
};

const footerStyle: React.CSSProperties = {
  fontSize: 22,
  letterSpacing: "0.18em",
  color: "var(--fg-faint, #6a7a8a)",
  textAlign: "center",
  marginTop: 48,
  textTransform: "uppercase",
};

const toastStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  padding: "6px 10px",
  borderRadius: 4,
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: 11,
  letterSpacing: "0.18em",
  color: "var(--up, #6fcf97)",
  background: "rgba(0,0,0,0.6)",
  border: "1px solid rgba(168, 216, 232, 0.3)",
  pointerEvents: "none",
};
