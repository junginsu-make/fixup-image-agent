import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_TERMS_VERSION } from "../../../../lib/membership/signup-consent";
const state = vi.hoisted(() => ({ member: null as any, enabled: true, rpc: vi.fn(), revalidate: vi.fn(), phone: vi.fn() }));
vi.mock("../../../../lib/membership/profile-store", () => ({ updateProfilePhone: state.phone }));
vi.mock("../../../../lib/membership/server", () => ({ getMembership: async () => state.member }));
vi.mock("../../../../lib/membership/credit-ledger", () => ({ isCreditLedgerEnabled: () => state.enabled }));
vi.mock("../../../../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
const { completeSocialOnboarding } = await import("../actions");
const input = { name: "홍길동", referrer: "friend", ageConfirmed: true, termsAgreed: true, termsVersion: SIGNUP_TERMS_VERSION };
beforeEach(() => {
  state.member = { user: { id: "verified-user" }, profile: { status: "active", email: "a@example.invalid", email_confirmed_at: "now", onboarding_required: true, onboarding_completed_at: null } };
  state.enabled = true; state.rpc.mockReset().mockResolvedValue({ error: null }); state.revalidate.mockClear();
  state.phone.mockReset().mockResolvedValue({ ok: true, message: "전화번호를 저장했습니다." });
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
  /** 전화번호(선택, 2026-10-02). 가입 완료 전에 저장한다 — 실패하면 완료하지 않는다. */
  it("saves an optional phone with consent for the session user before completing", async () => {
    expect((await completeSocialOnboarding({ ...input, phone: "01012345678", phoneConsent: true })).ok).toBe(true);
    expect(state.phone).toHaveBeenCalledExactlyOnceWith("verified-user", { phone: "01012345678", consent: true }, "member");
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.phone.mock.invocationCallOrder[0]).toBeLessThan(state.rpc.mock.invocationCallOrder[0]);
  });
  /** 앞선 시도에서 저장된 번호를 비우고 다시 내면 지운다(독립 리뷰 L1). 저장소는 같으면 아무것도 쓰지 않는다. */
  it("passes an emptied number so a number saved by an earlier attempt is withdrawn", async () => {
    expect((await completeSocialOnboarding({ ...input, phone: "", phoneConsent: false })).ok).toBe(true);
    expect(state.phone).toHaveBeenCalledExactlyOnceWith("verified-user", { phone: "", consent: false }, "member");
  });
  it.each([
    ["010-1234-5678", false],
    ["010-12", true],
  ])("rejects %j (consent %s) before writing anything", async (phone, phoneConsent) => {
    const result = await completeSocialOnboarding({ ...input, phone, phoneConsent });
    expect(result.ok).toBe(false);
    expect(state.phone).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not complete signup when the number could not be saved", async () => {
    state.phone.mockResolvedValue({ ok: false, message: "전화번호를 저장하지 못했습니다." });
    const result = await completeSocialOnboarding({ ...input, phone: "010-1234-5678", phoneConsent: true });
    expect(result.ok).toBe(false); expect(result.message).toContain("전화번호");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
