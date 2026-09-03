/**
 * 로그인한 사람이 처음 보는 곳.
 *
 * 전에는 상세페이지 만들기였다. 그런데 만들기부터 열면 재료가 뭐가 있는지
 * 모르는 채로 시작하게 된다. 라이브러리에는 참고 이미지와 지난 작업물이
 * 있고, 거기서 바로 도구로 보낼 수 있다. 가진 것을 먼저 보는 쪽이 맞다.
 *
 * 여러 곳에서 같은 곳으로 보내야 해서 한 자리에 둔다 — 로그인 화면,
 * 미들웨어, 로컬 우회.
 */
export const HOME_AFTER_LOGIN = "/library";

/**
 * 로그인 전에 가려던 곳으로 돌려보낸다.
 *
 * `//evil.example.com` 같은 것을 그대로 쓰면 브라우저가 **다른 사이트**로
 * 읽는다. 우리 안의 경로만 허용한다.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return HOME_AFTER_LOGIN;
  return next.startsWith("/") && !next.startsWith("//") ? next : HOME_AFTER_LOGIN;
}
