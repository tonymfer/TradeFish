"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  asset: string;
  questionText: string;
  onDone: () => void;
};

const MAX_MS = 3500;
const COUNTDOWN_MS = 600;
const COUNTDOWN_STEPS = 3;
const FLASH_MS = 120;
const REDUCED_HOLD_MS = 800;

export function RoundIntro({ asset, questionText, onDone }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "countdown" | "flash" | "done">(
    "typing",
  );
  const [count, setCount] = useState<number>(COUNTDOWN_STEPS);
  const doneRef = useRef(false);

  const safeQuestion = (questionText || "WILL BTC PUMP IN 60s?").slice(0, 200);

  // Adaptive typing speed so countdown still fits in MAX_MS.
  const typingMs = useMemo(() => {
    const reservedFlash = FLASH_MS;
    const reservedCountdown = COUNTDOWN_MS * COUNTDOWN_STEPS;
    const budget = MAX_MS - reservedFlash - reservedCountdown - 200;
    const perCharIdeal = 28;
    const ideal = perCharIdeal * safeQuestion.length;
    const total = Math.min(ideal, Math.max(400, budget));
    return total / Math.max(1, safeQuestion.length);
  }, [safeQuestion]);

  // Reduced-motion: static, then onDone after 800ms.
  useEffect(() => {
    if (!reducedMotion) return;
    setTyped(safeQuestion);
    const t = setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
    }, REDUCED_HOLD_MS);
    return () => clearTimeout(t);
  }, [reducedMotion, safeQuestion, onDone]);

  // Typing animation
  useEffect(() => {
    if (reducedMotion) return;
    if (phase !== "typing") return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(safeQuestion.slice(0, i));
      if (i >= safeQuestion.length) {
        clearInterval(id);
        setTimeout(() => setPhase("countdown"), 120);
      }
    }, typingMs);
    return () => clearInterval(id);
  }, [reducedMotion, phase, safeQuestion, typingMs]);

  // Countdown
  useEffect(() => {
    if (reducedMotion) return;
    if (phase !== "countdown") return;
    setCount(COUNTDOWN_STEPS);
    let n = COUNTDOWN_STEPS;
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        setPhase("flash");
      } else {
        setCount(n);
      }
    }, COUNTDOWN_MS);
    return () => clearInterval(id);
  }, [reducedMotion, phase]);

  // Flash → done
  useEffect(() => {
    if (reducedMotion) return;
    if (phase !== "flash") return;
    const id = setTimeout(() => {
      setPhase("done");
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
    }, FLASH_MS);
    return () => clearTimeout(id);
  }, [reducedMotion, phase, onDone]);

  if (phase === "done" && !reducedMotion) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="round-intro"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#02060c",
          color: "var(--fg, #f0e9e1)",
          fontFamily: "var(--font-mono, ui-monospace)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          textAlign: "center",
          letterSpacing: "0.04em",
        }}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: [0.94, 1.06, 1], opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            fontSize: "clamp(56px, 12vw, 128px)",
            lineHeight: 1,
            color: "var(--cyan, #a8d8e8)",
            textShadow: "0 0 32px rgba(168,216,232,0.4)",
            marginBottom: 48,
          }}
        >
          ${asset.toUpperCase()}
        </motion.div>

        <div
          style={{
            maxWidth: 880,
            fontSize: "clamp(18px, 2.4vw, 28px)",
            lineHeight: 1.4,
            color: "var(--fg, #f0e9e1)",
            minHeight: "2.8em",
          }}
        >
          <span>{typed}</span>
          {phase === "typing" && !reducedMotion && (
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              style={{
                display: "inline-block",
                width: "0.6ch",
                marginLeft: 4,
                color: "var(--cyan, #a8d8e8)",
              }}
            >
              ▍
            </motion.span>
          )}
        </div>

        <div
          style={{
            marginTop: 56,
            height: 96,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {phase === "countdown" && !reducedMotion && (
            <motion.div
              key={`c-${count}`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [0.6, 1.4, 1], opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{
                fontSize: 96,
                lineHeight: 1,
                color: "var(--cyan, #a8d8e8)",
                textShadow: "0 0 32px rgba(168,216,232,0.6)",
              }}
            >
              {count}
            </motion.div>
          )}
        </div>

        {phase === "flash" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: FLASH_MS / 1000 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "#ffffff",
              zIndex: 10000,
              pointerEvents: "none",
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}
