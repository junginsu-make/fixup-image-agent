import { describe, expect, it } from "vitest";
import { canSeeReference, referenceVisibility, type ReferenceViewScope } from "../reference-scope";

const scope = (over: Partial<ReferenceViewScope> = {}): ReferenceViewScope => ({
  userId: "me",
  teamId: null,
  anyTeamExists: true,
  isAdmin: false,
  ...over,
});

describe("팀을 안 쓰는 회사는 지금과 같다", () => {
  it("팀이 하나도 없으면 전부 본다", () => {
    // **배포하는 날 아무것도 안 잃는다.** 설계는 「팀이 없는 사람은 자기 것만」
    // 이었는데, 그대로 하면 팀을 만들기도 전에 전원이 서로의 본보기를 잃는다.
    expect(referenceVisibility(scope({ anyTeamExists: false }))).toEqual({ kind: "all" });
  });

  it("팀이 없으면 소속 여부와 무관하다", () => {
    expect(referenceVisibility(scope({ anyTeamExists: false, teamId: "t1" }))).toEqual({
      kind: "all",
    });
  });
});

describe("팀이 생기면 좁아진다", () => {
  it("팀에 있으면 같은 팀 것과 내 것", () => {
    expect(referenceVisibility(scope({ teamId: "t1" }))).toEqual({
      kind: "team",
      teamId: "t1",
      userId: "me",
    });
  });

  it("팀이 있는데 나는 소속이 없으면 내 것만", () => {
    // 회사가 나눠 쓰기로 정했는데 미배정인 사람만 전부 본다면, 그게 구멍이다.
    expect(referenceVisibility(scope())).toEqual({ kind: "own", userId: "me" });
  });

  it("운영자는 전부 본다", () => {
    // 신고를 확인하고 갤러리에 걸 것을 고른다.
    expect(referenceVisibility(scope({ isAdmin: true, teamId: "t1" }))).toEqual({ kind: "all" });
  });
});

describe("한 줄이 보이는가", () => {
  const mine = { userId: "me", teamId: null };
  const myTeam = { userId: "mate", teamId: "t1" };
  const otherTeam = { userId: "stranger", teamId: "t2" };
  const loose = { userId: "stranger", teamId: null };

  it("전부 보는 사람에게는 다 보인다", () => {
    const all = referenceVisibility(scope({ anyTeamExists: false }));
    for (const row of [mine, myTeam, otherTeam, loose]) {
      expect(canSeeReference(all, row)).toBe(true);
    }
  });

  it("팀원에게는 같은 팀 것이 보인다", () => {
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, myTeam)).toBe(true);
  });

  it("팀원에게 남의 팀 것은 안 보인다", () => {
    // 본보기는 어떤 브랜드를 준비 중인지가 그대로 드러나는 것이다.
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, otherTeam)).toBe(false);
  });

  it("팀원에게 소속 없는 남의 것은 안 보인다", () => {
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, loose)).toBe(false);
  });

  it("내 것은 팀이 안 붙어 있어도 보인다", () => {
    // 방금 올려 도장이 아직 안 찍힌 것이 내 눈앞에서 사라지면 안 된다.
    const team = referenceVisibility(scope({ teamId: "t1" }));
    expect(canSeeReference(team, mine)).toBe(true);
  });

  it("소속 없는 사람에게는 자기 것만 보인다", () => {
    const own = referenceVisibility(scope());
    expect(canSeeReference(own, mine)).toBe(true);
    expect(canSeeReference(own, myTeam)).toBe(false);
    expect(canSeeReference(own, loose)).toBe(false);
  });
});
