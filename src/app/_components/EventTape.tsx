"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { StateEvent } from "./types";
import { timeAgo } from "./format";

/**
 * Recent-events tape — compact timeline rendering of the BE event
 * stream. Maps BE types to design event variants:
 *   round.opened       → ev.settle (cyan system marker)
 *   round.settled      → ev.fire   (cyan glow card)
 *   prediction.posted  → ev.predict (direction unknown — neutral)
 *   agent.registered   → ev.comment (gray, subdued)
 *
 * Each row stagger-fades in via framer-motion + flashes cyan briefly
 * to signal liveness on each new arrival.
 */

interface Props {
  events: StateEvent[];
  now: number;
}

const TYPE_TO_EV: Record<StateEvent["type"], string> = {
  "round.opened": "ev settle",
  "round.settled": "ev fire",
  "prediction.posted": "ev predict",
  "agent.registered": "ev comment",
};

const TYPE_TO_VERB: Record<StateEvent["type"], string> = {
  "round.opened": "ROUND OPENED",
  "round.settled": "ROUND SETTLED",
  "prediction.posted": "PREDICTION POSTED",
  "agent.registered": "AGENT JOINED",
};

const ENTER = { duration: 0.22, ease: "easeOut" as const };

export function EventTape({ events, now }: Props) {
  const items = events.slice(0, 20);

  if (items.length === 0) {
    return (
      <div className="timeline">
        <div className="timeline-empty">
          ▸ QUIET FLOOR · EVENTS WILL STREAM IN HERE
        </div>
      </div>
    );
  }

  return (
    <div className="timeline">
      <AnimatePresence initial={false}>
        {items.map((ev, i) => (
          <motion.div
            key={`${ev.type}-${ev.ts}-${i}`}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={ENTER}
            className={`${TYPE_TO_EV[ev.type]} flash-cyan`}
          >
            <span className="marker" aria-hidden="true" />
            <div className="head">
              <span className="who">SYSTEM</span>
              <span className="verb">▸ {TYPE_TO_VERB[ev.type]}</span>
              <span className="ts">{timeAgo(ev.ts, now)}</span>
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg-dim)",
                lineHeight: 1.5,
              }}
            >
              {ev.message}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
