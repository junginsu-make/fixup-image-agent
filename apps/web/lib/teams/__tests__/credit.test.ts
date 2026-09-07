import { describe, expect, it } from "vitest";
import {
  balanceOf,
  effectiveQuotaOf,
  personalQuotaError,
  suggestedQuota,
  teamQuotaError,
  type MemberUsage,
  type TeamCredit,
} from "../credit";

const member = (over: Partial<MemberUsage> = {}): MemberUsage => ({
  userId: "u1",
  email: "a@example.com",
  role: "member",
  used: 0,
  personalQuota: 100,
  ...over,
});

describe("한도 적기", () => {
  it("빈 값을 막는다", () => {
    expect(teamQuotaError("  ")).toContain("적어 주세요");
  });

  it("숫자가 아니면 막는다", () => {
    expect(teamQuotaError("백")).toContain("정수");
    expect(teamQuotaError("-5")).toContain("정수");
    expect(teamQuotaError("1.5")).toContain("정수");
  });

  it("0 은 받는다 — 「안 정했다」는 뜻이다", () => {
    expect(teamQuotaError("0")).toBeNull();
  });

  it("표의 상한을 넘기면 막는다", () => {
    // DB 의 check 에서 걸리면 「23514」만 뜬다. 여기서 사람 말로 막는다.
    expect(teamQuotaError("1000001")).toContain("넘길 수 없습니다");
    expect(teamQuotaError("1000000")).toBeNull();
  });

  it("개인 상한은 팀과 다른 값으로 막는다", () => {
    // `profiles.monthly_quota` 의 check 는 10000 이다. 팀 값(1000000)으로
    // 재면 화면은 통과시키고 DB 가 막아, 무엇이 잘못됐는지 안 보인다.
    expect(personalQuotaError("10000")).toBeNull();
    expect(personalQuotaError("10001")).toContain("넘길 수 없습니다");
    // 관리자 화면의 검사(0~10000)와 같은 값이라야 두 화면이 서로 고칠 수 있다.
    expect(personalQuotaError("0")).toBeNull();
  });
});

describe("제안값", () => {
  it("팀원 개인 상한의 합이다", () => {
    // **팀을 만든 순간 쓸 수 있는 양이 줄면 사고다.** 지금까지 각자 쓰던
    // 만큼을 더한 것이 최소한의 출발점이다.
    expect(
      suggestedQuota([member({ personalQuota: 100 }), member({ userId: "u2", personalQuota: 60 })]),
    ).toBe(160);
  });

  it("아무도 없으면 0 이다", () => {
    expect(suggestedQuota([])).toBe(0);
  });
});

describe("잔량", () => {
  const credit = (quota: number, used: number[]): TeamCredit => ({
    quota,
    members: used.map((value, index) => member({ userId: `u${index}`, used: value })),
  });

  it("쓴 것을 합쳐 남은 것을 낸다", () => {
    expect(balanceOf(credit(100, [30, 20]))).toMatchObject({ used: 50, remaining: 50 });
  });

  it("비율을 낸다", () => {
    expect(balanceOf(credit(100, [25])).ratio).toBeCloseTo(0.25);
  });

  it("한도를 안 정했으면 0 으로 안 나눈다", () => {
    const balance = balanceOf(credit(0, [30]));
    expect(balance).toMatchObject({ unset: true, ratio: 0, remaining: 0 });
  });

  it("한도를 안 정했으면 「남은 것」을 지어내지 않는다", () => {
    // 큰 숫자를 보여주면 그만큼 쓸 수 있다는 뜻이 된다. 화면이 「정하지
    // 않음」이라고 말하게 둔다.
    expect(balanceOf(credit(0, [30])).remaining).toBe(0);
  });

  it("넘겨 썼으면 알린다", () => {
    // 한도를 나중에 내리면 이미 쓴 것이 더 많을 수 있다.
    const balance = balanceOf(credit(100, [80, 50]));
    expect(balance).toMatchObject({ over: true, remaining: 0 });
    expect(balance.ratio).toBe(1);
  });

  it("팀원이 없어도 안 터진다", () => {
    expect(balanceOf(credit(100, []))).toMatchObject({ used: 0, remaining: 100 });
  });
});

describe("이 사람이 쓸 수 있는 최대치", () => {
  it("한도를 안 정했으면 개인 상한 그대로다", () => {
    const me = member({ personalQuota: 80 });
    expect(effectiveQuotaOf({ quota: 0, members: [me] }, me)).toBe(80);
  });

  it("팀 잔량이 개인 상한보다 적으면 잔량이다", () => {
    // 팀원이 많이 쓸수록 내 천장이 내려간다. 그것이 「크레딧을 팀에
    // 합친다」의 뜻이다.
    const me = member({ personalQuota: 80 });
    const mate = member({ userId: "u2", used: 60 });
    expect(effectiveQuotaOf({ quota: 100, members: [me, mate] }, me)).toBe(40);
  });

  it("내가 쓴 것은 내 천장에서 안 뺀다", () => {
    // 내 것까지 빼면 두 번 빼는 것이 된다 — 비교하는 쪽이 내 사용량을 이미
    // 더한다.
    const me = member({ personalQuota: 80, used: 30 });
    expect(effectiveQuotaOf({ quota: 100, members: [me] }, me)).toBe(80);
  });

  it("개인 상한이 더 낮으면 개인 상한이다", () => {
    const me = member({ personalQuota: 20 });
    expect(effectiveQuotaOf({ quota: 1000, members: [me] }, me)).toBe(20);
  });

  it("팀원이 다 써 버렸으면 0 이다 — 음수가 아니다", () => {
    const me = member({ personalQuota: 80 });
    const mate = member({ userId: "u2", used: 150 });
    expect(effectiveQuotaOf({ quota: 100, members: [me, mate] }, me)).toBe(0);
  });
});
