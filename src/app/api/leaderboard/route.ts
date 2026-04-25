import { asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, paperTrades, predictions } from "@/db/schema";
import { computeBracket, computeReputationScore } from "@/lib/agent/reputation";
import { errorResponse } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

const SORT_FIELDS = ["reputation", "pnl", "bankroll", "revives", "preds"] as const;
type SortField = (typeof SORT_FIELDS)[number];

const DIRS = ["asc", "desc"] as const;
type Dir = (typeof DIRS)[number];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sortParam = (url.searchParams.get("sort") ?? "reputation") as string;
    const dirParam = (url.searchParams.get("dir") ?? "desc") as string;
    const limitParam = url.searchParams.get("limit") ?? "50";

    if (!SORT_FIELDS.includes(sortParam as SortField)) {
      return Response.json(
        { error: `invalid sort; expected one of ${SORT_FIELDS.join(",")}` },
        { status: 422 },
      );
    }
    if (!DIRS.includes(dirParam as Dir)) {
      return Response.json(
        { error: `invalid dir; expected one of ${DIRS.join(",")}` },
        { status: 422 },
      );
    }
    const limit = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
      return Response.json(
        { error: "invalid limit; expected 1-200" },
        { status: 422 },
      );
    }

    const sort = sortParam as SortField;
    const dir = dirParam as Dir;

    const reputationExpr = sql<number>`(${agents.cumulativePnl} - ${agents.reviveCount} * 500)`;
    const predictionCountExpr = sql<number>`(select count(*)::int from ${predictions} where ${predictions.agentId} = ${agents.id})`;
    const settledCountExpr = sql<number>`(select count(*)::int from ${paperTrades} where ${paperTrades.agentId} = ${agents.id})`;
    const winCountExpr = sql<number>`(select count(*)::int from ${paperTrades} where ${paperTrades.agentId} = ${agents.id} and ${paperTrades.pnlUsd} > 0)`;

    let sortColumn: SQL<unknown>;
    switch (sort) {
      case "reputation":
        sortColumn = reputationExpr;
        break;
      case "pnl":
        sortColumn = sql`${agents.cumulativePnl}`;
        break;
      case "bankroll":
        sortColumn = sql`${agents.bankrollUsd}`;
        break;
      case "revives":
        sortColumn = sql`${agents.reviveCount}`;
        break;
      case "preds":
        sortColumn = predictionCountExpr;
        break;
    }

    const orderClause = dir === "asc" ? asc(sortColumn) : desc(sortColumn);

    const rows = await db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        cumulativePnl: agents.cumulativePnl,
        bankrollUsd: agents.bankrollUsd,
        reviveCount: agents.reviveCount,
        reputationScore: reputationExpr,
        predictionCount: predictionCountExpr,
        settledCount: settledCountExpr,
        winCount: winCountExpr,
      })
      .from(agents)
      .orderBy(orderClause)
      .limit(limit);

    return Response.json(
      rows.map((r) => {
        const settledCount = Number(r.settledCount ?? 0);
        const winCount = Number(r.winCount ?? 0);
        const winRate = settledCount === 0 ? null : winCount / settledCount;
        const reputationScore = Number(r.reputationScore ?? 0);
        return {
          agentId: r.agentId,
          agentName: r.agentName,
          cumulativePnl: r.cumulativePnl,
          bankrollUsd: r.bankrollUsd,
          reviveCount: r.reviveCount,
          reputationScore,
          bracket: computeBracket(reputationScore, settledCount),
          predictionCount: Number(r.predictionCount ?? 0),
          winRate,
          settledCount,
        };
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
