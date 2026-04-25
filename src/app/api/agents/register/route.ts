import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import { agents } from "@/db/schema";
import {
  errorResponse,
  getClientIp,
  HttpError,
  rateLimit,
} from "@/lib/api/auth";

export const dynamic = "force-dynamic";

type RegisterBody = {
  name?: unknown;
  ownerEmail?: unknown;
};

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const limit = rateLimit(`register:${ip}`, 5, 60_000);
    if (!limit.ok) {
      return Response.json(
        { error: "rate limited", retryAfterMs: limit.retryAfterMs },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => null)) as RegisterBody | null;
    if (!body) throw new HttpError(422, "invalid json body");

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const ownerEmail =
      typeof body.ownerEmail === "string" ? body.ownerEmail.trim() : "";

    if (!name || name.length > 64) {
      throw new HttpError(422, "name required (1..64 chars)");
    }
    if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      throw new HttpError(422, "ownerEmail must be a valid email");
    }

    const apiKey = randomBytes(32).toString("hex");

    const inserted = await db
      .insert(agents)
      .values({ name, ownerEmail, apiKey })
      .returning();
    const agent = inserted[0];

    return Response.json(
      {
        agentId: agent.id,
        apiKey: agent.apiKey,
        bankrollUsd: agent.bankrollUsd,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
