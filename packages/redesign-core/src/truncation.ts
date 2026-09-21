/**
 * **끝까지 못 쓴 답을 알아본다**(F-7-1).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 잘린 응답은 JSON 이 안 닫힌다. `parseMaybeJson` 은 못 파싱하면
 * `{ summary: 조각난_글 }` 을 주는데, `isUsableAnalysis` 는 `summary` 에 글자가
 * 있으므로 **쓸 만하다고 본다.** 그래서 F-7-3 이 「빈 분석으로 유료 생성」을
 * 막아 놓고도 **잘린 분석으로는 그대로 유료 생성이 돌았다.**
 *
 * 상세페이지는 `stop_reason === "max_tokens"` 를 보고 던진다
 * (`apps/web/lib/pdp/providers.ts`). 같은 계약을 여기서도 쓴다.
 *
 * ── 사용자에게 가는 말에 모델 이름을 넣지 않는다 ─────────────
 *
 * 상세페이지는 공급자 문구를 **한 겹 번역해서** 내보낸다
 * (`pdp.service.ts`: 「AI 가 답을 끝까지 쓰지 못하고 잘렸습니다…」). 처음에는
 * 그 윗겹만 베껴서 `gpt-5.5` 같은 이름이 회원 토스트까지 그대로 갔다
 * (2026-09-21 리뷰). 이름이 든 원문은 로그로만 남긴다.
 *
 * **운영자만 할 수 있는 일을 사용자에게 시키지 않는다.** 「상한을 올려 주세요」는
 * 코드 상수라 회원이 못 한다 — 상세페이지 문구가 「입력을 줄이거나」로 끝나는
 * 이유가 그것이다.
 */

/** 상세페이지가 쓰는 것과 같은 이름(`PdpResponseTruncatedError.code`). */
export const TRUNCATED_CODE = "AI_RESPONSE_TRUNCATED";

/** 끝까지 못 썼다. 사용자가 할 일은 자료를 줄이는 것이다. */
const CUT_SHORT = "AI 가 분석을 끝까지 쓰지 못했습니다. 원본 장수를 줄여 다시 시도해 주세요.";

/** 모델이 중간에 멈췄다(안전 정책 등). 줄인다고 되는 일이 아니다. */
const STOPPED = "AI 가 분석을 중간에 멈췄습니다. 다른 자료로 다시 시도해 주세요.";

export class TruncatedResponseError extends Error {
  readonly code = TRUNCATED_CODE;
  constructor(message: string, readonly detail: string) {
    super(message);
    this.name = "TruncatedResponseError";
  }
}

/**
 * 이 응답을 계획으로 써도 되는가.
 *
 * 업체마다 이름이 다르다.
 *
 *   OpenAI  `status: "incomplete"` · `incomplete_details.reason`
 *   Google  `candidates[].finishReason` (정상은 `"STOP"`)
 *
 * **Google 은 `MAX_TOKENS` 만 보면 모자란다.** `SAFETY`·`RECITATION` 으로
 * 중간에 멈춰도 앞부분 글이 남아, `isUsableAnalysis` 가 통과시킨다 — 이름만
 * 바꾼 같은 구멍이다. 그래서 **정상(`STOP`)이 아니면 모두 잡는다.**
 *
 * `status` 도 `candidates` 도 없으면 지나간다. 모르는 모양에 문을 닫으면 옛
 * 응답 형식 하나에 생성이 통째로 멎는다.
 */
export function assertNotTruncated(data: unknown, model: string): void {
  if (!data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;

  const openaiReason = record.status === "incomplete"
    ? String((record.incomplete_details as { reason?: unknown } | undefined)?.reason ?? "incomplete")
    : "";

  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const googleReason = candidates
    .map((candidate) => String((candidate as { finishReason?: unknown })?.finishReason ?? ""))
    .find((reason) => reason && reason !== "STOP") ?? "";

  const reason = openaiReason || googleReason;
  if (!reason) return;

  const 길이때문 = reason === "max_output_tokens" || reason === "MAX_TOKENS";
  throw new TruncatedResponseError(
    길이때문 ? CUT_SHORT : STOPPED,
    // 이름과 사유는 **여기에만** 남는다. 사용자에게는 안 간다.
    `${model} finishReason=${reason}`,
  );
}
