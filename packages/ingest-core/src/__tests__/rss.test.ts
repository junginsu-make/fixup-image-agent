import { describe, expect, it } from "vitest";
import { parseFeed, RssSourceAdapter } from "../adapters/rss";
import type { IngestSource } from "../types";

const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><guid>news-1</guid><title>첫 뉴스</title><link>https://example.com/1</link><description><![CDATA[<p>핵심 설명입니다.</p>]]></description><pubDate>Sun, 24 Aug 2026 01:00:00 GMT</pubDate><media:thumbnail url="https://example.com/1.jpg" /></item>
</channel></rss>`;

describe("RSS 어댑터", () => {
  it("RSS 항목의 고유 ID·본문 요약·날짜·썸네일을 읽는다", () => {
    expect(parseFeed(rss, "https://example.com/feed.xml")[0]).toMatchObject({ externalId: "news-1", title: "첫 뉴스", url: "https://example.com/1", summary: "핵심 설명입니다.", thumbnailUrl: "https://example.com/1.jpg", publishedAt: "2026-08-24T01:00:00.000Z" });
  });

  it("구독의 최대 수집 개수를 지킨다", async () => {
    const source: IngestSource = { id: "s1", userId: "u1", name: "뉴스", kind: "rss", url: "https://example.com/feed.xml", enabled: true, intervalHours: 60, config: { maxItems: 1 }, nextPollAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const adapter = new RssSourceAdapter(async () => new Response(rss, { status: 200 }), async () => ["93.184.216.34"]);
    expect(await adapter.fetch(source)).toHaveLength(1);
  });

  it("공개 RSS가 내부 주소로 이동하면 따라가지 않는다", async () => {
    const now = new Date().toISOString();
    const source: IngestSource = { id: "s1", userId: "u1", name: "뉴스", kind: "rss", url: "https://example.com/feed.xml", enabled: true, intervalHours: 60, config: {}, nextPollAt: now, createdAt: now, updatedAt: now };
    let followedPrivate = false;
    const adapter = new RssSourceAdapter(async (_input, init) => {
      if (init?.redirect === "follow") {
        followedPrivate = true;
        return new Response(rss, { status: 200 });
      }
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/feed.xml" } });
    }, async () => ["93.184.216.34"]);

    await expect(adapter.fetch(source)).rejects.toThrow();
    expect(followedPrivate).toBe(false);
  });

  it("본문 보강 실패 이유를 후보에 남긴다", async () => {
    const adapter = new RssSourceAdapter(async (input) => (
      String(input).endsWith("/robots.txt")
        ? new Response("User-agent: *\nDisallow:", { status: 200 })
        : new Response("", { status: 503, headers: { "content-type": "text/html" } })
    ), async () => ["93.184.216.34"]);

    const hydrated = await adapter.hydrate!({
      externalId: "news-1",
      title: "첫 뉴스",
      url: "https://example.com/1",
    });

    expect(hydrated.metadata).toMatchObject({
      extractionStatus: "insufficient",
      extractionError: expect.stringContaining("503"),
    });
  });
});
