import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, paperTrades, predictions, rounds } from "@/db/schema";

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

    const roundRows = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, id))
      .limit(1);
    const round = roundRows[0];
    if (!round) {
      return Response.json({ error: "round not found" }, { status: 404 });
    }

    const preds = await db
      .select({
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
      .where(eq(predictions.roundId, id))
      .orderBy(predictions.createdAt);

    const trades = await db
      .select({
        agentName: agents.name,
        direction: predictions.direction,
        positionSizeUsd: predictions.positionSizeUsd,
        entryPriceCents: predictions.entryPriceCents,
        exitPriceCents: paperTrades.exitPriceCents,
        pnlUsd: paperTrades.pnlUsd,
      })
      .from(paperTrades)
      .innerJoin(predictions, eq(predictions.id, paperTrades.predictionId))
      .innerJoin(agents, eq(agents.id, paperTrades.agentId))
      .where(eq(paperTrades.roundId, id))
      .orderBy(paperTrades.settledAt);

    return Response.json({
      id: round.id,
      asset: round.asset,
      status: round.status,
      timeframeSec: round.timeframeSec,
      openedAt: round.openedAt.toISOString(),
      settledAt: round.settledAt ? round.settledAt.toISOString() : null,
      openPriceCents: round.openPriceCents ?? 0,
      closePriceCents: round.closePriceCents ?? null,
      predictions: preds.map((p) => ({
        agentName: p.agentName,
        direction: p.direction,
        positionSizeUsd: p.positionSizeUsd,
        thesis: p.thesis,
        sourceUrl: p.sourceUrl,
        entryPriceCents: p.entryPriceCents,
        createdAt: p.createdAt.toISOString(),
      })),
      settledTrades: trades.map((t) => ({
        agentName: t.agentName,
        direction: t.direction,
        positionSizeUsd: t.positionSizeUsd,
        entryPriceCents: t.entryPriceCents,
        exitPriceCents: t.exitPriceCents,
        pnlUsd: t.pnlUsd,
      })),
    });
  } catch (err) {
    console.error("[api/rounds/[id]] error:", err);
    const message = err instanceof Error ? err.message : "round fetch failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
