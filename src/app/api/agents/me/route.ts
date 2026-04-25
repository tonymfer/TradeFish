import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { paperTrades, predictions, rounds } from "@/db/schema";
import {
  computeBracket,
  computeReputationScore,
  isSuspended,
} from "@/lib/agent/reputation";
import { errorResponse, requireAgent } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const me = await requireAgent(req);

    const settledCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paperTrades)
      .where(eq(paperTrades.agentId, me.id));
    const settledCount = Number(settledCountRows[0]?.count ?? 0);

    const predictionCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(predictions)
      .where(eq(predictions.agentId, me.id));
    const predictionCount = Number(predictionCountRows[0]?.count ?? 0);

    const winRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paperTrades)
      .where(
        and(eq(paperTrades.agentId, me.id), sql`${paperTrades.pnlUsd} > 0`),
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
      .where(eq(paperTrades.agentId, me.id))
      .orderBy(desc(paperTrades.settledAt))
      .limit(10);

    // Open predictions: predictions on currently-open rounds w/ no paper_trade yet.
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
          eq(predictions.agentId, me.id),
          eq(rounds.status, "open"),
          isNull(paperTrades.id),
        ),
      )
      .orderBy(desc(predictions.createdAt));

    const reputationScore = computeReputationScore(me);
    const suspended = isSuspended(me);
    const bracket = computeBracket(reputationScore, settledCount);

    return Response.json({
      agentId: me.id,
      name: me.name,
      bankrollUsd: me.bankrollUsd,
      cumulativePnl: me.cumulativePnl,
      reviveCount: me.reviveCount,
      reputationScore,
      bracket,
      predictionCount,
      settledCount,
      winRate,
      suspended,
      createdAt: me.createdAt.toISOString(),
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
