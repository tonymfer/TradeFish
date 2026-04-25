import { db } from "@/db/client";
import { oracleSnapshots } from "@/db/schema";

const BTC_USD_FEED_ID =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

const HERMES_URL = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${BTC_USD_FEED_ID}&parsed=true`;

const CACHE_TTL_MS = 5_000;

export type OraclePrice = {
  priceCents: number;
  fetchedAt: Date;
  source: "pyth";
};

type CacheEntry = {
  value: OraclePrice;
  expiresAt: number;
};

type GlobalWithOracle = typeof globalThis & {
  __tradefishOracleCache?: Map<string, CacheEntry>;
  __tradefishOracleInflight?: Map<string, Promise<OraclePrice>>;
};

const globalForOracle = globalThis as GlobalWithOracle;
const cache =
  globalForOracle.__tradefishOracleCache ?? new Map<string, CacheEntry>();
const inflight =
  globalForOracle.__tradefishOracleInflight ??
  new Map<string, Promise<OraclePrice>>();
globalForOracle.__tradefishOracleCache = cache;
globalForOracle.__tradefishOracleInflight = inflight;

type PythParsedItem = {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
};

type PythResponse = {
  parsed?: PythParsedItem[];
};

function pythPriceToCents(rawPrice: string, expo: number): number {
  // priceUsd = rawPrice * 10^expo
  // priceCents = priceUsd * 100 = rawPrice * 10^(expo + 2)
  const raw = BigInt(rawPrice);
  const shift = expo + 2;
  const TEN = BigInt(10);
  const ZERO = BigInt(0);
  const TWO = BigInt(2);
  if (shift >= 0) {
    const cents = raw * TEN ** BigInt(shift);
    return Number(cents);
  }
  const divisor = TEN ** BigInt(-shift);
  const halved = divisor / TWO;
  const rounded =
    raw >= ZERO
      ? (raw + halved) / divisor
      : -((-raw + halved) / divisor);
  return Number(rounded);
}

async function fetchFromPyth(): Promise<OraclePrice> {
  const res = await fetch(HERMES_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Pyth Hermes responded ${res.status}`);
  }
  const json = (await res.json()) as PythResponse;
  const item = json.parsed?.[0];
  if (!item) {
    throw new Error("Pyth Hermes returned no parsed price");
  }
  const priceCents = pythPriceToCents(item.price.price, item.price.expo);
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    throw new Error(`Pyth Hermes returned invalid price: ${item.price.price}`);
  }
  const fetchedAt = new Date(item.price.publish_time * 1000);
  return { priceCents, fetchedAt, source: "pyth" };
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
      const price = await fetchFromPyth();
      cache.set(key, { value: price, expiresAt: Date.now() + CACHE_TTL_MS });
      // best-effort persist; don't block the caller on insert errors
      try {
        await db.insert(oracleSnapshots).values({
          asset: "BTC",
          priceCents: price.priceCents,
          fetchedAt: price.fetchedAt,
          source: price.source,
        });
      } catch (err) {
        console.error("[oracle] failed to persist snapshot:", err);
      }
      return price;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
