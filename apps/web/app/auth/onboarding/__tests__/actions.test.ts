import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_TERMS_VERSION } from "../../../../lib/membership/signup-consent";
const state = vi.hoisted(() => ({ member: null as any, enabled: true, rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("../../../../lib/membership/server", () => ({ getMembership: async () => state.member }));
vi.mock("../../../../lib/membership/credit-ledger", () => ({ isCreditLedgerEnabled: () => state.enabled }));
vi.mock("../../../../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
const { completeSocialOnboarding } = await import("../actions");
const input = { name: "홍길동", referrer: "friend", ageConfirmed: true, termsAgreed: true, termsVersion: SIGNUP_TERMS_VERSION };
beforeEach(() => {
  state.member = { user: { id: "verified-user" }, profile: { status: "active", email: "a@example.invalid", email_confirmed_at: "now", onboarding_required: true, onboarding_completed_at: null } };
  state.enabled = true; state.rpc.mockReset().mockResolvedValue({ error: null }); state.revalidate.mockClear();
});
describe("onboarding action", () => {
  it("takes the user only from the verified session and never grants credits", async () => {
    expect((await completeSocialOnboarding(input)).ok).toBe(true);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("complete_social_onboarding", { p_user: "verified-user", p_name: input.name, p_referrer: "friend", p_age: true, p_terms: true, p_version: SIGNUP_TERMS_VERSION });
    expect((await completeSocialOnboarding({ ...input, user: "other" } as never)).ok).toBe(false);
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["suspended", "withdrawn", "pending"])("does not complete a %s account", async status => {
    state.member.profile.status = status;
    expect((await completeSocialOnboarding(input)).ok).toBe(false); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects guests, missing consent and a disabled ledger without RPC calls", async () => {
    expect((await completeSocialOnboarding({ ...input, termsAgreed: false })).ok).toBe(false);
    state.enabled = false; expect((await completeSocialOnboarding(input)).ok).toBe(false);
    state.member = null; expect((await completeSocialOnboarding(input)).ok).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("returns success for a completed retry without overwriting the profile", async () => {
    state.member.profile.onboarding_completed_at = "earlier";
    expect((await completeSocialOnboarding(input)).ok).toBe(true); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not display internal database errors or claim success after RPC failure", async () => {
    state.rpc.mockResolvedValue({ error: { message: "database connection private information" } });
    const result = await completeSocialOnboarding(input);
    expect(result.ok).toBe(false); expect(result.message).not.toContain("private"); expect(state.revalidate).not.toHaveBeenCalled();
  });
});
