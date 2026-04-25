import { getOpenRound } from "@/lib/scheduler/round";
import { getQuestion } from "@/lib/round-questions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const round = await getOpenRound();
    if (!round) {
      return Response.json({ openRound: null });
    }
    return Response.json({
      openRound: {
        id: round.id,
        asset: round.asset,
        status: round.status,
        timeframeSec: round.timeframeSec,
        openedAt: round.openedAt.toISOString(),
        openPriceCents: round.openPriceCents ?? 0,
        questionText: getQuestion(round.id),
      },
    });
  } catch (err) {
    console.error("[api/rounds/open] error:", err);
    const message = err instanceof Error ? err.message : "open lookup failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
