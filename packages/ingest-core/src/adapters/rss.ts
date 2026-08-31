import { JSDOM } from "jsdom";
import { ingestWeb, validateWebUrl } from "./web";
import type { IngestAdapter } from "../types";
import type { RawCandidate, IngestSource } from "../types";

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "FixupImageAgent/1.0 (+content-collector)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchFeed(
  initialUrl: URL,
  fetcher: typeof fetch,
  resolveAddresses?: (hostname: string) => Promise<string[]>,
): Promise<{ response: Response; url: URL }> {
  let current = initialUrl;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    current = await validateWebUrl(current.href, resolveAddresses);
    const response = await fetcher(current, {
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml,application/atom+xml,application/xml,text/xml" },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    if (!REDIRECT_STATUSES.has(response.status)) return { response, url: current };
    const location = response.headers.get("location");
    if (!location) throw new Error("RSS 이동 주소가 올바르지 않습니다.");
    current = new URL(location, current);
  }
  throw new Error("RSS 주소가 너무 많이 이동했습니다.");
}

function text(element: Element | null | undefined): string | undefined {
  const value = element?.textContent?.replace(/\s+/g, " ").trim();
  return value || undefined;
}
function htmlText(value?: string): string {
  return value ? (JSDOM.fragment(value).textContent ?? "").replace(/\s+/g, " ").trim() : "";
}
function date(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

export function parseFeed(xml: string, baseUrl: string, limit = 20): RawCandidate[] {
  const document = new JSDOM(xml, { contentType: "text/xml", url: baseUrl }).window.document;
  const entries = [...document.querySelectorAll("item, entry")].slice(0, limit);
  return entries.flatMap((entry) => {
    const atomLink = entry.querySelector("link[href]")?.getAttribute("href") ?? undefined;
    const rawLink = atomLink ?? text(entry.querySelector("link"));
    if (!rawLink) return [];
    let url: string;
    try { url = new URL(rawLink, baseUrl).href; } catch { return []; }
    const title = text(entry.querySelector("title")) ?? url;
    const description = text(entry.querySelector("description")) ?? text(entry.querySelector("summary")) ?? text(entry.querySelector("content"));
    const externalId = text(entry.querySelector("guid")) ?? text(entry.querySelector("id")) ?? url;
    const thumbnail = entry.querySelector("media\\:thumbnail, thumbnail")?.getAttribute("url") ?? undefined;
    return [{
      externalId, title, url,
      author: text(entry.querySelector("author > name")) ?? text(entry.querySelector("author")) ?? text(entry.querySelector("dc\\:creator")),
      publishedAt: date(text(entry.querySelector("pubDate")) ?? text(entry.querySelector("published")) ?? text(entry.querySelector("updated"))),
      summary: htmlText(description), body: htmlText(description), thumbnailUrl: thumbnail,
      metadata: { feedUrl: baseUrl },
    }];
  });
}

export class RssSourceAdapter implements IngestAdapter {
  readonly kind = "rss" as const;
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly resolveAddresses?: (hostname: string) => Promise<string[]>) {}

  async fetch(subscription: IngestSource): Promise<RawCandidate[]> {
    const url = await validateWebUrl(subscription.url, this.resolveAddresses);
    const fetched = await fetchFeed(url, this.fetcher, this.resolveAddresses);
    const { response } = fetched;
    if (!response.ok) throw new Error(`RSS를 읽지 못했습니다. (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_FEED_BYTES) throw new Error("RSS 파일이 너무 큽니다.");
    const maxItems = Math.min(50, Math.max(1, Number(subscription.config.maxItems ?? 20)));
    return parseFeed(new TextDecoder().decode(bytes), fetched.url.href, maxItems);
  }

  async hydrate(item: RawCandidate): Promise<RawCandidate> {
    try {
      const document = await ingestWeb({ id: `candidate_${crypto.randomUUID()}`, url: item.url, fetcher: this.fetcher, resolveAddresses: this.resolveAddresses });
      return { ...item, publishedAt: item.publishedAt ?? document.publishedAt, body: document.segments.map((segment) => segment.text).join("\n\n") };
    } catch (error) {
      return {
        ...item,
        metadata: {
          ...item.metadata,
          extractionStatus: "insufficient",
          extractionError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
