import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 규칙과 화면을 잇는 줄들의 자물쇠.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-e
 *
 * **이 저장소에는 jsdom 이 없다.** `package.json` 을 건드리면 격리 계약이
 * 깨진다(§4.1). 그래서 판단은 `export-rules.ts` 로 뽑아 시험으로 잠그는데,
 * **그것을 부르는 줄은 계속 시험 밖에 남았다.** 실제로 아래 줄들을 지워도
 * 저장소 834개가 전부 초록이었다 — 그 줄들이 정확히 방금 고친 고장이 살던
 * 자리다.
 *
 * 문자열 대조라 리팩터링에 약하다. **그것이 이 시험의 값이다** — 이 줄을
 * 건드리면 사람이 한 번 멈춰 선다. 같은 방식이 `app/poster/__tests__/
 * new-client-wiring.test.ts` 와 `packages/sns-core/src/__tests__/
 * ad-isolation-lock.test.ts` 에 이미 있다.
 */

const client = readFileSync(new URL("../ad-export-client.tsx", import.meta.url), "utf8");
const fileRoute = readFileSync(
  new URL("../../api/poster/projects/[id]/images/[index]/file/route.ts", import.meta.url),
  "utf8",
);

describe("어디서 그림을 가져오는가", () => {
  /** 지우면 포스터 작업이 라이브러리 갈래로 가서 다시 「찾을 수 없습니다」가 된다. */
  it("어느 표를 읽을지 서버에 알린다", () => {
    expect(client).toContain("source: item.source");
  });

  it("포스터면 포스터 목록을 읽는다", () => {
    expect(client).toMatch(/next\.source === "poster"\s*\?\s*await posterItemImages\(next\.id\)/);
  });

  it("두 목록을 합쳐 보여 준다", () => {
    expect(client).toContain("adSourceItems(library, posters)");
  });
});

describe("어느 그림을 뽑는가", () => {
  /**
   * **배열 번호를 보내면 안 된다.** 서버는 그것을 `variantIndex` 로 읽는데
   * 그 번호는 배치마다 0 부터 다시 시작한다 — 사용자가 A 를 보고 골랐는데
   * ZIP 에는 B 가 담긴다.
   */
  it("고른 그림의 실제 번호를 보낸다", () => {
    expect(client).toContain("setPosition(image.position)");
    expect(client, "배열 번호로 되돌아가면 안 된다").not.toContain("setPosition(index)");
  });

  it("두 목록 다 순수 규칙이 번호를 정한다", () => {
    expect(client).toContain("posterImagePicks(projectId,");
    expect(client).toContain("libraryImagePicks(");
  });
});

describe("로컬에서 관리자 조회를 안 쓴다", () => {
  /**
   * 지우면 로컬에서 포스터 그림이 한 장도 안 보인다(500) — 「사람 눈이 의도
   * 검증이다」가 통째로 없어진다. 순수 함수만 시험하면 이 줄이 안 잠긴다.
   */
  it("판단을 순수 함수에 맡긴다", () => {
    expect(fileRoute).toContain("usesAdminLookup(auth.member.profile.role, isLocalStoreEnabled())");
  });
});
