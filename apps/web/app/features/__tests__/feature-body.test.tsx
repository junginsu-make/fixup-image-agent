import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FEATURE_PAGES } from "../../_landing/features-content";
import { FeatureBody, FeatureCards } from "../feature-body";

/** 키워드별 소개 화면 본문(계획 2026-10-07 seo-keyword-pages). */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

describe.each(FEATURE_PAGES.map((page) => [page.slug, page]))("FeatureBody %s", (_slug, page) => {
  const html = renderToStaticMarkup(<FeatureBody page={page} />);

  it("h1 은 하나, 대표 검색어가 들어 있다", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(text(html.match(/<h1[\s\S]*?<\/h1>/)![0])).toContain(page.keyword);
  });
  it("질문과 답이 모두 보인다", () => {
    const all = text(html);
    for (const qa of page.faq) {
      expect(all).toContain(qa.q);
      expect(all).toContain(qa.a);
    }
  });
  it("만드는 순서가 번호 목록으로 다 나온다", () => {
    expect(html).toContain("<ol");
    for (const step of page.steps) expect(text(html)).toContain(step.title);
  });
  it("가입 신청·설명서·모든 기능으로 간다", () => {
    expect(hrefs(html)).toEqual(expect.arrayContaining(["/signup", page.guideHref, "/features"]));
  });
});

describe("FeatureCards", () => {
  const html = renderToStaticMarkup(<FeatureCards pages={FEATURE_PAGES} />);
  it("여섯 화면으로 가는 링크와 대표 검색어", () => {
    for (const page of FEATURE_PAGES) {
      expect(hrefs(html)).toContain(page.path);
      expect(text(html)).toContain(page.keyword);
    }
  });
});
