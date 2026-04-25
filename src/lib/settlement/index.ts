import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, paperTrades, predictions, rounds } from "@/db/schema";

export type SettlementResult = {
  roundId: string;
  predictionsSettled: number;
};

const DIRECTION_SIGN = { LONG: 1, SHORT: -1, HOLD: 0 } as const;

export function computePnlUsd(
  positionSizeUsd: number,
  entryPriceCents: number,
  exitPriceCents: number,
  direction: "LONG" | "SHORT" | "HOLD",
): number {
  if (entryPriceCents <= 0) return 0;
  const sign = DIRECTION_SIGN[direction];
  if (sign === 0) return 0;
  const delta = (exitPriceCents - entryPriceCents) / entryPriceCents;
  const raw = positionSizeUsd * delta * sign;
  return Math.round(raw);
}

export async function settlePredictionsForRound(
  roundId: string,
): Promise<SettlementResult> {
  return db.transaction(async (tx) => {
    const roundRows = await tx
      .select()
      .from(rounds)
      .where(eq(rounds.id, roundId))
      .limit(1);
    const round = roundRows[0];
    if (!round) return { roundId, predictionsSettled: 0 };

    const exitPriceCents =
      round.closePriceCents ?? round.openPriceCents ?? null;
    if (exitPriceCents == null) {
      console.error(
        `[settlement] round ${roundId} has no close or open price; skipping`,
      );
      return { roundId, predictionsSettled: 0 };
    }

    const open = await tx
      .select()
      .from(predictions)
      .where(eq(predictions.roundId, roundId));

    let settled = 0;
    for (const p of open) {
      const existing = await tx
        .select({ id: paperTrades.id })
        .from(paperTrades)
        .where(eq(paperTrades.predictionId, p.id))
        .limit(1);
      if (existing[0]) continue;

      const pnlUsd = computePnlUsd(
        p.positionSizeUsd,
        p.entryPriceCents,
        exitPriceCents,
        p.direction,
      );

      await tx.insert(paperTrades).values({
        predictionId: p.id,
        agentId: p.agentId,
        roundId: p.roundId,
        exitPriceCents,
        pnlUsd,
        settledAt: new Date(),
      });

      const credit = p.positionSizeUsd + pnlUsd;
      await tx
        .update(agents)
        .set({
          bankrollUsd: sql`${agents.bankrollUsd} + ${credit}`,
          cumulativePnl: sql`${agents.cumulativePnl} + ${pnlUsd}`,
        })
        .where(eq(agents.id, p.agentId));

      settled += 1;
    }

    return { roundId, predictionsSettled: settled };
  });
}
