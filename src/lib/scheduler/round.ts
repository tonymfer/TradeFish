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

export async function openNewRound(opts?: {
  asset?: string;
  timeframeSec?: number;
  skipExistingCheck?: boolean;
}): Promise<Round> {
  const asset = opts?.asset ?? "BTC";
  const timeframeSec = opts?.timeframeSec;
  const skipExistingCheck = opts?.skipExistingCheck ?? false;

  if (!skipExistingCheck) {
    const existing = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.status, "open"), eq(rounds.asset, asset)))
      .limit(1);
    if (existing[0]) return existing[0];
  }

  const price = await getBtcPrice();
  const values: typeof rounds.$inferInsert = {
    asset,
    status: "open",
    openedAt: new Date(),
    openPriceCents: price.priceCents,
  };
  if (typeof timeframeSec === "number") {
    values.timeframeSec = timeframeSec;
  }
  const inserted = await db.insert(rounds).values(values).returning();
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
