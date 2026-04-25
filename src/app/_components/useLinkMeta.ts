"use client";

import { useEffect, useState } from "react";

/**
 * Per-tab link-meta cache. Module-level so every component that asks
 * about the same URL shares one fetch + result. The frontend cache
 * complements the server's 24h cache: instant hits across components,
 * dedupes concurrent requests for the same url within a single tab.
 */

export type LinkMeta = {
  image?: string;
  title?: string;
  description?: string;
  host?: string;
  isLoading: boolean;
};

type LinkMetaResult = Omit<LinkMeta, "isLoading">;

const cache = new Map<string, LinkMetaResult>();
const inflight = new Map<string, Promise<LinkMetaResult>>();

function fetchMeta(url: string): Promise<LinkMetaResult> {
  const existing = inflight.get(url);
  if (existing) return existing;

  const p = (async (): Promise<LinkMetaResult> => {
    try {
      const res = await fetch(
        `/api/link-meta?url=${encodeURIComponent(url)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        return { host: hostOf(url) };
      }
      const json = (await res.json()) as {
        image?: string;
        title?: string;
        description?: string;
        host?: string;
      };
      return {
        image: json.image,
        title: json.title,
        description: json.description,
        host: json.host ?? hostOf(url),
      };
    } catch {
      return { host: hostOf(url) };
    }
  })();

  inflight.set(url, p);
  p.then((result) => {
    cache.set(url, result);
    inflight.delete(url);
  }).catch(() => {
    inflight.delete(url);
  });
  return p;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function useLinkMeta(url: string | undefined | null): LinkMeta {
  const safeUrl = url || "";
  const initial = safeUrl ? cache.get(safeUrl) : undefined;
  const [meta, setMeta] = useState<LinkMetaResult | undefined>(initial);

  useEffect(() => {
    if (!safeUrl) {
      setMeta(undefined);
      return;
    }
    const cached = cache.get(safeUrl);
    if (cached) {
      setMeta(cached);
      return;
    }
    let cancelled = false;
    fetchMeta(safeUrl).then((result) => {
      if (!cancelled) setMeta(result);
    });
    return () => {
      cancelled = true;
    };
  }, [safeUrl]);

  if (!safeUrl) {
    return { isLoading: false };
  }
  if (!meta) {
    return { isLoading: true, host: hostOf(safeUrl) };
  }
  return {
    image: meta.image,
    title: meta.title,
    description: meta.description,
    host: meta.host,
    isLoading: false,
  };
}
