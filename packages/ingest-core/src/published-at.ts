function asIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value.trim());
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function jsonLdPublishedAt(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = jsonLdPublishedAt(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const direct = asIsoDate(record.datePublished) ?? asIsoDate(record.uploadDate);
  if (direct) return direct;
  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    const found = jsonLdPublishedAt(record[key]);
    if (found) return found;
  }
  return undefined;
}

export function publishedAtFromDocument(document: Document): string | undefined {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[itemprop="datePublished"]',
    'meta[itemprop="uploadDate"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[name="publish-date"]',
    'meta[name="parsely-pub-date"]',
    'time[itemprop="datePublished"]',
    'time[itemprop="uploadDate"]',
  ];
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const found = asIsoDate(node?.getAttribute("content") ?? node?.getAttribute("datetime") ?? node?.textContent);
    if (found) return found;
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const found = jsonLdPublishedAt(JSON.parse(script.textContent ?? ""));
      if (found) return found;
    } catch { /* 깨진 JSON-LD는 다른 발행일 후보를 계속 확인한다. */ }
  }
  return undefined;
}
