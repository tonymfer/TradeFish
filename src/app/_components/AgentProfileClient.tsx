"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AgentBracket,
  AgentOpenPrediction,
  AgentProfile,
  AgentRecentTrade,
} from "./types";
import { LiveDot } from "./Panel";
import { formatPnl, formatUsd, timeAgo } from "./format";

const POLL_MS = 2000;

interface Props {
  agentId: string;
}

type Status = "loading" | "ok" | "error" | "missing";

export function AgentProfileClient({ agentId }: Props) {
  const [data, setData] = useState<AgentProfile | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/agents/${agentId}`, {
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
        const json = (await res.json()) as AgentProfile;
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
  }, [agentId]);

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
            <span className="now">
              A-{agentId.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>
        <div className="topbar-r">
          <span>
            ROUTE<span className="v">/AGENTS/[ID]</span>
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

      {status === "missing" ? (
        <MissingState agentId={agentId} />
      ) : !data ? (
        <SkeletonState />
      ) : (
        <ProfileBody data={data} now={now} />
      )}

      <div className="statusbar">
        <div className="grp">
          <span>
            <span className={status === "ok" ? "ok" : ""}>●</span> {liveLabel}{" "}
            · POLL 2s
          </span>
          <span>
            EVENTS
            <span className="v"> /api/agents/{agentId.slice(0, 8)}</span>
          </span>
        </div>
        <div className="grp">
          {data ? (
            <span>
              JOINED
              <span className="v"> {timeAgo(data.createdAt, now)}</span>
            </span>
          ) : null}
          <span>
            UTC<span className="v"> {utc}</span>
          </span>
        </div>
      </div>
    </main>
  );
}

function MissingState({ agentId }: { agentId: string }) {
  return (
    <div className="stage">
      <div className="main">
        <div className="qhead">
          <div className="meta-top">
            <span className="id">
              ▸ A-{agentId.slice(0, 8).toUpperCase()}
            </span>
            <span>·</span>
            <span className="chain">PROFILE</span>
          </div>
          <h1>
            <span className="acc">Agent not found.</span>
          </h1>
          <div className="meta-bot">
            <span>
              STATUS<span className="v">▸ MISSING</span>
            </span>
            <span>
              <Link href="/arena" style={{ color: "var(--cyan)" }}>
                ← back to arena
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonState() {
  return (
    <div className="stage">
      <div className="main">
        <div className="qhead">
          <div className="meta-top">
            <span className="id">▸ LOADING…</span>
          </div>
          <h1 style={{ opacity: 0.5 }}>
            <span className="acc">Connecting</span> to agent…
          </h1>
          <div className="meta-bot">
            <span>
              STATUS<span className="v">▸ CONNECTING</span>
            </span>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginTop: 16,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cell" style={{ opacity: 0.4 }}>
              <div className="lbl">—</div>
              <div className="v">———</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileBody({ data, now }: { data: AgentProfile; now: number }) {
  const repTone =
    data.reputationScore > 0
      ? "up"
      : data.reputationScore < 0
        ? "down"
        : "";
  const pnlTone =
    data.cumulativePnl > 0 ? "up" : data.cumulativePnl < 0 ? "down" : "";

  const winRateLabel =
    data.winRate === null
      ? "—"
      : `${Math.round(data.winRate * 100)}% (${Math.round(
          data.winRate * data.settledCount,
        )}/${data.settledCount})`;

  const tooltipFormula = `reputationScore = cumulativePnl − reviveCount × 500\n= ${data.cumulativePnl} − ${data.reviveCount} × 500 = ${data.reputationScore}`;

  return (
    <div className="stage">
      <div className="main">
        {data.suspended ? (
          <div
            style={{
              border: "1px solid var(--amber, #d4a960)",
              background: "rgba(212, 169, 96, 0.08)",
              color: "var(--amber, #d4a960)",
              padding: "10px 14px",
              marginBottom: 12,
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            ⚠ AGENT SUSPENDED — bankroll ≤ 0. Owner must revive via API.
          </div>
        ) : null}

        <div
          className="qhead"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>
              <span className="acc">{data.name}</span>
            </h1>
            <BracketPill bracket={data.bracket} />
            {data.reviveCount > 0 ? (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  background: "rgba(212, 169, 96, 0.1)",
                  color: "var(--amber, #d4a960)",
                  border: "1px solid rgba(212, 169, 96, 0.3)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                ↻ {data.reviveCount}
              </span>
            ) : null}
          </div>
          <Link
            href="/arena"
            style={{
              color: "var(--cyan)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            ← back to arena
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          <StatCell
            label="Reputation Score"
            value={String(data.reputationScore)}
            tone={repTone}
            big
            tooltip={tooltipFormula}
          />
          <StatCell
            label="Cumulative PnL"
            value={formatPnl(data.cumulativePnl)}
            tone={pnlTone}
          />
          <StatCell
            label="Current Bankroll"
            value={`$${data.bankrollUsd.toLocaleString("en-US", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}`}
          />
          <StatCell label="Win Rate" value={winRateLabel} />
        </div>

        {data.openPredictions.length > 0 ? (
          <OpenPredictionsSection
            predictions={data.openPredictions}
            now={now}
          />
        ) : null}

        <RecentTradesSection trades={data.recentTrades} now={now} />
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone,
  big,
  tooltip,
}: {
  label: string;
  value: string;
  tone?: string;
  big?: boolean;
  tooltip?: string;
}) {
  const color =
    tone === "up"
      ? "var(--long)"
      : tone === "down"
        ? "var(--short)"
        : "var(--cream)";
  return (
    <div
      className="cell"
      title={tooltip}
      style={{
        cursor: tooltip ? "help" : undefined,
      }}
    >
      <div className="lbl">{label}</div>
      <div
        className="v"
        style={{
          color,
          fontSize: big ? 24 : 16,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function BracketPill({ bracket }: { bracket: AgentBracket }) {
  const palette: Record<AgentBracket, { bg: string; fg: string }> = {
    Unranked: { bg: "rgba(120,120,120,0.15)", fg: "#9aa0a6" },
    Bronze: { bg: "rgba(176,100,60,0.18)", fg: "#cf8a5c" },
    Silver: { bg: "rgba(180,180,200,0.18)", fg: "#cfd2dc" },
    Gold: { bg: "rgba(212,169,96,0.18)", fg: "#d4a960" },
    Whale: { bg: "rgba(120,200,220,0.18)", fg: "#7ed0e2" },
    Legend: { bg: "rgba(168,216,232,0.22)", fg: "#a8d8e8" },
  };
  const { bg, fg } = palette[bracket] ?? palette.Unranked;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        background: bg,
        color: fg,
        border: `1px solid ${fg}33`,
        padding: "3px 9px",
        borderRadius: 999,
      }}
    >
      {bracket}
    </span>
  );
}

function OpenPredictionsSection({
  predictions,
  now,
}: {
  predictions: AgentOpenPrediction[];
  now: number;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <div className="panel-hd">
        <span className="ttl">▸ OPEN POSITIONS</span>
        <span className="meta">{predictions.length}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          marginTop: 10,
        }}
      >
        {predictions.map((p) => {
          const dirCls =
            p.direction === "LONG" ? "l" : p.direction === "SHORT" ? "s" : "h";
          return (
            <Link
              key={p.predictionId}
              href={`/rounds/${p.roundId}`}
              style={{ textDecoration: "none" }}
            >
              <div
                className="cell"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className={`pos ${dirCls}`}>
                    {p.direction} · ${p.positionSizeUsd.toLocaleString()}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--fg-faint)",
                    }}
                  >
                    {timeAgo(p.createdAt, now)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--cream)",
                  }}
                >
                  entry {formatUsd(p.entryPriceCents)}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--cyan)",
                    letterSpacing: "0.08em",
                  }}
                >
                  → R-{p.roundId.slice(0, 8).toUpperCase()}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RecentTradesSection({
  trades,
  now,
}: {
  trades: AgentRecentTrade[];
  now: number;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <div className="panel-hd">
        <span className="ttl">▸ RECENT TRADES</span>
        <span className="meta">last {trades.length}</span>
      </div>
      {trades.length === 0 ? (
        <div
          className="roster-empty"
          style={{ marginTop: 10 }}
        >
          ▸ NO SETTLED TRADES YET
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "var(--fg-faint)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontSize: 10,
                  borderBottom: "1px solid var(--hair)",
                }}
              >
                <th style={{ padding: "8px 10px" }}>Round</th>
                <th style={{ padding: "8px 10px" }}>Asset</th>
                <th style={{ padding: "8px 10px" }}>Dir</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>
                  Size
                </th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>
                  Entry
                </th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>
                  Exit
                </th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>
                  PnL
                </th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>
                  Settled
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const dirCls =
                  t.direction === "LONG"
                    ? "l"
                    : t.direction === "SHORT"
                      ? "s"
                      : "h";
                const pnlColor =
                  t.pnlUsd > 0
                    ? "var(--long)"
                    : t.pnlUsd < 0
                      ? "var(--short)"
                      : "var(--fg-faint)";
                return (
                  <tr
                    key={t.tradeId}
                    style={{
                      borderBottom: "1px solid var(--hair)",
                      color: "var(--cream)",
                    }}
                  >
                    <td style={{ padding: "8px 10px" }}>
                      <Link
                        href={`/rounds/${t.roundId}`}
                        style={{ color: "var(--cyan)" }}
                      >
                        R-{t.roundId.slice(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td style={{ padding: "8px 10px" }}>{t.asset}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span className={`pos ${dirCls}`}>{t.direction}</span>
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ${t.positionSizeUsd.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatUsd(t.entryPriceCents)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatUsd(t.exitPriceCents)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        color: pnlColor,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatPnl(t.pnlUsd)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        color: "var(--fg-faint)",
                      }}
                    >
                      {timeAgo(t.settledAt, now)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
