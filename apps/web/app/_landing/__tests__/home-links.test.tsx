import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeLinks, homeUrls } from "../home-links";

/** 첫 화면이 직접 내는 대표 주소·언어 연결(계획 2026-10-06 seo-search-registration). */
describe("homeUrls", () => {
  it("한국어 판의 대표 주소는 /", () => {
    expect(homeUrls("ko", "https://formwith.fix-up.kr")).toEqual({
      canonical: "https://formwith.fix-up.kr/", ko: "https://formwith.fix-up.kr/", en: "https://formwith.fix-up.kr/?lang=en",
    });
  });
  it("영어 판의 대표 주소는 ?lang=en 을 잃지 않는다", () => {
    expect(homeUrls("en", "https://formwith.fix-up.kr").canonical).toBe("https://formwith.fix-up.kr/?lang=en");
  });
});

describe("HomeLinks", () => {
  const html = renderToStaticMarkup(<HomeLinks locale="en" />);
  it("대표 주소·언어 셋·og:url 을 한 번씩 낸다", () => {
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toMatch(/rel="alternate" hrefLang="ko" href="[^"]+\/"/);
    expect(html).toMatch(/hrefLang="en" href="[^"]+\/\?lang=en"/);
    expect(html).toMatch(/hrefLang="x-default" href="[^"]+\/"/);
    expect(html).toMatch(/<meta property="og:url" content="[^"]+\/\?lang=en"/);
    expect(html).toMatch(/rel="canonical" href="[^"]+\/\?lang=en"/);
  });
  it("한국어 판은 대표 주소가 /", () => {
    const ko = renderToStaticMarkup(<HomeLinks locale="ko" />);
    expect(ko).toMatch(/rel="canonical" href="[^"]+\/"/);
    expect(ko).toMatch(/og:url" content="[^"]+\/"/);
  });
});
