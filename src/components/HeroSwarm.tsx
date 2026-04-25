"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Hero fish-swarm v3 — one cohesive swarm, signal contagion, consensus.
 *
 * The 12k particles always live inside one fish silhouette (no morph cycle,
 * no separate schools). Three layered behaviors:
 *
 *  1. **Per-particle breath orbits.** Each particle wobbles on its own
 *     deterministic micro-pattern (3-axis sine with hashed freqs/phases/amps).
 *     Stagger without sync — the body is alive but never falls apart.
 *
 *  2. **Signal contagion.** Random particles emit green pulses; the wave
 *     spreads outward through home-position distance with a Gaussian
 *     envelope. Up to 4 concurrent waves. Visualizes inter-agent signal
 *     exchange.
 *
 *  3. **Consensus convergence cycle.** Every 12s the whole body's hues
 *     pull together: random drift → all green → release. Visualizes the
 *     emergence of a market consensus across the agent swarm.
 *
 * Performance budget: 12k particles × ~25 mul/add per particle per frame
 * + 4 wave intensity lookups stays well under 16ms. Inner loop is
 * allocation-free.
 *
 * Honors prefers-reduced-motion (renders one static frame at t=0).
 * StrictMode-safe: cleans up renderer / geometry / RAF / ResizeObserver.
 */

const TAU = Math.PI * 2;
const GOLDEN = 2.39996322972865332;

// HSL hue for the consensus / signal color. 0.36 ≈ #7fe0a8 (brand phosphor).
const GREEN_HUE = 0.36;
const SWIM_SPEED = 0.55;
const WIGGLE_AMP = 2.6;

// Signal contagion
const MAX_WAVES = 4;
const WAVE_DURATION = 4.0;
const WAVE_INTERVAL_MIN = 1.5;
const WAVE_INTERVAL_MAX = 4.0;

// Consensus convergence (12s loop)
const CONSENSUS_CYCLE = 12;
const PHASE_DIVERGE_END = 6 / 12;
const PHASE_CONVERGE_END = 9 / 12;
const PHASE_CONSENSUS_END = 11 / 12;

interface SignalWave {
  active: boolean;
  seedX: number;
  seedY: number;
  seedZ: number;
  startTime: number;
}

/**
 * Mulberry32-style integer hash → [0, 1). Deterministic, allocation-free.
 * Used to seed per-particle breath frequencies, phases, and hues.
 */
function hash01(x: number): number {
  let z = x | 0;
  z = (z ^ 0x6d2b79f5) | 0;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
}

/**
 * Pre-compute the fish silhouette point cloud — a side-view fish with
 * lemon-profile body and a V-shaped tail fork. Tail fork is 1/6 of particles
 * (up from 1/8 in v2) for a more legible fork.
 */
function buildFishCloud(
  out: Float32Array,
  n: number,
  length: number,
  height: number,
): void {
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    if (i % 6 === 0) {
      const tailT = ((i / 6) * 0.6180339887) % 1.0;
      const yMul = Math.floor(i / 6) % 2 === 0 ? 1 : -1;
      out[idx] = -length / 2 - tailT * length * 0.28;
      out[idx + 1] = yMul * (tailT * height * 0.7 + height * 0.1);
      out[idx + 2] = (((i * 0.7158) % 1.0) - 0.5) * 4;
    } else {
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
 * Per-particle micro-motion seeds — 9 floats per particle: 3 frequencies,
 * 3 phase offsets, 3 amplitudes. Deterministic from index.
 *
 * Frequencies in 0.35..1.4 rad/sec range, amplitudes 0.4..1.6 units.
 * Result: every particle wobbles on its own slightly different pattern.
 */
function buildBreathParams(out: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    const j = i * 9;
    out[j] = 0.35 + hash01(i * 7919 + 1) * 1.05;
    out[j + 1] = 0.35 + hash01(i * 7919 + 2) * 1.05;
    out[j + 2] = 0.35 + hash01(i * 7919 + 3) * 1.05;
    out[j + 3] = hash01(i * 7919 + 4) * TAU;
    out[j + 4] = hash01(i * 7919 + 5) * TAU;
    out[j + 5] = hash01(i * 7919 + 6) * TAU;
    out[j + 6] = 0.4 + hash01(i * 7919 + 7) * 1.2;
    out[j + 7] = 0.4 + hash01(i * 7919 + 8) * 1.2;
    out[j + 8] = 0.4 + hash01(i * 7919 + 9) * 1.2;
  }
}

/**
 * Per-particle hue seeds — 2 floats: base hue [0,1) and drift speed.
 * During the divergent phase each particle slowly cycles through its own
 * personal hue. Consensus phase pulls them all toward GREEN_HUE.
 */
function buildHueSeeds(out: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    const j = i * 2;
    out[j] = hash01(i * 104729 + 11);
    out[j + 1] = 0.04 + hash01(i * 104729 + 13) * 0.1;
  }
}

/**
 * Consensus phase factor [0..1] across the 12s cycle.
 *  0–6s   diverge   → 0
 *  6–9s   converge  → smoothstep 0..1
 *  9–11s  consensus → 1
 *  11–12s release   → smoothstep 1..0
 */
function consensusFactor(timeSec: number): number {
  const t = (timeSec % CONSENSUS_CYCLE) / CONSENSUS_CYCLE;
  if (t < PHASE_DIVERGE_END) return 0;
  if (t < PHASE_CONVERGE_END) {
    const u =
      (t - PHASE_DIVERGE_END) / (PHASE_CONVERGE_END - PHASE_DIVERGE_END);
    return u * u * (3 - 2 * u);
  }
  if (t < PHASE_CONSENSUS_END) return 1;
  const u = (t - PHASE_CONSENSUS_END) / (1 - PHASE_CONSENSUS_END);
  return 1 - u * u * (3 - 2 * u);
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
    const length = isMobile ? 200 : 280;
    const height = isMobile ? 60 : 80;
    const halfLen = length / 2;
    const waveSpeed = isMobile ? 65 : 90;
    const waveWidth = isMobile ? 20 : 28;

    const initialRect = container.getBoundingClientRect();
    const canvasW = Math.max(1, initialRect.width);
    const canvasH = Math.max(1, initialRect.height);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvasW / canvasH, 1, 2000);
    camera.position.set(0, 0, 380);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvasW, canvasH);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "hero-canvas";
    container.appendChild(renderer.domElement);

    // Per-particle precomputed buffers — allocated once, mutated each frame.
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const homePositions = new Float32Array(count * 3);
    const breathParams = new Float32Array(count * 9);
    const hueSeeds = new Float32Array(count * 2);
    buildFishCloud(homePositions, count, length, height);
    buildBreathParams(breathParams, count);
    buildHueSeeds(hueSeeds, count);

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

    // Signal-wave ring buffer — fixed-size, reused.
    const waves: SignalWave[] = [];
    for (let wi = 0; wi < MAX_WAVES; wi++) {
      waves.push({ active: false, seedX: 0, seedY: 0, seedZ: 0, startTime: 0 });
    }
    let nextSpawn =
      WAVE_INTERVAL_MIN +
      Math.random() * (WAVE_INTERVAL_MAX - WAVE_INTERVAL_MIN);

    const t0 = performance.now();
    let raf = 0;
    let cancelled = false;

    const renderFrame = (timeSec: number) => {
      const t = timeSec * SWIM_SPEED;

      // Whole-body glide — one curve, not 14.
      const fishCenterX = Math.sin(t * 0.13) * 60;
      const fishCenterY = Math.sin(t * 0.09 + 1.2) * 22;
      const fishYaw = Math.sin(t * 0.07) * 0.42;
      const cosY = Math.cos(fishYaw);
      const sinY = Math.sin(fishYaw);

      // Consensus phase + soft breathing pulse during the all-green phase.
      const consensus = consensusFactor(timeSec);
      const phaseT = (timeSec % CONSENSUS_CYCLE) / CONSENSUS_CYCLE;
      let consensusPulse = 0;
      if (phaseT >= PHASE_CONVERGE_END && phaseT < PHASE_CONSENSUS_END) {
        const localT =
          (phaseT - PHASE_CONVERGE_END) /
          (PHASE_CONSENSUS_END - PHASE_CONVERGE_END);
        const fade = Math.min(1, Math.min(localT * 4, (1 - localT) * 4));
        consensusPulse = (0.5 + 0.5 * Math.sin(timeSec * 4.0)) * fade;
      }

      // Spawn / expire signal waves.
      if (timeSec >= nextSpawn) {
        for (let wi = 0; wi < waves.length; wi++) {
          if (!waves[wi].active) {
            const seedIdx = Math.floor(Math.random() * count) * 3;
            waves[wi].active = true;
            waves[wi].seedX = homePositions[seedIdx];
            waves[wi].seedY = homePositions[seedIdx + 1];
            waves[wi].seedZ = homePositions[seedIdx + 2];
            waves[wi].startTime = timeSec;
            break;
          }
        }
        nextSpawn =
          timeSec +
          WAVE_INTERVAL_MIN +
          Math.random() * (WAVE_INTERVAL_MAX - WAVE_INTERVAL_MIN);
      }
      for (let wi = 0; wi < waves.length; wi++) {
        if (waves[wi].active && timeSec - waves[wi].startTime > WAVE_DURATION) {
          waves[wi].active = false;
        }
      }

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const i9 = i * 9;
        const i2 = i * 2;

        const hx = homePositions[i3];
        const hy = homePositions[i3 + 1];
        const hz = homePositions[i3 + 2];

        // Per-particle breath orbit — staggered micro-motion.
        const breathX =
          Math.sin(timeSec * breathParams[i9] + breathParams[i9 + 3]) *
          breathParams[i9 + 6];
        const breathY =
          Math.sin(timeSec * breathParams[i9 + 1] + breathParams[i9 + 4]) *
          breathParams[i9 + 7];
        const breathZ =
          Math.sin(timeSec * breathParams[i9 + 2] + breathParams[i9 + 5]) *
          breathParams[i9 + 8];

        // Tail wiggle on Y — ramps from 0 at front body to 1 at tail tip.
        // Vertical motion reads more clearly than lateral wiggle on a
        // side-view fish at this camera angle.
        const tailT = Math.max(0, Math.min(1, -hx / halfLen));
        const wiggle = Math.sin(t * 4.5 + tailT * 6.0) * WIGGLE_AMP * tailT;

        const localX = hx + breathX;
        const localY = hy + breathY + wiggle;
        const localZ = hz + breathZ;

        // Yaw rotation around Y axis, then whole-body translation.
        const rotX = localX * cosY - localZ * sinY;
        const rotZ = localX * sinY + localZ * cosY;
        positions[i3] = rotX + fishCenterX;
        positions[i3 + 1] = localY + fishCenterY;
        positions[i3 + 2] = rotZ;

        // ── Color ──────────────────────────────────────────────────
        // Per-particle drifting hue (random palette during diverge phase).
        const baseHue = (hueSeeds[i2] + timeSec * hueSeeds[i2 + 1]) % 1.0;

        // Signal-wave intensity = max gaussian envelope across active waves.
        // Distance is computed in HOME space — wave appears to emanate from
        // the seed particle and traverse the swarm in a clean radial sweep.
        let waveIntensity = 0;
        for (let wi = 0; wi < waves.length; wi++) {
          const wave = waves[wi];
          if (!wave.active) continue;
          const elapsed = timeSec - wave.startTime;
          const r = waveSpeed * elapsed;
          const dx = hx - wave.seedX;
          const dy = hy - wave.seedY;
          const dz = hz - wave.seedZ;
          const dHome = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const delta = (r - dHome) / waveWidth;
          const env = Math.exp(-delta * delta);
          const ageFactor = 1 - elapsed / WAVE_DURATION;
          const contrib = env * ageFactor;
          if (contrib > waveIntensity) waveIntensity = contrib;
        }

        // Pull hue toward green by both consensus and wave intensity.
        const greenPull = consensus > waveIntensity ? consensus : waveIntensity;
        const hue = baseHue * (1 - greenPull) + GREEN_HUE * greenPull;

        // Saturation: muted when divergent, vivid under wave or consensus.
        const sat = 0.35 + 0.5 * greenPull;

        // Lightness: base + wave bump + consensus glow + soft pulse.
        const light = Math.min(
          0.92,
          0.32 +
            waveIntensity * 0.45 +
            consensus * 0.12 +
            consensusPulse * 0.06,
        );

        tmpColor.setHSL(hue, sat, light);
        colors[i3] = tmpColor.r;
        colors[i3 + 1] = tmpColor.g;
        colors[i3 + 2] = tmpColor.b;
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
