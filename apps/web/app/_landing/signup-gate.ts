import { SIGNUP_REQUIRED, safeNext } from "../../lib/routes";

/**
 * 첫 화면 주소에서 「회원가입 안내」를 읽는다 (2026-09-30 사용자, 설계 §3.5).
 *
 * 미들웨어가 비회원을 `/?signup=required&next=/create` 로 보낸다
 * (`lib/routes.ts` 의 `signupRequiredPath`). 서버의 첫 화면과 클라이언트의
 * 모달이 함께 쓰므로 DB·세션을 만지지 않는 순수 함수로 둔다.
 */

/** Next 의 searchParams 값. 같은 이름이 두 번 오면 배열이다. */
export type QueryValue = string | string[] | undefined;

export interface SignupGate {
  /** 모달을 열까. */
  open: boolean;
  /** 로그인 뒤 돌아갈 곳. 우리 안의 경로가 아니면 `null`. */
  next: string | null;
}

const first = (value: QueryValue) => (Array.isArray(value) ? value[0] : value);

export function readSignupGate(query: { signup?: QueryValue; next?: QueryValue }): SignupGate {
  if (first(query.signup) !== SIGNUP_REQUIRED) return { open: false, next: null };
  const next = first(query.next);
  // 로그인 화면의 `safeNext` 가 그대로 돌려주는 값만 싣는다 — 밖으로 나가는 주소는 여기서부터 버린다.
  return { open: true, next: next && safeNext(next) === next ? next : null };
}

/** 모달의 [로그인] 이 갈 곳. 로그인 화면이 `next` 를 읽어 돌려보낸다(`app/login/page.tsx`). */
export function loginHrefFor(next: string | null): string {
  return next ? `/login?${new URLSearchParams({ next }).toString()}` : "/login";
}
