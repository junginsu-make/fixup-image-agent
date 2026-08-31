import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { fetchPublicHtml, ingestWeb, validateWebUrl, WebSourceBlockedError } from "./web";
import type { IngestAdapter } from "../types";
import { RssSourceAdapter } from "./rss";
import type { RawCandidate, IngestSource } from "../types";

export const GLOBAL_AI_MODEL_CATEGORY = "글로벌 AI 모델 소식";

export type OfficialAiProvider = "openai" | "anthropic" | "google" | "meta" | "xai" | "deepseek";
type OfficialAiStrategy = "rss" | "changelog" | "listing";

interface OfficialAiParserOptions {
  provider: OfficialAiProvider;
  providerLabel: string;
  maxItems: number;
}

interface OfficialAiListingOptions extends OfficialAiParserOptions {
  articlePathPrefix: string;
}

export interface OfficialAiSourcePreset {
  provider: OfficialAiProvider;
  providerLabel: string;
  name: string;
  url: string;
  category: typeof GLOBAL_AI_MODEL_CATEGORY;
  strategy: OfficialAiStrategy;
  pollingMinutes: number;
  maxItems: number;
  articlePathPrefix?: string;
  forceBrowser?: boolean;
}

export const OFFICIAL_AI_SOURCE_PRESETS: readonly OfficialAiSourcePreset[] = [
  { provider: "openai", providerLabel: "OpenAI", name: "OpenAI 공식 소식", url: "https://openai.com/news/rss.xml", category: GLOBAL_AI_MODEL_CATEGORY, strategy: "rss", pollingMinutes: 60, maxItems: 5 },
  { provider: "anthropic", providerLabel: "Anthropic Claude", name: "Anthropic Claude 공식 소식", url: "https://platform.claude.com/docs/en/release-notes/feed.xml", category: GLOBAL_AI_MODEL_CATEGORY, strategy: "rss", pollingMinutes: 60, maxItems: 5 },
  { provider: "google", providerLabel: "Google Gemini", name: "Google Gemini 공식 소식", url: "https://ai.google.dev/gemini-api/docs/changelog?hl=en", category: GLOBAL_AI_MODEL_CATEGORY, strategy: "changelog", pollingMinutes: 60, maxItems: 5 },
  { provider: "meta", providerLabel: "Meta AI", name: "Meta AI 공식 소식", url: "https://ai.meta.com/blog/", category: GLOBAL_AI_MODEL_CATEGORY, strategy: "listing", pollingMinutes: 180, maxItems: 5, articlePathPrefix: "/blog/" },
  { provider: "xai", providerLabel: "xAI Grok", name: "xAI Grok 공식 소식", url: "https://x.ai/news?category=all", category: GLOBAL_AI_MODEL_CATEGORY, strategy: "listing", pollingMinutes: 60, maxItems: 5, articlePathPrefix: "/news/", forceBrowser: true },
  { provider: "deepseek", providerLabel: "DeepSeek", name: "DeepSeek 공식 소식", url: "https://api-docs.deepseek.com/updates/", category: GLOBAL_AI_MODEL_CATEGORY, strategy: "changelog", pollingMinutes: 60, maxItems: 5 },
] as const;

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/^date\s*:\s*/i, "").replace(/[​-‍﻿]/g, "").trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized) || /^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(normalized);
  const parsed = new Date(dateOnly ? `${normalized} UTC` : normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function fragment(value: string): string {
  return value.toLowerCase().replace(/[​-‍﻿]/g, "").replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
}

function metadata(options: OfficialAiParserOptions, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: options.provider,
    providerLabel: options.providerLabel,
    category: GLOBAL_AI_MODEL_CATEGORY,
    extractionStatus: "complete",
    ...extra,
  };
}

export function parseOfficialChangelog(html: string, pageUrl: string, options: OfficialAiParserOptions): RawCandidate[] {
  const dom = new JSDOM(html, { url: pageUrl });
  const document = dom.window.document;
  const headings = [...document.querySelectorAll("main h2, article h2, [role='main'] h2")];
  return headings.flatMap((heading) => {
    const headingText = cleanText(heading.textContent);
    const publishedAt = parseDate(headingText);
    if (!publishedAt) return [];
    const blocks: string[] = [];
    let current = heading.nextElementSibling;
    while (current && current.tagName !== "H2") {
      const value = cleanText(current.textContent);
      if (value) blocks.push(value);
      current = current.nextElementSibling;
    }
    const body = blocks.join("\n\n");
    if (!body) return [];
    const id = heading.id || fragment(headingText);
    const url = new URL(pageUrl);
    url.hash = id;
    return [{
      externalId: `${options.provider}:${publishedAt.slice(0, 10)}:${id}`,
      title: `${options.providerLabel} 업데이트 · ${headingText}`,
      url: url.href,
      author: options.providerLabel,
      publishedAt,
      summary: body.slice(0, 600),
      body,
      metadata: metadata(options, { changelogUrl: pageUrl }),
    }];
  }).slice(0, options.maxItems);
}

export function parseOfficialListing(html: string, pageUrl: string, options: OfficialAiListingOptions): RawCandidate[] {
  const dom = new JSDOM(html, { url: pageUrl });
  const document = dom.window.document;
  const base = new URL(pageUrl);
  const items = new Map<string, RawCandidate>();
  const genericTitles = new Set(["featured", "read more", "learn more", "blog", "news"]);
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    let url: URL;
    try { url = new URL(anchor.href, base); } catch { continue; }
    if (url.origin !== base.origin || !url.pathname.startsWith(options.articlePathPrefix) || url.pathname === options.articlePathPrefix) continue;
    url.search = ""; url.hash = "";
    const externalId = url.href;
    const title = cleanText(anchor.querySelector("h1, h2, h3, h4")?.textContent) || cleanText(anchor.textContent);
    if (!title || title.length < 4 || genericTitles.has(title.toLowerCase())) continue;
    let container: Element | null = anchor.closest("article, li, section") ?? anchor.parentElement;
    for (let depth = 0; container?.parentElement && depth < 4; depth += 1) {
      const parentText = cleanText(container.parentElement.textContent);
      if (parentText.length > 2_000) break;
      container = container.parentElement;
    }
    const time = container?.querySelector("time");
    const containerText = cleanText(container?.textContent);
    const writtenDate = containerText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i)?.[0]
      ?? containerText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/i)?.[0];
    const publishedAt = parseDate(time?.getAttribute("datetime") || cleanText(time?.textContent) || writtenDate);
    const discovered: RawCandidate = {
      externalId, title, url: externalId, author: options.providerLabel, publishedAt,
      summary: containerText.slice(0, 600),
      metadata: metadata(options, { listingUrl: pageUrl, extractionStatus: "pending" }),
    };
    const existing = items.get(externalId);
    if (!existing || title.length > existing.title.length) items.set(externalId, { ...existing, ...discovered, publishedAt: publishedAt ?? existing?.publishedAt });
  }
  return [...items.values()].slice(0, options.maxItems);
}

interface LoadedPage { url: string; html: string }
type PageLoader = (url: string, forceBrowser?: boolean) => Promise<LoadedPage>;
type RssDiscover = (subscription: IngestSource) => Promise<RawCandidate[]>;

async function loadRenderedPage(url: string): Promise<LoadedPage> {
  await validateWebUrl(url);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    await page.route("**/*", async (route) => {
      const kind = route.request().resourceType();
      if (kind === "font" || kind === "media") await route.abort();
      else await route.continue();
    });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response?.ok()) throw new Error(`공식 페이지를 읽지 못했습니다. (${response?.status() ?? "응답 없음"})`);
    await page.waitForTimeout(1_500);
    const finalUrl = await validateWebUrl(page.url());
    return { url: finalUrl.href, html: await page.content() };
  } finally {
    await browser.close();
  }
}

async function defaultPageLoader(url: string, forceBrowser = false): Promise<LoadedPage> {
  if (!forceBrowser) {
    try {
      const page = await fetchPublicHtml({ url });
      return { url: page.url.href, html: page.html };
    } catch (error) {
      if (error instanceof WebSourceBlockedError) throw error;
    }
  }
  return loadRenderedPage(url);
}

function configOf(subscription: IngestSource): OfficialAiSourcePreset {
  const provider = subscription.config.provider;
  const preset = OFFICIAL_AI_SOURCE_PRESETS.find((item) => item.provider === provider && item.url === subscription.url);
  if (!preset) throw new Error("지원하는 글로벌 AI 공식 소스가 아닙니다.");
  return { ...preset, ...subscription.config } as OfficialAiSourcePreset;
}

function extractedArticle(html: string, url: string, providerLabel: string): Partial<RawCandidate> {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content")?.trim() || undefined;
  const article = new Readability(document).parse();
  const body = cleanText(article?.textContent ?? document.querySelector("article, main")?.textContent);
  const rawThumbnail = meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]');
  let thumbnailUrl: string | undefined;
  try { thumbnailUrl = rawThumbnail ? new URL(rawThumbnail, url).href : undefined; } catch { thumbnailUrl = undefined; }
  return {
    title: cleanText(meta('meta[property="og:title"]') ?? article?.title) || undefined,
    author: meta('meta[name="author"]') ?? meta('meta[property="article:author"]') ?? providerLabel,
    publishedAt: parseDate(meta('meta[property="article:published_time"]') ?? meta('meta[name="date"]')),
    summary: body.slice(0, 600), body, thumbnailUrl,
  };
}

export class OfficialAiSourceAdapter implements IngestAdapter {
  readonly kind = "official_ai" as const;
  private readonly rss: RssSourceAdapter;
  private readonly rssDiscover: RssDiscover;
  private readonly pageLoader: PageLoader;

  constructor(dependencies: { rssDiscover?: RssDiscover; pageLoader?: PageLoader } = {}) {
    this.rss = new RssSourceAdapter();
    this.rssDiscover = dependencies.rssDiscover ?? ((source) => this.rss.fetch(source));
    this.pageLoader = dependencies.pageLoader ?? defaultPageLoader;
  }

  async fetch(subscription: IngestSource): Promise<RawCandidate[]> {
    const config = configOf(subscription);
    const options = { provider: config.provider, providerLabel: config.providerLabel, maxItems: config.maxItems };
    if (config.strategy === "rss") {
      const items = await this.rssDiscover({ ...subscription, kind: "rss" });
      return items.slice(0, config.maxItems).map((item) => ({ ...item, author: item.author ?? config.providerLabel, metadata: { ...item.metadata, ...metadata(options) } }));
    }
    const page = await this.pageLoader(subscription.url, config.forceBrowser);
    if (config.strategy === "changelog") return parseOfficialChangelog(page.html, page.url, options);
    return parseOfficialListing(page.html, page.url, { ...options, articlePathPrefix: config.articlePathPrefix! });
  }

  async hydrate(item: RawCandidate, subscription: IngestSource): Promise<RawCandidate> {
    const config = configOf(subscription);
    if (config.strategy === "changelog") return item;
    if (config.strategy === "rss") {
      const hydrated = await this.rss.hydrate(item);
      if (hydrated.body?.trim()) return { ...hydrated, metadata: { ...hydrated.metadata, ...item.metadata, extractionStatus: "complete" } };
      try {
        const page = await this.pageLoader(item.url);
        const extracted = extractedArticle(page.html, page.url, config.providerLabel);
        if (extracted.body?.trim()) return { ...hydrated, ...extracted, url: page.url, metadata: { ...hydrated.metadata, ...item.metadata, extractionStatus: "complete" } };
      } catch { /* RSS 설명만으로도 후보를 남겨 공식 소식을 유실하지 않는다. */ }
      return { ...hydrated, metadata: { ...hydrated.metadata, ...item.metadata, extractionStatus: "summary_only" } };
    }
    try {
      const document = await ingestWeb({ id: `candidate_${crypto.randomUUID()}`, url: item.url });
      return {
        ...item, title: document.title || item.title, author: document.author ?? item.author,
        publishedAt: item.publishedAt ?? document.publishedAt,
        body: document.segments.map((segment) => segment.text).join("\n\n"), thumbnailUrl: document.thumbnailUrl,
        metadata: { ...item.metadata, extractionStatus: "complete" },
      };
    } catch (error) {
      if (error instanceof WebSourceBlockedError) throw error;
      const page = await this.pageLoader(item.url, config.forceBrowser);
      const extracted = extractedArticle(page.html, page.url, config.providerLabel);
      if (!extracted.body?.trim()) throw new Error("공식 발표에서 카드뉴스에 사용할 내용을 찾지 못했습니다.");
      return { ...item, ...extracted, url: page.url, metadata: { ...item.metadata, extractionStatus: "complete" } };
    }
  }
}
