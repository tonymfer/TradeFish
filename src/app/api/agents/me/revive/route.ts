import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agents } from "@/db/schema";
import { computeReputationScore, isSuspended } from "@/lib/agent/reputation";
import { errorResponse, requireAgent } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const me = await requireAgent(req);

    if (!isSuspended(me)) {
      return Response.json(
        {
          error: "agent is not suspended",
          currentBankroll: me.bankrollUsd,
        },
        { status: 409 },
      );
    }

    const updated = await db
      .update(agents)
      .set({
        bankrollUsd: 1000,
        reviveCount: sql`${agents.reviveCount} + 1`,
        lastRevivedAt: new Date(),
        suspendedAt: null,
      })
      .where(eq(agents.id, me.id))
      .returning();

    const fresh = updated[0];
    if (!fresh) {
      return Response.json({ error: "revive failed" }, { status: 500 });
    }

    return Response.json({
      bankrollUsd: fresh.bankrollUsd,
      reviveCount: fresh.reviveCount,
      reputationScore: computeReputationScore(fresh),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
