import { describe, expect, it } from "vitest";
import { GUIDE_TOPICS } from "../../../app/guide/_components/topics";
import { publicPages, sitemapEntries } from "../sitemap";

/** 사이트 지도(계획 2026-10-06 seo-search-registration). */
const now = new Date("2026-10-06T00:00:00Z");
const entries = sitemapEntries("https://formwith.fix-up.kr", publicPages(GUIDE_TOPICS.map((t) => t.href)), now);
const urls = entries.map((e) => e.url);

describe("sitemapEntries", () => {
  it("첫 화면·소개·설명서 목차 전부를 절대 주소로", () => {
    expect(urls).toContain("https://formwith.fix-up.kr/");
    expect(urls).toContain("https://formwith.fix-up.kr/about");
    for (const topic of GUIDE_TOPICS) expect(urls).toContain(`https://formwith.fix-up.kr${topic.href}`);
    expect(urls).toHaveLength(2 + GUIDE_TOPICS.length);
  });
  it("꺼진 화면·회원 화면은 없다", () => {
    for (const path of ["/guide/team", "/create", "/sns", "/admin", "/login", "/signup"]) {
      expect(urls).not.toContain(`https://formwith.fix-up.kr${path}`);
    }
  });
  it("첫 화면과 소개는 영어 판을 잇는다", () => {
    const home = entries.find((e) => e.url === "https://formwith.fix-up.kr/");
    expect(home?.alternates?.languages).toEqual({ ko: "https://formwith.fix-up.kr/", en: "https://formwith.fix-up.kr/?lang=en" });
    expect(home?.priority).toBe(1);
  });
  it("주소 끝 / 가 겹치지 않고 마지막 수정 시각을 단다", () => {
    expect(urls.every((u) => !u.includes("//", 8))).toBe(true);
    expect(entries.every((e) => e.lastModified === now)).toBe(true);
  });
});
