import type { EasyStore } from "./store";
import { isSayBody } from "../../app/easy/row-marks";

/**
 * **실패도 대화에 남긴다**(2026-10-06 설계 B4).
 *
 * 사용자 말을 남긴 뒤 기획 · 생성 · 고치기 · 원고가 실패하면 화면에만 오류를 보였다.
 * 새로고침하면 내 말만 남고 답이 없어 「대화가 끊겼다」로 보였다.
 *
 * 저장소를 감싸 **마지막으로 남긴 줄이 사용자 말인지**만 지켜본다. 라우트의 `catch` 한
 * 곳에서 부르면 이미지 · 카드뉴스 원고 · 이미지 고치기 길이 모두 같은 규칙을 탄다.
 */
const 머리 = "요청을 처리하지 못했습니다. ";

/**
 * 우리가 알고 낸 실패(`EasyStepError`)가 **아닐 때** 남길 말(최종 리뷰 2026-10-06). 그런
 * 오류의 글에는 표 이름 · 칼럼 이름이 섞여 온다 — 대화는 남고 다시 열면 보인다. 가림은
 * 라우트가 한다: 이 파일은 화면도 읽어서(`ad-ask.ts`) `relay.ts`(→ `node:crypto`)를 못 들인다.
 */
export const FAILED_TURN_GENERIC = "잠시 뒤 다시 시도해 주세요.";

export function failureRowBody(message: string): string {
  return `${머리}${message}`;
}

/**
 * 실패 줄에 남길 글(리뷰 2026-10-06). 안쪽 포스터 라우트는 모든 예외를 잡아 **날것의 오류 글**을
 * 응답에 싣고 `read()` 가 그것을 `EasyStepError` 로 올린다 — `EasyStepError` 라고 우리가 쓴
 * 말은 아니다. 우리 멤버십 층이 쓴 글만 남긴다: 크레딧 · 한도 코드가 있거나 402 · 403 일 때.
 * 나머지(코드 없는 4xx · 5xx 포함, 429 · 503 도 안쪽 글이라 가려진다)는 일반 문장이다.
 * `relay.ts` 를 못 들이므로 이름으로 알아본다.
 */
export function failureRowMessage(error: unknown): string {
  if (!(error instanceof Error) || error.name !== "EasyStepError") return FAILED_TURN_GENERIC;
  const { code, status } = error as Error & { code?: string; status?: number };
  return code || status === 402 || status === 403 ? error.message : FAILED_TURN_GENERIC;
}

/** 실패 안내 줄인가(글로 알아본다 — 표에 칸을 더하지 않는다). */
export function isFailureRowBody(body: string): boolean {
  return body.startsWith(머리);
}

type Append = EasyStore["appendMessage"];

export function trackUserTurn<S extends { appendMessage: Append }>(store: S): {
  store: S;
  /** 실패 안내를 남겼으면 답 못 받은 그 사용자 줄 글(표시 포함), 안 남겼으면 undefined(후속 Task 9). */
  leaveFailure(conversationId: string, message: string): Promise<string | undefined>;
} {
  // 답 못 받은 사용자 줄 글. 답을 받았거나 아직 말을 안 남겼으면 undefined.
  let 답없는말: string | undefined;
  const appendMessage: Append = async (input) => {
    const row = await store.appendMessage(input);
    /*
     * **머리말 줄은 답이 아니다**(2026-10-07 2차 D4 · §3-4). 일하는 턴은 사용자 줄 -> 머리말 줄 ->
     * 그림 줄 차례다. 머리말 뒤에 기획 · 생성이 실패해도 실패 줄이 남아야 한다.
     */
    const 머리말 = 답없는말 !== undefined && input.role === "assistant" && isSayBody(input.body ?? "");
    답없는말 = input.role === "user" ? input.body ?? "" : 머리말 ? 답없는말 : undefined;
    return row;
  };
  return {
    store: { ...store, appendMessage },
    async leaveFailure(conversationId, message) {
      const 말 = 답없는말;
      if (말 === undefined) return undefined;
      답없는말 = undefined;
      try {
        await store.appendMessage({ conversationId, role: "assistant", body: failureRowBody(message) });
        return 말;
      } catch {
        // 삼킨다. 실패 안내 하나 때문에 원래 오류를 덮지 않는다.
        return undefined;
      }
    },
  };
}
