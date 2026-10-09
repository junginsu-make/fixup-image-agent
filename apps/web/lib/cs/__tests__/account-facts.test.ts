import { describe, expect, it } from "vitest";
import { daysLeft, describeAccount } from "../account-facts";
import { keepKnownTopics, isAccountTopic, ACCOUNT_TOPICS, TOPIC_HINT } from "../topics";

/**
 * **내 계정 사실을 사람 말로**(2026-09-23, 설계 §5.1).
 *
 * 「월 구독 남은 날짜, 크레딧 얼마 남았는지 물어보면 답하나요?」
 *
 * ── 왜 여기서 세는가 ───────────────────────────────────────
 *
 * 「9월 30일까지면 며칠 남았나」를 모델에게 시키면 틀린다. **여기서 세고**,
 * 모델은 받은 문장을 말투만 다듬는다.
 */

const 오늘 = new Date("2026-09-23T05:00:00Z");

const 사용량 = (patch: Record<string, unknown> = {}) => ({
  used: 30, reserved: 0, quota: 100, remaining: 70,
  periodStart: "2026-09-01", periodEnd: "2026-10-01",
  pricingPolicy: "image-v2" as const, balance: 70,
  subscription: { units: 75, expiresAt: "2026-09-30T00:00:00Z" },
  purchased: { units: 0, expiresAt: null },
  bonus: { units: 0, expiresAt: null },
  ...patch,
});

const 말 = (topic: string, facts: Record<string, unknown>) =>
  describeAccount([topic as never], facts as never, { now: 오늘 })[0]!;

describe("며칠 남았나", () => {
  it("**일 단위로 센다**", () => {
    expect(daysLeft("2026-09-30T00:00:00Z", 오늘)).toBe(7);
  });

  /**
   * **자정을 기준으로 센다.** 시각까지 세면 같은 날인데 「0일」과 「1일」이
   * 갈린다. 사람이 달력을 보고 세는 것과 같게 한다.
   */
  it("**같은 날이면 0 이다** — 시각이 달라도", () => {
    expect(daysLeft("2026-09-23T23:59:00Z", 오늘)).toBe(0);
    expect(daysLeft("2026-09-23T00:00:00Z", 오늘)).toBe(0);
  });

  it("**지난 날은 음수다**", () => {
    expect(daysLeft("2026-09-20T00:00:00Z", 오늘)).toBe(-3);
  });

  it("**없으면 모른다** — 0 이 아니다", () => {
    expect(daysLeft(null, 오늘)).toBeNull();
    expect(daysLeft("", 오늘)).toBeNull();
    expect(daysLeft("어제", 오늘)).toBeNull();
  });
});

describe("크레딧 잔액", () => {
  it("**남은 수를 말한다**", () => {
    expect(말("balance", { usage: 사용량() })).toContain("70장");
  });

  it("**처리 중인 것이 있으면 따로 말한다**", () => {
    const 답 = 말("balance", { usage: 사용량({ reserved: 5 }) });

    expect(답).toContain("5장은 지금 만들고 있는");
  });

  it("**처리 중이 없으면 그 말을 안 한다**", () => {
    expect(말("balance", { usage: 사용량() })).not.toContain("만들고 있는");
  });

  it("**구독 크레딧 만료일을 함께 말한다**", () => {
    const 답 = 말("balance", { usage: 사용량() });

    expect(답).toContain("2026년 9월 30일");
    expect(답).toContain("7일 남았습니다");
  });

  it("**무제한이면 숫자를 안 말한다**", () => {
    expect(말("balance", { usage: 사용량({ unlimited: true }) })).toContain("무제한");
  });

  /**
   * **모르는 것은 모른다고 한다.** 장부를 못 읽었는데 0 을 적으면
   * 「0장 남았다」가 되어 없는 사실을 말하게 된다.
   */
  it("**못 읽었으면 그렇다고 한다** — 0장이라고 하지 않는다", () => {
    const 답 = 말("balance", { usage: null });

    expect(답).toContain("읽지 못했습니다");
    expect(답).not.toContain("0장");
  });
});

describe("구독 플랜", () => {
  it("**플랜 이름과 남은 날짜를 말한다**", () => {
    const 답 = 말("plan", { usage: 사용량(), planName: "Basic", planStatus: "active" });

    expect(답).toContain("Basic");
    expect(답).toContain("7일 남았습니다");
  });

  it("**구독 중이 아니면 그렇다고 한다**", () => {
    const 답 = 말("plan", { usage: 사용량(), planName: null });

    expect(답).toContain("구독 중인 플랜이 없습니다");
  });

  it("**상태가 이용 중이 아니면 말한다**", () => {
    const 답 = 말("plan", { usage: 사용량(), planName: "Basic", planStatus: "canceled" });

    expect(답).toContain("canceled");
  });

  it("**만료일을 모르면 지어내지 않는다**", () => {
    const 답 = 말("plan", {
      usage: 사용량({ subscription: { units: 75, expiresAt: null } }),
      planName: "Basic",
    });

    expect(답).toContain("읽지 못했습니다");
    expect(답, "모르는데 날짜를 지어냈다").not.toMatch(/\d+일 남았습니다/);
  });

  it("**오늘이 마지막 날이면 그렇게 말한다**", () => {
    const 답 = 말("plan", {
      usage: 사용량({ subscription: { units: 75, expiresAt: "2026-09-23T10:00:00Z" } }),
      planName: "Basic",
    });

    expect(답).toContain("오늘이 마지막 날");
  });

  it("**이미 지났으면 그렇게 말한다**", () => {
    const 답 = 말("plan", {
      usage: 사용량({ subscription: { units: 0, expiresAt: "2026-09-01T00:00:00Z" } }),
      planName: "Basic",
    });

    expect(답).toContain("이미 지났습니다");
  });
});

describe("이번 달 사용량", () => {
  it("**쓴 수를 말한다**", () => {
    expect(말("usage", { usage: 사용량() })).toContain("30장");
  });

  it("**언제 바뀌는지 말한다**", () => {
    expect(말("usage", { usage: 사용량() })).toContain("2026년 10월 1일");
  });

  /**
   * 2026-10-09: 구독 기간은 이제 배정한 날부터 한 달이라 달력의 달과 다르다. 「이번 기간」이라고
   * 하면 구독 기간으로 읽힌다 — 달력으로 끊는 것은 사용량 집계뿐임을 밝힌다.
   */
  it("**달력으로 끊는 것이 사용량 집계라고 밝힌다** — 구독 기간과 헷갈리지 않게", () => {
    const 답 = 말("usage", { usage: 사용량() });
    expect(답).toContain("사용량은 2026년 10월 1일부터 새로 셉니다");
    expect(답).not.toContain("이번 기간은");
  });
});

/**
 * **「왜 안 만들어졌어요?」에 실제 까닭을 답한다.**
 */
describe("최근 실패", () => {
  const 실패 = [
    { what: "상세페이지 이미지 만들기", at: "2026-09-22T10:00:00Z", reason: "크레딧이 부족했습니다" },
  ];

  it("**무엇이 언제 왜 실패했는지 말한다**", () => {
    const 답 = 말("failures", { failures: 실패 });

    expect(답).toContain("상세페이지 이미지 만들기");
    expect(답).toContain("2026년 9월 22일");
    expect(답).toContain("크레딧이 부족");
  });

  it("**없으면 없다고 한다**", () => {
    expect(말("failures", { failures: [] })).toContain("실패한 작업이 없습니다");
  });

  /** **「없다」와 「모른다」는 다르다.** */
  it("**못 읽었으면 없다고 하지 않는다**", () => {
    const 답 = 말("failures", { failures: undefined });

    expect(답).toContain("읽지 못했습니다");
    expect(답).not.toContain("없습니다");
  });

  it("**까닭이 없으면 없다고 적는다** — 지어내지 않는다", () => {
    const 답 = 말("failures", {
      failures: [{ what: "포스터 만들기", at: "2026-09-22T10:00:00Z", reason: "" }],
    });

    expect(답).toContain("기록돼 있지 않습니다");
  });
});

/**
 * **모르는 갈래는 버린다**(설계 §4.1).
 *
 * LLM 이 만들어 낸 이름을 그대로 쓰지 않는다. 구조화 응답이라도 목록 밖
 * 값이 오는 일이 있고, 조용히 넘어가면 읽기 함수가 엉뚱한 갈래를 탄다.
 */
describe("갈래 가리기", () => {
  it("**아는 이름만 남긴다**", () => {
    expect(keepKnownTopics(["balance", "남의크레딧", "plan"])).toEqual(["balance", "plan"]);
  });

  it("**같은 것을 여러 번 골라도 한 번만**", () => {
    expect(keepKnownTopics(["balance", "balance"])).toEqual(["balance"]);
  });

  it.each([
    ["목록이 아님", "balance"],
    ["없는 것", undefined],
    ["객체", { topic: "balance" }],
  ])("**%s 는 빈 목록이다**", (_이름, value) => {
    expect(keepKnownTopics(value)).toEqual([]);
  });

  it("**남의 계정을 가리키는 이름은 아예 없다**", () => {
    for (const 나쁜것 of ["otherUser", "allMembers", "userById", "admin"]) {
      expect(isAccountTopic(나쁜것), `${나쁜것} 이 갈래로 통과한다`).toBe(false);
    }
  });

  it("**갈래마다 설명이 있다** — LLM 이 고를 근거다", () => {
    for (const topic of ACCOUNT_TOPICS) {
      expect(TOPIC_HINT[topic]?.length, `${topic} 설명이 없다`).toBeGreaterThan(0);
    }
  });
});
