import { describe, expect, it } from "vitest";
import { classifyFalFailure } from "../failure";

/**
 * **제공자가 거절한 것과 우리가 고장난 것은 다른 일이다.**
 *
 * 2026-09-16: 포스터를 글만으로 만들었더니 fal 이 422 로 거절했다 —
 * 「content checker」에 걸린 것이고, fal 은 $0.00 을 청구했다. 그런데 화면에는
 * 「500 Internal Server Error」만 떴다. 사용자는 **자기 요청이 거절된 것인지
 * 우리 서버가 죽은 것인지 알 수 없었다.**
 *
 * 그리고 돈이 안 나갔는데도 예약한 장은 10분(`reserve_generation` 의
 * `interval '10 minutes'`) 동안 그 사람 한도에서 묶여 있었다.
 *
 * **화면 밖에서 가른다.** 라우트의 `catch` 안에 두면 「4xx 를 4xx 로 내보내는가」를
 * 값으로 못 잰다.
 */

const falError = (status: number, message: string) =>
  Object.assign(new Error(message), { name: "ApiError", status });

describe("제공자 거절", () => {
  /** 이것이 이번에 실제로 난 일이다. */
  it("422 는 거절이다", () => {
    const verdict = classifyFalFailure(falError(422, "The content could not be processed"));

    expect(verdict.kind).toBe("rejected");
    expect(verdict.status).toBe(422);
  });

  it("다른 4xx 도 거절이다", () => {
    for (const status of [400, 403, 404, 413]) {
      expect(classifyFalFailure(falError(status, "nope")).kind).toBe("rejected");
    }
  });

  /**
   * **429 는 거절이 아니다.** 한도에 걸린 것이라 다시 하면 된다 — 되돌릴 수 없는
   * 거절처럼 말하면 사용자가 포기한다.
   */
  it("429 는 다시 하면 되는 일이다", () => {
    expect(classifyFalFailure(falError(429, "rate limit")).kind).toBe("busy");
  });

  it("5xx 는 제공자 고장이다", () => {
    expect(classifyFalFailure(falError(500, "boom")).kind).toBe("provider_fault");
    expect(classifyFalFailure(falError(503, "down")).kind).toBe("provider_fault");
  });

  /** 상태가 없는 것은 우리 쪽에서 터진 것이다. 남 탓하지 않는다. */
  it("상태 없는 예외는 우리 고장이다", () => {
    expect(classifyFalFailure(new Error("이미지를 저장하지 못했습니다.")).kind).toBe("fault");
    expect(classifyFalFailure("문자열").kind).toBe("fault");
    expect(classifyFalFailure(null).kind).toBe("fault");
  });
});

/**
 * **돈이 나갔는가.**
 *
 * 거절이면 fal 이 청구하지 않는다($0.00 실측). 그러면 묶어 둔 장을 **바로**
 * 돌려줘야 한다 — 안 그러면 10분간 그 사람 한도가 줄어든 채로 있다.
 */
describe("예약을 풀어야 하는가", () => {
  it("거절·바쁨·제공자 고장이면 푼다 — 돈이 안 나갔다", () => {
    for (const status of [422, 400, 429, 503]) {
      expect(classifyFalFailure(falError(status, "x")).releaseReservation).toBe(true);
    }
  });

  /**
   * **우리 고장은 안 푼다.** 어디서 터졌는지 모르는데, fal 은 이미 그려서 돈을
   * 받았을 수 있다. 그때 풀면 공짜로 한 장을 준 셈이 된다. 10분 뒤 만료로
   * 풀리게 두는 편이 안전하다.
   */
  it("우리 고장이면 안 푼다 — 이미 그려졌을 수 있다", () => {
    expect(classifyFalFailure(new Error("저장 실패")).releaseReservation).toBe(false);
  });
});

describe("사람에게 할 말", () => {
  /** 영어 원문만 던지면 무엇을 해야 할지 모른다. */
  it("거절이면 무엇을 하라고 말한다", () => {
    const verdict = classifyFalFailure(falError(422, "flagged by a content checker"));

    expect(verdict.message).toContain("거절");
    expect(verdict.message.length).toBeGreaterThan(10);
  });

  /** 제공자가 준 원문도 함께 남긴다 — 운영자가 이것으로 fal 기록을 찾는다. */
  it("제공자가 준 말을 버리지 않는다", () => {
    expect(classifyFalFailure(falError(422, "flagged by a content checker")).detail)
      .toContain("flagged by a content checker");
  });

  it("바쁨과 제공자 고장은 다시 해 보라고 한다", () => {
    expect(classifyFalFailure(falError(429, "x")).message).toContain("잠시");
    expect(classifyFalFailure(falError(503, "x")).message).toContain("잠시");
  });
});

/**
 * **HTTP 로 무엇을 돌려줄까.**
 *
 * 거절을 500 으로 내보내면 「우리가 고장났다」는 뜻이 된다. 거절은 요청이
 * 문제였다는 뜻이라 4xx 다.
 */
describe("돌려줄 HTTP 상태", () => {
  it("거절은 그 상태를 그대로", () => {
    expect(classifyFalFailure(falError(422, "x")).httpStatus).toBe(422);
    expect(classifyFalFailure(falError(400, "x")).httpStatus).toBe(400);
  });

  it("바쁨은 429", () => {
    expect(classifyFalFailure(falError(429, "x")).httpStatus).toBe(429);
  });

  /** 남의 고장을 우리 500 으로 말하지 않는다. 502 가 「위쪽이 문제」다. */
  it("제공자 고장은 502", () => {
    expect(classifyFalFailure(falError(503, "x")).httpStatus).toBe(502);
  });

  it("우리 고장은 500", () => {
    expect(classifyFalFailure(new Error("x")).httpStatus).toBe(500);
  });
});
