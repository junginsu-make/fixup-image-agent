import { describe, expect, it } from "vitest";
import { canSeeReference, referenceVisibility, type ReferenceViewScope } from "../reference-scope";

const scope = (over: Partial<ReferenceViewScope> = {}): ReferenceViewScope => ({
  userId: "me",
  teamId: null,
  isAdmin: false,
  ...over,
});

const mine = { userId: "me", teamId: null };
const myTeam = { userId: "mate", teamId: "t1" };
const otherTeam = { userId: "stranger", teamId: "t2" };
const loose = { userId: "stranger", teamId: null };

describe("누가 무엇을 보는가", () => {
  it("팀에 있으면 팀 것과 공용을 본다", () => {
    expect(referenceVisibility(scope({ teamId: "t1" }))).toEqual({
      kind: "team",
      teamId: "t1",
      userId: "me",
    });
  });

  it("소속이 없으면 공용과 내 것을 본다", () => {
    expect(referenceVisibility(scope())).toEqual({ kind: "loose", userId: "me" });
  });

  it("운영자는 전부 본다", () => {
    // 신고를 확인하고 갤러리에 걸 것을 고른다.
    expect(referenceVisibility(scope({ isAdmin: true, teamId: "t1" }))).toEqual({ kind: "all" });
  });
});

describe("팀이 안 붙은 것은 공용 창고다", () => {
  it("소속 있는 사람도 본다", () => {
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, loose)).toBe(true);
  });

  it("소속 없는 사람도 본다", () => {
    const own = referenceVisibility(scope());
    expect(canSeeReference(own, loose)).toBe(true);
  });

  it("**팀을 쓰기 전에는 지금과 똑같다**", () => {
    // 팀이 없으면 모든 줄의 팀이 비어 있다. 그래서 이 규칙만으로 배포일에
    // 아무것도 안 잃는다 — 따로 안전장치를 두지 않아도 된다.
    const beforeTeams = referenceVisibility(scope());
    for (const row of [mine, loose, { userId: "other", teamId: null }]) {
      expect(canSeeReference(beforeTeams, row)).toBe(true);
    }
  });
});

describe("팀에 묶인 것은 그 팀만", () => {
  it("같은 팀 것이 보인다", () => {
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, myTeam)).toBe(true);
  });

  it("남의 팀 것은 안 보인다", () => {
    // 팀에 묶인 본보기는 어떤 브랜드를 준비 중인지가 드러나는 것이다.
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, otherTeam)).toBe(false);
  });

  it("소속 없는 사람에게도 남의 팀 것은 안 보인다", () => {
    const own = referenceVisibility(scope());
    expect(canSeeReference(own, myTeam)).toBe(false);
    expect(canSeeReference(own, otherTeam)).toBe(false);
  });

  it("운영자에게는 모든 팀 것이 보인다", () => {
    const all = referenceVisibility(scope({ isAdmin: true }));
    for (const row of [mine, myTeam, otherTeam, loose]) {
      expect(canSeeReference(all, row)).toBe(true);
    }
  });
});

describe("내 것은 늘 보인다", () => {
  it("팀이 안 붙은 내 것", () => {
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, mine)).toBe(true);
  });

  it("어쩌다 다른 팀이 붙은 내 것도 보인다", () => {
    // 팀에서 빠졌거나 손으로 팀을 고친 줄이 있어도 자기 본보기가 사라지지는
    // 않는다.
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, { userId: "me", teamId: "t9" })).toBe(true);
  });
});
