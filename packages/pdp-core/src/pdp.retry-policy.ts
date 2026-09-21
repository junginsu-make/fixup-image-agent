/**
 * **무엇을 다시 물어볼 것인가.**
 *
 * ── 무엇이 문제였나 (D-3 · D-6) ──────────────────────────────
 *
 * 모델이 JSON 대신 말을 섞어 보내거나 섹션을 하나도 안 주면 다시 묻는 것이
 * 맞다. 그러라고 재시도 장치가 있었다. 그런데 **아무것도 그 장치에 닿지
 * 못했다.**
 *
 * **① 호출 층(D-6).** 재시도 여부를 `error.message` 로 정했다 — 「JSON」·
 * 「Unexpected token」 같은 엔진 글자를 찾는다. 그런데 설계도 파싱은 그 오류를
 * 잡아 **한국어 문장으로 바꿔** 던진다. 찾는 글자가 사라졌으니 한 번도 안 걸렸다.
 *
 * **② 라우트 층(D-3).** 「`INVALID_REQUEST` 이고 detail 에 section 이 있으면」
 * 다시 부르게 돼 있었다. 그런데 분석 경로에는 그 코드를 던지는 자리가 없다 —
 * 섹션이 비면 `AI_RESPONSE_INVALID` 다. 코드가 안 맞아 역시 한 번도 안 걸렸다.
 *
 * 설계 §14.4: D-6 「**오류 코드 기반으로** 수정」.
 *
 * ── 왜 한 곳에 모으나 ────────────────────────────────────────
 *
 * 두 층이 각자 다른 글자를 찾고 있었기 때문이다. 판단을 한 곳에 두면 다음에
 * 코드가 하나 늘어도 두 층이 같이 안다.
 */

/**
 * **다시 물으면 달라질 수 있는 실패.**
 *
 * 지금은 하나뿐이다 — 모델이 답을 제대로 못 쓴 경우. 같은 그림·같은 프롬프트로
 * 다시 물으면 다른 답이 온다.
 *
 * 공급자 장애(`AI_PROVIDER_UNAVAILABLE`)와 사용량 초과(`AI_QUOTA_EXCEEDED`)는
 * **여기 없다.** 그쪽은 기다렸다 부르는 것이 맞고, 그 기다림은 호출 층이 따로
 * 한다(`retryOperation` 의 backoff).
 */
export const RETRIABLE_MODEL_CODES = ["AI_RESPONSE_INVALID"] as const;

const RETRIABLE = new Set<string>(RETRIABLE_MODEL_CODES);

/**
 * 이 실패를 다시 물어볼 것인가.
 *
 * **모르는 코드는 안 묻는다.** 다시 부르는 것은 공짜가 아니다 — 넓히면 값이
 * 그만큼 더 나간다. 한도 면제(`pdp.analysis-quota`)가 모르는 것을 「먹는 쪽」에
 * 두는 것과 **같은 이유, 반대 방향**이다: 어느 쪽이든 조심하는 쪽이 기본이다.
 */
export function isRetriableModelFailure(code: string | null | undefined): boolean {
  return Boolean(code) && RETRIABLE.has(code!);
}
