import { describe, expect, it } from "vitest";
import {
  advanceJob,
  canRetrySubmission,
  initialJobState,
  isTerminal,
  outcomeOf,
  type PdpJobState,
} from "../state";

/**
 * **생성 작업의 상태를 값으로 잰다.**
 *
 * 설계 §8.2 의 전이표다. 화면 밖에서도 결과를 되찾으려면 「지금 어디까지 갔나」를
 * 서버가 알아야 하는데, 그 판단이 라우트·워커에 흩어지면 한쪽만 고치는 날
 * **이미 값을 치른 그림을 잃는다.** 그래서 전이는 여기 한 곳에서만 정한다.
 *
 * 세 축이 **서로 독립**이라는 것이 핵심이다.
 *   생성(generation) · 정산(settlement) · 보존(persistence)
 * 정산이 실패해도 결과는 살아 있어야 하고, 그림을 받았어도 저장 전에는
 * 「끝났다」고 말하면 안 된다.
 */
const 새작업 = (): PdpJobState => initialJobState();

describe("생성 축", () => {
  it("예약 전에는 아무것도 제출하지 않는다", () => {
    expect(새작업().generation).toBe("validated");
    expect(isTerminal(새작업())).toBe(false);
  });

  it("정상 흐름은 예약 → 제출 → 생성 → 결과 → 보존 순이다", () => {
    let state = 새작업();
    for (const event of ["reserved", "submitting", "submitted", "generating", "result_available", "persisted"] as const) {
      state = advanceJob(state, { type: event });
    }
    expect(state.generation).toBe("persisted");
    expect(state.persistence).toBe("stored");
  });

  it("건너뛴 전이는 거부한다 — 제출한 적 없는 작업이 결과를 가질 수 없다", () => {
    expect(() => advanceJob(새작업(), { type: "result_available" })).toThrow(/전이/);
  });
});

describe("제출이 불확실할 때", () => {
  const 제출중 = () => advanceJob(advanceJob(새작업(), { type: "reserved" }), { type: "submitting" });

  it("응답을 못 받으면 uncertain 이고, 끝난 것도 실패한 것도 아니다", () => {
    const state = advanceJob(제출중(), { type: "submission_unknown" });

    expect(state.submission).toBe("uncertain");
    expect(isTerminal(state)).toBe(false);
    expect(outcomeOf(state)).toBe("checking");
  });

  it("**같은 유료 호출을 자동으로 다시 보내지 않는다**", () => {
    const state = advanceJob(제출중(), { type: "submission_unknown" });

    // 공급자가 멱등을 보장하는지 우리가 확인하지 않았다. 다시 보내면 두 번 낸다.
    expect(canRetrySubmission(state)).toBe(false);
  });

  it("아직 제출 전이면 다시 보내도 된다", () => {
    expect(canRetrySubmission(advanceJob(새작업(), { type: "reserved" }))).toBe(true);
  });

  it("뒤늦게 request ID 를 찾으면 정상 흐름으로 돌아온다", () => {
    const state = advanceJob(제출중(), { type: "submission_unknown" });
    const 찾음 = advanceJob(state, { type: "submitted" });

    expect(찾음.submission).toBe("known");
    expect(찾음.generation).toBe("submitted");
  });
});

describe("정산은 생성과 독립이다", () => {
  const 결과있음 = () => {
    let state = 새작업();
    for (const event of ["reserved", "submitting", "submitted", "generating", "result_available"] as const) {
      state = advanceJob(state, { type: event });
    }
    return state;
  };

  it("정산이 실패해도 결과를 버리지 않는다", () => {
    const state = advanceJob(결과있음(), { type: "settlement_failed" });

    expect(state.generation).toBe("result_available");
    expect(state.settlement).toBe("retry_required");
    expect(outcomeOf(state)).not.toBe("failed");
  });

  it("보존까지 끝나고 정산이 남았으면 아직 완료가 아니다", () => {
    let state = advanceJob(결과있음(), { type: "persisted" });
    state = advanceJob(state, { type: "settlement_failed" });

    expect(isTerminal(state)).toBe(false);
    expect(outcomeOf(state)).toBe("settling");
  });

  it("**생성이 끝났어도 정산이 남으면 손을 떼면 안 된다**", () => {
    let state = advanceJob(결과있음(), { type: "persisted" });
    state = advanceJob(state, { type: "reviewed", passed: true });
    state = advanceJob(state, { type: "settlement_failed" });

    // 생성 축만 보면 `completed` 다. 여기서 끝났다고 하면 그 요청의 크레딧은
    // 영영 안 닫히고, 원가도 장부에 안 남는다.
    expect(state.generation).toBe("completed");
    expect(isTerminal(state)).toBe(false);
    expect(outcomeOf(state)).toBe("settling");
  });

  it("생성이 끝났어도 보존이 남으면 손을 떼면 안 된다", () => {
    let state = advanceJob(결과있음(), { type: "persisted" });
    state = advanceJob(state, { type: "reviewed", passed: true });
    state = advanceJob(state, { type: "persist_failed" });

    expect(state.generation).toBe("completed");
    expect(isTerminal(state)).toBe(false);
  });

  it("셋이 모두 끝나야 완료다", () => {
    let state = advanceJob(결과있음(), { type: "persisted" });
    state = advanceJob(state, { type: "settled" });
    state = advanceJob(state, { type: "reviewed", passed: true });

    expect(state.generation).toBe("completed");
    expect(isTerminal(state)).toBe(true);
  });
});

describe("보존", () => {
  const 결과있음 = () => {
    let state = 새작업();
    for (const event of ["reserved", "submitting", "submitted", "generating", "result_available"] as const) {
      state = advanceJob(state, { type: event });
    }
    return state;
  };

  it("그림을 받았어도 저장 전에는 완료라고 말하지 않는다", () => {
    expect(outcomeOf(결과있음())).toBe("storing");
  });

  it("저장이 실패하면 **그 결과로** 다시 시도한다 — 새로 만들지 않는다", () => {
    const state = advanceJob(결과있음(), { type: "persist_failed" });

    expect(state.persistence).toBe("retry_required");
    // 생성 축은 그대로다. 되돌아가서 다시 그리면 값을 두 번 낸다.
    expect(state.generation).toBe("result_available");
    expect(canRetrySubmission(state)).toBe(false);
  });
});

describe("검수 결과", () => {
  const 저장됨 = () => {
    let state = 새작업();
    for (const event of ["reserved", "submitting", "submitted", "generating", "result_available", "persisted", "settled"] as const) {
      state = advanceJob(state, { type: event });
    }
    return state;
  };

  it("검수에서 걸리면 완료가 아니라 확인 대기다", () => {
    const state = advanceJob(저장됨(), { type: "reviewed", passed: false });

    expect(state.generation).toBe("review_required");
    expect(isTerminal(state)).toBe(true);
  });

  it("일부만 성공하면 partial 이다", () => {
    const state = advanceJob(저장됨(), { type: "partial" });

    expect(state.generation).toBe("partial");
    expect(isTerminal(state)).toBe(true);
  });
});

describe("실패", () => {
  it("제출 전 실패는 깨끗한 실패다", () => {
    const state = advanceJob(advanceJob(새작업(), { type: "reserved" }), { type: "failed" });

    expect(state.generation).toBe("failed");
    expect(isTerminal(state)).toBe(true);
  });

  it("결과를 이미 받은 뒤에는 실패로 덮지 않는다", () => {
    let state = 새작업();
    for (const event of ["reserved", "submitting", "submitted", "generating", "result_available"] as const) {
      state = advanceJob(state, { type: event });
    }

    expect(() => advanceJob(state, { type: "failed" })).toThrow(/전이/);
  });
});
