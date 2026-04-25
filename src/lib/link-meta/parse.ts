function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _m;
    });
}

function findMetaContent(html: string, attr: string, value: string): string | undefined {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // <meta {attr}="{value}" content="...">  OR  <meta content="..." {attr}="{value}">
  const a = new RegExp(
    `<meta[^>]+${attr}\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    "i",
  );
  const b = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*${attr}\\s*=\\s*["']${escaped}["']`,
    "i",
  );
  const m = html.match(a) ?? html.match(b);
  if (!m) return undefined;
  const out = decodeHtmlEntities(m[1].trim());
  return out || undefined;
}

function findTitleTag(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  const out = decodeHtmlEntities(m[1].trim());
  return out || undefined;
}

export type ParsedMeta = {
  image?: string;
  title?: string;
  description?: string;
};

export function parseHtml(html: string): ParsedMeta {
  // Limit scan to <head> when possible — much cheaper on big pages.
  const headEnd = html.search(/<\/head\s*>/i);
  const slice = headEnd > 0 ? html.slice(0, headEnd + 7) : html.slice(0, 200_000);

  const image =
    findMetaContent(slice, "property", "og:image") ??
    findMetaContent(slice, "name", "og:image") ??
    findMetaContent(slice, "name", "twitter:image") ??
    findMetaContent(slice, "property", "twitter:image");

  const title =
    findMetaContent(slice, "property", "og:title") ??
    findMetaContent(slice, "name", "og:title") ??
    findMetaContent(slice, "name", "twitter:title") ??
    findTitleTag(slice);

  const description =
    findMetaContent(slice, "property", "og:description") ??
    findMetaContent(slice, "name", "og:description") ??
    findMetaContent(slice, "name", "description") ??
    findMetaContent(slice, "name", "twitter:description");

  return { image, title, description };
}

export function resolveImageUrl(image: string, pageUrl: string): string {
  try {
    return new URL(image, pageUrl).toString();
  } catch {
    return image;
  }
}
