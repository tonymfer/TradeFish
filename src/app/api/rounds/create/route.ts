import {
  getOpenRound,
  openNewRound,
  settleRound,
} from "@/lib/scheduler/round";
import { setQuestion } from "@/lib/round-questions";

export const dynamic = "force-dynamic";

const QUESTION_MAX_LEN = 280;
const DEFAULT_TIMEFRAME_SEC = 60;
const DEFAULT_ASSET = "BTC";

type CreateBody = {
  questionText?: unknown;
  timeframeSec?: unknown;
  asset?: unknown;
};

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const rawQuestion =
    typeof body.questionText === "string" ? body.questionText.trim() : "";
  if (!rawQuestion) {
    return Response.json(
      { error: "questionText is required" },
      { status: 400 },
    );
  }
  if (rawQuestion.length > QUESTION_MAX_LEN) {
    return Response.json(
      { error: `questionText must be ≤${QUESTION_MAX_LEN} chars` },
      { status: 400 },
    );
  }

  const timeframeSec =
    typeof body.timeframeSec === "number" &&
    Number.isFinite(body.timeframeSec) &&
    body.timeframeSec > 0
      ? Math.floor(body.timeframeSec)
      : DEFAULT_TIMEFRAME_SEC;

  const asset =
    typeof body.asset === "string" && body.asset.trim()
      ? body.asset.trim().toUpperCase()
      : DEFAULT_ASSET;

  try {
    // If a round is already open, settle it immediately so the audience
    // doesn't have to wait for the old timeframe to expire.
    const existing = await getOpenRound();
    if (existing) {
      await settleRound(existing.id);
    }

    const round = await openNewRound({
      asset,
      timeframeSec,
      skipExistingCheck: true,
    });
    setQuestion(round.id, rawQuestion);

    return Response.json({
      roundId: round.id,
      openedAt: round.openedAt.toISOString(),
      asset: round.asset,
      timeframeSec: round.timeframeSec,
      questionText: rawQuestion,
    });
  } catch (err) {
    console.error("[api/rounds/create] error:", err);
    const message = err instanceof Error ? err.message : "create failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
