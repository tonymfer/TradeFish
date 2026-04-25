"use client";

/**
 * RoundIntro
 * ----------
 * The "audience hook" overlay. Plays for ~3.5s when the user lands on
 * /arena?fresh=1 right after creating a round. Sequence:
 *   1. asset symbol pulses in
 *   2. their question types out monospace, with a blinking caret
 *   3. 3 → 2 → 1 countdown
 *   4. white flash, then onDone fires and the overlay unmounts
 *
 * Pure visual — no data fetching, no side effects beyond timers.
 * Honors prefers-reduced-motion: static render, fires onDone after 800ms.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  asset: string;
  questionText: string;
  onDone: () => void;
};

const HARD_CAP_MS = 3500;
const COUNTDOWN_STEP_MS = 600;
const COUNTDOWN_TOTAL_MS = COUNTDOWN_STEP_MS * 3;
const FLASH_MS = 120;
const REDUCED_HOLD_MS = 800;
const ASSET_PULSE_MS = 600;
// Reserve ~250ms for asset pulse settle before typing kicks in.
const TYPING_BUDGET_MS = HARD_CAP_MS - COUNTDOWN_TOTAL_MS - FLASH_MS - 250;

export function RoundIntro({ asset, questionText, onDone }: Props) {
  const symbol = asset.startsWith("$") ? asset : `$${asset.toUpperCase()}`;
  const reducedMotion = usePrefersReducedMotion();

  const charDelayMs = useMemo(() => {
    if (questionText.length === 0) return 28;
    const ideal = 28;
    const fitted = Math.floor(TYPING_BUDGET_MS / questionText.length);
    return Math.max(10, Math.min(ideal, fitted));
  }, [questionText]);

  const [typedCount, setTypedCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const doneFiredRef = useRef(false);
  const countdownStartedRef = useRef(false);

  // Pin onDone via ref. The parent (HomeClient) re-renders every poll
  // tick (~1s) and creates a new function reference for handleIntroDone
  // each time. If onDone is in any effect's dep array, the cleanup runs
  // mid-sequence and clears our timers — that's how the countdown ended
  // up frozen on "3" in production.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Reduced-motion fast path: render static, then bail out.
  useEffect(() => {
    if (!reducedMotion) return;
    const fillTimer = setTimeout(
      () => setTypedCount(questionText.length),
      0,
    );
    const doneTimer = setTimeout(() => {
      if (doneFiredRef.current) return;
      doneFiredRef.current = true;
      onDoneRef.current();
    }, REDUCED_HOLD_MS);
    return () => {
      clearTimeout(fillTimer);
      clearTimeout(doneTimer);
    };
  }, [reducedMotion, questionText.length]);

  // Type the question one character at a time.
  useEffect(() => {
    if (reducedMotion) return;
    if (typedCount >= questionText.length) return;
    const t = setTimeout(() => setTypedCount((c) => c + 1), charDelayMs);
    return () => clearTimeout(t);
  }, [reducedMotion, typedCount, questionText.length, charDelayMs]);

  // After typing finishes, run the 3-2-1 countdown once. Gated by a ref
  // so each setCountdown() inside this effect doesn't re-trigger it (the
  // previous countdown-in-deps version froze on "3" because cleanup
  // canceled the 2/1/flash/done timers as soon as 3 was set).
  useEffect(() => {
    if (reducedMotion) return;
    if (typedCount < questionText.length) return;
    if (countdownStartedRef.current) return;
    countdownStartedRef.current = true;

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setCountdown(3), 0));
    timers.push(setTimeout(() => setCountdown(2), COUNTDOWN_STEP_MS));
    timers.push(setTimeout(() => setCountdown(1), COUNTDOWN_STEP_MS * 2));
    timers.push(setTimeout(() => setFlash(true), COUNTDOWN_STEP_MS * 3));
    timers.push(
      setTimeout(
        () => {
          if (doneFiredRef.current) return;
          doneFiredRef.current = true;
          onDoneRef.current();
        },
        COUNTDOWN_STEP_MS * 3 + FLASH_MS,
      ),
    );

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [reducedMotion, typedCount, questionText.length]);

  const typed = questionText.slice(0, typedCount);
  const typingDone = typedCount >= questionText.length;

  return (
    <div style={overlayStyle} role="dialog" aria-label="Round intro">
      <div style={columnStyle}>
        <motion.div
          style={assetStyle}
          initial={
            reducedMotion ? { scale: 1, opacity: 1 } : { scale: 0.94, opacity: 0 }
          }
          animate={
            reducedMotion
              ? { scale: 1, opacity: 1 }
              : { scale: [0.94, 1.06, 1], opacity: 1 }
          }
          transition={{
            duration: ASSET_PULSE_MS / 1000,
            ease: "easeOut",
            times: reducedMotion ? undefined : [0, 0.55, 1],
          }}
        >
          {symbol}
        </motion.div>

        <div style={questionStyle}>
          <span>{typed}</span>
          {!typingDone && !reducedMotion && (
            <span style={caretStyle} aria-hidden>
              ▌
            </span>
          )}
        </div>

        <div style={countdownSlotStyle} aria-hidden>
          <AnimatePresence mode="wait">
            {countdown !== null && countdown > 0 && (
              <motion.div
                key={countdown}
                style={countdownNumStyle}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [0.6, 1.25, 1], opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                {countdown}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {flash && <div style={flashStyle} />}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  // Lazy initializer reads the preference on mount; the subscription only
  // pushes updates via the change handler (no setState in effect body).
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "var(--bg-0, #050a14)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  color: "var(--fg, #f0e9e1)",
  overflow: "hidden",
};

const columnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 32,
  textAlign: "center",
  padding: "0 5vw",
  maxWidth: "1100px",
  width: "100%",
};

const assetStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: "clamp(64px, 11vw, 160px)",
  lineHeight: 1,
  letterSpacing: "0.04em",
  color: "var(--cyan, #a8d8e8)",
  textShadow: "0 0 32px rgba(168, 216, 232, 0.35)",
};

const questionStyle: React.CSSProperties = {
  fontSize: "clamp(20px, 2.6vw, 36px)",
  lineHeight: 1.35,
  color: "var(--fg, #f0e9e1)",
  letterSpacing: "0.02em",
  minHeight: "1.4em",
  whiteSpace: "pre-wrap",
};

const caretStyle: React.CSSProperties = {
  display: "inline-block",
  marginLeft: 4,
  color: "var(--cyan, #a8d8e8)",
  animation: "tf-intro-caret 0.9s steps(2) infinite",
};

const countdownSlotStyle: React.CSSProperties = {
  height: "clamp(80px, 12vh, 140px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 12,
};

const countdownNumStyle: React.CSSProperties = {
  fontSize: "clamp(72px, 10vw, 140px)",
  lineHeight: 1,
  color: "var(--cyan, #a8d8e8)",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  textShadow: "0 0 40px rgba(168, 216, 232, 0.5)",
};

const flashStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#ffffff",
  zIndex: 10000,
  pointerEvents: "none",
};

// Inject caret keyframe once. Safe on multiple mounts (idempotent insertion).
if (typeof document !== "undefined") {
  const ID = "tf-round-intro-keyframes";
  if (!document.getElementById(ID)) {
    const style = document.createElement("style");
    style.id = ID;
    style.textContent = `@keyframes tf-intro-caret { 0%,100% { opacity: 1 } 50% { opacity: 0 } }`;
    document.head.appendChild(style);
  }
}
