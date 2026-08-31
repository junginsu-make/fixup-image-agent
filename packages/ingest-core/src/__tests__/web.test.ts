import { describe, expect, it } from "vitest";
import { ingestWeb, validateWebUrl, WebSourceBlockedError } from "../adapters/web";

const publicAddress = async () => ["93.184.216.34"];

describe("web source ingestion", () => {
  it("500자 미만의 짧은 공개 글도 본문으로 수집한다", async () => {
    const fetcher = async (url: URL | RequestInfo) => {
      const href = String(url);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:", { status: 200, headers: { "content-type": "text/plain" } });
      return new Response("<html><head><title>짧은 공지</title></head><body><article><h1>짧은 공지</h1><p>서비스 점검은 오늘 오후 3시에 종료됩니다.</p></article></body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    };
    const document = await ingestWeb({ id: "short", url: "https://example.com/short", fetcher: fetcher as typeof fetch, resolveAddresses: publicAddress });
    expect(document.segments.map((segment) => segment.text).join(" ")).toContain("오후 3시");
  });

  it("blocks configured sites and private network addresses", async () => {
    await expect(validateWebUrl("https://news.naver.com/article", publicAddress)).rejects.toBeInstanceOf(WebSourceBlockedError);
    await expect(validateWebUrl("http://127.0.0.1/private")).rejects.toBeInstanceOf(WebSourceBlockedError);
  });

  it("respects robots.txt", async () => {
    const fetcher = async (url: URL | RequestInfo) => {
      const href = String(url);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /private", { status: 200, headers: { "content-type": "text/plain" } });
      return new Response("", { status: 200, headers: { "content-type": "text/html" } });
    };
    await expect(ingestWeb({ id: "blocked", url: "https://example.com/private/story", fetcher: fetcher as typeof fetch, resolveAddresses: publicAddress })).rejects.toBeInstanceOf(WebSourceBlockedError);
  });

  it("extracts readable article text into cited segments", async () => {
    const paragraph = "카드뉴스로 정리할 수 있는 공개 웹페이지의 핵심 내용입니다. ".repeat(35);
    const fetcher = async (url: URL | RequestInfo) => {
      const href = String(url);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:", { status: 200, headers: { "content-type": "text/plain" } });
      return new Response(`<html><head><title>쉬운 웹 글</title></head><body><article><h1>쉬운 웹 글</h1><p>${paragraph}</p></article></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    };
    const document = await ingestWeb({ id: "article", url: "https://example.com/story", fetcher: fetcher as typeof fetch, resolveAddresses: publicAddress });
    expect(document.title).toBe("쉬운 웹 글");
    expect(document.segments.length).toBeGreaterThan(1);
    expect(document.segments[0]?.sourceUrl).toBe("https://example.com/story");
  });

  it("원문 메타데이터에서 발행일을 추출한다", async () => {
    const paragraph = "발행일이 공개된 기사 본문입니다. ".repeat(40);
    const fetcher = async (url: URL | RequestInfo) => {
      const href = String(url);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:", { status: 200, headers: { "content-type": "text/plain" } });
      return new Response(`<html><head><meta property="article:published_time" content="2026-08-23T14:30:00+09:00"><title>발행일 기사</title></head><body><article><h1>발행일 기사</h1><p>${paragraph}</p></article></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    };

    const document = await ingestWeb({ id: "dated-article", url: "https://example.com/dated", fetcher: fetcher as typeof fetch, resolveAddresses: publicAddress });

    expect(document.publishedAt).toBe("2026-08-23T05:30:00.000Z");
  });

  it("문단을 살리고 문장 한가운데서 끊지 않는다", async () => {
    const paragraphs = [
      `전세권 제도는 부동산 임대차와 유사한 대한민국의 특이한 부동산 물권제도입니다. ${"전세권자는 일정 기간 동안 해당 부동산을 사용할 권리를 얻습니다. ".repeat(8).trim()}`,
      `사용대가는 전세권설정자가 전세금의 이자수입으로 충당하는 것입니다. ${"이는 주택 부족이라는 한국의 특수한 상황에서 발전한 제도입니다. ".repeat(8).trim()}`,
    ];
    const fetcher = async (url: URL | RequestInfo) => {
      const href = String(url);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:", { status: 200, headers: { "content-type": "text/plain" } });
      return new Response(
        `<html><head><title>전세권</title></head><body><article><h1>전세권</h1>${paragraphs.map((text) => `<p>${text}</p>`).join("\n")}</article></body></html>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    };
    const document = await ingestWeb({ id: "article", url: "https://example.com/story", fetcher: fetcher as typeof fetch, resolveAddresses: publicAddress });

    expect(document.segments.some((segment) => segment.text.includes("\n\n"))).toBe(true);
    for (const segment of document.segments) expect(/[.!?…]$/.test(segment.text.trimEnd())).toBe(true);
  });
});
