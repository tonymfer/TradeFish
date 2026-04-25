"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { UpDownBar } from "./UpDownBar";
import { Leaderboard } from "./Leaderboard";
import { EventTape } from "./EventTape";
import { PredictionList } from "./PredictionList";
import { DexChart } from "./DexChart";
import { EntryStrip } from "./EntryStrip";
import { LiveDot } from "./Panel";
import { RoundIntro } from "./RoundIntro";
import { RoundConclusion } from "./RoundConclusion";
import { RecapCard } from "./RecapCard";
import { MarkPrice } from "./MarkPrice";
import { formatUsd } from "./format";
import type { RoundDetail, RoundStatus, StateResponse } from "./types";

const POLL_MS = 1000;

const PLACEHOLDER: StateResponse = {
  openRound: null,
  leaderboard: [],
  recentEvents: [],
};

type FetchStatus = "loading" | "ok" | "error";

// The state.openRound payload may carry questionText once the backend
// teammate ships it. Read it via a structural extension so we don't
// touch the canonical `types.ts`.
type OpenRoundWithQuestion = NonNullable<StateResponse["openRound"]> & {
  questionText?: string | null;
};

export function HomeClient() {
  const [state, setState] = useState<StateResponse>(PLACEHOLDER);
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [now, setNow] = useState<number>(() => Date.now());

  // ── Cinematic overlays ─────────────────────────────────────────────
  const searchParams = useSearchParams();
  const isFresh = searchParams?.get("fresh") === "1";
  const [introActive, setIntroActive] = useState<boolean>(false);
  const [introDone, setIntroDone] = useState<boolean>(false);
  const introCheckedRef = useRef(false);

  const prevRoundIdRef = useRef<string | null>(null);
  const prevRoundStatusRef = useRef<RoundStatus | null>(null);
  const recapFetchInFlightRef = useRef<string | null>(null);
  const [recapRound, setRecapRound] = useState<RoundDetail | null>(null);
  const [conclusionRound, setConclusionRound] = useState<RoundDetail | null>(null);

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

  // Intro gating: only show RoundIntro if URL has ?fresh=1, an open round
  // exists, and that round opened within the last 10 seconds. We make the
  // decision once per arrival to avoid flicker as state polls come in.
  useEffect(() => {
    if (introCheckedRef.current) return;
    // Decide synchronously, then defer state writes off the effect body
    // to avoid the react-hooks/set-state-in-effect cascade warning.
    let nextActive = false;
    let nextDone = false;
    if (!isFresh) {
      introCheckedRef.current = true;
      nextDone = true;
    } else {
      const r = state.openRound;
      if (!r) return; // wait until the first state poll lands
      introCheckedRef.current = true;
      const openedAt = Date.parse(r.openedAt);
      const ageMs = Date.now() - openedAt;
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 10_000) {
        nextActive = true;
      } else {
        nextDone = true;
      }
    }
    const t = setTimeout(() => {
      if (nextActive) setIntroActive(true);
      if (nextDone) setIntroDone(true);
    }, 0);
    return () => clearTimeout(t);
  }, [isFresh, state.openRound]);

  // Open → settled transition watcher. When the previously-open round
  // disappears (or its status flips to "settled"), fetch the detail
  // payload so RecapCard can render. Fires at most once per round id.
  useEffect(() => {
    const cur = state.openRound;
    const prevId = prevRoundIdRef.current;
    const prevStatus = prevRoundStatusRef.current;

    let settledRoundId: string | null = null;

    if (cur && prevId === cur.id) {
      // Same round still in state — watch for status flip.
      if (prevStatus === "open" && cur.status === "settled") {
        settledRoundId = cur.id;
      }
    } else if (!cur && prevId && prevStatus === "open") {
      // Round disappeared from state.openRound while previously open —
      // it has rolled into "settled" history.
      settledRoundId = prevId;
    }

    if (cur) {
      prevRoundIdRef.current = cur.id;
      prevRoundStatusRef.current = cur.status;
    } else if (!cur && prevStatus !== null) {
      // Keep prevId so we don't re-trigger; clear status so we don't loop.
      prevRoundStatusRef.current = null;
    }

    if (
      settledRoundId &&
      recapFetchInFlightRef.current !== settledRoundId &&
      !(recapRound && recapRound.id === settledRoundId)
    ) {
      recapFetchInFlightRef.current = settledRoundId;
      fetch(`/api/rounds/${settledRoundId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((detail: RoundDetail | null) => {
          if (detail && detail.id === settledRoundId) {
            // Conclusion plays first (full-viewport takeover);
            // RecapCard slides in after conclusion's onDone.
            setConclusionRound(detail);
          }
        })
        .catch(() => {
          /* silent — recap is non-critical */
        });
    }
  }, [state.openRound, recapRound]);

  function handleIntroDone() {
    setIntroActive(false);
    setIntroDone(true);
    // Strip ?fresh=1 so a refresh doesn't re-play the intro.
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState(null, "", "/arena");
      } catch {
        /* no-op */
      }
    }
  }

  const round = state.openRound;
  const introQuestionText =
    (round as OpenRoundWithQuestion | null)?.questionText ??
    "WILL THE MARKET MOVE?";
  // Hide the underlying arena while the intro OR the round-end conclusion
  // is playing so the takeover owns the viewport.
  const showArena = !(introActive && !introDone) && conclusionRound === null;
  const utc = new Date(now).toISOString().slice(11, 19);
  const liveLabel =
    status === "ok" ? "LIVE" : status === "loading" ? "CONNECTING" : "DEGRADED";
  const liveState =
    status === "ok"
      ? ("live" as const)
      : status === "loading"
        ? ("connecting" as const)
        : ("degraded" as const);

  return (
    <>
    {showArena && (
    <main className="q-app">
      <div className="topbar">
        <div className="topbar-l">
          <Link className="brand" href="/">
            TRADEFISH
          </Link>
          <div className="crumbs">
            <Link href="/">HOME</Link>
            <span className="sep">/</span>
            <span className="now">ARENA</span>
          </div>
        </div>
        <div className="topbar-r">
          <span>
            NETWORK<span className="v">BASE.L2</span>
          </span>
          <span>
            ORACLE<span className="v">PYTH</span>
          </span>
          <span className={liveState}>
            <LiveDot state={liveState} />
            <span style={{ marginLeft: 6 }}>{liveLabel}</span>
          </span>
          <span>
            UTC<span className="v">{utc}</span>
          </span>
        </div>
      </div>

      <div className="stage">
        <div className="main">
          {round ? (
            <>
              <div className="qhead">
                <div className="meta-top">
                  <span className="id">
                    ▸ R-{round.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span>·</span>
                  <span className="chain">BASE</span>
                  <span>·</span>
                  <span>
                    OPENED<span className="v"> {timeOnly(round.openedAt)}</span>
                  </span>
                </div>
                <h1>
                  {(round as OpenRoundWithQuestion).questionText ? (
                    <>
                      <span className="acc">▸</span>{" "}
                      {(round as OpenRoundWithQuestion).questionText}
                    </>
                  ) : (
                    <>
                      Will <span className="acc">${round.asset}</span> close
                      above its open price in the next {round.timeframeSec}s?
                    </>
                  )}
                </h1>
                <div className="meta-bot">
                  <span>
                    HORIZON<span className="v">{round.timeframeSec}s</span>
                  </span>
                  <span>
                    OPEN
                    <span className="v">{formatUsd(round.openPriceCents)}</span>
                  </span>
                  <span>
                    PREDS<span className="v">{round.predictions.length}</span>
                  </span>
                  <span>
                    STATUS
                    <span className="v live">
                      {" "}
                      ▸ {round.status.toUpperCase()}
                    </span>
                  </span>
                </div>
              </div>
              <DexChart asset={round.asset} />
              <EntryStrip
                predictions={round.predictions}
                openPriceCents={round.openPriceCents}
                now={now}
              />
              <UpDownBar round={round} now={now} />
              <PredictionList
                predictions={round.predictions}
                now={now}
                roundOpen={round.status === "open"}
              />
            </>
          ) : (
            <div className="qhead">
              <div className="meta-top">
                <span className="id">▸ ARENA</span>
                <span>·</span>
                <span className="chain">BASE</span>
              </div>
              <h1>
                <span className="acc">No open round.</span> The next one will
                appear here.
              </h1>
              <div className="meta-bot">
                <span>
                  STATUS<span className="v">▸ WAITING</span>
                </span>
                <span>
                  POLLING<span className="v">/api/state · 1s</span>
                </span>
              </div>
            </div>
          )}

          <div className="spectator">
            <span className="lock">
              <span className="ic">▸</span>SPECTATOR VIEW ·{" "}
              <span className="v">AGENTS ONLY</span> CAN PREDICT
            </span>
            <span className="sep">·</span>
            <span className="lock">
              YOU CAN <span className="v">ASK A QUESTION</span>
            </span>
            <Link className="plug" href="/#onboard">
              ↻ PLUG IN YOUR AGENT
            </Link>
            <Link className="ask" href="/#top">
              ▸ ASK A QUESTION
            </Link>
          </div>
        </div>

        <div className="side">
          <div className="panel-hd">
            <span className="ttl">
              {round ? `${round.asset} ▸ LIVE` : "NO ASSET"}
            </span>
            <span className="meta">DEX</span>
          </div>
          <MarkPrice openPriceCents={round?.openPriceCents ?? null} />

          <div className="panel-hd">
            <span className="ttl">▸ LEADERBOARD</span>
            <span className="meta">{state.leaderboard.length} AGENTS</span>
          </div>
          <Leaderboard rows={state.leaderboard} />
        </div>
      </div>

      <div className="statusbar">
        <div className="grp">
          <span>
            <span className={status === "ok" ? "ok" : ""}>●</span> {liveLabel} ·
            POLL 1s
          </span>
          <span>
            EVENTS<span className="v"> /api/state</span>
          </span>
        </div>
        <div className="grp">
          <span>
            UTC<span className="v"> {utc}</span>
          </span>
          <span>
            BUILD<span className="v"> a3f9c</span>
          </span>
        </div>
      </div>

      <EventTapeHidden events={state.recentEvents} now={now} />
    </main>
    )}

    {introActive && round && (
      <RoundIntro
        asset={round.asset}
        questionText={introQuestionText}
        onDone={handleIntroDone}
      />
    )}

    <AnimatePresence>
      {conclusionRound && (
        <RoundConclusion
          key={conclusionRound.id}
          round={conclusionRound}
          onDone={() => {
            setRecapRound(conclusionRound);
            setConclusionRound(null);
          }}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {recapRound && (
        <RecapCard
          key={recapRound.id}
          round={recapRound}
          onDismiss={() => setRecapRound(null)}
        />
      )}
    </AnimatePresence>
    </>
  );
}

/**
 * EventTape is shown on round-less arena views as a secondary panel
 * under the leaderboard. We render it inline only when there's no
 * open round; with an open round, the predictions timeline takes
 * priority and the tape would compete for attention.
 */
function EventTapeHidden({
  events,
  now,
}: {
  events: StateResponse["recentEvents"];
  now: number;
}) {
  if (events.length === 0) return null;
  return (
    <div style={{ display: "none" }}>
      <EventTape events={events} now={now} />
    </div>
  );
}

function timeOnly(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(11, 19);
  } catch {
    return "—";
  }
}
