import { describe, expect, it } from "vitest";
import { ANALYSIS_QUOTA_EXEMPT_CODES, consumesAnalysisQuota } from "./pdp.analysis-quota";
import { toPdpErrorResponse } from "./pdp.service";

/**
 * **못 만든 분석이 한도를 먹었다**(C-9).
 *
 * 분석은 시간당 열 번으로 묶여 있다(`ANALYZE_HOURLY_LIMIT`). 그런데 그 수를
 * 세는 SQL 은 **실패한 시도까지 함께 센다** — 공급자가 죽어 있거나 키가 안
 * 꽂혀 있어도 한 칸이 사라진다.
 *
 * 사용자는 아무것도 못 받고 한도만 잃는다. 열 번을 그렇게 잃으면 한 시간을
 * 기다려야 한다.
 *
 * 설계 §14(C-9): 「**정책 분리** 수정, **남용 제한은 유지**」.
 *
 * ── 가르는 기준 하나 ─────────────────────────────────────────
 *
 * **모델이 실제로 일했는가.** 부르기 전에 끝났거나 공급자가 손도 안 댄 실패는
 * 면제하고, 답이 돌아온 뒤의 실패는 값이 이미 나갔으니 먹는다.
 */

describe("모델이 일하지 않은 실패는 한도를 안 먹는다", () => {
  it.each([
    ["AI_KEY_MISSING"],
    ["AI_KEY_INVALID"],
    ["AI_MODEL_ACCESS_DENIED"],
    ["AI_QUOTA_EXCEEDED"],
    ["AI_PROVIDER_UNAVAILABLE"],
    ["INVALID_IMAGE_PAYLOAD"],
  ])("%s → 면제", (code) => {
    expect(consumesAnalysisQuota(code)).toBe(false);
  });

  it("**예약만 하고 만료된 행도 면제다** — SQL 이 이미 그렇게 하고 있었다", () => {
    expect(consumesAnalysisQuota("reservation_expired")).toBe(false);
  });
});

describe("모델이 답한 뒤의 실패는 한도를 먹는다", () => {
  it.each([
    ["AI_RESPONSE_INVALID"],
    ["PDP_ANALYZE_FAILED"],
    ["PDP_IMAGE_QA_REJECTED"],
    ["TEXT_INPUT_INSUFFICIENT"],
  ])("%s → 소비", (code) => {
    expect(consumesAnalysisQuota(code)).toBe(true);
  });

  /**
   * **`INVALID_REQUEST` 는 면제가 아니다.**
   *
   * 이름만 보면 「깨진 입력」이라 면제하고 싶어진다. 그런데 요청 모양이 틀린
   * 것은 `readPdpRequest` 가 **예약 전에** 되돌려 보내 행 자체가 안 생긴다.
   * 예약 뒤에 이 코드가 나오는 자리는 하나뿐이다 — **모델이 쓴 설계도를
   * 못 읽은 경우**(`isTransientBlueprintFailure` 가 보는 그 코드다).
   *
   * 여기서 면제하면 모델 값을 다 치르고도 한도를 안 먹는 구멍이 생긴다.
   */
  it("**INVALID_REQUEST 는 먹는다** — 예약 뒤의 이 코드는 모델이 답한 뒤다", () => {
    expect(consumesAnalysisQuota("INVALID_REQUEST")).toBe(true);
  });

  it("성공은 당연히 먹는다", () => {
    expect(consumesAnalysisQuota(undefined)).toBe(true);
    expect(consumesAnalysisQuota(null)).toBe(true);
    expect(consumesAnalysisQuota("")).toBe(true);
  });

  it("**모르는 코드는 먹는 쪽으로 둔다** — 면제를 넓히면 한도가 뚫린다", () => {
    expect(consumesAnalysisQuota("analyze_failed")).toBe(true);
    expect(consumesAnalysisQuota("무슨코드")).toBe(true);
  });
});

/**
 * **면제 코드를 사용자가 만들 수 있으면 한도가 뚫린다**(C-9 리뷰 HIGH).
 *
 * `AI_QUOTA_EXCEEDED` 를 면제로 올리면서, 그 코드를 정하는 매처가 `"429"`
 * **부분일치**라는 것이 문제가 됐다. SDK 는 공급자 본문을 그대로 메시지에
 * 싣는다 — 「400 prompt is too long: 214297 tokens」의 토큰 수에 그 세 글자가
 * 들어가게 입력 길이를 맞추면 면제받는다. 그때 이미 다른 LLM 호출 값은 나간
 * 뒤다.
 */
describe("면제 코드를 입력으로 만들 수 없다", () => {
  it.each([
    ["400 prompt is too long: 214297 tokens > 200000 maximum"],
    ["400 image exceeds maximum: 4294967 bytes"],
  ])("%s 는 사용량 초과가 아니다", (message) => {
    const 응답 = toPdpErrorResponse(new Error(message));

    expect(응답.code).not.toBe("AI_QUOTA_EXCEEDED");
    expect(consumesAnalysisQuota(응답.code)).toBe(true);
  });

  it("**진짜 429 는 그대로 사용량 초과다**", () => {
    expect(toPdpErrorResponse(new Error("429 rate_limit_error")).code).toBe("AI_QUOTA_EXCEEDED");
    expect(
      toPdpErrorResponse(Object.assign(new Error("slow down"), { status: 429 })).code,
    ).toBe("AI_QUOTA_EXCEEDED");
  });
});

/**
 * **모델이 답을 보냈다는 신호가 장애 신호보다 강하다.**
 *
 * 장애 판정은 본문 글자도 본다. 모델이 쓴 조각이 그 글자에 닿으면 과금이 나간
 * 뒤인데도 면제받는다.
 */
describe("모델이 답한 흔적이 우선한다", () => {
  it("**깨진 JSON 안에 장애 낱말이 있어도 응답 오류다**", () => {
    const 응답 = toPdpErrorResponse(new Error('Unexpected token in JSON: {"note":"network error"}'));

    expect(응답.code).toBe("AI_RESPONSE_INVALID");
    expect(consumesAnalysisQuota(응답.code)).toBe(true);
  });
});

describe("면제 목록은 한 곳에 있다", () => {
  it("목록의 모든 코드가 면제다", () => {
    expect(ANALYSIS_QUOTA_EXEMPT_CODES.length).toBeGreaterThan(0);
    for (const code of ANALYSIS_QUOTA_EXEMPT_CODES) {
      expect(consumesAnalysisQuota(code)).toBe(false);
    }
  });
});

/**
 * **공급자가 죽은 것을 「처리 중 오류」라 부르면 면제할 수가 없다.**
 *
 * 그동안 연결 실패·502·과부하는 전부 `PDP_ANALYZE_FAILED` 로 떨어졌다. 그
 * 통은 우리 쪽 버그도 함께 담는 통이라, 통째로 면제하면 모델 값을 다 쓰고
 * 터진 경우까지 공짜가 된다. 그래서 **장애만 따로 이름 붙인다.**
 */
describe("공급자 장애를 따로 알아본다", () => {
  it.each([
    ["fetch failed"],
    ["connect ETIMEDOUT 142.250.0.1:443"],
    ["503 Service Unavailable"],
    ["The model is overloaded. Please try again later."],
    ["502 Bad Gateway"],
    /*
      **숫자 절만 잴 수 있는 사례.**

      위 다섯은 전부 낱말 절(`service unavailable`·`bad gateway`·`overloaded`)로도
      걸려서, 숫자 정규식이 **죽어 있어도 초록이었다.** 실제로 죽어 있었다 —
      `` 가 리터럴 백스페이스로 박혀 「백스페이스 문자를 찾아라」가 됐고,
      그 줄을 통째로 지워도 22건이 다 통과했다. 리뷰가 잡았다.

      아래 셋은 낱말 절에 안 걸린다. 숫자 절이 죽으면 여기가 빨개진다.
    */
    ["503 status code (no body)"],
    ["504 Gateway Time-out"],
    ["502 "],
  ])("%s → AI_PROVIDER_UNAVAILABLE", (message) => {
    expect(toPdpErrorResponse(new Error(message)).code).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  /**
   * **상태 코드가 있으면 그것이 답이다.**
   *
   * SDK 는 공급자 본문을 그대로 `error.message` 에 싣는다. 본문 글자로만
   * 가르면 모델이 답한 뒤의 실패가 장애로 둔갑한다.
   */
  it("**4xx 는 장애가 아니다** — 본문에 장애 낱말이 있어도", () => {
    const 사가공 = Object.assign(new Error("400 the model is overloaded"), { status: 400 });

    expect(toPdpErrorResponse(사가공).code).not.toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("503 이면 본문이 무엇이든 장애다", () => {
    const 오공삼 = Object.assign(new Error("{\"type\":\"error\"}"), { status: 503 });

    expect(toPdpErrorResponse(오공삼).code).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("**우리 쪽 버그는 여전히 우리 통에 담긴다**", () => {
    expect(toPdpErrorResponse(new Error("Cannot read properties of undefined")).code).toBe(
      "PDP_ANALYZE_FAILED",
    );
  });

  it("**장애는 재시도 안내를 준다** — 「처리 중 오류」로는 무엇을 하면 되는지 모른다", () => {
    const 응답 = toPdpErrorResponse(new Error("fetch failed"));

    expect(응답.message).toContain("잠시 후");
  });
});
