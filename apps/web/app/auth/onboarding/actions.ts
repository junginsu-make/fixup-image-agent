"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getMembership } from "../../../lib/membership/server";
import { isCreditLedgerEnabled } from "../../../lib/membership/credit-ledger";
import { needsOnboarding, onboardingInputError, type OnboardingInput } from "../../../lib/membership/onboarding";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

const Input = z.object({ name: z.string(), referrer: z.string(), ageConfirmed: z.boolean(), termsAgreed: z.boolean(), termsVersion: z.string() }).strict();
export async function completeSocialOnboarding(input: OnboardingInput): Promise<{ ok: boolean; message: string }> {
  try {
    const parsed = Input.safeParse(input);
    if (!parsed.success) return { ok: false, message: "가입 정보를 다시 확인해 주세요." };
    const problem = onboardingInputError(parsed.data);
    if (problem) return { ok: false, message: problem };
    const membership = await getMembership();
    if (!membership) return { ok: false, message: "로그인이 필요합니다. 다시 로그인해 주세요." };
    const p = membership.profile;
    if (p.status !== "active" || !p.email_confirmed_at || !p.email) return { ok: false, message: "이 계정으로 가입을 완료할 수 없습니다. 계정 상태를 확인해 주세요." };
    if (!needsOnboarding(p)) return { ok: true, message: "가입이 완료되었습니다." };
    if (!isCreditLedgerEnabled()) return { ok: false, message: "회원 시스템을 준비 중입니다. 잠시 후 다시 시도해 주세요." };
    const { error } = await createSupabaseAdminClient().rpc("complete_social_onboarding", {
      p_user: membership.user.id, p_name: parsed.data.name, p_referrer: parsed.data.referrer,
      p_age: parsed.data.ageConfirmed, p_terms: parsed.data.termsAgreed, p_version: parsed.data.termsVersion,
    });
    if (error) return { ok: false, message: error.message?.includes("invalid_signup_consent")
      ? "이용약관이 변경되었습니다. 새로고침 후 다시 확인해 주세요."
      : "가입을 완료하지 못했습니다. 계정 상태를 확인하거나 잠시 후 다시 시도해 주세요." };
    revalidatePath("/", "layout");
    return { ok: true, message: "가입이 완료되었습니다." };
  } catch {
    return { ok: false, message: "가입 결과를 확인하지 못했습니다. 같은 정보로 다시 시도해 주세요." };
  }
}
