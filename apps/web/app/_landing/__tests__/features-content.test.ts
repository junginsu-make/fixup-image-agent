import { describe, expect, it } from "vitest";
import { GUIDE_TOPICS } from "../../guide/_components/topics";
import { FEATURE_CTA, FEATURE_PAGES, FEATURE_SECTIONS, FEATURES_HUB, featureBySlug } from "../features-content";

const FORBIDDEN = /무료 체험|무료로 시작|무료 가입|회원가입|지금 시작|바로 시작|더 팔|전환율|매출 상승|[—–]/;
const allText = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(allText) : v && typeof v === "object" ? Object.values(v).flatMap(allText) : [];

describe("키워드 화면 문구", () => {
  it("여섯 화면, 주소가 겹치지 않는다", () => {
    expect(FEATURE_PAGES.map((p) => p.slug)).toEqual(["cardnews", "detail-page", "redesign", "ad-creative", "poster", "character"]);
    expect(new Set(FEATURE_PAGES.map((p) => p.path)).size).toBe(6);
    for (const p of FEATURE_PAGES) expect(p.path).toBe(`/features/${p.slug}`);
  });
  it.each(FEATURE_PAGES.map((p) => [p.slug, p]))("%s: 대표 검색어가 h1·제목에 들어 있다", (_s, p) => {
    expect(p.h1).toContain(p.keyword);
    expect(p.metaTitle).toContain(p.keyword);
  });
  it.each([...FEATURE_PAGES, FEATURES_HUB].map((p) => [p.path, p]))("%s: 설명은 40~80자", (_s, p) => {
    expect(p.metaDescription.length).toBeGreaterThanOrEqual(40);
    expect(p.metaDescription.length).toBeLessThanOrEqual(80);
  });
  it.each(FEATURE_PAGES.map((p) => [p.slug, p]))("%s: 내용이 비지 않았다", (_s, p) => {
    expect(p.goodFor.length).toBeGreaterThanOrEqual(3);
    expect(p.inputs.length).toBeGreaterThanOrEqual(2);
    expect(p.steps.length).toBeGreaterThanOrEqual(3);
    expect(p.outputs.length).toBeGreaterThanOrEqual(2);
    expect(p.faq.length).toBeGreaterThanOrEqual(3);
  });
  it.each([...FEATURE_PAGES, FEATURES_HUB, FEATURE_SECTIONS, FEATURE_CTA].map((p, i) => [String(i), p]))("%s: 금지 표현이 없다", (_s, p) => {
    for (const text of allText(p)) expect(text).not.toMatch(FORBIDDEN);
  });
  it("설명서 링크는 실제 설명서 목차에 있다", () => {
    const hrefs = new Set(GUIDE_TOPICS.map((t) => t.href));
    for (const p of FEATURE_PAGES) expect(hrefs.has(p.guideHref)).toBe(true);
  });
  it("모르는 주소는 undefined", () => {
    expect(featureBySlug("cardnews")?.keyword).toBe("AI 카드뉴스 만들기");
    expect(featureBySlug("abc")).toBeUndefined();
  });
});
