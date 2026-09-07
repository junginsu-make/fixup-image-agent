import { describe, expect, it } from "vitest";
import { scopedRead, teamOrFilter, type ViewScope } from "../scope";

const solo: ViewScope = { userId: "u1", teamId: null, isAdmin: false };
const inTeam: ViewScope = { userId: "u1", teamId: "t1", isAdmin: false };
const admin: ViewScope = { userId: "u9", teamId: null, isAdmin: true };

/** 실제 질의 대신, 무엇이 걸렸는지만 적어 두는 가짜. */
function fakeQuery() {
  const calls: string[] = [];
  const query = {
    calls,
    eq(column: string, value: string) {
      calls.push(`eq:${column}=${value}`);
      return query;
    },
    or(filter: string) {
      calls.push(`or:${filter}`);
      return query;
    },
  };
  return query;
}

describe("조건 만들기", () => {
  it("팀이 있으면 같은 팀 것과 내 것", () => {
    expect(teamOrFilter(inTeam)).toBe("team_id.eq.t1,user_id.eq.u1");
  });

  it("내 것을 늘 넣는다", () => {
    // 내가 만든 것이 나에게 안 보이는 경우를 만들지 않는다.
    expect(teamOrFilter(inTeam)).toContain("user_id.eq.u1");
  });

  it("팀이 없으면 조건이 없다", () => {
    // 부르는 쪽이 「내 것만」으로 처리한다.
    expect(teamOrFilter(solo)).toBeNull();
  });

  it("운영자에게도 조건이 없다", () => {
    expect(teamOrFilter(admin)).toBeNull();
  });
});

describe("질의에 걸기", () => {
  it("개인은 자기 것만 본다", () => {
    // **오늘 실제로 도는 길이다.** 팀에 아무도 없으면 전부 이쪽으로 가고,
    // 그때 답이 지금과 같아야 한다.
    const query = fakeQuery();
    scopedRead(query, solo);
    expect(query.calls).toEqual(["eq:user_id=u1"]);
  });

  it("팀원은 팀 것을 함께 본다", () => {
    const query = fakeQuery();
    scopedRead(query, inTeam);
    expect(query.calls).toEqual(["or:team_id.eq.t1,user_id.eq.u1"]);
  });

  it("운영자에게는 아무것도 안 건다", () => {
    const query = fakeQuery();
    scopedRead(query, admin);
    expect(query.calls).toEqual([]);
  });

  it("운영자면 팀이 있어도 전부 본다", () => {
    // 운영자가 어느 팀에 속해 있다고 해서 시야가 그 팀으로 좁아지면 안 된다.
    const query = fakeQuery();
    scopedRead(query, { userId: "u9", teamId: "t1", isAdmin: true });
    expect(query.calls).toEqual([]);
  });

  it("같은 질의를 돌려준다 — 이어서 걸 수 있게", () => {
    const query = fakeQuery();
    expect(scopedRead(query, solo)).toBe(query);
    expect(scopedRead(query, inTeam)).toBe(query);
    expect(scopedRead(query, admin)).toBe(query);
  });
});
