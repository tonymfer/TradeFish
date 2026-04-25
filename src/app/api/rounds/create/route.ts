import { getOpenRound, openNewRound, settleRound } from "@/lib/scheduler/round";

export const dynamic = "force-dynamic";

type CreateBody = {
  questionText?: unknown;
  timeframeSec?: unknown;
  asset?: unknown;
};

export async function POST(req: Request) {
  try {
    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const rawQuestion =
      typeof body.questionText === "string" ? body.questionText : "";
    const trimmed = rawQuestion.trim();
    if (!trimmed) {
      return Response.json(
        { error: "questionText is required" },
        { status: 400 },
      );
    }
    const questionText = trimmed.slice(0, 280);

    const timeframeSec =
      typeof body.timeframeSec === "number" &&
      Number.isFinite(body.timeframeSec) &&
      body.timeframeSec > 0
        ? Math.floor(body.timeframeSec)
        : 60;

    const asset =
      typeof body.asset === "string" && body.asset.trim()
        ? body.asset.trim().toUpperCase()
        : "BTC";

    // Settle any open round so audience-created rounds preempt stale demo rounds.
    const open = await getOpenRound();
    if (open) {
      await settleRound(open.id);
    }

    const round = await openNewRound({
      asset,
      timeframeSec,
      questionText,
      skipExistingCheck: true,
    });

    return Response.json({
      roundId: round.id,
      openedAt: round.openedAt.toISOString(),
      asset: round.asset,
      timeframeSec: round.timeframeSec,
      questionText: round.questionText ?? null,
    });
  } catch (err) {
    console.error("[api/rounds/create] error:", err);
    const message = err instanceof Error ? err.message : "create failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
