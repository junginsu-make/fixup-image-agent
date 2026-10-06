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
 *
 * **역슬래시도 같은 구멍이다**(2026-09-30 독립 리뷰). 브라우저는 경로의
 * 역슬래시를 슬래시로 바꿔 읽어서 `/\evil.example.com` 이 `//evil.example.com`
 * 이 된다 — 실제로 로그인 뒤 `router.replace` 가 다른 사이트로 보냈다(열린
 * 리다이렉트). 퍼센트 인코딩된 역슬래시(`%5C`)는 이 함수가 디코딩하지 않으므로
 * 글자 그대로 남아 위험하지 않다.
 *
 * **탭·줄바꿈 같은 제어문자도 같은 구멍이다**(2026-10-06 조사). 브라우저와
 * `new URL` 이 주소를 읽을 때 그것들을 지워서 `/<탭>/evil.example.com` 이
 * `//evil.example.com` 이 된다 — 메일 인증 링크에서 실제로 다른 사이트로 보냈다.
 *
 * **글자만 보지 않고 풀어 본 결과도 본다.** `/.//evil.example.com` 은 글자로는
 * 멀쩡한데 점 경로가 풀리면 `//evil.example.com` 이 된다(2026-10-06 보안 리뷰).
 * `socialNext`(`lib/auth/social-auth.ts`)가 이미 같은 확인을 한다.
 */
const UNSAFE_IN_NEXT = /[\u0000-\u001f\u007f\\]/;
const PROBE_ORIGIN = "https://next.invalid";

export function safeNext(next: string | null | undefined): string {
  if (!next) return HOME_AFTER_LOGIN;
  if (!next.startsWith("/") || next.startsWith("//") || UNSAFE_IN_NEXT.test(next)) return HOME_AFTER_LOGIN;
  const resolved = new URL(next, PROBE_ORIGIN);
  if (resolved.origin !== PROBE_ORIGIN || resolved.pathname.startsWith("//")) return HOME_AFTER_LOGIN;
  return next;
}

/**
 * 비회원이 회원 화면을 열었을 때 보내는 곳 (2026-09-30 사용자, 설계 §3.5).
 *
 * 첫 화면이 `signup=required` 를 보고 「회원가입이 필요합니다」 모달을 연다
 * (`app/_landing/signup-required-modal.tsx`). `next` 는 모달의 [로그인] 이
 * 로그인 화면에 넘긴다 — 밖으로 나가는 주소를 걸러 내는 것은 로그인 화면의
 * `safeNext` 다.
 */
export const SIGNUP_REQUIRED = "required";

export function signupRequiredPath(next: string): string {
  return `/?${new URLSearchParams({ signup: SIGNUP_REQUIRED, next }).toString()}`;
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
