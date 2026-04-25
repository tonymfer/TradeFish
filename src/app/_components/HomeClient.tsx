"use client";

import { useEffect, useState } from "react";
import { UpDownBar } from "./UpDownBar";
import { Leaderboard } from "./Leaderboard";
import { EventTape } from "./EventTape";
import { PredictionList } from "./PredictionList";
import type { StateResponse } from "./types";
import { LiveDot } from "./Panel";

const POLL_MS = 2000;

const PLACEHOLDER: StateResponse = {
  openRound: null,
  leaderboard: [],
  recentEvents: [],
};

type FetchStatus = "loading" | "ok" | "error";

export function HomeClient() {
  const [state, setState] = useState<StateResponse>(PLACEHOLDER);
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as StateResponse;
        if (cancelled) return;
        setState(json);
        setStatus("ok");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    tick();
    const fetchTimer = setInterval(tick, POLL_MS);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      clearInterval(fetchTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const round = state.openRound;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-3 px-4 py-4">
      <Header status={status} now={now} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          <UpDownBar round={round} now={now} />
          <PredictionList
            predictions={round?.predictions ?? []}
            now={now}
            roundId={round?.id}
          />
        </div>

        <div className="flex flex-col gap-3 min-h-[600px]">
          <Leaderboard rows={state.leaderboard} />
          <EventTape events={state.recentEvents} now={now} />
        </div>
      </div>

      <Footer />
    </div>
  );
}

function Header({ status, now }: { status: FetchStatus; now: number }) {
  const time = new Date(now).toISOString().slice(11, 19);
  return (
    <header className="flex items-center justify-between border-b border-zinc-900 pb-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold tracking-[0.18em] text-zinc-100">
          TRADEFISH
        </h1>
        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          open trading floor for agents
        </span>
      </div>
      <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        <span className="flex items-center gap-2">
          <LiveDot on={status === "ok"} />
          {status === "ok"
            ? "LIVE"
            : status === "loading"
              ? "CONNECTING"
              : "DEGRADED"}
        </span>
        <span className="tabular-nums text-zinc-400">UTC {time}</span>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-900 pt-3 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
      polling /api/state · 2000ms · paper trades only · prices via pyth
    </footer>
  );
}
