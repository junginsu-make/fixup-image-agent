import { describe, expect, it } from "vitest";
import { ownerIdsOf, withOwner } from "../core";

const ROWS = [
  { id: "a", userId: "u1", title: "가을 운동회" },
  { id: "b", userId: "u2", title: "겨울 신상" },
  { id: "c", userId: "u1", title: "봄 소풍" },
  { id: "d", title: "주인 없는 것" },
];

describe("만든 사람을 물어볼 대상", () => {
  it("같은 사람을 두 번 묻지 않는다", () => {
    // 작업이 200 건이어도 만든 사람은 몇 명뿐이다. 그대로 물으면 같은
    // 사람을 수십 번 조회한다.
    expect(ownerIdsOf(ROWS)).toEqual(["u1", "u2"]);
  });

  it("주인을 모르는 줄은 빼고 묻는다", () => {
    expect(ownerIdsOf(ROWS)).not.toContain(undefined);
  });

  it("아무것도 없으면 아무도 안 묻는다", () => {
    expect(ownerIdsOf([])).toEqual([]);
  });
});

describe("소유자를 덧댈 때", () => {
  const emails = new Map([["u1", "one@example.com"], ["u2", "two@example.com"]]);

  it("원래 칸을 하나도 잃지 않는다", () => {
    // 회원 목록과 같은 모양을 유지해야 화면이 변환을 한 벌만 갖는다.
    const [first] = withOwner(ROWS, "u1", emails);
    expect(first).toMatchObject({ id: "a", userId: "u1", title: "가을 운동회" });
  });

  it("내 것과 남의 것을 가른다", () => {
    const owned = withOwner(ROWS, "u1", emails);
    expect(owned.map((row) => row.mine)).toEqual([true, false, true, false]);
  });

  it("만든 사람의 이메일을 붙인다", () => {
    const owned = withOwner(ROWS, "u1", emails);
    expect(owned[1].ownerEmail).toBe("two@example.com");
  });

  it("이메일을 못 찾아도 줄을 버리지 않는다", () => {
    // 지운 회원의 작업이 남아 있을 수 있다. 그 한 줄 때문에 목록이
    // 통째로 사라지면, 관리자는 무엇이 없어졌는지도 모른다.
    const owned = withOwner(ROWS, "u1", new Map());
    expect(owned).toHaveLength(4);
    expect(owned[0].ownerEmail).toBeNull();
  });

  it("주인을 모르는 줄은 내 것이 아니다", () => {
    const owned = withOwner(ROWS, "u1", emails);
    expect(owned[3]).toMatchObject({ mine: false, ownerEmail: null });
  });

  it("원본을 바꾸지 않는다", () => {
    const before = JSON.stringify(ROWS);
    withOwner(ROWS, "u1", emails);
    expect(JSON.stringify(ROWS)).toBe(before);
  });
});
