/**
 * **가입 때 받는 동의**(2026-09-29).
 *
 * 체크 칸은 둘 — 만 14세 이상, 이용약관 동의. 개인정보는 처리방침이 계약
 * 이행을 근거로 처리하므로 동의 칸을 두지 않고 **처리방침을 안내**한다
 * (2026-09-29 사용자 결정). 까닭은 `__tests__/signup-consent.test.ts` 머리에 있다.
 */

/**
 * 동의받는 약관의 판 — **게시한 약관의 시행일**이다.
 *
 * 약관을 새 판으로 바꾸면 이 값도 바꾼다. 안 바꾸면 시험이 붉어진다 — 새
 * 약관에 동의한 사람이 옛 판에 동의한 것으로 기록되기 때문이다.
 */
export const SIGNUP_TERMS_VERSION = "2026-09-14";

export interface SignupConsent {
  ageConfirmed: boolean;
  termsAgreed: boolean;
}

/** 빠진 것이 있으면 사용자에게 보여 줄 말, 다 있으면 `null`. */
export function signupConsentError(consent: SignupConsent): string | null {
  if (!consent.ageConfirmed) return "만 14세 이상인지 확인해 주세요.";
  if (!consent.termsAgreed) return "이용약관에 동의해 주세요.";
  return null;
}

/**
 * 가입 정보에 함께 담는 동의 기록.
 *
 * 가입 메타데이터(`auth.users.raw_user_meta_data`)에 남는다. 가입 트리거는
 * 이름·추천인만 옮기므로 이 값들은 메타데이터에 그대로 남는다.
 *
 * **동의 시각은 여기서 찍지 않는다.** 브라우저 시계는 틀릴 수 있다. 동의는
 * 가입과 같은 순간이므로 서버가 찍는 가입 시각(`auth.users.created_at`)이
 * 동의 시각이다.
 */
export function signupConsentMetadata() {
  return {
    terms_version: SIGNUP_TERMS_VERSION,
    age_14_confirmed: true,
  } as const;
}
