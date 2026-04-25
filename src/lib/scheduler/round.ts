import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { rounds, type Round } from "@/db/schema";
import { getBtcPrice } from "@/lib/oracle";
import { settlePredictionsForRound } from "@/lib/settlement";

export async function getOpenRound(): Promise<Round | null> {
  const result = await db
    .select()
    .from(rounds)
    .where(eq(rounds.status, "open"))
    .orderBy(asc(rounds.openedAt))
    .limit(1);
  return result[0] ?? null;
}

export async function openNewRound(asset = "BTC"): Promise<Round> {
  const existing = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.status, "open"), eq(rounds.asset, asset)))
    .limit(1);
  if (existing[0]) return existing[0];

  const price = await getBtcPrice();
  const inserted = await db
    .insert(rounds)
    .values({
      asset,
      status: "open",
      openedAt: new Date(),
      openPriceCents: price.priceCents,
    })
    .returning();
  return inserted[0];
}

export async function settleRound(roundId: string): Promise<Round | null> {
  const claimed = await db
    .update(rounds)
    .set({ status: "settling" })
    .where(and(eq(rounds.id, roundId), eq(rounds.status, "open")))
    .returning();
  const round = claimed[0];
  if (!round) return null;

  const price = await getBtcPrice();
  await settlePredictionsForRound(roundId, {
    exitPriceCents: price.priceCents,
  });

  const finalized = await db
    .update(rounds)
    .set({
      status: "settled",
      settledAt: new Date(),
      closePriceCents: price.priceCents,
    })
    .where(eq(rounds.id, roundId))
    .returning();
  return finalized[0] ?? null;
}

export function isRoundDue(round: Round, now: Date = new Date()): boolean {
  const elapsedSec = (now.getTime() - round.openedAt.getTime()) / 1000;
  return elapsedSec >= round.timeframeSec;
}
