import { JSDOM } from "jsdom";
import { fetchPublicHtml, ingestWeb } from "./web";
import type { IngestAdapter } from "../types";
import type { RawCandidate, IngestSource } from "../types";

interface CommunitySelectors {
  itemSelector: string;
  linkSelector?: string;
  titleSelector?: string;
  summarySelector?: string;
  authorSelector?: string;
  dateSelector?: string;
  thumbnailSelector?: string;
}

function selectors(subscription: IngestSource): CommunitySelectors {
  const itemSelector = typeof subscription.config.itemSelector === "string" ? subscription.config.itemSelector.trim() : "";
  if (!itemSelector) throw new Error("커뮤니티 소스에는 config.itemSelector CSS 선택자가 필요합니다.");
  const optional = (key: keyof CommunitySelectors) => typeof subscription.config[key] === "string" ? String(subscription.config[key]) : undefined;
  return { itemSelector, linkSelector: optional("linkSelector"), titleSelector: optional("titleSelector"), summarySelector: optional("summarySelector"), authorSelector: optional("authorSelector"), dateSelector: optional("dateSelector"), thumbnailSelector: optional("thumbnailSelector") };
}
function nodeText(node: Element | null): string | undefined { const value = node?.textContent?.replace(/\s+/g, " ").trim(); return value || undefined; }
function select(node: Element, selector?: string): Element | null { return selector ? node.querySelector(selector) : null; }

export class CommunityPageAdapter implements IngestAdapter {
  readonly kind = "community" as const;
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly resolveAddresses?: (hostname: string) => Promise<string[]>) {}

  async fetch(subscription: IngestSource): Promise<RawCandidate[]> {
    const config = selectors(subscription);
    const page = await fetchPublicHtml({ url: subscription.url, fetcher: this.fetcher, resolveAddresses: this.resolveAddresses });
    const document = new JSDOM(page.html, { url: page.url.href }).window.document;
    let rows: Element[];
    try { rows = [...document.querySelectorAll(config.itemSelector)]; }
    catch { throw new Error("커뮤니티 itemSelector가 올바른 CSS 선택자가 아닙니다."); }
    const limit = Math.min(50, Math.max(1, Number(subscription.config.maxItems ?? 20)));
    return rows.slice(0, limit).flatMap((row) => {
      const linkNode = (select(row, config.linkSelector) ?? row.querySelector("a[href]")) as HTMLAnchorElement | null;
      const href = linkNode?.getAttribute("href");
      if (!href) return [];
      let url: string;
      try { url = new URL(href, page.url).href; } catch { return []; }
      const dateText = nodeText(select(row, config.dateSelector));
      const parsedDate = dateText ? new Date(dateText) : undefined;
      const imageNode = select(row, config.thumbnailSelector) as HTMLImageElement | null;
      const thumbnail = imageNode?.getAttribute("src");
      return [{
        externalId: row.getAttribute("data-id") ?? url,
        title: nodeText(select(row, config.titleSelector)) ?? nodeText(linkNode) ?? url,
        url,
        summary: nodeText(select(row, config.summarySelector)) ?? "",
        body: nodeText(select(row, config.summarySelector)) ?? "",
        author: nodeText(select(row, config.authorSelector)),
        publishedAt: parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : undefined,
        thumbnailUrl: thumbnail ? new URL(thumbnail, page.url).href : undefined,
        metadata: { listingUrl: page.url.href },
      }];
    });
  }

  async hydrate(item: RawCandidate): Promise<RawCandidate> {
    const document = await ingestWeb({ id: `candidate_${crypto.randomUUID()}`, url: item.url, fetcher: this.fetcher, resolveAddresses: this.resolveAddresses });
    return { ...item, publishedAt: item.publishedAt ?? document.publishedAt, body: document.segments.map((segment) => segment.text).join("\n\n") };
  }
}
