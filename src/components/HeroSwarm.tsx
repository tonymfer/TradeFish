"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Hero fish-swarm — Three.js Points renderer running the TradeFish swarm
 * math inline at 60fps.
 *
 * The math comes from a creative-coding sandbox function body and is
 * adapted as follows:
 *  - `addControl(...)` slider calls are baked into constants (the values
 *    that look best at scale=180 / 12k particles); a future PR can lift
 *    them to React props.
 *  - `setInfo` / `annotate` HUD helpers are removed (no production HUD).
 *  - `target.set(x,y,z)` writes directly into a positions Float32Array.
 *  - `color.setHSL(h,s,l)` uses ONE reusable THREE.Color instance and
 *    copies `_color.r/.g/.b` into a colors Float32Array — this keeps
 *    the inner loop allocation-free across 12k iterations per frame.
 *
 * Behavior:
 *  - 14 schools wandering on Lissajous paths.
 *  - Each fish tilts/wiggles around its school's heading axis, with a
 *    body wave running through the school.
 *  - An invisible predator wanders the ocean; fish flee outward when
 *    inside its aura.
 *  - Iridescent cool-cyan palette with rare magenta legendary flashes
 *    (every 233rd fish).
 *  - Additive blending on a transparent canvas — the body's --bg-0
 *    cool-black ocean shows through.
 *
 * Mounts as a transparent absolute-positioned canvas inside its
 * container. Honors prefers-reduced-motion (renders one static frame).
 * Cleans up renderer / geometry / RAF on unmount (StrictMode-safe).
 */
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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: isMobile ? 1.4 : 1.8,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Reusable color instance — written 12k times per frame, never re-allocated.
    const tmpColor = new THREE.Color();

    // Hot-path constants (sandbox `addControl` defaults baked in).
    const SCALE = 180;
    const TIGHTNESS = 22;
    const SWIM_SPEED = 0.55;
    const WIGGLE_AMP = 1.6;
    const CURRENT_STRENGTH = 0.7;
    const PREDATOR_RADIUS = 38;
    const COLOR_SHIFT = 0.6;

    const SCHOOL_COUNT = 14;
    const TAU = Math.PI * 2;
    const GOLDEN = 2.39996322972865332;

    const t0 = performance.now();
    let raf = 0;
    let cancelled = false;

    const renderFrame = (timeSec: number) => {
      const t = timeSec * SWIM_SPEED;

      // Predator anchor — same for all fish, computed once per frame.
      const predX = Math.sin(timeSec * 0.6) * SCALE * 0.7;
      const predY = Math.sin(timeSec * 0.4 + 1.3) * SCALE * 0.3;
      const predZ = Math.cos(timeSec * 0.5 + 2.1) * SCALE * 0.7;

      // Ocean current — same for all fish, computed once per frame.
      const curX = Math.sin(timeSec * 0.17) * CURRENT_STRENGTH * 12.0;
      const curY = Math.cos(timeSec * 0.21) * CURRENT_STRENGTH * 8.0;
      const curZ = Math.sin(timeSec * 0.13 + 1.7) * CURRENT_STRENGTH * 12.0;

      for (let i = 0; i < count; i++) {
        const schoolIndex = i % SCHOOL_COUNT;
        const localI = Math.floor(i / SCHOOL_COUNT);
        const localPhase = localI * GOLDEN;
        const localElev = (localI * 0.6180339887) % 1.0;
        const seed = (i * 0.7158) % 1.0;

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

        const swirl = t * 1.6 + localPhase + seed * 0.4;
        const elev = (localElev - 0.5) * 2.0;
        const cosE = Math.cos(elev * 1.3);
        const sinE = Math.sin(elev * 1.3);
        const localR =
          TIGHTNESS *
          schoolScale *
          (0.55 + 0.45 * Math.sin(swirl * 0.5 + seed * TAU));

        const lf = Math.cos(swirl) * localR * cosE;
        let ls = Math.sin(swirl) * localR * cosE;
        const lu = sinE * localR * 0.6;

        const bodyPhase = t * 4.2 + localI * 0.24;
        const wiggle =
          Math.sin(bodyPhase) * WIGGLE_AMP * (0.5 + 0.5 * Math.cos(seed * TAU));
        ls += wiggle;

        const offX = hxN * lf + -hzN * ls;
        const offZ = hzN * lf + hxN * ls;
        const offY = lu;

        let px = sX + offX + curX;
        let py = sY + offY + curY;
        let pz = sZ + offZ + curZ;

        const dx = px - predX;
        const dy = py - predY;
        const dz = pz - predZ;
        const distSq = dx * dx + dy * dy + dz * dz + 1e-3;
        const dist = Math.sqrt(distSq);
        const flee =
          Math.max(0, PREDATOR_RADIUS - dist) / (PREDATOR_RADIUS + 1e-6);
        const fleePush = flee * flee * 24.0;
        const invD = 1.0 / dist;
        px += dx * invD * fleePush;
        py += dy * invD * fleePush;
        pz += dz * invD * fleePush;

        const idx3 = i * 3;
        positions[idx3] = px;
        positions[idx3 + 1] = py;
        positions[idx3 + 2] = pz;

        const flash = 0.5 + 0.5 * Math.sin(bodyPhase + seed * TAU);
        const schoolHue = Math.sin(schoolIndex * 1.7) * 0.04;
        const baseHue =
          0.52 +
          schoolHue +
          Math.sin(bodyPhase * 0.5 + schoolIndex * 0.3) * 0.05 * COLOR_SHIFT;
        const hueIrid = (seed - 0.5) * 0.16 * COLOR_SHIFT;
        const hue = baseHue + hueIrid;
        const sat = 0.32 + 0.42 * flash;
        const surfaceLight = 0.5 + (py / (SCALE + 1e-6)) * 0.18;
        // Floor bumped to 0.18 so fish stay visible against pure-black bg
        // under additive blending (sandbox value 0.08 was for non-additive).
        const light = Math.min(
          0.9,
          Math.max(
            0.18,
            0.32 + flash * 0.28 + flee * 0.32 + surfaceLight * 0.18,
          ),
        );

        const isLegend = i % 233 === 0 ? 1 : 0;
        const legendBlend = isLegend * 0.7;
        const finalHue = hue * (1 - legendBlend) + 0.88 * legendBlend;
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
      // Single static frame at t=0 — skip the RAF loop.
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
