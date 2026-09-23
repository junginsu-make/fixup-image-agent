import type { MembershipStatus } from "./types";

/**
 * 지금 스튜디오를 쓸 수 있는 계정인가.
 *
 * **한 곳에서만 답한다.** 이 질문에 세 군데가 각자 답하고 있었다 —
 * 미들웨어, `requireActiveMember()`, 그리고 대기 화면. 셋이 어긋나면 한쪽은
 * 「들어가라」, 다른 쪽은 「기다려라」가 되어 두 화면이 서로를 밀어낸다.
 * 사용자에게는 화면이 깜빡이며 멈추지 않는 것으로 보인다.
 *
 * 판단은 둘뿐이다. 이메일 인증을 마쳤고, 정지되지 않았다.
 */
export function isUsableAccount(
  profile:
    | { email_confirmed_at?: string | null; status?: MembershipStatus | string | null }
    | null
    | undefined,
): boolean {
  if (!profile) return false;
  return Boolean(profile.email_confirmed_at) && profile.status === "active";
}

/**
 * 기다려도 달라지지 않는 상태인가.
 *
 * 정지된 계정은 스스로 풀리지 않는다. 여기서 상태를 계속 되물으면 서버만
 * 두드릴 뿐 화면은 영영 그대로다 — 그리고 사용자는 곧 풀릴 것처럼 오해한다.
 */
export function isTerminalWait(
  profile: { status?: MembershipStatus | string | null } | null | undefined,
): boolean {
  // 탈퇴한 계정도 스스로 안 풀린다. 되물으면 화면이 영영 기다린다(2026-09-23).
  return profile?.status === "suspended" || profile?.status === "withdrawn";
}
