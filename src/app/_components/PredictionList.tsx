"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { StatePrediction } from "./types";
import { domainFrom, formatUsd, timeAgo } from "./format";
import { useLinkMeta } from "./useLinkMeta";

/**
 * Timeline of predictions in a round — each entry rendered as the
 * canonical `ev.predict.{dir}` event with a `pcard` body. Each row
 * animates in with framer-motion and flashes cyan briefly on enter.
 * Each row also renders a 64px-tall meta-thumbnail card next to the
 * thesis (pulled from /api/link-meta via the useLinkMeta hook).
 *
 * If the round is open and the swarm has been silent for >30s, a soft
 * amber "deliberating" pulse row is shown at the top, cycling through
 * the four sponsor-real persona names.
 */

interface Props {
  predictions: StatePrediction[];
  now: number;
  roundOpen?: boolean;
}

const PERSONAS = [
  "Pyth Pulse",
  "DexScreener Degen",
  "Coingecko Whale",
  "Alternative Cat",
];

const SILENT_MS = 30_000;
const ENTER = { duration: 0.22, ease: "easeOut" as const };

function dirClass(dir: StatePrediction["direction"]): string {
  return dir === "LONG" ? "long" : dir === "SHORT" ? "short" : "hold";
}

function dirVerbClass(dir: StatePrediction["direction"]): string {
  return dir === "LONG" ? "l" : dir === "SHORT" ? "s" : "h";
}

function predictionKey(p: StatePrediction, fallback: number): string {
  return `${p.agentName}-${p.createdAt}-${fallback}`;
}

function lastPredictionTs(predictions: StatePrediction[]): number {
  let max = 0;
  for (const p of predictions) {
    const t = new Date(p.createdAt).getTime();
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max;
}

export function PredictionList({ predictions, now, roundOpen = true }: Props) {
  const last = lastPredictionTs(predictions);
  const silent = roundOpen && now - last > SILENT_MS;

  return (
    <div className="timeline">
      <AnimatePresence initial={false}>
        {silent ? <ThinkingPulse key="thinking-pulse" /> : null}
        {predictions.length === 0 && !silent ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={ENTER}
            className="timeline-empty"
          >
            ▸ NO PREDICTIONS YET · WAITING ON THE SWARM
          </motion.div>
        ) : null}
        {predictions.map((p, i) => (
          <PredictionRow
            key={predictionKey(p, i)}
            prediction={p}
            now={now}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function PredictionRow({
  prediction: p,
  now,
}: {
  prediction: StatePrediction;
  now: number;
}) {
  const dc = dirClass(p.direction);
  const vc = dirVerbClass(p.direction);
  const entryUsd = formatUsd(p.entryPriceCents);
  const sizeUsd = formatUsd(p.positionSizeUsd * 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={ENTER}
      className={`ev predict ${dc} flash-cyan`}
    >
      <span className="marker" aria-hidden="true" />
      <div className="head">
        <span className="who">{p.agentName}</span>
        <span className={`verb ${vc}`}>
          ▸ {p.direction} @ {entryUsd}
        </span>
        <span className="ts">{timeAgo(p.createdAt, now)}</span>
      </div>
      <div className={`pcard ${dc}`}>
        <div className="pchips">
          <span className={`pchip ${vc}`}>{p.direction}</span>
          <span className="pchip size">
            <span className="lab">SIZE</span>
            {sizeUsd}
          </span>
          <span className="pchip">
            <span className="lab">ENTRY</span>
            {entryUsd}
          </span>
        </div>
        {p.thesis ? <div className="thesis">{p.thesis}</div> : null}
        {p.sourceUrl ? <SourceMetaCard url={p.sourceUrl} /> : null}
      </div>
    </motion.div>
  );
}

function SourceMetaCard({ url }: { url: string }) {
  const meta = useLinkMeta(url);
  const host = meta.host || domainFrom(url);

  if (!meta.image) {
    // Fallback: just a host chip + bare anchor
    return (
      <div className="sources">
        <a className="src" href={url} target="_blank" rel="noopener noreferrer">
          {host}
        </a>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="meta-card"
    >
      <span
        className="meta-thumb"
        style={{ backgroundImage: `url(${cssEscapeUrl(meta.image)})` }}
        aria-hidden="true"
      />
      <span className="meta-body">
        {meta.title ? (
          <span className="meta-title">{meta.title}</span>
        ) : (
          <span className="meta-title meta-title-fallback">{url}</span>
        )}
        <span className="meta-host">{host}</span>
      </span>
    </a>
  );
}

function cssEscapeUrl(u: string): string {
  return u.replace(/(["\\])/g, "\\$1");
}

function ThinkingPulse() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setIdx((n) => (n + 1) % PERSONAS.length),
      1500,
    );
    return () => clearInterval(t);
  }, []);
  const name = PERSONAS[idx];
  return (
    <motion.div
      key="thinking-pulse"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={ENTER}
      className="thinking-pulse"
      role="status"
      aria-live="polite"
    >
      <span className="dot" aria-hidden="true" />
      <span className="text">{name} deliberating…</span>
    </motion.div>
  );
}
