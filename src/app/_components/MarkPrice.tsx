"use client";

/**
 * MarkPrice
 * ---------
 * Live-polling, animated price display for the arena side rail.
 * Polls /api/oracle/price every POLL_MS and renders the value with:
 *   - direction color (lime up / rose down) derived from prev value
 *   - background flash on every successful tick
 *   - direction arrow ▲ / ▼ that briefly intensifies on change
 *   - delta-vs-open % readout below the headline price
 *
 * Self-contained: own polling loop, own animation state. The arena's
 * 1s state poll continues as-is for the rest of the page.
 */
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { formatUsd } from "./format";

type Props = {
  /** Round open price in cents — used for the % delta vs open readout. */
  openPriceCents: number | null | undefined;
};

const POLL_MS = 500;
const FLASH_MS = 280;

type Direction = "up" | "down" | "flat";

export function MarkPrice({ openPriceCents }: Props) {
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [dir, setDir] = useState<Direction>("flat");
  const [flashKey, setFlashKey] = useState(0);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch("/api/oracle/price", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { priceCents?: number };
        if (cancelled || typeof json.priceCents !== "number") return;
        const next = json.priceCents;
        const last = lastRef.current;
        if (last === null) {
          setDir("flat");
        } else if (next > last) {
          setDir("up");
        } else if (next < last) {
          setDir("down");
        }
        // Flash on every tick where the value actually changed.
        if (last !== next) {
          setFlashKey((k) => k + 1);
        }
        lastRef.current = next;
        setPriceCents(next);
      } catch {
        /* silent — keep last good value, retry next tick */
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, POLL_MS);
        }
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dirColor =
    dir === "up"
      ? "var(--long, #9af0a8)"
      : dir === "down"
        ? "var(--short, #f08aa0)"
        : "var(--fg, #f0e9e1)";
  const flashBg =
    dir === "up"
      ? "rgba(154, 240, 168, 0.18)"
      : dir === "down"
        ? "rgba(240, 138, 160, 0.18)"
        : "rgba(168, 216, 232, 0.10)";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "·";

  const open = openPriceCents ?? null;
  const deltaPct =
    open && open > 0 && priceCents !== null
      ? ((priceCents - open) / open) * 100
      : null;
  const deltaSign =
    deltaPct === null ? "" : deltaPct > 0 ? "+" : deltaPct < 0 ? "" : "";
  const deltaColor =
    deltaPct === null
      ? "var(--fg-faint, #6a7585)"
      : deltaPct > 0
        ? "var(--long, #9af0a8)"
        : deltaPct < 0
          ? "var(--short, #f08aa0)"
          : "var(--fg-faint, #6a7585)";

  return (
    <div className="price-card" style={{ position: "relative", overflow: "hidden" }}>
      {/* Background flash, keyed on flashKey so each new tick re-mounts and re-runs the fade-out. */}
      <motion.div
        key={flashKey}
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 0 }}
        transition={{ duration: FLASH_MS / 1000, ease: "easeOut" }}
        style={{
          position: "absolute",
          inset: 0,
          background: flashBg,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div className="lbl" style={{ position: "relative", zIndex: 1 }}>
        ▸ MARK PRICE
      </div>
      <div
        className="px"
        style={{
          position: "relative",
          zIndex: 1,
          color: dirColor,
          transition: "color 220ms ease",
          fontVariantNumeric: "tabular-nums",
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <motion.span
          key={priceCents ?? "loading"}
          initial={{ y: dir === "up" ? -3 : dir === "down" ? 3 : 0, opacity: 0.3 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          {priceCents !== null ? formatUsd(priceCents) : "—"}
        </motion.span>
        <span style={{ fontSize: "0.5em", color: dirColor, transition: "color 220ms ease" }}>
          {arrow}
        </span>
      </div>
      <div
        className="delta"
        style={{
          position: "relative",
          zIndex: 1,
          color: deltaColor,
          transition: "color 220ms ease",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {deltaPct !== null
          ? `${deltaSign}${deltaPct.toFixed(2)}% vs open`
          : open
            ? "open · awaiting tick"
            : "—"}
      </div>
      <div className="src" style={{ position: "relative", zIndex: 1 }}>
        SOURCE <span className="v">PYTH HERMES · 500ms</span>
      </div>
    </div>
  );
}
