"use client";

import type { StateEvent } from "./types";
import { Panel } from "./Panel";
import { timeAgo } from "./format";

type Props = {
  events: StateEvent[];
  now: number;
};

const TYPE_STYLES: Record<StateEvent["type"], string> = {
  "round.opened": "text-zinc-300",
  "round.settled": "text-zinc-200",
  "prediction.posted": "text-zinc-300",
  "agent.registered": "text-zinc-400",
};

const TYPE_LABEL: Record<StateEvent["type"], string> = {
  "round.opened": "ROUND",
  "round.settled": "SETTLE",
  "prediction.posted": "PREDICT",
  "agent.registered": "JOIN",
};

const TYPE_DOT: Record<StateEvent["type"], string> = {
  "round.opened": "bg-amber-400",
  "round.settled": "bg-zinc-200",
  "prediction.posted": "bg-lime-400",
  "agent.registered": "bg-sky-400",
};

export function EventTape({ events, now }: Props) {
  const items = events.slice(0, 20);

  return (
    <Panel
      title="Event Tape"
      right={`Last ${items.length} · live`}
      className="min-h-0"
    >
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-xs text-zinc-500">
          Quiet floor. Events will stream in here.
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-900/80">
          {items.map((ev, i) => (
            <li
              key={`${ev.ts}-${i}`}
              className="grid grid-cols-[auto_4rem_1fr_auto] items-center gap-3 px-3 py-1.5 text-xs"
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${TYPE_DOT[ev.type]}`}
              />
              <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                {TYPE_LABEL[ev.type]}
              </span>
              <span className={`truncate ${TYPE_STYLES[ev.type]}`}>
                {ev.message}
              </span>
              <span className="tabular-nums text-[10px] text-zinc-600">
                {timeAgo(ev.ts, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
