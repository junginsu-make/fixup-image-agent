import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUSINESS } from "../legal/business-info";
import { StructuredData, jsonLd, structuredData } from "../structured-data";

/** 검색 결과용 회사·사이트 정보(계획 2026-10-06 seo-search-registration). */
describe("structuredData", () => {
  const [org, site] = structuredData("https://formwith.fix-up.kr");

  it("회사 정보는 사업자 정보와 같은 값", () => {
    expect(org).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BUSINESS.companyName,
      url: "https://formwith.fix-up.kr",
      logo: "https://formwith.fix-up.kr/icon-512.png",
      telephone: BUSINESS.contact,
    });
  });
  it("사이트 정보는 FormWith, 한국어", () => {
    expect(site).toMatchObject({ "@type": "WebSite", name: "FormWith", url: "https://formwith.fix-up.kr/", inLanguage: "ko-KR" });
  });
});

describe("StructuredData", () => {
  it("ld+json 스크립트 하나로 내고, </script> 로 끊길 글자를 막는다", () => {
    const html = renderToStaticMarkup(<StructuredData />);
    expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
    const body = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"));
    expect(body).not.toContain("<");
    expect(JSON.parse(body)).toHaveLength(2);
  });
});

describe("jsonLd", () => {
  const x = { a: "</script><b>" };
  it("< 를 남기지 않고 \\u003c 글자로 바꾼다", () => {
    const out = jsonLd(x);
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c/script>");
  });
  it("JSON.parse 로 원래 값이 돌아온다", () => {
    expect(JSON.parse(jsonLd(x))).toEqual(x);
  });
});
