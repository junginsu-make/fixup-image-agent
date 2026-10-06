import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "../../access/routes";
import { PRIVATE_PREFIXES, robotsTxt } from "../robots";

/** 검색 로봇 안내(계획 2026-10-06 seo-search-registration). */
const disallowed = (text: string) => text.split("\n").filter((l) => l.startsWith("Disallow: ")).map((l) => l.slice(10));
// robots.txt 의 Disallow 는 앞머리 일치다 — 그 글자로 시작하는 주소를 막는다.
const blocks = (prefixes: string[], path: string) => prefixes.some((p) => path.startsWith(p));

describe("robotsTxt", () => {
  const text = robotsTxt({ siteUrl: "https://formwith.fix-up.kr" });

  it("모두에게 열고, 사이트 지도 주소를 절대 주소로 알린다", () => {
    expect(text).toContain("User-agent: *\nAllow: /\n");
    expect(text).toContain("Sitemap: https://formwith.fix-up.kr/sitemap.xml");
  });
  it("회원 화면·관리자·API 는 막는다(사이드바 화면 전부, 설명서 빼고)", () => {
    const list = disallowed(text);
    for (const route of APP_ROUTES.filter((r) => r.path !== "/guide")) {
      expect(blocks(list, route.path), route.path).toBe(true);
    }
    for (const path of ["/api/track", "/auth/callback", "/easy", "/ad", "/onboarding", "/access"]) {
      expect(blocks(list, path), path).toBe(true);
    }
  });
  it("공개 화면은 하나도 막지 않는다", () => {
    const list = disallowed(text);
    for (const path of ["/", "/about", "/guide", "/guide/easy", "/guide/ad", "/login", "/signup"]) {
      expect(blocks(list, path), path).toBe(false);
    }
  });
  it("다음 확인 줄은 맨 위에, 비면 안 넣는다", () => {
    expect(robotsTxt({ siteUrl: "https://a.kr", daumPin: "#DaumWebMasterTool:abc:def" }).split("\n")[0]).toBe("#DaumWebMasterTool:abc:def");
    expect(robotsTxt({ siteUrl: "https://a.kr", daumPin: "" })).not.toContain("DaumWebMasterTool");
  });
  it("이상한 다음 값은 거절한다 — robots.txt 를 망가뜨리지 않게", () => {
    expect(() => robotsTxt({ siteUrl: "https://a.kr", daumPin: "abc" })).toThrow(/DaumWebMasterTool/);
    expect(() => robotsTxt({ siteUrl: "https://a.kr", daumPin: "#DaumWebMasterTool:a\nDisallow: /" })).toThrow(/DaumWebMasterTool/);
  });
  it("막을 목록에 설명서·소개·첫 화면이 없다", () => {
    expect(PRIVATE_PREFIXES).not.toContain("/");
    expect(PRIVATE_PREFIXES.some((p) => "/guide".startsWith(p) || "/about".startsWith(p))).toBe(false);
  });
});
