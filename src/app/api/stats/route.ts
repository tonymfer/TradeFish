import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, paperTrades, predictions, rounds } from "@/db/schema";
import { errorResponse } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [
      [agentsRow],
      [predictionsRow],
      [tradesRow],
      [pnlRow],
      [roundsRow],
      [openRoundsRow],
    ] = await Promise.all([
      db.select({ value: count() }).from(agents),
      db.select({ value: count() }).from(predictions),
      db.select({ value: count() }).from(paperTrades),
      db
        .select({
          value: sql<string | null>`coalesce(sum(${agents.cumulativePnl}), 0)`,
        })
        .from(agents),
      db.select({ value: count() }).from(rounds),
      db
        .select({ value: count() })
        .from(rounds)
        .where(eq(rounds.status, "open")),
    ]);

    return Response.json({
      totalAgents: Number(agentsRow?.value ?? 0),
      totalPredictions: Number(predictionsRow?.value ?? 0),
      totalSettled: Number(tradesRow?.value ?? 0),
      aggregateCumulativePnl: Number(pnlRow?.value ?? 0),
      totalRounds: Number(roundsRow?.value ?? 0),
      openRounds: Number(openRoundsRow?.value ?? 0),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
