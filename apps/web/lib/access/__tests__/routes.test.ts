import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessPage } from "../core";
import { APP_ROUTES, DISABLED_ROUTES, PAGE_ACCESS, isDisabledRoute } from "../routes";

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

/**
 * **꺼 둔 화면은 세 곳이 함께 맞아야 한다.**
 *
 * 등록부(여기) · 사이드바(`packages/ui`) · 페이지 문(각 `page.tsx`).
 * 한 곳만 하면 이 파일 머리말이 경계하는 두 사고가 난다 —
 * 「메뉴에는 있는데 안 열리는 화면」과, 더 나쁘게는
 * 「메뉴에 없는데 주소를 치면 열리는 화면」.
 */
describe("당분간 꺼 둔 화면", () => {
  it("수집함과 수집 리스트가 꺼져 있다", () => {
    // 2026-09-10 운영자 판단. 켤 때는 `routes.ts` 의 `disabled` 두 줄을 지운다.
    expect([...DISABLED_ROUTES].sort()).toEqual(["/inbox", "/sources"]);
  });

  it("지우지 않고 꺼 뒀다 — 되돌릴 곳이 남아 있다", () => {
    for (const route of DISABLED_ROUTES) {
      const entry = APP_ROUTES.find((candidate) => candidate.path === route);
      expect(entry, `${route} 가 등록부에서 사라졌다`).toBeTruthy();
      expect(entry!.label).toBeTruthy();
    }
  });

  it("하위 경로까지 막는다", () => {
    expect(isDisabledRoute("/inbox")).toBe(true);
    expect(isDisabledRoute("/inbox/abc-123")).toBe(true);
    expect(isDisabledRoute("/sources")).toBe(true);
  });

  it("이름이 비슷한 다른 화면은 안 막는다", () => {
    // `startsWith` 만 쓰면 `/inboxes` 까지 걸린다.
    expect(isDisabledRoute("/inboxes")).toBe(false);
    expect(isDisabledRoute("/sources-guide")).toBe(false);
  });

  it("켜 둔 화면은 안 막는다", () => {
    for (const route of APP_ROUTES.filter((candidate) => !candidate.disabled)) {
      expect(isDisabledRoute(route.path), route.path).toBe(false);
    }
  });

  /**
   * 사이드바는 **다른 패키지에 손으로 적혀 있다.** 등록부에서 파생되지 않는다
   * (이 파일 머리말의 「셋이 함께 따라온다」는 역할 규칙 이야기다).
   * import 로 맞댈 수 없으니 파일을 글자로 읽는다.
   */
  it("사이드바에 꺼 둔 화면이 없다", () => {
    const shell = readFileSync(
      path.join(process.cwd(), "../../packages/ui/src/components/app-shell.tsx"),
      "utf8",
    );
    // 반복문이 헛돌지 않는지 먼저 본다.
    expect(shell).toContain('href: "/library"');
    for (const route of DISABLED_ROUTES) {
      expect(shell, `사이드바에 ${route} 가 남아 있다`).not.toContain(`href: "${route}"`);
    }
  });

  /**
   * 사이드바에서 빼는 것만으로는 **주소를 치면 열린다.** 역할 규칙으로도 못
   * 막는다 — `canAccessPage()` 가 관리자를 무조건 통과시킨다. 그래서 페이지가
   * 직접 돌려보내야 하고, 그 문이 걸려 있는지를 여기서 본다.
   */
  it("꺼 둔 화면의 페이지가 직접 돌려보낸다", () => {
    for (const route of DISABLED_ROUTES) {
      const page = readFileSync(path.join(process.cwd(), `app${route}/page.tsx`), "utf8");
      expect(page, `${route} 가 문을 안 걸었다`).toContain(`if (isDisabledRoute("${route}")) redirect(`);
    }
  });
});
