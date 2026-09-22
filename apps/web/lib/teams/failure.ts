/**
 * 팀 화면의 실패를 사람 말로 돌려보내는 길.
 *
 * **서버 액션이 던지면 운영에서는 안내가 사라진다.** 운영 빌드는 오류의 글을 가리고
 * 「server-side exception · Digest …」만 남긴다. 2026-09-22 에 「빼기」가 바로 그렇게
 * 보였고, 서버 기록에는 「마지막 팀장은 뺄 수 없습니다」가 있었다. 그래서 액션은
 * 던지지 않고 실패 문구를 주소(`?error=`)에 실어 돌려보낸다 — 성공을 `?notice=` 로
 * 나르는 것과 같은 길이다.
 */

const GENERIC = "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * 우리가 적은 안내(한국어)는 그대로, 그 밖은 뭉쳐서.
 *
 * DB·네트워크 오류의 글에는 표 이름과 제약 이름이 들어 있다. 화면에 내보내지 않고
 * 서버 기록에만 남긴다.
 */
export function teamFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/[가-힣]/.test(message)) return message;
  console.error("[team] 처리 실패", cause);
  return GENERIC;
}

/**
 * 주소에 실려 온 실패 문구를 화면에 낼 것인가.
 *
 * `?error=` 는 누구나 적어 보낼 수 있다. 「보안 경고: …에서 다시 로그인하세요」를 담은
 * 링크를 관리자에게 보내면 진짜 경고처럼 뜬다(독립 리뷰 2026-09-22). 우리가 보내는
 * 꼴 — 한국어, 200자 이하, 주소가 안 들어간 한 줄 — 만 그대로 보여 준다.
 */
export function shownFailure(raw: string | undefined): string | null {
  if (!raw) return null;
  const ours = /[가-힣]/.test(raw) && raw.length <= 200 && !/https?:|www\.|\.(com|net|io|kr|example)\b/i.test(raw);
  return ours ? raw : GENERIC;
}

/** 돌아갈 주소에 실패 문구를 싣는다. */
export function failureUrl(back: string, message: string): string {
  return `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}
