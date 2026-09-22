import { describe, expect, it } from "vitest";
import { leaveOutcome } from "../core";

/**
 * **팀에서 뺄 때 무슨 일이 일어나나** (2026-09-22).
 *
 * 운영에서 혼자인 팀의 팀장을 빼면 「server-side exception」이 났다 — 팀 화면에서도
 * (Digest 2887180017), 관리자 회원 목록의 「팀 없음」에서도(Digest 4200012665).
 * 서버 기록은 둘 다 「마지막 팀장은 뺄 수 없습니다」였다. 규칙상 막힌 것은 맞지만,
 * **혼자인 팀을 정리할 길이 아예 없었다.** 혼자면 팀을 접는다.
 */
const leader = (userId: string) => ({ userId, role: "leader" as const });
const member = (userId: string) => ({ userId, role: "member" as const });

describe("팀에서 빼기", () => {
  it("혼자인 팀이면 팀을 접는다", () => {
    expect(leaveOutcome([leader("a")], "a")).toBe("archive");
  });

  /** 팀장이 아닌 사람 혼자 남은 팀은 그 사람만 뺀다. 팀까지 접으면 이름·한도·프로젝트가 같이 사라진다(독립 리뷰). */
  it("혼자 남은 사람이 팀장이 아니면 팀은 두고 사람만 뺀다", () => {
    expect(leaveOutcome([member("a")], "a")).toBe("remove");
  });

  it("팀원은 그냥 뺀다", () => {
    expect(leaveOutcome([leader("a"), member("b")], "b")).toBe("remove");
  });

  it("팀장이 둘 이상이면 팀장도 뺀다", () => {
    expect(leaveOutcome([leader("a"), leader("b")], "a")).toBe("remove");
  });

  /** 남은 사람이 있는데 팀장이 없어지면 그 팀은 아무도 못 꾸린다. 먼저 다른 사람을 팀장으로. */
  it("다른 팀원이 남는데 마지막 팀장이면 막는다", () => {
    expect(leaveOutcome([leader("a"), member("b")], "a")).toBe("blocked");
  });

  it("팀에 없는 사람이면 막는다", () => {
    expect(leaveOutcome([leader("a")], "z")).toBe("blocked");
  });
});
