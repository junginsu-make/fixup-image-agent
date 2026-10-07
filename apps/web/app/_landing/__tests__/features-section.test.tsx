import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeaturesSection } from "../features-section";
import { FEATURE_PAGES } from "../features-content";
import { CONTENT } from "../landing-content";

/** 첫 화면의 주 제목과 「무엇을 만들 수 있나요」 구획(계획 2026-10-07 seo-keyword-pages). */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("FeaturesSection", () => {
  const html = renderToStaticMarkup(<FeaturesSection t={CONTENT.ko} />);
  it("구획 제목과 자리표", () => {
    expect(html).toContain('id="features"');
    expect(html).toContain(`<h2 class="mcs-h2">${CONTENT.ko.featTitle}</h2>`);
  });
  it("여섯 키워드 화면과 모아 보기로 간다", () => {
    for (const page of FEATURE_PAGES) expect(hrefs(html)).toContain(page.path);
    expect(hrefs(html)).toContain("/features");
  });
  it("영어 화면은 머리만 영어", () => {
    const en = renderToStaticMarkup(<FeaturesSection t={CONTENT.en} />);
    expect(en).toContain(CONTENT.en.featTitle);
    expect(en).toContain(CONTENT.en.featCardMore);
  });
});

describe("첫 화면 조립", () => {
  const src = readFileSync(join(__dirname, "..", "..", "page.tsx"), "utf8");
  it("주 제목(h1)은 정확히 하나, 화면에는 숨기고 검색엔진·읽기 도구만 읽는다", () => {
    expect(src.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(src).toMatch(/<h1 className="sr-only">\{t\.homeH1\}<\/h1>/);
  });
  it("주 제목은 검색 제목과 같은 핵심 말을 쓴다", () => {
    for (const word of ["카드뉴스", "상세페이지", "광고 소재"]) expect(CONTENT.ko.homeH1).toContain(word);
  });
  it("새 구획은 차별점 다음", () => {
    expect(src.indexOf("<FeaturesSection")).toBeGreaterThan(src.indexOf("<Difference"));
  });
});
