import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, paperTrades, predictions, rounds } from "@/db/schema";
import { errorResponse } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

type TradeHighlight = {
  agentName: string;
  agentId: string;
  pnlUsd: number;
  direction: "LONG" | "SHORT" | "HOLD";
  positionSizeUsd: number;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit") ?? "5";
    const limit = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 20) {
      return Response.json(
        { error: "invalid limit; expected 1-20" },
        { status: 422 },
      );
    }

    // Top-N settled rounds with non-null open/close prices (open != 0),
    // sorted by abs((close - open) / open) desc.
    const topRounds = await db
      .select({
        id: rounds.id,
        asset: rounds.asset,
        openedAt: rounds.openedAt,
        settledAt: rounds.settledAt,
        openPriceCents: rounds.openPriceCents,
        closePriceCents: rounds.closePriceCents,
      })
      .from(rounds)
      .where(
        and(
          eq(rounds.status, "settled"),
          isNotNull(rounds.openPriceCents),
          isNotNull(rounds.closePriceCents),
          isNotNull(rounds.settledAt),
          ne(rounds.openPriceCents, 0),
        ),
      )
      .orderBy(
        desc(
          sql`abs((${rounds.closePriceCents} - ${rounds.openPriceCents})::numeric / ${rounds.openPriceCents}::numeric)`,
        ),
      )
      .limit(limit);

    const results = await Promise.all(
      topRounds.map(async (r) => {
        const open = r.openPriceCents;
        const close = r.closePriceCents;
        // These should not be null due to filters above, but guard anyway.
        if (open == null || close == null || open === 0 || !r.settledAt) {
          return null;
        }

        const deltaPct =
          Math.round(((close - open) / open) * 100 * 10000) / 10000;

        const [
          [predictionCountRow],
          [settledTradeCountRow],
          biggestWinRow,
          biggestLossRow,
        ] = await Promise.all([
          db
            .select({
              value: sql<number>`count(*)::int`,
            })
            .from(predictions)
            .where(eq(predictions.roundId, r.id)),
          db
            .select({
              value: sql<number>`count(*)::int`,
            })
            .from(paperTrades)
            .where(eq(paperTrades.roundId, r.id)),
          db
            .select({
              agentId: paperTrades.agentId,
              agentName: agents.name,
              pnlUsd: paperTrades.pnlUsd,
              direction: predictions.direction,
              positionSizeUsd: predictions.positionSizeUsd,
            })
            .from(paperTrades)
            .innerJoin(agents, eq(agents.id, paperTrades.agentId))
            .innerJoin(
              predictions,
              eq(predictions.id, paperTrades.predictionId),
            )
            .where(eq(paperTrades.roundId, r.id))
            .orderBy(desc(paperTrades.pnlUsd))
            .limit(1),
          db
            .select({
              agentId: paperTrades.agentId,
              agentName: agents.name,
              pnlUsd: paperTrades.pnlUsd,
              direction: predictions.direction,
              positionSizeUsd: predictions.positionSizeUsd,
            })
            .from(paperTrades)
            .innerJoin(agents, eq(agents.id, paperTrades.agentId))
            .innerJoin(
              predictions,
              eq(predictions.id, paperTrades.predictionId),
            )
            .where(eq(paperTrades.roundId, r.id))
            .orderBy(asc(paperTrades.pnlUsd))
            .limit(1),
        ]);

        const biggestWin: TradeHighlight | null =
          biggestWinRow[0] && Number(biggestWinRow[0].pnlUsd) > 0
            ? {
                agentId: biggestWinRow[0].agentId,
                agentName: biggestWinRow[0].agentName,
                pnlUsd: Number(biggestWinRow[0].pnlUsd),
                direction: biggestWinRow[0].direction,
                positionSizeUsd: Number(biggestWinRow[0].positionSizeUsd),
              }
            : null;

        const biggestLoss: TradeHighlight | null =
          biggestLossRow[0] && Number(biggestLossRow[0].pnlUsd) < 0
            ? {
                agentId: biggestLossRow[0].agentId,
                agentName: biggestLossRow[0].agentName,
                pnlUsd: Number(biggestLossRow[0].pnlUsd),
                direction: biggestLossRow[0].direction,
                positionSizeUsd: Number(biggestLossRow[0].positionSizeUsd),
              }
            : null;

        return {
          roundId: r.id,
          asset: r.asset,
          openedAt: r.openedAt.toISOString(),
          settledAt: r.settledAt.toISOString(),
          openPriceCents: Number(open),
          closePriceCents: Number(close),
          deltaPct,
          predictionCount: Number(predictionCountRow?.value ?? 0),
          settledTradeCount: Number(settledTradeCountRow?.value ?? 0),
          biggestWin,
          biggestLoss,
        };
      }),
    );

    return Response.json({ highlights: results.filter((x) => x !== null) });
  } catch (err) {
    return errorResponse(err);
  }
}
