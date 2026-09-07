import { describe, expect, it } from "vitest";
import {
  canAccessPage,
  canManageKnowledge,
  canSeeOwnerEmails,
  canTouch,
  ownerFilter,
  scope,
  type AccessConfig,
} from "../core";

const MEMBER = { userId: "member-1", role: "member" as const };
const OTHER = { userId: "member-9", role: "member" as const };
const ADMIN = { userId: "admin-1", role: "admin" as const };

describe("만질 수 있는 범위", () => {
  it("회원은 자기 것만", () => {
    expect(scope(MEMBER, "read")).toEqual({ kind: "user", userId: "member-1" });
    expect(scope(MEMBER, "delete")).toEqual({ kind: "user", userId: "member-1" });
  });

  it("관리자는 보기도 지우기도 전부", () => {
    // 2026-09-04 운영자 판단: 잘못 올라온 것을 내릴 사람이 없으면 그대로 남는다.
    expect(scope(ADMIN, "read")).toEqual({ kind: "all" });
    expect(scope(ADMIN, "delete")).toEqual({ kind: "all" });
  });

  it("목록과 상세가 같은 답을 낸다", () => {
    // 이 함수가 생긴 이유다. 전에는 목록만 넓히고 상세를 안 따라가서,
    // 관리자에게 목록은 뜨는데 열리지는 않았다.
    const listed = scope(ADMIN, "read");
    const opened = canTouch(ADMIN, "member-9", "read");
    expect(listed.kind).toBe("all");
    expect(opened).toBe(true);
  });
});

describe("이 줄을 만질 수 있나", () => {
  it("자기 것은 만진다", () => {
    expect(canTouch(MEMBER, "member-1", "read")).toBe(true);
    expect(canTouch(MEMBER, "member-1", "delete")).toBe(true);
  });

  it("남의 것은 못 만진다", () => {
    expect(canTouch(MEMBER, "member-9", "read")).toBe(false);
    expect(canTouch(MEMBER, "member-9", "delete")).toBe(false);
  });

  it("관리자는 남의 것도 만진다", () => {
    expect(canTouch(ADMIN, "member-9", "read")).toBe(true);
    expect(canTouch(ADMIN, "member-9", "delete")).toBe(true);
  });

  it("회원끼리는 서로 못 만진다", () => {
    expect(canTouch(OTHER, "member-1", "delete")).toBe(false);
  });
});

describe("질의에 걸 소유자 조건", () => {
  it("회원에게는 자기 id 를 준다", () => {
    expect(ownerFilter(MEMBER, "read")).toBe("member-1");
  });

  it("관리자에게는 조건 자체를 주지 않는다", () => {
    // `null` 이 아니라 `undefined` 다. `null` 을 주면 부르는 쪽이 그대로
    // `.eq("user_id", null)` 에 넘겨, 한 줄도 안 지우면서 오류도 안 나는
    // 길이 열린다 — 2026-09-04 에 실제로 그랬다.
    expect(ownerFilter(ADMIN, "read")).toBeUndefined();
    expect(ownerFilter(ADMIN, "delete")).toBeUndefined();
  });

  it("조건이 없을 때 null 을 주지 않는다", () => {
    expect(ownerFilter(ADMIN, "read")).not.toBeNull();
  });
});

describe("주소 문지기", () => {
  const config: AccessConfig = {
    "/admin": { allowedRoles: ["admin"] },
  };

  it("관리자 화면은 회원에게 막힌다", () => {
    expect(canAccessPage("/admin", MEMBER, config)).toBe(false);
  });

  it("관리자는 열린다", () => {
    expect(canAccessPage("/admin", ADMIN, config)).toBe(true);
  });

  it("하위 경로도 같은 규칙을 탄다", () => {
    expect(canAccessPage("/admin/costs", MEMBER, config)).toBe(false);
  });

  it("이름이 겹치는 다른 화면까지 막지 않는다", () => {
    // `/administrator` 나 `/admin-guide` 는 `/admin` 이 아니다.
    // `startsWith` 만 쓰면 이것들이 함께 막힌다.
    expect(canAccessPage("/administrator", MEMBER, config)).toBe(true);
    expect(canAccessPage("/admin-guide", MEMBER, config)).toBe(true);
  });

  it("규칙이 없는 화면은 열린다", () => {
    // 안 막힌 화면은 곧 발견되지만, 안 열리는 화면은 신고가 온다.
    expect(canAccessPage("/sns", MEMBER, config)).toBe(true);
    expect(canAccessPage("/library", MEMBER, {})).toBe(true);
  });

  it("긴 경로 규칙이 짧은 것을 이긴다", () => {
    // 열쇠 순서에 따라 답이 달라지면 그건 규칙이 아니라 우연이다.
    const nested: AccessConfig = {
      "/team": { allowedRoles: ["admin"] },
      "/team/join": {},
    };
    expect(canAccessPage("/team", MEMBER, nested)).toBe(false);
    expect(canAccessPage("/team/join", MEMBER, nested)).toBe(true);
  });

  it("열쇠를 거꾸로 적어도 답이 같다", () => {
    const reversed: AccessConfig = {
      "/team/join": {},
      "/team": { allowedRoles: ["admin"] },
    };
    expect(canAccessPage("/team/join", MEMBER, reversed)).toBe(true);
  });

  it("관리자는 규칙과 무관하게 통과한다", () => {
    // 이 줄이 없으면 화면을 새로 만들 때마다 설정에 관리자를 적어야 하고,
    // 한 번 빠뜨리면 운영자가 못 들어간다.
    expect(canAccessPage("/anything", ADMIN, { "/anything": { allowedRoles: [] } })).toBe(true);
  });

  it("빈 역할 목록은 막지 않는다", () => {
    expect(canAccessPage("/x", MEMBER, { "/x": { allowedRoles: [] } })).toBe(true);
  });
});

describe("기능 권한은 행 접근과 다르다", () => {
  it("지식 관리는 관리자만", () => {
    expect(canManageKnowledge(ADMIN)).toBe(true);
    expect(canManageKnowledge(MEMBER)).toBe(false);
  });

  it("올린 사람 이메일은 관리자만", () => {
    expect(canSeeOwnerEmails(ADMIN)).toBe(true);
    expect(canSeeOwnerEmails(MEMBER)).toBe(false);
  });
});
