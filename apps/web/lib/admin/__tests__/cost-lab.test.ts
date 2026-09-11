import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COST_LAB_FILE, COST_LAB_HEADERS, canOpenCostLab, costLabFilePath } from "../cost-lab";
import { canAccessPage } from "../../access/core";
import { PAGE_ACCESS } from "../../access/routes";

/**
 * 비용 전략실의 문단속.
 *
 * jsdom 이 없는 저장소라 화면을 그려 볼 수 없다. **판단 함수는 값으로,
 * 배선은 파일을 글자로 읽어** 맞댄다 — 갈리면 화면에서만 드러나는 것들이다.
 */
/*
  **`fileURLToPath` 를 쓴다.** `new URL(...).pathname` 은 윈도에서 `/C:/...` 로
  나와 맨 앞 `/` 를 떼야 하는데, 리눅스에서는 `/home/...` 이라 떼면 상대 경로가
  된다. 그래서 **로컬에서는 되고 CI 에서만 ENOENT** 가 났다(2026-09-11).
*/
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

describe("누가 열 수 있나", () => {
  it("관리자만 연다", () => {
    expect(canOpenCostLab({ role: "admin" })).toBe(true);
    expect(canOpenCostLab({ role: "member" })).toBe(false);
  });
});

/**
 * **문이 둘이다.** 하나만 시험하면 다른 하나가 언제 무너졌는지 모른다.
 * 여기서는 미들웨어가 쓰는 판단 함수를 **실제로 실행해** 본다.
 */
describe("미들웨어가 먼저 막는다", () => {
  const member = { userId: "u1", role: "member" as const };
  const admin = { userId: "u2", role: "admin" as const };

  it("회원은 못 들어온다", () => {
    // `/admin` 규칙이 하위 경로까지 덮는다. 그 사실이 깨지면 여기서 터진다.
    expect(canAccessPage("/admin/cost-lab", member, PAGE_ACCESS)).toBe(false);
  });

  it("관리자는 들어온다", () => {
    expect(canAccessPage("/admin/cost-lab", admin, PAGE_ACCESS)).toBe(true);
  });

  it("전제 확인 — 규칙이 실제로 걸려 있다", () => {
    // 규칙이 통째로 사라져도 위 두 검사 중 하나는 통과한다. 전제를 따로 본다.
    expect(Object.keys(PAGE_ACCESS)).toContain("/admin");
    expect(PAGE_ACCESS["/admin"]?.allowedRoles).toEqual(["admin"]);
  });
});

describe("파일 자리", () => {
  it("작업 디렉터리 기준이다 — 서버가 apps/web 에서 돈다", () => {
    expect(costLabFilePath("/srv/app")).toBe(path.join("/srv/app", COST_LAB_FILE));
  });

  it("그 자리에 파일이 실제로 있다", () => {
    // 이름이 갈리면 배포본에서만 404 가 된다. 값으로 잠근다.
    expect(existsSync(path.join(WEB, COST_LAB_FILE)), COST_LAB_FILE).toBe(true);
  });

  /**
   * **`import` 되지 않는 파일이라 Next 의 추적이 못 따라간다.** 추적 목록에서
   * 빠지면 로컬에서는 되고 배포본에서만 404 가 된다 — 가장 늦게 발견되는 갈래다.
   */
  it("빌드 추적 목록에 적혀 있다", () => {
    const config = read("next.config.mjs");
    expect(config).toContain("outputFileTracingIncludes");
    expect(config).toContain(COST_LAB_FILE);
  });
});

describe("내주는 방식", () => {
  it("가격을 다룬 화면이라 캐시에 안 남긴다", () => {
    expect(COST_LAB_HEADERS["cache-control"]).toBe("no-store");
    expect(COST_LAB_HEADERS["x-robots-tag"]).toContain("noindex");
  });

  it("HTML 로 내준다", () => {
    expect(COST_LAB_HEADERS["content-type"]).toContain("text/html");
  });
});

describe("라우트 배선", () => {
  const route = read("app/admin/cost-lab/route.ts");

  /**
   * 미들웨어 하나에 맡기지 않는다. 이 저장소는 미들웨어가 조용히 비껴가는 일을
   * 이미 두 번 겪었다(정적 자산 matcher 의 `woff2` 누락, `LOCAL_AUTH_BYPASS`).
   */
  it("라우트가 스스로 한 번 더 본다", () => {
    expect(route).toContain("canOpenCostLab");
    expect(route).toContain("authenticateApiMember");
  });

  /** 403 은 「여기 뭔가 있다」를 알려 준다. 없는 화면으로 둔다. */
  it("못 들어오면 404 다", () => {
    expect(route).not.toContain("status: 403");
    expect(route.match(/status: 404/g) ?? []).toHaveLength(2);
  });

  it("파일이 없으면 그렇게 말한다", () => {
    // 빈 화면을 주면 도구가 고장 난 줄 알고 계산을 의심하게 된다.
    expect(route).toContain("배포 꾸러미를 확인해 주세요");
  });
});

describe("도구 자체", () => {
  const html = read(COST_LAB_FILE);

  it("혼자 도는 한 장이다 — 바깥에서 받아오는 것이 없다", () => {
    // 외부 주소를 물면 로그인 뒤 화면에서 바깥으로 요청이 나간다.
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["'](?:https?:)?\/\//);
  });

  it("이 시스템의 화면이라고 적혀 있다", () => {
    expect(html).toContain("<title>MCS 비용 전략실</title>");
  });
});
