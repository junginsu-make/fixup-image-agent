import { JSDOM } from "jsdom";
import { z } from "zod";
import { ingestWeb } from "./web";
import type { IngestAdapter } from "../types";
import type { RawCandidate, IngestSource } from "../types";

export const NAVER_NEWS_API_URL = "https://openapi.naver.com/v1/search/news.json";
export const NAVER_AI_NEWS_QUERIES = ["생성형 AI", "인공지능 기술", "AI 산업", "AI 모델"] as const;

const NaverItemSchema = z.object({
  title: z.string(),
  originallink: z.string().optional().default(""),
  link: z.string().optional().default(""),
  description: z.string().optional().default(""),
  pubDate: z.string().optional().default(""),
});
const NaverResponseSchema = z.object({ items: z.array(NaverItemSchema).default([]) });

interface NaverCredentials { clientId?: string; clientSecret?: string }
type AddressLookup = (hostname: string) => Promise<string[]>;

function htmlText(value: string): string {
  return (JSDOM.fragment(value).textContent ?? "").replace(/\s+/g, " ").trim();
}

function sourceName(url: string): string | undefined {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

const AI_HEADLINE = /(^|[^A-Za-z])AI([^A-Za-z]|$)|인공지능|생성형|LLM|AGI|머신러닝|딥러닝|챗GPT|ChatGPT|오픈AI|OpenAI|앤트로픽|Anthropic|클로드|Claude|제미나이|Gemini|퍼플렉시티|Perplexity/i;

export function isAiNewsHeadline(title: string): boolean {
  return AI_HEADLINE.test(title);
}

function queries(subscription: IngestSource): string[] {
  const configured = Array.isArray(subscription.config.queries)
    ? subscription.config.queries.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())
    : [];
  return configured.length ? configured.slice(0, 10) : [...NAVER_AI_NEWS_QUERIES];
}

export class NaverNewsAdapter implements IngestAdapter {
  readonly kind = "naver_news" as const;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly credentials: NaverCredentials = { clientId: process.env.NAVER_CLIENT_ID, clientSecret: process.env.NAVER_CLIENT_SECRET },
    private readonly resolveAddresses?: AddressLookup,
  ) {}

  async fetch(subscription: IngestSource): Promise<RawCandidate[]> {
    const clientId = this.credentials.clientId?.trim();
    const clientSecret = this.credentials.clientSecret?.trim();
    if (!clientId || !clientSecret) throw new Error("네이버 뉴스 수집에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET이 필요합니다.");
    const display = Math.min(100, Math.max(1, Number(subscription.config.display ?? 10)));
    const maxItems = Math.min(100, Math.max(1, Number(subscription.config.maxItems ?? 10)));
    const discovered: RawCandidate[] = [];

    for (const query of queries(subscription)) {
      const url = new URL(NAVER_NEWS_API_URL);
      url.searchParams.set("query", query);
      url.searchParams.set("display", String(display));
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "date");
      const response = await this.fetcher(url, {
        headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret, accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`네이버 뉴스 API를 호출하지 못했습니다. (${response.status})`);
      const payload = NaverResponseSchema.parse(await response.json());
      for (const item of payload.items) {
        const originalUrl = item.originallink.trim();
        if (!originalUrl) continue;
        let parsed: URL;
        try { parsed = new URL(originalUrl); } catch { continue; }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
        const published = new Date(item.pubDate);
        const title = htmlText(item.title) || parsed.href;
        if (!isAiNewsHeadline(title)) continue;
        discovered.push({
          externalId: parsed.href,
          title,
          url: parsed.href,
          author: sourceName(parsed.href),
          publishedAt: Number.isFinite(published.getTime()) ? published.toISOString() : undefined,
          summary: htmlText(item.description),
          body: htmlText(item.description),
          metadata: { provider: "naver_news", naverUrl: item.link || undefined, searchQuery: query, extractionStatus: "pending" },
        });
      }
    }

    const unique = [...new Map(discovered.map((item) => [item.externalId, item])).values()];
    return unique
      .sort((first, second) => (second.publishedAt ?? "").localeCompare(first.publishedAt ?? ""))
      .slice(0, maxItems);
  }

  async hydrate(item: RawCandidate): Promise<RawCandidate> {
    try {
      const document = await ingestWeb({ id: `candidate_${crypto.randomUUID()}`, url: item.url, fetcher: this.fetcher, resolveAddresses: this.resolveAddresses });
      return {
        ...item,
        title: document.title || item.title,
        author: document.author || item.author,
        publishedAt: item.publishedAt ?? document.publishedAt,
        thumbnailUrl: document.thumbnailUrl || item.thumbnailUrl,
        body: document.segments.map((segment) => segment.text).join("\n\n"),
        metadata: { ...item.metadata, extractionStatus: "complete" },
      };
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
