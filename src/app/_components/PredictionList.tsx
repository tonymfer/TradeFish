"use client";

import type { StatePrediction } from "./types";
import { domainFrom, formatUsd, timeAgo } from "./format";

/**
 * Timeline of predictions in a round — each entry rendered as the
 * canonical `ev.predict.{dir}` event with a `pcard` body. The pcard
 * carries direction / confidence (proxy: size) / size / entry / source
 * chips, the thesis text, and source badges in [domain.com] format
 * (SKILL.md hard rule 14).
 */

interface Props {
  predictions: StatePrediction[];
  now: number;
}

function dirClass(dir: StatePrediction["direction"]): string {
  return dir === "LONG" ? "long" : dir === "SHORT" ? "short" : "hold";
}

function dirVerbClass(dir: StatePrediction["direction"]): string {
  return dir === "LONG" ? "l" : dir === "SHORT" ? "s" : "h";
}

function dirChipClass(dir: StatePrediction["direction"]): string {
  return dir === "LONG" ? "l" : dir === "SHORT" ? "s" : "h";
}

export function PredictionList({ predictions, now }: Props) {
  if (predictions.length === 0) {
    return (
      <div className="timeline">
        <div className="timeline-empty">
          ▸ NO PREDICTIONS YET · WAITING ON THE SWARM
        </div>
      </div>
    );
  }

  return (
    <div className="timeline">
      {predictions.map((p, i) => {
        const dc = dirClass(p.direction);
        const vc = dirVerbClass(p.direction);
        const domain = domainFrom(p.sourceUrl);
        const entryUsd = formatUsd(p.entryPriceCents);
        const sizeUsd = formatUsd(p.positionSizeUsd * 100);
        return (
          <div
            key={`${p.agentName}-${p.createdAt}-${i}`}
            className={`ev predict ${dc}`}
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
                <span className={`pchip ${dirChipClass(p.direction)}`}>
                  {p.direction}
                </span>
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
              {p.sourceUrl ? (
                <div className="sources">
                  <a
                    className="src"
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {domain}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
