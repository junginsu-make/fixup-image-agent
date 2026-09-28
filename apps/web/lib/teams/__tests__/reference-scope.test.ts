import { describe, expect, it } from "vitest";
import { canSeeReference, referenceVisibility, type ReferenceViewScope } from "../reference-scope";

const scope = (over: Partial<ReferenceViewScope> = {}): ReferenceViewScope => ({
  userId: "me",
  isAdmin: false,
  ...over,
});

const mine = { userId: "me", teamId: null };
const mineInTeam = { userId: "me", teamId: "t9" };
const teammate = { userId: "mate", teamId: "t1" };
const otherTeam = { userId: "stranger", teamId: "t2" };
const loose = { userId: "stranger", teamId: null };

describe("누가 무엇을 보는가", () => {
  it("회원은 내 것만 본다", () => {
    expect(referenceVisibility(scope())).toEqual({ kind: "own", userId: "me" });
  });

  it("운영자는 전부 본다", () => {
    // 신고를 확인하고 갤러리에 걸 것을 고른다.
    expect(referenceVisibility(scope({ isAdmin: true }))).toEqual({ kind: "all" });
  });
});

describe("남의 것은 안 보인다 (2026-09-28 사용자 결정)", () => {
  it("팀이 안 붙은 남의 것 — 전에는 공용 창고였다", () => {
    const own = referenceVisibility(scope());
    expect(canSeeReference(own, loose)).toBe(false);
  });

  it("같은 팀이 찍힌 남의 것", () => {
    // 팀 기능을 안 쓴다. 표에 남은 소속이 공유를 되살리면 안 된다.
    const own = referenceVisibility(scope());
    expect(canSeeReference(own, teammate)).toBe(false);
  });

  it("남의 팀 것", () => {
    const own = referenceVisibility(scope());
    expect(canSeeReference(own, otherTeam)).toBe(false);
  });
});

describe("내 것은 늘 보인다", () => {
  it("팀이 안 붙은 내 것", () => {
    expect(canSeeReference(referenceVisibility(scope()), mine)).toBe(true);
  });

  it("어쩌다 팀이 붙은 내 것도 보인다", () => {
    expect(canSeeReference(referenceVisibility(scope()), mineInTeam)).toBe(true);
  });
});

describe("운영자", () => {
  it("모든 줄이 보인다", () => {
    const all = referenceVisibility(scope({ isAdmin: true }));
    for (const row of [mine, mineInTeam, teammate, otherTeam, loose]) {
      expect(canSeeReference(all, row)).toBe(true);
    }
  });
});
