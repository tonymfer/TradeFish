import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, paperTrades, predictions, rounds } from "@/db/schema";
import { computeBracket, computeReputationScore } from "@/lib/agent/reputation";

export const dynamic = "force-dynamic";

type EventType =
  | "round.opened"
  | "round.settled"
  | "prediction.posted"
  | "agent.registered";

type Event = { type: EventType; message: string; ts: string };

function fmtPriceFromCents(cents: number | null | undefined): string {
  if (cents == null) return "?";
  return `$${(cents / 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export async function GET() {
  try {
    const openRows = await db
      .select()
      .from(rounds)
      .where(eq(rounds.status, "open"))
      .orderBy(desc(rounds.openedAt))
      .limit(1);
    const open = openRows[0] ?? null;

    let openRoundPayload: unknown = null;
    if (open) {
      const preds = await db
        .select({
          agentId: predictions.agentId,
          agentName: agents.name,
          direction: predictions.direction,
          positionSizeUsd: predictions.positionSizeUsd,
          thesis: predictions.thesis,
          sourceUrl: predictions.sourceUrl,
          entryPriceCents: predictions.entryPriceCents,
          createdAt: predictions.createdAt,
        })
        .from(predictions)
        .innerJoin(agents, eq(agents.id, predictions.agentId))
        .where(eq(predictions.roundId, open.id))
        .orderBy(predictions.createdAt);
      openRoundPayload = {
        id: open.id,
        asset: open.asset,
        status: open.status,
        openedAt: open.openedAt.toISOString(),
        openPriceCents: open.openPriceCents ?? 0,
        timeframeSec: open.timeframeSec,
        predictions: preds.map((p) => ({
          agentId: p.agentId,
          agentName: p.agentName,
          direction: p.direction,
          positionSizeUsd: p.positionSizeUsd,
          thesis: p.thesis,
          sourceUrl: p.sourceUrl,
          entryPriceCents: p.entryPriceCents,
          createdAt: p.createdAt.toISOString(),
        })),
      };
    }

    const lb = await db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        cumulativePnl: agents.cumulativePnl,
        bankrollUsd: agents.bankrollUsd,
        reviveCount: agents.reviveCount,
        predictionCount: sql<number>`(select count(*)::int from ${predictions} where ${predictions.agentId} = ${agents.id})`,
        settledCount: sql<number>`(select count(*)::int from ${paperTrades} where ${paperTrades.agentId} = ${agents.id})`,
      })
      .from(agents)
      .orderBy(sql`(${agents.cumulativePnl} - ${agents.reviveCount} * 500) desc`)
      .limit(10);

    const recentRounds = await db
      .select({
        id: rounds.id,
        asset: rounds.asset,
        status: rounds.status,
        openedAt: rounds.openedAt,
        settledAt: rounds.settledAt,
        openPriceCents: rounds.openPriceCents,
        closePriceCents: rounds.closePriceCents,
      })
      .from(rounds)
      .orderBy(desc(rounds.openedAt))
      .limit(20);

    const recentPreds = await db
      .select({
        agentName: agents.name,
        direction: predictions.direction,
        positionSizeUsd: predictions.positionSizeUsd,
        asset: rounds.asset,
        createdAt: predictions.createdAt,
      })
      .from(predictions)
      .innerJoin(agents, eq(agents.id, predictions.agentId))
      .innerJoin(rounds, eq(rounds.id, predictions.roundId))
      .orderBy(desc(predictions.createdAt))
      .limit(20);

    const recentAgents = await db
      .select({ name: agents.name, createdAt: agents.createdAt })
      .from(agents)
      .orderBy(desc(agents.createdAt))
      .limit(10);

    const events: Event[] = [];

    for (const r of recentRounds) {
      events.push({
        type: "round.opened",
        message: `round opened on ${r.asset} @ ${fmtPriceFromCents(r.openPriceCents)}`,
        ts: r.openedAt.toISOString(),
      });
      if (r.status === "settled" && r.settledAt) {
        events.push({
          type: "round.settled",
          message: `round settled on ${r.asset}: ${fmtPriceFromCents(r.openPriceCents)} → ${fmtPriceFromCents(r.closePriceCents)}`,
          ts: r.settledAt.toISOString(),
        });
      }
    }
    for (const p of recentPreds) {
      events.push({
        type: "prediction.posted",
        message: `${p.agentName} ${p.direction} ${p.asset} @ $${p.positionSizeUsd}`,
        ts: p.createdAt.toISOString(),
      });
    }
    for (const a of recentAgents) {
      events.push({
        type: "agent.registered",
        message: `${a.name} registered`,
        ts: a.createdAt.toISOString(),
      });
    }

    events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    const recentEvents = events.slice(0, 20);

    return Response.json({
      openRound: openRoundPayload,
      leaderboard: lb.map((row) => {
        const reviveCount = Number(row.reviveCount ?? 0);
        const settledCount = Number(row.settledCount ?? 0);
        const reputationScore = computeReputationScore({
          cumulativePnl: row.cumulativePnl,
          reviveCount,
        });
        const bracket = computeBracket(reputationScore, settledCount);
        return {
          agentId: row.agentId,
          agentName: row.agentName,
          cumulativePnl: row.cumulativePnl,
          bankrollUsd: row.bankrollUsd,
          predictionCount: Number(row.predictionCount ?? 0),
          reviveCount,
          reputationScore,
          bracket,
        };
      }),
      recentEvents,
    });
  } catch (err) {
    console.error("[api/state] error:", err);
    const message = err instanceof Error ? err.message : "state failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
