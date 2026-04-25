export type LinkMeta = {
  url: string;
  image?: string;
  title?: string;
  description?: string;
  host: string;
};

type Entry = {
  value: LinkMeta;
  expiresAt: number;
};

const MAX_ENTRIES = 500;

type GlobalWithCache = typeof globalThis & {
  __tradefishLinkMetaCache?: Map<string, Entry>;
};

const globalForCache = globalThis as GlobalWithCache;
const cache =
  globalForCache.__tradefishLinkMetaCache ?? new Map<string, Entry>();
globalForCache.__tradefishLinkMetaCache = cache;

export function get(url: string): LinkMeta | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(url);
    return null;
  }
  // refresh LRU position
  cache.delete(url);
  cache.set(url, entry);
  return entry.value;
}

export function set(url: string, value: LinkMeta, ttlMs: number) {
  if (cache.has(url)) cache.delete(url);
  cache.set(url, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export const TTL_SUCCESS_MS = 24 * 60 * 60 * 1000;
export const TTL_FAILURE_MS = 60 * 60 * 1000;
