import { JSDOM } from "jsdom";
import { ingestYoutube, parseYoutubeVideoId } from "./youtube";
import type { IngestAdapter } from "../types";
import { parseFeed } from "./rss";
import type { RawCandidate, IngestSource } from "../types";
import { publishedAtFromDocument } from "../published-at";

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function youtubeUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error("올바른 YouTube 채널 주소를 넣어 주세요."); }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || url.username || url.password || (hostname !== "youtube.com" && !hostname.endsWith(".youtube.com"))) {
    throw new Error("YouTube 채널 주소만 사용할 수 있습니다.");
  }
  return url;
}

async function fetchYoutubePage(initialUrl: URL, fetcher: typeof fetch): Promise<Response> {
  let current = initialUrl;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    current = youtubeUrl(current.href);
    const response = await fetcher(current, { headers: { "user-agent": "Mozilla/5.0 FixupImageAgent/1.0" }, redirect: "manual", signal: AbortSignal.timeout(12_000) });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("YouTube 이동 주소가 올바르지 않습니다.");
    current = new URL(location, current);
  }
  throw new Error("YouTube 채널 주소가 너무 많이 이동했습니다.");
}

export function channelIdFromInput(input: string): string | undefined {
  const trimmed = input.trim();
  if (CHANNEL_ID.test(trimmed)) return trimmed;
  try { return youtubeUrl(trimmed).pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1]; }
  catch { return undefined; }
}

function videoIdFromInput(input: string): string | undefined {
  try { return parseYoutubeVideoId(input); }
  catch { return undefined; }
}

async function singleVideo(subscription: IngestSource, videoId: string, fetcher: typeof fetch): Promise<RawCandidate> {
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let title = `YouTube ${videoId}`;
  let author: string | undefined;
  let publishedAt: string | undefined;
  let thumbnailUrl: string | undefined;
  try {
    const response = await fetchYoutubePage(youtubeUrl(subscription.url), fetcher);
    if (response.ok) {
      const document = new JSDOM(await response.text()).window.document;
      title = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim()
        || document.querySelector("title")?.textContent?.replace(/\s*-\s*YouTube\s*$/, "").trim()
        || title;
      author = document.querySelector('meta[itemprop="author"]')?.getAttribute("content")?.trim() || undefined;
      publishedAt = publishedAtFromDocument(document);
      thumbnailUrl = document.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim() || undefined;
    }
  } catch { /* 제목 조회가 실패해도 자막 수집은 계속한다. */ }
  return { externalId: `yt:video:${videoId}`, title, url: canonicalUrl, author, publishedAt, thumbnailUrl, metadata: { videoId, singleVideo: true } };
}

export class YoutubeChannelAdapter implements IngestAdapter {
  readonly kind = "youtube_channel" as const;
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async resolveChannelId(subscription: IngestSource): Promise<string> {
    const configured = typeof subscription.config.channelId === "string" ? subscription.config.channelId : undefined;
    const direct = configured ?? channelIdFromInput(subscription.url);
    if (direct && CHANNEL_ID.test(direct)) return direct;
    const response = await fetchYoutubePage(youtubeUrl(subscription.url), this.fetcher);
    if (!response.ok) throw new Error(`YouTube 채널을 확인하지 못했습니다. (${response.status})`);
    const html = await response.text();
    const found = html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/)?.[1]
      ?? html.match(/<meta itemprop="channelId" content="(UC[A-Za-z0-9_-]{22})"/)?.[1]
      ?? html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/)?.[1];
    if (!found) throw new Error("YouTube 채널 ID를 찾지 못했습니다. /channel/UC... 주소 또는 channelId 설정을 사용해 주세요.");
    return found;
  }

  async fetch(subscription: IngestSource): Promise<RawCandidate[]> {
    const videoId = videoIdFromInput(subscription.url);
    if (videoId) return [await singleVideo(subscription, videoId, this.fetcher)];
    const channelId = await this.resolveChannelId(subscription);
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const response = await this.fetcher(feedUrl, { headers: { accept: "application/atom+xml" }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`YouTube 채널 피드를 읽지 못했습니다. (${response.status})`);
    const maxItems = Math.min(30, Math.max(1, Number(subscription.config.maxItems ?? 15)));
    return parseFeed(await response.text(), feedUrl, maxItems).map((item) => ({ ...item, metadata: { ...item.metadata, channelId } }));
  }

  async hydrate(item: RawCandidate): Promise<RawCandidate> {
    const document = await ingestYoutube({ id: `candidate_${crypto.randomUUID()}`, url: item.url });
    const fallbackTitle = `YouTube ${videoIdFromInput(item.url) ?? ""}`;
    const title = document.title && document.title !== fallbackTitle ? document.title : item.title;
    const body = document.segments.map((segment) => segment.text).join("\n");
    return { ...item, title, body, metadata: { ...item.metadata, extractionChannels: document.extractionChannels ?? [], extractionStatus: body.trim() ? "complete" : "insufficient" } };
  }
}
