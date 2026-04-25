import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, type Agent } from "@/db/schema";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireAgent(req: Request): Promise<Agent> {
  const token = getBearerToken(req);
  if (!token) {
    throw new HttpError(401, "missing bearer token");
  }
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKey, token))
    .limit(1);
  const agent = rows[0];
  if (!agent) {
    throw new HttpError(401, "invalid api key");
  }
  return agent;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[api] unhandled error:", err);
  const message = err instanceof Error ? err.message : "internal error";
  return Response.json({ error: message }, { status: 500 });
}

// Per-IP rate limiter, in-memory. Hackathon-grade.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
