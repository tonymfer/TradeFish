import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, predictions, rounds } from "@/db/schema";
import { errorResponse, HttpError, requireAgent } from "@/lib/api/auth";
import { isSuspended } from "@/lib/agent/reputation";
import { getBtcPrice } from "@/lib/oracle";

export const dynamic = "force-dynamic";

type PredictBody = {
  direction?: unknown;
  confidence?: unknown;
  positionSizeUsd?: unknown;
  thesis?: unknown;
  sourceUrl?: unknown;
};

const DIRECTIONS = new Set(["LONG", "SHORT", "HOLD"] as const);
type Direction = "LONG" | "SHORT" | "HOLD";

const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roundId } = await ctx.params;
    if (!roundId) throw new HttpError(422, "roundId required");

    const agent = await requireAgent(req);
    if (isSuspended(agent)) throw new HttpError(409, "agent suspended");

    const body = (await req.json().catch(() => null)) as PredictBody | null;
    if (!body) throw new HttpError(422, "invalid json body");

    const direction = body.direction;
    if (typeof direction !== "string" || !DIRECTIONS.has(direction as Direction)) {
      throw new HttpError(422, "direction must be LONG | SHORT | HOLD");
    }
    const confidence = Number(body.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      throw new HttpError(422, "confidence must be 0..100");
    }
    const positionSizeUsd = Number(body.positionSizeUsd);
    if (
      !Number.isFinite(positionSizeUsd) ||
      positionSizeUsd < 10 ||
      positionSizeUsd > 1000 ||
      !Number.isInteger(positionSizeUsd)
    ) {
      throw new HttpError(422, "positionSizeUsd must be an integer 10..1000");
    }
    const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";
    if (!thesis || thesis.length > 1500) {
      throw new HttpError(422, "thesis required (1..1500 chars)");
    }
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
    if (!sourceUrl || !URL_RE.test(sourceUrl)) {
      throw new HttpError(422, "sourceUrl must be a valid http(s) URL");
    }

    const roundRows = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, roundId))
      .limit(1);
    const round = roundRows[0];
    if (!round) throw new HttpError(404, "round not found");
    if (round.status !== "open") {
      throw new HttpError(409, `round is ${round.status}`);
    }

    // Multi-posting is allowed: an agent can submit any number of
    // predictions in a single round (LONG → SHORT reversals, scaling
    // in, multiple theses on the same direction). The previous
    // 'one prediction per round per agent' guard was lifted; settlement
    // works per-prediction so PnL accumulates correctly.

    if (agent.bankrollUsd < positionSizeUsd) {
      throw new HttpError(422, "insufficient bankroll");
    }

    const price = await getBtcPrice();

    // hold the position size out of bankroll
    const debited = await db
      .update(agents)
      .set({ bankrollUsd: sql`${agents.bankrollUsd} - ${positionSizeUsd}` })
      .where(
        and(
          eq(agents.id, agent.id),
          sql`${agents.bankrollUsd} >= ${positionSizeUsd}`,
        ),
      )
      .returning({ bankrollUsd: agents.bankrollUsd });
    if (!debited[0]) {
      throw new HttpError(409, "bankroll changed concurrently");
    }

    const inserted = await db
      .insert(predictions)
      .values({
        agentId: agent.id,
        roundId,
        direction: direction as Direction,
        confidence: Math.round(confidence),
        positionSizeUsd,
        thesis,
        sourceUrl,
        entryPriceCents: price.priceCents,
      })
      .returning();
    const prediction = inserted[0];

    return Response.json(
      {
        predictionId: prediction.id,
        entryPriceCents: prediction.entryPriceCents,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
