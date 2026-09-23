import { describe, expect, it } from "vitest";
import { checkWithdrawal, confirmsWithdrawal, withdrawalDone } from "../withdrawal";

/**
 * **회원 탈퇴**(2026-09-23 사용자 요청).
 *
 * 「모든 사용자는 계정(개인페이지)에서 탈퇴 할 수 있어야 합니다.」
 *
 * ── 왜 두 갈래인가 ─────────────────────────────────────────
 *
 * 데이터베이스가 **돈 기록이 있는 회원의 삭제를 막는다**
 * (`credit_member_has_records`, 202609220003). 가입만 한 사람은
 * `credit_accounts` 한 줄뿐이라 안 걸리지만, **한 번이라도 만들어 본 사람은
 * `credit_jobs`·`credit_holds` 가 생겨 걸린다.**
 *
 * 즉 실제로 써 본 회원은 전부 하드 삭제가 안 된다. 사고가 아니라 의도다.
 */

const 상태 = (patch: Record<string, unknown> = {}) => ({
  hasMoneyRecords: false,
  hasWorkInProgress: false,
  availableCredits: 0,
  status: "active" as const,
  ...patch,
});

describe("어느 길로 가나", () => {
  it("**돈 기록이 없으면 지운다**", () => {
    const 결과 = checkWithdrawal(상태());

    expect(결과.ok).toBe(true);
    expect(결과.ok && 결과.path).toBe("delete");
  });

  it("**돈 기록이 있으면 닫는다**", () => {
    const 결과 = checkWithdrawal(상태({ hasMoneyRecords: true }));

    expect(결과.ok).toBe(true);
    expect(결과.ok && 결과.path).toBe("close");
  });
});

/**
 * **만들고 있는 중에는 못 떠난다.**
 *
 * 크레딧이 잡혀 있다는 것은 지금 그림을 만들고 있다는 뜻이다. 그 사이에
 * 계정을 닫으면 결과가 갈 곳이 없어지고 잡힌 크레딧도 풀 데가 없다.
 */
describe("만들고 있는 중", () => {
  it("**막는다**", () => {
    const 결과 = checkWithdrawal(상태({ hasWorkInProgress: true }));

    expect(결과.ok).toBe(false);
    expect(결과.ok === false && 결과.reason).toContain("만들고 있는 작업");
  });

  it("**돈 기록이 있어도 막는다** — 처리 중이 먼저다", () => {
    expect(checkWithdrawal(상태({ hasWorkInProgress: true, hasMoneyRecords: true })).ok).toBe(false);
  });

  it("**끝나고 다시 오라고 말한다**", () => {
    const 결과 = checkWithdrawal(상태({ hasWorkInProgress: true }));

    expect(결과.ok === false && 결과.reason).toContain("다시 시도");
  });
});

describe("이미 떠난 계정", () => {
  it("**두 번 탈퇴하지 않는다**", () => {
    const 결과 = checkWithdrawal(상태({ status: "withdrawn" }));

    expect(결과.ok).toBe(false);
    expect(결과.ok === false && 결과.reason).toContain("이미 탈퇴");
  });
});

/**
 * **무엇이 사라지고 무엇이 남는지 정확히 말한다.**
 *
 * 「다 지웁니다」라고 해 놓고 돈 기록이 남으면 그것은 거짓말이다.
 */
describe("무엇이 사라지는지 말한다", () => {
  it("**되돌릴 수 없다고 말한다**", () => {
    for (const 것 of [상태(), 상태({ hasMoneyRecords: true })]) {
      const 결과 = checkWithdrawal(것);
      expect(결과.ok && 결과.notice).toContain("되돌릴 수 없습니다");
    }
  });

  it("**닫는 길에서는 돈 기록이 남는다고 말한다**", () => {
    const 결과 = checkWithdrawal(상태({ hasMoneyRecords: true }));

    expect(결과.ok && 결과.notice).toContain("보관됩니다");
  });

  /**
   * **지우는 길에서는 그 말을 안 한다.** 남는 것이 없는데 「보관됩니다」라고
   * 하면 사용자는 뭔가 남는 줄 안다.
   */
  it("**지우는 길에서는 보관 이야기를 안 한다**", () => {
    const 결과 = checkWithdrawal(상태());

    expect(결과.ok && 결과.notice).not.toContain("보관됩니다");
  });

  /**
   * **남은 크레딧을 숫자로 말한다.** 「사라집니다」만으로는 얼마가 사라지는지
   * 모른다. 42장이 적혀 있으면 한 번 더 생각한다.
   */
  it("**남은 크레딧을 숫자로 말한다**", () => {
    const 결과 = checkWithdrawal(상태({ availableCredits: 42 }));

    expect(결과.ok && 결과.notice).toContain("42장");
  });

  it("**0장이면 크레딧 이야기를 안 한다** — 없는 것을 아깝다고 말하지 않는다", () => {
    const 결과 = checkWithdrawal(상태({ availableCredits: 0 }));

    expect(결과.ok && 결과.notice).not.toContain("크레딧");
  });
});

/**
 * **끝난 뒤에도 어느 길로 갔는지 숨기지 않는다.**
 *
 * 기록이 남았는데 「모두 삭제했습니다」라고 하면 나중에 문의가 온다.
 */
describe("끝난 뒤 할 말", () => {
  it("**지웠으면 모두 삭제됐다고 한다**", () => {
    expect(withdrawalDone("delete")).toContain("모두 삭제");
  });

  it("**닫았으면 기록이 남는다고 한다**", () => {
    expect(withdrawalDone("close")).toContain("보관됩니다");
    expect(withdrawalDone("close"), "닫았는데 모두 삭제했다고 한다").not.toContain("모두 삭제");
  });
});

/**
 * **확인 글자.** 관리자가 회원을 지울 때 이미 이메일을 그대로 치게 한다.
 * 같은 무게의 일이니 같은 문턱을 둔다.
 */
describe("확인 글자", () => {
  it("**이메일이 같으면 통과한다**", () => {
    expect(confirmsWithdrawal("me@example.com", "me@example.com")).toBe(true);
  });

  it("**대소문자와 앞뒤 공백은 봐준다**", () => {
    expect(confirmsWithdrawal("  ME@Example.com ", "me@example.com")).toBe(true);
  });

  it.each([
    ["빈 것", ""],
    ["다른 이메일", "other@example.com"],
    ["없는 것", undefined],
    ["글자가 아닌 것", 12345],
  ])("**%s 는 막는다**", (_이름, typed) => {
    expect(confirmsWithdrawal(typed, "me@example.com")).toBe(false);
  });
});
