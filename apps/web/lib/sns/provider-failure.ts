import { errorLogText } from "../easy/log-text";

/** 제공자 호출이 던졌을 때 `issues` 에 남는 글. */
export const PROVIDER_FAILED = "응답을 받지 못했습니다.";

/**
 * **제공자가 던진 원문을 우리 문장으로 바꿔 다시 던진다**(2026-10-07 오류 원문 가리기 Task 3, 다양하게 12b 와 같다).
 *
 * 패키지(`withIssueFallback`)는 던진 글을 그대로 `issues` 에 적는다(「주 모델 기획 실패: <원문>」). 그 목록은
 * 작업에 저장되고 카드뉴스 화면 · 쉽게 모드 대화에 뜬다. 원문(SDK · 네트워크 글)은 서버 기록에만 남긴다.
 * **여전히 던진다** — 주→예비 넘어가기가 전과 같다. 값은 원래 호출 안에서 잰다.
 *
 * 제공자 호출 하나만 감싼다. 패키지가 응답을 검사하며 던지는 글(「AI가 허용 범위 …」)은 이 밖이라 그대로다.
 */
export async function maskProviderError<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    console.error(`[sns] ${what} 호출 실패`, errorLogText(error));
    throw new Error(PROVIDER_FAILED);
  }
}
