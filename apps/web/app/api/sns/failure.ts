import { errorLogText } from "../../../lib/easy/log-text";

/**
 * **예상 못 한 실패를 화면에 어떻게 말할지**(2026-10-07 서버 처리 오류 원문 가리기, 카드뉴스).
 *
 * 전에는 `catch` 마다 `error.message` 를 그대로 돌려줬다. Supabase · 저장소 · fal · 글 모델의 날것 글과
 * 설정 오류의 환경변수 이름이 카드뉴스 화면에 떴다. 원문은 서버 기록에만 남기고 화면에는 그 라우트의
 * 일반 문장을 준다.
 *
 * **상태 코드는 부른 쪽이 지금 쓰던 값을 그대로 넘긴다.** 화면은 상태 코드로 갈래를 타고(404 다시 읽기,
 * 만들기 실패 뒤 다시 맞추기), 쉽게 모드는 5xx 를 한 번 더 가린다. 일부러 쓴 안내는 여기로 오지 않는다.
 */
export function snsFailure(where: string, error: unknown, message: string, status: number): Response {
  console.error(`[sns] ${where} 실패`, errorLogText(error));
  return Response.json({ ok: false, message }, { status });
}
