import { phoneInputError } from "./phone";
import { profileInputError } from "./profile-extras";
import { SIGNUP_TERMS_VERSION, signupConsentError } from "./signup-consent";

export const ONBOARDING_PATH = "/auth/onboarding";
export const ONBOARDING_COLUMNS = "signup_provider,onboarding_required,onboarding_completed_at";
export type OnboardingState = {
  signup_provider?: string | null;
  onboarding_required?: boolean;
  onboarding_completed_at?: string | null;
};
export function needsOnboarding(profile: OnboardingState | null | undefined): boolean {
  return profile?.onboarding_required === true && !profile.onboarding_completed_at;
}
export type OnboardingInput = {
  name: string;
  referrer: string;
  ageConfirmed: boolean;
  termsAgreed: boolean;
  termsVersion: string;
  /** 휴대폰 또는 전화번호(선택). 적으면 phoneConsent 가 있어야 저장한다. */
  phone?: string;
  phoneConsent?: boolean;
};
export function onboardingInputError(input: OnboardingInput): string | null {
  const error = profileInputError(input) ?? phoneInputError(input.phone ?? "", input.phoneConsent === true)
    ?? signupConsentError({ ageConfirmed: input.ageConfirmed === true, termsAgreed: input.termsAgreed === true });
  if (error) return error;
  return input.termsVersion === SIGNUP_TERMS_VERSION ? null : "이용약관이 변경되었습니다. 새로고침 후 내용을 확인해 주세요.";
}
