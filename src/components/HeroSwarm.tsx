"use client";

import { useEffect, useRef } from "react";

/**
 * Renders the WebGL particle swarm background for the hero section.
 *
 * The shader code lives in `public/swarm.js` (ported verbatim from the
 * design system). It exposes `window.TFSwarm.create(canvas, options)`
 * which returns a controller. We load the script once on mount, attach
 * a 6-school layout that rotates over time, and pulse on mousemove.
 *
 * Falls back gracefully: if the script fails to load or WebGL is
 * unavailable, the hero still renders — just without the swarm.
 */

type Vec3 = [number, number, number];

interface SwarmController {
  setSchools: (
    schools: Array<{
      id: number;
      x: number;
      y: number;
      color: Vec3;
      weight: number;
      radius: number;
    }>,
  ) => void;
  setMode: (
    mode: "idle" | "schooling" | "coalesce" | "leaderboard" | "explode",
  ) => void;
  pulseAt: (x: number, y: number, radius?: number) => void;
}

declare global {
  interface Window {
    TFSwarm?: {
      create: (
        canvas: HTMLCanvasElement,
        options: {
          count?: number;
          max?: number;
          defaultColor?: Vec3;
          background?: [number, number, number, number];
        },
      ) => SwarmController | null;
    };
  }
}

const TINTS: Vec3[] = [
  [0.98, 0.98, 0.96],
  [0.92, 0.95, 0.97],
  [0.82, 0.91, 0.96],
  [0.7, 0.85, 0.93],
  [0.58, 0.78, 0.9],
  [0.86, 0.93, 0.97],
];

function computeLayout(canvas: HTMLCanvasElement, t: number) {
  const r = canvas.getBoundingClientRect();
  const cx = r.width / 2;
  const cy = r.height / 2;
  const radius = Math.min(r.width, r.height) * 0.36;
  return TINTS.map((c, i) => {
    const ang = (i / 6) * Math.PI * 2 - Math.PI / 2 + t * 0.08;
    return {
      id: i,
      x: cx + Math.cos(ang) * radius,
      y: cy + Math.sin(ang) * radius,
      color: c,
      weight: 1,
      radius: 100,
    };
  });
}

export function HeroSwarm() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<SwarmController | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    const startSwarm = () => {
      if (cancelled || !window.TFSwarm) return;
      const ctrl = window.TFSwarm.create(canvas, {
        count: 3000,
        max: 8000,
        defaultColor: [0.94, 0.96, 0.98],
        background: [0.02, 0.04, 0.08, 1.0],
      });
      if (!ctrl) return;
      controllerRef.current = ctrl;
      ctrl.setSchools(computeLayout(canvas, 0));
      ctrl.setMode("schooling");

      const t0 = performance.now();
      const tick = () => {
        if (cancelled) return;
        const t = (performance.now() - t0) / 1000;
        ctrl.setSchools(computeLayout(canvas, t));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if (window.TFSwarm) {
      startSwarm();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-tradefish-swarm="1"]',
      );
      if (existing) {
        existing.addEventListener("load", startSwarm, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = "/swarm.js";
        script.async = true;
        script.dataset.tradefishSwarm = "1";
        script.addEventListener("load", startSwarm, { once: true });
        document.head.appendChild(script);
      }
    }

    const handleResize = () => {
      const ctrl = controllerRef.current;
      if (!ctrl || !canvas) return;
      ctrl.setSchools(computeLayout(canvas, 0));
    };
    let lastPulse = 0;
    const handleMove = (e: MouseEvent) => {
      const ctrl = controllerRef.current;
      if (!ctrl || !canvas) return;
      const now = performance.now();
      if (now - lastPulse < 60) return;
      lastPulse = now;
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.height) {
        ctrl.pulseAt(e.clientX - r.left, e.clientY - r.top, 280);
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMove);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMove);
      controllerRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}
