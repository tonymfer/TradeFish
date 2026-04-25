"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Hero fish-swarm v2 — Three.js Points renderer at 60fps.
 *
 * Three behaviors layered on top of the v1 swarm:
 *  1. **Cohesive school formation.** Each particle has a fixed slot
 *     relative to its school's leader (teardrop cone behind the heading).
 *     The school translates as one unit; followers maintain their slot.
 *     A tail wave propagates from front to back through each formation.
 *
 *  2. **Trading signal colors.** Every 4s each school cycles through
 *     LIVE (cyan) → LONG (green) → SHORT (red) → HOLD (amber). The first
 *     ~25% of each cycle is a brightness flash — feels like a signal
 *     broadcast. Schools are staggered so the screen has constant motion.
 *
 *  3. **Shape morph cycle.** Every 16s all 12k particles converge to
 *     form a giant fish silhouette in the center, hold ~3s, then
 *     disperse back into schools. The fish point cloud is precomputed
 *     once at mount; each frame just lerps between the school slot and
 *     the (slowly yaw-rotated) fish target by `morphFactor`.
 *
 * Performance budget: 12k particles × ~40 mul/add per particle per frame
 * stays well under 16ms. Inner loop is allocation-free — one reusable
 * THREE.Color instance, primitive locals only.
 *
 * Honors prefers-reduced-motion (renders one static frame at t=0).
 * StrictMode-safe: cleans up renderer / geometry / RAF / ResizeObserver.
 */

const SCHOOL_COUNT = 14;
const TAU = Math.PI * 2;
const GOLDEN = 2.39996322972865332;

// LIVE / LONG / SHORT / HOLD — index matches the per-school signal cycle.
// Hues are HSL hue (0..1). Cyan is the default brand accent; green/red
// follow trading semantic; amber is the brand --hold.
const SIGNAL_HUES = [0.52, 0.39, 0.02, 0.1];
const SIGNAL_SATS = [0.55, 0.85, 0.85, 0.85];

/**
 * Pre-compute the fish silhouette point cloud — a side-view fish with
 * lemon-profile body and a small tail fork. Called once at mount.
 *
 * Particles with `i % 8 === 0` (12.5%) form the V-shaped tail fork; the
 * rest fill an ellipsoidal body whose cross-section tapers toward both
 * ends via `sqrt(t * (1 - t))`. Body cross-section angles are spaced
 * by the golden angle to give uniform coverage without banding.
 */
function buildFishCloud(
  out: Float32Array,
  n: number,
  length: number,
  height: number,
): void {
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    if (i % 8 === 0) {
      // Tail fork — alternating top/bottom forks splay backward.
      const tailT = ((i / 8) * 0.6180339887) % 1.0;
      const yMul = Math.floor(i / 8) % 2 === 0 ? 1 : -1;
      out[idx] = -length / 2 - tailT * length * 0.25;
      out[idx + 1] = yMul * (tailT * height * 0.6 + height * 0.1);
      out[idx + 2] = (((i * 0.7158) % 1.0) - 0.5) * 4;
    } else {
      // Body — lemon-profile ellipsoid.
      const bodyT = (i * 0.6180339887) % 1.0;
      const profile = Math.sqrt(Math.max(0, bodyT * (1 - bodyT))) * 2;
      const localR = profile * height * 0.5;
      const angle = (i * GOLDEN) % TAU;
      out[idx] = (bodyT - 0.5) * length;
      out[idx + 1] = Math.cos(angle) * localR;
      out[idx + 2] = Math.sin(angle) * localR * 0.5;
    }
  }
}

/**
 * 16-second morph cycle:
 *  0   - 9s   : school mode (morph = 0)
 *  9   - 10s  : morph IN (smoothstep 0 → 1)
 *  10  - 13s  : hold fish silhouette (morph = 1)
 *  13  - 14.5s: morph OUT (smoothstep 1 → 0)
 *  14.5- 16s  : school mode again
 */
function morphCurve(cycleT: number): number {
  if (cycleT < 9 / 16) return 0;
  if (cycleT < 10 / 16) {
    const u = (cycleT - 9 / 16) / (1 / 16);
    return u * u * (3 - 2 * u);
  }
  if (cycleT < 13 / 16) return 1;
  if (cycleT < 14.5 / 16) {
    const u = (cycleT - 13 / 16) / (1.5 / 16);
    return 1 - u * u * (3 - 2 * u);
  }
  return 0;
}

export function HeroSwarm() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const count = isMobile ? 4000 : 12000;
    const SCHOOL_SIZE = Math.ceil(count / SCHOOL_COUNT);

    const initialRect = container.getBoundingClientRect();
    const w = Math.max(1, initialRect.width);
    const h = Math.max(1, initialRect.height);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 1, 2000);
    camera.position.set(0, 0, 380);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "hero-canvas";
    container.appendChild(renderer.domElement);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const fishTargets = new Float32Array(count * 3);
    buildFishCloud(
      fishTargets,
      count,
      isMobile ? 200 : 280,
      isMobile ? 60 : 80,
    );

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: isMobile ? 1.6 : 2.0,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const tmpColor = new THREE.Color();

    // Hot-path constants — tuned for the v2 cohesive-formation aesthetic.
    const SCALE = 180;
    const TIGHTNESS = 26;
    const SWIM_SPEED = 0.55;
    const WIGGLE_AMP = 2.4;
    const CURRENT_STRENGTH = 0.7;
    const PREDATOR_RADIUS = 38;
    const CYCLE_SECONDS = 16;

    const t0 = performance.now();
    let raf = 0;
    let cancelled = false;

    const renderFrame = (timeSec: number) => {
      const t = timeSec * SWIM_SPEED;

      // Per-frame globals (computed once, used by all 12k particles).
      const cycleT = (timeSec % CYCLE_SECONDS) / CYCLE_SECONDS;
      const morphFactor = morphCurve(cycleT);
      const fishYaw = timeSec * 0.18;
      const fishCosY = Math.cos(fishYaw);
      const fishSinY = Math.sin(fishYaw);

      const predX = Math.sin(timeSec * 0.6) * SCALE * 0.7;
      const predY = Math.sin(timeSec * 0.4 + 1.3) * SCALE * 0.3;
      const predZ = Math.cos(timeSec * 0.5 + 2.1) * SCALE * 0.7;

      const curX = Math.sin(timeSec * 0.17) * CURRENT_STRENGTH * 12.0;
      const curY = Math.cos(timeSec * 0.21) * CURRENT_STRENGTH * 8.0;
      const curZ = Math.sin(timeSec * 0.13 + 1.7) * CURRENT_STRENGTH * 12.0;

      // Predator influence is dampened during morph so the fish silhouette
      // stays clean instead of being yanked sideways.
      const fleeScale = 1 - morphFactor * 0.85;

      for (let i = 0; i < count; i++) {
        const schoolIndex = i % SCHOOL_COUNT;
        const localI = Math.floor(i / SCHOOL_COUNT);
        const formationT = localI / SCHOOL_SIZE; // 0 = leader, 1 = tail
        const seed = (i * 0.7158) % 1.0;

        // School anchor + heading (Lissajous).
        const schoolScale =
          0.55 + (Math.sin(schoolIndex * 1.91) * 0.5 + 0.5) * 1.45;
        const sX =
          Math.sin(t * 0.27 + schoolIndex * 1.71) * SCALE +
          Math.cos(t * 0.51 + schoolIndex * 0.83) * SCALE * 0.34;
        const sY = Math.sin(t * 0.31 + schoolIndex * 2.27) * SCALE * 0.55;
        const sZ =
          Math.cos(t * 0.23 + schoolIndex * 1.33) * SCALE +
          Math.sin(t * 0.43 + schoolIndex * 1.07) * SCALE * 0.34;

        const hX = Math.cos(t * 0.27 + schoolIndex * 1.71);
        const hZ = -Math.sin(t * 0.23 + schoolIndex * 1.33);
        const hLen = Math.sqrt(hX * hX + hZ * hZ) + 1e-6;
        const hxN = hX / hLen;
        const hzN = hZ / hLen;

        // Formation slot — fixed relative to school center, teardrop cone
        // behind the leader. Lateral spread widens toward the tail.
        const slotForward = -formationT * TIGHTNESS * 1.2 * schoolScale;
        const lateralAngle = (localI * GOLDEN) % TAU;
        const lateralR = TIGHTNESS * schoolScale * (0.18 + formationT * 0.85);
        const slotSideStatic = Math.cos(lateralAngle) * lateralR;
        const slotUp = Math.sin(lateralAngle) * lateralR * 0.45;

        // Tail wave — propagates front to back through the formation.
        const tailPhase = t * 4.5 + formationT * 6.0 + schoolIndex * 0.7;
        const wiggle =
          Math.sin(tailPhase) * WIGGLE_AMP * (0.6 + formationT * 0.6);
        const slotSide = slotSideStatic + wiggle;

        // Project formation onto world via heading basis (XZ plane).
        const offX = hxN * slotForward + -hzN * slotSide;
        const offZ = hzN * slotForward + hxN * slotSide;
        const schoolPosX = sX + offX + curX;
        const schoolPosY = sY + slotUp + curY;
        const schoolPosZ = sZ + offZ + curZ;

        // Fish silhouette target — yaw-rotated for presentation.
        const fIdx = i * 3;
        const fX = fishTargets[fIdx];
        const fY = fishTargets[fIdx + 1];
        const fZ = fishTargets[fIdx + 2];
        const rotFishX = fX * fishCosY - fZ * fishSinY;
        const rotFishZ = fX * fishSinY + fZ * fishCosY;

        // Lerp school ↔ fish.
        const inv = 1 - morphFactor;
        let px = schoolPosX * inv + rotFishX * morphFactor;
        let py = schoolPosY * inv + fY * morphFactor;
        let pz = schoolPosZ * inv + rotFishZ * morphFactor;

        // Predator flee — dampened during morph.
        const dx = px - predX;
        const dy = py - predY;
        const dz = pz - predZ;
        const distSq = dx * dx + dy * dy + dz * dz + 1e-3;
        const dist = Math.sqrt(distSq);
        const flee =
          Math.max(0, PREDATOR_RADIUS - dist) / (PREDATOR_RADIUS + 1e-6);
        const fleePush = flee * flee * 24.0 * fleeScale;
        const invD = 1.0 / dist;
        px += dx * invD * fleePush;
        py += dy * invD * fleePush;
        pz += dz * invD * fleePush;

        const idx3 = i * 3;
        positions[idx3] = px;
        positions[idx3 + 1] = py;
        positions[idx3 + 2] = pz;

        // ── Color ──────────────────────────────────────────────────
        // Per-school signal cycle: LIVE → LONG → SHORT → HOLD.
        const signalCycle = timeSec / 4.0 + schoolIndex * 0.7;
        const signalIndex = Math.floor(signalCycle) % 4;
        const signalT = signalCycle - Math.floor(signalCycle);
        const signalHue = SIGNAL_HUES[signalIndex];
        const signalSat = SIGNAL_SATS[signalIndex];
        // Flash on transition: bright at signalT < 0.25, fades to base.
        const flashAmount = Math.max(0, 1 - signalT * 4);

        // Body wave flicker (per-particle iridescence).
        const bodyFlash = 0.5 + 0.5 * Math.sin(tailPhase + seed * TAU);

        // Mix school-mode signal hue with morph-mode unified cyan.
        const morphHue = 0.52;
        const hue = signalHue * inv + morphHue * morphFactor;
        const sat =
          (signalSat - 0.05 + bodyFlash * 0.1) * inv + 0.7 * morphFactor;
        const light = Math.min(
          0.92,
          Math.max(
            0.18,
            0.32 +
              bodyFlash * 0.18 +
              flashAmount * 0.45 * inv +
              flee * 0.25 * fleeScale +
              morphFactor * 0.18,
          ),
        );

        // Hue jitter per particle — tiny, only outside morph.
        const hueJitter = (seed - 0.5) * 0.04 * inv;
        let finalHue = hue + hueJitter;

        // Legendary fish — magenta accent on every 233rd particle.
        const isLegend = i % 233 === 0 ? 1 : 0;
        const legendBlend = isLegend * 0.7 * inv;
        finalHue = finalHue * (1 - legendBlend) + 0.88 * legendBlend;
        const finalSat = sat * (1 - legendBlend) + 0.9 * legendBlend;

        tmpColor.setHSL(finalHue, Math.min(1, finalSat), light);
        colors[idx3] = tmpColor.r;
        colors[idx3 + 1] = tmpColor.g;
        colors[idx3 + 2] = tmpColor.b;
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      renderer.render(scene, camera);
    };

    const tick = () => {
      if (cancelled) return;
      const time = (performance.now() - t0) / 1000;
      renderFrame(time);
      raf = requestAnimationFrame(tick);
    };

    if (reduceMotion) {
      renderFrame(0);
    } else {
      raf = requestAnimationFrame(tick);
    }

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const newW = Math.max(1, rect.width);
      const newH = Math.max(1, rect.height);
      renderer.setSize(newW, newH);
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      cancelled = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      ro.disconnect();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
