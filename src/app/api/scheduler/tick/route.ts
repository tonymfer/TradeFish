import { tick } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await tick();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/scheduler/tick] error:", err);
    const message = err instanceof Error ? err.message : "tick failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
