import { describe, expect, it } from "vitest";
import { GET } from "../robots.txt/route";
import sitemap from "../sitemap";

/** 실제로 내보내는 robots.txt·sitemap.xml(계획 2026-10-06 seo-search-registration). */
describe("robots.txt 라우트", () => {
  it("글자 파일로 내고 사이트 지도를 알린다", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    const text = await res.text();
    expect(text).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m);
    expect(text).toContain("Disallow: /admin");
  });
});

describe("sitemap.ts", () => {
  it("공개 화면을 낸다", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/about"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/guide/cardnews"))).toBe(true);
  });
});
