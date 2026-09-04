/**
 * 로그인한 사람이 처음 보는 곳.
 *
 * 상세페이지 만들기 → 라이브러리 → 설명서 순으로 옮겨 왔다.
 *
 * 만들기부터 열면 재료가 뭐가 있는지 모르는 채로 시작한다. 그래서 가진 것을
 * 먼저 보여 주려고 라이브러리로 옮겼다. 그런데 라이브러리도 **무엇을 하는
 * 도구인지 아는 사람**에게나 쓸모가 있다. 처음 온 사람은 재료를 봐도 그걸로
 * 뭘 할 수 있는지 모른다.
 *
 * 설명서를 첫 화면으로 둔다. 여기서 도구마다 무엇을 하는지 보고, 각 설명서
 * 끝의 버튼으로 그 도구에 바로 들어간다. 사이드바에서도 맨 위에 있다.
 *
 * 여러 곳에서 같은 곳으로 보내야 해서 한 자리에 둔다 — 로그인 화면,
 * 미들웨어, 로컬 우회, 랜딩의 「스튜디오 열기」.
 */
export const HOME_AFTER_LOGIN = "/guide";

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

/**
 * 밖에서 보이는 주소.
 *
 * standalone 으로 띄우면 미들웨어의 `request.url` 출처가 **공개 주소가 아니라
 * 내부 주소**(`http://localhost:3000`)다. 그걸 기준으로 로그인 화면으로
 * 돌려보내면 사용자 브라우저가 자기 컴퓨터의 3000 포트로 간다. 실제로 그랬다 —
 * Host 헤더를 맞게 줘도 마찬가지였으니 프록시 문제가 아니다.
 *
 * 앞단이 알려 주는 것을 본다. 없으면 물려받은 것을 그대로 쓴다.
 *
 * host 는 요청자가 마음대로 넣을 수 있다. 주소 모양이 아니면 버린다 —
 * 그대로 믿으면 로그인 화면으로 보내는 척 남의 사이트로 보낼 수 있다.
 */
export function publicOrigin(
  headers: { get(name: string): string | null },
  fallback: string,
): string {
  // 프록시가 여러 겹이면 쉼표로 이어 붙는다. 맨 앞이 원래 요청자가 본 주소다.
  const first = (value: string | null) => value?.split(",")[0]?.trim() || "";
  const host = first(headers.get("x-forwarded-host")) || first(headers.get("host"));
  if (!host || !/^[a-z0-9.\-[\]]+(:\d+)?$/i.test(host)) return fallback;

  const proto = first(headers.get("x-forwarded-proto")) || fallback.split(":")[0];
  return `${proto}://${host}`;
}
