import { describe, expect, it, vi } from "vitest";
import { NaverNewsAdapter } from "../adapters/naver-news";
import type { IngestSource } from "../types";

const now = "2026-08-24T05:00:00.000Z";
const source: IngestSource = {
  id: "naver-ai",
  userId: "local-admin",
  name: "네이버 AI 뉴스",
  kind: "naver_news",
  url: "https://openapi.naver.com/v1/search/news.json",
  enabled: true,
  intervalHours: 60,
  config: { queries: ["생성형 AI", "인공지능 기술"], display: 10, maxItems: 20 },
  nextPollAt: now,
  createdAt: now,
  updatedAt: now,
};

describe("네이버 AI 뉴스 어댑터", () => {
  it("검색어별 최신 뉴스를 원문 URL 기준으로 중복 제거한다", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo, _init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("sort")).toBe("date");
      return new Response(JSON.stringify({
        items: [{
          title: "<b>생성형 AI</b> 새 소식",
          originallink: "https://news.example.com/article/1",
          link: "https://n.news.naver.com/article/1",
          description: "<b>AI</b> 기술에 관한 요약입니다.",
          pubDate: "Sun, 24 Aug 2026 05:00:00 +0900",
        }, {
          title: "일반 기업의 분기 실적 발표",
          originallink: "https://news.example.com/article/unrelated",
          link: "https://n.news.naver.com/article/unrelated",
          description: "본문에서 AI를 한 번 언급한 일반 기사입니다.",
          pubDate: "Sun, 24 Aug 2026 04:00:00 +0900",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const adapter = new NaverNewsAdapter(fetcher, { clientId: "client", clientSecret: "secret" });

    const items = await adapter.fetch(source);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "https://news.example.com/article/1",
      title: "생성형 AI 새 소식",
      url: "https://news.example.com/article/1",
      summary: "AI 기술에 관한 요약입니다.",
      metadata: { provider: "naver_news", naverUrl: "https://n.news.naver.com/article/1" },
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "X-Naver-Client-Id": "client", "X-Naver-Client-Secret": "secret" }),
    });
  });

  it("원문에서 실제 제목, 본문, 언론사와 대표 이미지를 채운다", async () => {
    const article = `<!doctype html><html><head>
      <meta property="og:site_name" content="테크뉴스" />
      <meta property="og:image" content="https://news.example.com/cover.jpg" />
      <meta property="og:title" content="원문 실제 AI 제목" />
      </head><body><main><article itemprop="articleBody"><h1>원문 실제 AI 제목</h1>
      <p>${"생성형 AI 산업의 변화와 기업의 대응을 설명하는 원문입니다. ".repeat(20)}</p>
      </article></main></body></html>`;
    const fetcher = vi.fn(async (input: URL | RequestInfo, _init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /", { status: 200 });
      return new Response(article, { status: 200, headers: { "content-type": "text/html" } });
    });
    const adapter = new NaverNewsAdapter(fetcher, { clientId: "client", clientSecret: "secret" }, async () => ["93.184.216.34"]);

    const hydrated = await adapter.hydrate!({
      externalId: "https://news.example.com/article/1",
      title: "검색 결과 제목",
      url: "https://news.example.com/article/1",
      summary: "검색 결과 요약",
    });

    expect(hydrated.title).toBe("원문 실제 AI 제목");
    expect(hydrated.author).toBe("테크뉴스");
    expect(hydrated.thumbnailUrl).toBe("https://news.example.com/cover.jpg");
    expect(hydrated.body?.length).toBeGreaterThan(500);
    expect(hydrated.metadata).toMatchObject({ extractionStatus: "complete" });
  });

});
