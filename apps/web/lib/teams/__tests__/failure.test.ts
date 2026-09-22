import { describe, expect, it, vi } from "vitest";
import { failureUrl, shownFailure, teamFailure } from "../failure";

/**
 * **팀 화면의 실패가 사람 말로 보인다** (2026-09-22).
 *
 * 운영에서 「빼기」를 누르면 「server-side exception · Digest 2887180017」만 떴다.
 * 서버 기록에는 「마지막 팀장은 뺄 수 없습니다. 먼저 다른 팀원을 팀장으로 세워
 * 주세요.」가 있었다. 서버 액션이 던진 오류의 글은 운영 빌드에서 화면으로 안
 * 넘어온다 — 그래서 던지지 않고 주소에 실어 돌려보낸다.
 */
describe("팀 화면 실패 문구", () => {
  it("우리가 적은 한국어 안내는 그대로 보여 준다", () => {
    expect(teamFailure(new Error("마지막 팀장은 뺄 수 없습니다. 먼저 다른 팀원을 팀장으로 세워 주세요."))).toBe(
      "마지막 팀장은 뺄 수 없습니다. 먼저 다른 팀원을 팀장으로 세워 주세요.",
    );
  });

  /** DB·네트워크 오류의 글은 내부 구조를 드러낸다. 화면에는 뭉쳐 말하고 서버에만 남긴다. */
  it("예상 못 한 오류는 뭉쳐 말하고 서버 기록에만 남긴다", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(teamFailure(new Error('duplicate key value violates unique constraint "team_members_pkey"'))).toBe(
      "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("오류가 아닌 것이 던져져도 뭉쳐 말한다", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(teamFailure("boom")).toBe("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    log.mockRestore();
  });

  /**
   * 주소의 `?error=` 는 누구나 적어 보낼 수 있다. 「보안 경고: 다시 로그인하세요」 같은
   * 글을 담은 링크를 관리자에게 보내면 진짜 경고처럼 뜬다(독립 리뷰). 우리가 보내는
   * 문구 꼴(한국어·짧은 한 줄)만 보여 준다.
   */
  it("주소에 실린 문구는 우리 꼴일 때만 보여 준다", () => {
    expect(shownFailure("마지막 팀장은 뺄 수 없습니다.")).toBe("마지막 팀장은 뺄 수 없습니다.");
    expect(shownFailure(undefined)).toBeNull();
    expect(shownFailure("Please log in again at evil.example")).toBe("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(shownFailure("가".repeat(201))).toBe("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(shownFailure("보안 경고: https://evil.example 에서 다시 로그인하세요")).toBe("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("돌아갈 주소에 실패 문구를 싣는다 — 이미 조건이 있으면 이어 붙인다", () => {
    expect(failureUrl("/team", "안 됩니다")).toBe(`/team?error=${encodeURIComponent("안 됩니다")}`);
    expect(failureUrl("/team?tab=credit&team=x", "안 됩니다")).toBe(`/team?tab=credit&team=x&error=${encodeURIComponent("안 됩니다")}`);
  });
});
