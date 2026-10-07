import { describe, expect, it } from "vitest";
import { GUIDE_TOPICS } from "../../../app/guide/_components/topics";
import { publicPages, sitemapEntries } from "../sitemap";

/** 사이트 지도(계획 2026-10-06 seo-search-registration). */
const entries = sitemapEntries("https://formwith.fix-up.kr", publicPages(GUIDE_TOPICS.map((t) => t.href)));
const urls = entries.map((e) => e.url);

describe("키워드 소개 화면(계획 2026-10-07 seo-keyword-pages)", () => {
  const pages = publicPages([], ["/features", "/features/cardnews"]);
  it("모아 보기는 0.8, 키워드 화면은 0.7, 달마다, 영어 줄 없음", () => {
    expect(pages).toContainEqual({ path: "/features", priority: 0.8, changeFrequency: "monthly" });
    expect(pages).toContainEqual({ path: "/features/cardnews", priority: 0.7, changeFrequency: "monthly" });
  });
  it("둘째 인자를 안 주면 예전과 같다", () => {
    expect(publicPages([])).toHaveLength(2);
  });
});

describe("sitemapEntries", () => {
  it("첫 화면·소개·설명서 목차 전부를 절대 주소로", () => {
    expect(urls).toContain("https://formwith.fix-up.kr/");
    expect(urls).toContain("https://formwith.fix-up.kr/about");
    for (const topic of GUIDE_TOPICS) expect(urls).toContain(`https://formwith.fix-up.kr${topic.href}`);
    expect(urls).toHaveLength(2 + 2 + GUIDE_TOPICS.length);
  });
  it("꺼진 화면·회원 화면은 없다", () => {
    for (const path of ["/guide/team", "/create", "/sns", "/admin", "/login", "/signup"]) {
      expect(urls).not.toContain(`https://formwith.fix-up.kr${path}`);
    }
  });
  it("영어 판도 따로 한 줄씩 있다", () => {
    expect(urls).toContain("https://formwith.fix-up.kr/?lang=en");
    expect(urls).toContain("https://formwith.fix-up.kr/about?lang=en");
  });
  it("한국어·영어 두 줄 모두 서로를 잇고 x-default 는 한국어", () => {
    for (const [ko, en] of [["/", "/?lang=en"], ["/about", "/about?lang=en"]]) {
      const languages = { ko: `https://formwith.fix-up.kr${ko}`, en: `https://formwith.fix-up.kr${en}`, "x-default": `https://formwith.fix-up.kr${ko}` };
      for (const path of [ko, en]) {
        const entry = entries.find((e) => e.url === `https://formwith.fix-up.kr${path}`);
        expect(entry?.alternates?.languages, path).toEqual(languages);
      }
    }
  });
  it("영어 판의 우선순위는 한국어 판보다 0.1 낮고 갱신 주기는 같다", () => {
    const find = (path: string) => entries.find((e) => e.url === `https://formwith.fix-up.kr${path}`)!;
    expect(find("/").priority).toBe(1);
    expect(find("/?lang=en").priority).toBeCloseTo(0.9);
    expect(find("/about").priority).toBe(0.8);
    expect(find("/about?lang=en").priority).toBeCloseTo(0.7);
    expect(find("/?lang=en").changeFrequency).toBe(find("/").changeFrequency);
  });
  it("주소 끝 / 가 겹치지 않고, 배포마다 바뀌는 마지막 수정 시각은 달지 않는다", () => {
    expect(urls.every((u) => !u.includes("//", 8))).toBe(true);
    expect(entries.every((e) => e.lastModified === undefined)).toBe(true);
  });
});
