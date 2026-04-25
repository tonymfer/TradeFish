import { db } from "@/db/client";
import { oracleSnapshots } from "@/db/schema";
import { lookupAssetChart } from "@/app/_components/ASSET_CHART_REGISTRY";

// 500ms is the floor — any tighter and we slam DexScreener's API.
// Client-side MarkPrice polls at 500ms; concurrent requests within a
// process share one in-flight fetch via the inflight map below.
const CACHE_TTL_MS = 500;

export type OraclePrice = {
  priceCents: number;
  fetchedAt: Date;
  source: "dexscreener";
};

type CacheEntry = {
  value: OraclePrice;
  expiresAt: number;
};

type GlobalWithOracle = typeof globalThis & {
  __tradefishDexCache?: Map<string, CacheEntry>;
  __tradefishDexInflight?: Map<string, Promise<OraclePrice>>;
};

const g = globalThis as GlobalWithOracle;
const cache = g.__tradefishDexCache ?? new Map<string, CacheEntry>();
const inflight = g.__tradefishDexInflight ?? new Map<string, Promise<OraclePrice>>();
g.__tradefishDexCache = cache;
g.__tradefishDexInflight = inflight;

type DexPair = {
  priceUsd?: string;
  priceNative?: string;
  chainId?: string;
};

type DexResponse = {
  pairs?: DexPair[];
};

function priceUsdToCents(priceUsd: string): number {
  const [whole, frac = ""] = priceUsd.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const wholeCents = BigInt(whole) * BigInt(100);
  const fracCents = BigInt(fracPadded || "0");
  const sign = wholeCents < BigInt(0) ? BigInt(-1) : BigInt(1);
  const cents = wholeCents + sign * fracCents;
  return Number(cents);
}

async function fetchFromDex(asset: string): Promise<OraclePrice> {
  const entry = lookupAssetChart(asset);
  if (!entry) {
    throw new Error(`No DexScreener pair registered for ${asset}`);
  }
  const url = `https://api.dexscreener.com/latest/dex/pairs/${entry.chain}/${entry.pairAddress}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`DexScreener responded ${res.status}`);
  }
  const json = (await res.json()) as DexResponse;
  const pair = json.pairs?.[0];
  const priceUsd = pair?.priceUsd;
  if (!priceUsd) {
    throw new Error(`DexScreener returned no priceUsd for ${asset}`);
  }
  const priceCents = priceUsdToCents(priceUsd);
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    throw new Error(`DexScreener returned invalid price: ${priceUsd}`);
  }
  return { priceCents, fetchedAt: new Date(), source: "dexscreener" };
}

export async function getBtcPrice(): Promise<OraclePrice> {
  const key = "BTC";
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const price = await fetchFromDex(key);
      cache.set(key, { value: price, expiresAt: Date.now() + CACHE_TTL_MS });
      try {
        await db.insert(oracleSnapshots).values({
          asset: "BTC",
          priceCents: price.priceCents,
          fetchedAt: price.fetchedAt,
          source: price.source,
        });
      } catch (err) {
        console.error("[oracle/dexscreener] failed to persist snapshot:", err);
      }
      return price;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
