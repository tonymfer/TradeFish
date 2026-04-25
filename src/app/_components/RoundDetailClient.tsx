"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RoundDetail } from "./types";
import { UpDownBar } from "./UpDownBar";
import { PredictionList } from "./PredictionList";
import { DirectionBadge, LiveDot, Panel } from "./Panel";
import { formatPnl, formatUsd, timeAgo } from "./format";

const POLL_MS = 2000;

type Props = { roundId: string };
type Status = "loading" | "ok" | "error" | "missing";

export function RoundDetailClient({ roundId }: Props) {
  const [data, setData] = useState<RoundDetail | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/rounds/${roundId}`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          if (!cancelled) {
            setData(null);
            setStatus("missing");
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as RoundDetail;
        if (cancelled) return;
        setData(json);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
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
  }, [roundId]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-3 px-4 py-4">
      <Header roundId={roundId} status={status} now={now} />

      {data ? (
        <>
          <UpDownBar
            round={
              data.status === "settled"
                ? null
                : {
                    id: data.id,
                    asset: data.asset,
                    status: data.status,
                    openedAt: data.openedAt,
                    openPriceCents: data.openPriceCents,
                    timeframeSec: data.timeframeSec,
                    predictions: data.predictions,
                  }
            }
            now={now}
          />

          {data.status === "settled" ? (
            <SettledSummary detail={data} />
          ) : null}

          <PredictionList
            predictions={data.predictions}
            now={now}
            variant="full"
          />
        </>
      ) : (
        <Panel title="Round" right={status.toUpperCase()}>
          <div className="px-4 py-10 text-center text-xs text-zinc-500">
            {status === "missing"
              ? "Round not found."
              : "Connecting to round…"}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Header({
  roundId,
  status,
  now,
}: {
  roundId: string;
  status: Status;
  now: number;
}) {
  const time = new Date(now).toISOString().slice(11, 19);
  return (
    <header className="flex items-center justify-between border-b border-zinc-900 pb-3">
      <div className="flex items-baseline gap-3">
        <Link
          href="/arena"
          className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          ← ARENA
        </Link>
        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          /
        </span>
        <span className="font-mono text-xs text-zinc-300">
          round {roundId.slice(0, 8)}
        </span>
      </div>
      <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        <span className="flex items-center gap-2">
          <LiveDot on={status === "ok"} />
          {status === "ok"
            ? "LIVE"
            : status === "loading"
              ? "CONNECTING"
              : status === "missing"
                ? "MISSING"
                : "DEGRADED"}
        </span>
        <span className="tabular-nums text-zinc-400">UTC {time}</span>
      </div>
    </header>
  );
}

function SettledSummary({ detail }: { detail: RoundDetail }) {
  const total = detail.settledTrades.reduce((acc, t) => acc + t.pnlUsd, 0);
  return (
    <Panel
      title="Settled"
      right={
        detail.settledAt ? (
          <span>{timeAgo(detail.settledAt, Date.now())}</span>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 px-4 pt-4 md:grid-cols-4">
        <Stat
          label="Open"
          value={formatUsd(detail.openPriceCents)}
        />
        <Stat
          label="Close"
          value={
            detail.closePriceCents ? formatUsd(detail.closePriceCents) : "—"
          }
        />
        <Stat label="Trades" value={String(detail.settledTrades.length)} />
        <Stat
          label="Net PnL"
          value={formatPnl(total)}
          tone={total > 0 ? "up" : total < 0 ? "down" : undefined}
        />
      </div>
      <ul className="mt-3 divide-y divide-zinc-900/80">
        {detail.settledTrades.map((t, i) => (
          <li
            key={i}
            className="grid grid-cols-[6rem_1fr_auto_auto] items-center gap-3 px-3 py-2 text-xs"
          >
            <DirectionBadge direction={t.direction} />
            <span className="truncate text-zinc-200">{t.agentName}</span>
            <span className="tabular-nums text-zinc-400">
              size {formatUsd(t.positionSizeUsd * 100)}
            </span>
            <span
              className={`tabular-nums ${
                t.pnlUsd > 0
                  ? "text-lime-300"
                  : t.pnlUsd < 0
                    ? "text-rose-300"
                    : "text-zinc-400"
              }`}
            >
              {formatPnl(t.pnlUsd)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  const valueColor =
    tone === "up"
      ? "text-lime-300"
      : tone === "down"
        ? "text-rose-300"
        : "text-zinc-100";
  return (
    <div className="rounded border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-base font-semibold ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
