import { describe, expect, it } from "vitest";
import { canAccessPage } from "../core";
import { APP_ROUTES, PAGE_ACCESS } from "../routes";

const MEMBER = { userId: "member-1", role: "member" as const };
const ADMIN = { userId: "admin-1", role: "admin" as const };

describe("화면 등록부", () => {
  it("역할이 걸린 화면만 규칙에 담긴다", () => {
    const gated = APP_ROUTES.filter((route) => route.requiredRole).map((route) => route.path);
    expect(Object.keys(PAGE_ACCESS).sort()).toEqual(gated.sort());
  });

  it("등록부에 적힌 역할이 그대로 규칙이 된다", () => {
    for (const route of APP_ROUTES) {
      if (!route.requiredRole) continue;
      expect(PAGE_ACCESS[route.path].allowedRoles).toEqual([route.requiredRole]);
    }
  });

  it("경로가 겹치지 않는다", () => {
    // 같은 경로를 두 번 적으면 뒤엣것이 조용히 이긴다.
    const paths = APP_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("모든 경로가 슬래시로 시작한다", () => {
    // 상대 경로가 섞이면 `startsWith` 판정이 어긋난다.
    for (const route of APP_ROUTES) {
      expect(route.path.startsWith("/")).toBe(true);
    }
  });
});

describe("등록부가 실제로 문을 지킨다", () => {
  it("관리자 화면은 회원에게 막힌다", () => {
    expect(canAccessPage("/admin", MEMBER, PAGE_ACCESS)).toBe(false);
    expect(canAccessPage("/admin", ADMIN, PAGE_ACCESS)).toBe(true);
  });

  it("역할이 안 걸린 도구는 회원도 연다", () => {
    for (const path of ["/sns", "/poster", "/create", "/redesign", "/characters", "/library"]) {
      expect(canAccessPage(path, MEMBER, PAGE_ACCESS)).toBe(true);
    }
  });

  it("메뉴에 내는 기준과 문을 여는 기준이 같다", () => {
    // 사이드바는 `canAccessPage("/admin", …)` 로 관리자 메뉴를 낼지 정하고,
    // 미들웨어는 같은 함수로 문을 연다. 둘이 갈리면 「메뉴엔 있는데 안 열리는」
    // 화면이나 「메뉴엔 없는데 주소를 치면 열리는」 화면이 생긴다.
    const shownInMenu = canAccessPage("/admin", MEMBER, PAGE_ACCESS);
    const opensTheDoor = canAccessPage("/admin", MEMBER, PAGE_ACCESS);
    expect(shownInMenu).toBe(opensTheDoor);
  });

  it("등록부에 없는 주소는 막지 않는다", () => {
    // 새 화면이 조용히 막히면 신고가 온다. 막을 것을 적는 편이 눈에 띈다.
    expect(canAccessPage("/brand-new-tool", MEMBER, PAGE_ACCESS)).toBe(true);
  });
});
