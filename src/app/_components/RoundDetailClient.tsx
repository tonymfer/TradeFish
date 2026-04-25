"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RoundDetail } from "./types";
import { UpDownBar } from "./UpDownBar";
import { PredictionList } from "./PredictionList";
import { LiveDot } from "./Panel";
import { formatPnl, formatUsd, timeAgo } from "./format";

const POLL_MS = 1000;

interface Props {
  roundId: string;
}

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

  const utc = new Date(now).toISOString().slice(11, 19);
  const liveLabel =
    status === "ok"
      ? "LIVE"
      : status === "loading"
        ? "CONNECTING"
        : status === "missing"
          ? "MISSING"
          : "DEGRADED";
  const liveState =
    status === "ok"
      ? ("live" as const)
      : status === "loading"
        ? ("connecting" as const)
        : ("degraded" as const);

  const settled = data?.status === "settled";
  const totalPnl =
    data?.settledTrades?.reduce((acc, t) => acc + t.pnlUsd, 0) ?? 0;

  return (
    <main className="q-app">
      <div className="topbar">
        <div className="topbar-l">
          <Link className="brand" href="/">
            TRADEFISH
          </Link>
          <div className="crumbs">
            <Link href="/">HOME</Link>
            <span className="sep">/</span>
            <Link href="/arena">ARENA</Link>
            <span className="sep">/</span>
            <span className="now">R-{roundId.slice(0, 8).toUpperCase()}</span>
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
          {data ? (
            <>
              <div className="qhead">
                <div className="meta-top">
                  <span className="id">
                    ▸ R-{data.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span>·</span>
                  <span className="chain">BASE</span>
                  <span>·</span>
                  <span>
                    OPENED
                    <span className="v"> {timeOnly(data.openedAt)}</span>
                  </span>
                  {data.settledAt ? (
                    <>
                      <span>·</span>
                      <span>
                        SETTLED
                        <span className="v"> {timeOnly(data.settledAt)}</span>
                      </span>
                    </>
                  ) : null}
                </div>
                <h1>
                  Will <span className="acc">${data.asset}</span> close above
                  its open price in {data.timeframeSec}s?
                </h1>
                <div className="meta-bot">
                  <span>
                    HORIZON<span className="v">{data.timeframeSec}s</span>
                  </span>
                  <span>
                    OPEN
                    <span className="v">{formatUsd(data.openPriceCents)}</span>
                  </span>
                  {data.closePriceCents ? (
                    <span>
                      CLOSE
                      <span className="v">
                        {formatUsd(data.closePriceCents)}
                      </span>
                    </span>
                  ) : null}
                  <span>
                    STATUS
                    <span className="v live">
                      {" "}
                      ▸ {data.status.toUpperCase()}
                    </span>
                  </span>
                </div>
              </div>

              {settled ? (
                <SettledStrip detail={data} totalPnl={totalPnl} />
              ) : (
                <UpDownBar
                  round={{
                    id: data.id,
                    asset: data.asset,
                    status: data.status,
                    openedAt: data.openedAt,
                    openPriceCents: data.openPriceCents,
                    timeframeSec: data.timeframeSec,
                    predictions: data.predictions,
                  }}
                  now={now}
                />
              )}

              <PredictionList
                predictions={data.predictions}
                now={now}
                roundOpen={data.status === "open"}
              />
            </>
          ) : (
            <div className="qhead">
              <div className="meta-top">
                <span className="id">
                  ▸ R-{roundId.slice(0, 8).toUpperCase()}
                </span>
                <span>·</span>
                <span className="chain">BASE</span>
              </div>
              <h1>
                {status === "missing" ? (
                  <>
                    <span className="acc">Round not found.</span>
                  </>
                ) : (
                  <>
                    <span className="acc">Connecting</span> to round…
                  </>
                )}
              </h1>
              <div className="meta-bot">
                <span>
                  STATUS<span className="v">▸ {liveLabel}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="side">
          <div className="panel-hd">
            <span className="ttl">
              {data ? `${data.asset} ▸ ${settled ? "SETTLED" : "LIVE"}` : "—"}
            </span>
            <span className="meta">PYTH</span>
          </div>
          <div className="price-card">
            <div className="lbl">▸ {settled ? "CLOSE" : "OPEN"} PRICE</div>
            <div className="px">
              {data
                ? formatUsd(
                    settled
                      ? (data.closePriceCents ?? data.openPriceCents)
                      : data.openPriceCents,
                  )
                : "—"}
            </div>
            <div className={`delta ${settled && totalPnl < 0 ? "down" : ""}`}>
              {settled
                ? `realized ${formatPnl(totalPnl)}`
                : data
                  ? "open · awaiting close"
                  : "—"}
            </div>
            <div className="src">
              SOURCE <span className="v">PYTH HERMES</span>
            </div>
          </div>

          <div className="panel-hd">
            <span className="ttl">▸ AGENTS IN ROUND</span>
            <span className="meta">{data?.predictions.length ?? 0}</span>
          </div>
          <RoundRoster detail={data} now={now} />
        </div>
      </div>

      <div className="statusbar">
        <div className="grp">
          <span>
            <span className={status === "ok" ? "ok" : ""}>●</span> {liveLabel} ·
            POLL 1s
          </span>
          <span>
            EVENTS<span className="v"> /api/rounds/{roundId.slice(0, 8)}</span>
          </span>
        </div>
        <div className="grp">
          <span>
            UTC<span className="v"> {utc}</span>
          </span>
        </div>
      </div>
    </main>
  );
}

function SettledStrip({
  detail,
  totalPnl,
}: {
  detail: RoundDetail;
  totalPnl: number;
}) {
  const tone = totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : "";
  return (
    <div className="settle-block">
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--cyan)",
        }}
      >
        ▸ SETTLED · NET PNL{" "}
        <span
          style={{
            color:
              tone === "up"
                ? "var(--long)"
                : tone === "down"
                  ? "var(--short)"
                  : "var(--cream)",
          }}
        >
          {formatPnl(totalPnl)}
        </span>
      </div>
      <div className="grid">
        <Cell label="Open" value={formatUsd(detail.openPriceCents)} />
        <Cell
          label="Close"
          value={
            detail.closePriceCents ? formatUsd(detail.closePriceCents) : "—"
          }
        />
        <Cell label="Trades" value={String(detail.settledTrades.length)} />
        <Cell label="Net PnL" value={formatPnl(totalPnl)} tone={tone} />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="cell">
      <div className="lbl">{label}</div>
      <div className={`v ${tone || ""}`}>{value}</div>
    </div>
  );
}

function RoundRoster({
  detail,
  now,
}: {
  detail: RoundDetail | null;
  now: number;
}) {
  if (!detail || detail.predictions.length === 0) {
    return (
      <div className="roster-empty">
        ▸ NO AGENTS HAVE PREDICTED THIS ROUND YET
      </div>
    );
  }
  return (
    <div className="roster">
      {detail.predictions.map((p, i) => {
        const dirCls =
          p.direction === "LONG" ? "l" : p.direction === "SHORT" ? "s" : "h";
        const settled = detail.settledTrades.find(
          (t) => t.agentId === p.agentId,
        );
        return (
          <div key={`${p.agentId}-${p.createdAt}-${i}`} className="ag-row">
            <span className="who">
              <Link href={`/agents/${p.agentId}`} className="agent-link name">
                {p.agentName}
              </Link>
            </span>
            <span className={`pos ${dirCls}`}>
              {p.direction} · {formatUsd(p.positionSizeUsd * 100)}
            </span>
            <span className="meta-line">
              <span>entry {formatUsd(p.entryPriceCents)}</span>
              <span>{timeAgo(p.createdAt, now)}</span>
              {settled ? (
                <span className={settled.pnlUsd >= 0 ? "pnl-up" : "pnl-dn"}>
                  pnl {formatPnl(settled.pnlUsd)}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
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
