import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, paperTrades, predictions, rounds } from "@/db/schema";
import {
  computeBracket,
  computeReputationScore,
  isSuspended,
} from "@/lib/agent/reputation";
import { errorResponse } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return Response.json({ error: "missing id" }, { status: 422 });
    }

    const agentRows = await db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);
    const agent = agentRows[0];
    if (!agent) {
      return Response.json({ error: "agent not found" }, { status: 404 });
    }

    const settledCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paperTrades)
      .where(eq(paperTrades.agentId, agent.id));
    const settledCount = Number(settledCountRows[0]?.count ?? 0);

    const predictionCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(predictions)
      .where(eq(predictions.agentId, agent.id));
    const predictionCount = Number(predictionCountRows[0]?.count ?? 0);

    const winRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paperTrades)
      .where(
        and(eq(paperTrades.agentId, agent.id), sql`${paperTrades.pnlUsd} > 0`),
      );
    const winCount = Number(winRows[0]?.count ?? 0);
    const winRate = settledCount === 0 ? null : winCount / settledCount;

    const recentTradeRows = await db
      .select({
        tradeId: paperTrades.id,
        roundId: paperTrades.roundId,
        asset: rounds.asset,
        direction: predictions.direction,
        positionSizeUsd: predictions.positionSizeUsd,
        entryPriceCents: predictions.entryPriceCents,
        exitPriceCents: paperTrades.exitPriceCents,
        pnlUsd: paperTrades.pnlUsd,
        settledAt: paperTrades.settledAt,
      })
      .from(paperTrades)
      .innerJoin(predictions, eq(predictions.id, paperTrades.predictionId))
      .innerJoin(rounds, eq(rounds.id, paperTrades.roundId))
      .where(eq(paperTrades.agentId, agent.id))
      .orderBy(desc(paperTrades.settledAt))
      .limit(10);

    const openPredictionRows = await db
      .select({
        predictionId: predictions.id,
        roundId: predictions.roundId,
        direction: predictions.direction,
        positionSizeUsd: predictions.positionSizeUsd,
        entryPriceCents: predictions.entryPriceCents,
        createdAt: predictions.createdAt,
      })
      .from(predictions)
      .innerJoin(rounds, eq(rounds.id, predictions.roundId))
      .leftJoin(paperTrades, eq(paperTrades.predictionId, predictions.id))
      .where(
        and(
          eq(predictions.agentId, agent.id),
          eq(rounds.status, "open"),
          isNull(paperTrades.id),
        ),
      )
      .orderBy(desc(predictions.createdAt));

    const reputationScore = computeReputationScore(agent);
    const suspended = isSuspended(agent);
    const bracket = computeBracket(reputationScore, settledCount);

    return Response.json({
      agentId: agent.id,
      name: agent.name,
      bankrollUsd: agent.bankrollUsd,
      cumulativePnl: agent.cumulativePnl,
      reviveCount: agent.reviveCount,
      reputationScore,
      bracket,
      predictionCount,
      settledCount,
      winRate,
      suspended,
      createdAt: agent.createdAt.toISOString(),
      recentTrades: recentTradeRows.map((t) => ({
        tradeId: t.tradeId,
        roundId: t.roundId,
        asset: t.asset,
        direction: t.direction,
        positionSizeUsd: t.positionSizeUsd,
        entryPriceCents: t.entryPriceCents,
        exitPriceCents: t.exitPriceCents,
        pnlUsd: t.pnlUsd,
        settledAt: t.settledAt.toISOString(),
      })),
      openPredictions: openPredictionRows.map((p) => ({
        predictionId: p.predictionId,
        roundId: p.roundId,
        direction: p.direction,
        positionSizeUsd: p.positionSizeUsd,
        entryPriceCents: p.entryPriceCents,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
