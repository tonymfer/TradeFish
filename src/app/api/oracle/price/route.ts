import { getLivePrice } from "@/lib/oracle";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const price = await getLivePrice();
    return Response.json(
      {
        asset: "BTC",
        priceCents: price.priceCents,
        fetchedAt: price.fetchedAt.toISOString(),
        source: price.source,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (err) {
    console.error("[api/oracle/price] error:", err);
    const message = err instanceof Error ? err.message : "price lookup failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
