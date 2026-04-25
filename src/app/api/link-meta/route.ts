import {
  TTL_FAILURE_MS,
  TTL_SUCCESS_MS,
  get as cacheGet,
  set as cacheSet,
  type LinkMeta,
} from "@/lib/link-meta/cache";
import { parseHtml, resolveImageUrl } from "@/lib/link-meta/parse";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 2_500;
const BODY_BYTE_CAP = 1_024 * 1_024; // 1MB

const PRIVATE_HOST_RE =
  /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|::1|0\.|fe80:)/i;

function isAllowedHost(host: string): boolean {
  if (!host) return false;
  if (PRIVATE_HOST_RE.test(host)) return false;
  // raw IPv4 literals: still allow public ranges (e.g., 8.8.8.8) — quick check excludes the obvious internal ones above.
  return true;
}

async function readWithCap(
  res: Response,
  cap: number,
): Promise<string> {
  if (!res.body) {
    const text = await res.text();
    return text.slice(0, cap);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > cap) {
      const remaining = cap - (received - value.byteLength);
      out += decoder.decode(value.subarray(0, Math.max(0, remaining)), {
        stream: false,
      });
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const target = reqUrl.searchParams.get("url");
  if (!target) {
    return Response.json({ error: "missing url" }, { status: 422 });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    return Response.json({ error: "invalid url" }, { status: 422 });
  }
  if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
    return Response.json({ error: "url must be http or https" }, { status: 422 });
  }
  if (!isAllowedHost(parsedTarget.hostname)) {
    return Response.json({ error: "host not allowed" }, { status: 422 });
  }

  const canonical = parsedTarget.toString();
  const cached = cacheGet(canonical);
  if (cached) {
    return Response.json(cached);
  }

  const fallback: LinkMeta = {
    url: canonical,
    host: parsedTarget.hostname,
  };

  try {
    const res = await fetch(canonical, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "user-agent": "TradeFish/1.0 link-meta bot",
        accept: "text/html,*/*",
      },
    });
    if (!res.ok) {
      cacheSet(canonical, fallback, TTL_FAILURE_MS);
      return Response.json(fallback);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|xhtml|application\/xml/i.test(ct)) {
      cacheSet(canonical, fallback, TTL_FAILURE_MS);
      return Response.json(fallback);
    }
    const html = await readWithCap(res, BODY_BYTE_CAP);
    const parsed = parseHtml(html);
    const meta: LinkMeta = {
      url: canonical,
      host: parsedTarget.hostname,
      title: parsed.title,
      description: parsed.description,
      image: parsed.image
        ? resolveImageUrl(parsed.image, canonical)
        : undefined,
    };
    cacheSet(canonical, meta, TTL_SUCCESS_MS);
    return Response.json(meta);
  } catch (err) {
    console.error("[api/link-meta] fetch failed:", err);
    cacheSet(canonical, fallback, TTL_FAILURE_MS);
    return Response.json(fallback);
  }
}
