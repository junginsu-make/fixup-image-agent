import { describe, expect, it } from "vitest";
import { usesAdminLookup } from "../projects/[id]/images/[index]/file/admin-lookup";

/**
 * 관리자 조회를 언제 쓰는가.
 *
 * **로컬에서는 쓰면 안 된다.** 관리자 조회는 Supabase 를 직접 읽는데
 * (`adminAssetPath`), 로컬 개발은 `LOCAL_STORE=1` 로 파일 시스템을 쓰고
 * Supabase 환경변수를 **비워 둔다**. 그런데 `dev-auth.ts:44` 가 로컬 사용자를
 * 언제나 `role: "admin"` 으로 주므로, **로컬에서는 이 라우트가 항상 관리자
 * 갈래를 타고 500 을 낸다** — 포스터 결과 그림이 한 장도 안 보인다.
 *
 * 광고 규격 화면이 이 주소로 미리보기를 그리는데(설계 §10 3-e), 「사람 눈이
 * 의도 검증이다」(§5.2)가 그 화면의 존재 이유다. 그림이 안 보이면 그 보증이
 * 통째로 없다.
 *
 * **운영에는 영향이 없다** — `isLocalStoreEnabled()` 가 거기서는 언제나 거짓이다.
 */

describe("전체 조회를 쓰는 조건", () => {
  it("운영에서 전체 범위면 쓴다 — 첫 화면에 걸 것을 고르려면 남의 것도 봐야 한다", () => {
    expect(usesAdminLookup(true, false)).toBe(true);
  });

  it("운영에서 자기 것만 보는 사람은 안 쓴다", () => {
    expect(usesAdminLookup(false, false)).toBe(false);
  });

  /** 여기가 500 을 내던 자리다. */
  it("로컬에서는 전체 범위여도 안 쓴다 — Supabase 가 없다", () => {
    expect(usesAdminLookup(true, true)).toBe(false);
  });

  it("로컬에서는 어느 쪽도 안 쓴다", () => {
    expect(usesAdminLookup(false, true)).toBe(false);
  });
});
