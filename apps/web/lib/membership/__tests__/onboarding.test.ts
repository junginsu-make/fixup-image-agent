import { describe, expect, it } from "vitest";
import { needsOnboarding, onboardingInputError } from "../onboarding";
import { isUsableAccount } from "../usable";
import { SIGNUP_TERMS_VERSION } from "../signup-consent";

const active = { status: "active", email_confirmed_at: "2026-10-01" };
describe("social signup completion", () => {
  it("preserves existing and email members, but blocks an unfinished social signup", () => {
    expect(needsOnboarding({})).toBe(false);
    expect(isUsableAccount(active)).toBe(true);
    const pending = { ...active, onboarding_required: true, onboarding_completed_at: null };
    expect(needsOnboarding(pending)).toBe(true);
    expect(isUsableAccount(pending)).toBe(false);
    expect(isUsableAccount({ ...pending, onboarding_completed_at: "2026-10-01" })).toBe(true);
    expect(isUsableAccount({ ...pending, status: "suspended", onboarding_completed_at: "2026-10-01" })).toBe(false);
  });
  it("requires a name, both confirmations and the displayed current terms version", () => {
    const input = { name: "홍길동", referrer: "", ageConfirmed: true, termsAgreed: true, termsVersion: SIGNUP_TERMS_VERSION };
    expect(onboardingInputError(input)).toBeNull();
    for (const change of [{ name: " " }, { name: "가".repeat(41) }, { ageConfirmed: false }, { termsAgreed: false }, { termsVersion: "old" }]) {
      expect(onboardingInputError({ ...input, ...change })).toBeTruthy();
    }
    expect(onboardingInputError({ ...input, ageConfirmed: "true" } as never)).toBeTruthy();
  });
});
