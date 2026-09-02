export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase 공개 환경변수가 설정되지 않았습니다.");
  }
  return { url, publishableKey };
}

export const AUTH_UNAVAILABLE_MESSAGE =
  "회원 시스템 환경변수가 설정되지 않아 지금은 로그인할 수 없습니다.";

/**
 * 로그인·가입 화면이 지금 쓸 수 있는 상태인가.
 *
 * 로컬 확인 환경은 이 두 값을 일부러 비워 둔다(로컬 파일 저장소만 쓴다).
 * 그대로 제출하면 클라이언트를 만드는 자리에서 예외가 나는데, async 이벤트
 * 처리기라 아무 데도 안 잡히고 사라진다 — 버튼은 "로그인 중…"에 멈추고
 * 화면에는 이유가 안 나온다. 만들기 전에 여기서 막는다.
 */
export function authAvailability(env?: { url?: string; publishableKey?: string }) {
  const url = env ? env.url : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env ? env.publishableKey : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey
    ? { ready: true, message: "" }
    : { ready: false, message: AUTH_UNAVAILABLE_MESSAGE };
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
