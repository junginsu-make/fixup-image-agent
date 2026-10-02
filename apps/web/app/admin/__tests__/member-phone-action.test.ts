import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자가 회원 전화번호(선택)를 고친다**(2026-10-02). 관리자는 이미 동의한 번호만
 * 고치거나 지운다 — 그 판단은 저장소(`updateProfilePhone(…, "admin")`)가 한다.
 */
const state = vi.hoisted(() => ({ extras: vi.fn(), phone: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("../../../lib/email/approval", () => ({}));
vi.mock("../../../lib/membership/profile-store", () => ({ updateProfileExtras: state.extras, updateProfilePhone: state.phone }));
vi.mock("../../../lib/membership/server", () => ({
  requireAdmin: async () => ({ user: { id: "admin-id" }, profile: { email: "admin@example.invalid", role: "admin" } }),
}));
vi.mock("../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { email: "member@example.invalid", role: "member", status: "active", email_confirmed_at: "now" }, error: null }) }) }) }),
  }),
}));

const { adminUpdateMemberProfile } = await import("../actions");
const USER = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  state.extras.mockReset().mockResolvedValue({ ok: true, message: "저장했습니다." });
  state.phone.mockReset().mockResolvedValue({ ok: true, message: "전화번호를 저장했습니다." });
});

describe("관리자 회원 정보 저장", () => {
  it("번호를 관리자 권한으로 넘긴다 — 회원 동의를 대신 하지 않는다", async () => {
    const result = await adminUpdateMemberProfile(USER, { name: "김회원", referrer: "", phone: "010-9999-8888", phoneBefore: "010-1234-5678" });
    expect(result.ok).toBe(true);
    expect(state.phone).toHaveBeenCalledExactlyOnceWith(USER, { phone: "010-9999-8888", consent: false, expected: "010-1234-5678" }, "admin");
  });

  it("번호를 안 보내면 번호는 건드리지 않는다", async () => {
    await adminUpdateMemberProfile(USER, { name: "김회원", referrer: "" });
    expect(state.phone).not.toHaveBeenCalled();
  });

  it("번호 저장이 막히면 이름은 저장됐다는 것과 이유를 함께 알린다", async () => {
    state.phone.mockResolvedValue({ ok: false, message: "전화번호는 회원이 직접 입력하고 동의해야 저장할 수 있습니다." });
    const result = await adminUpdateMemberProfile(USER, { name: "김회원", referrer: "", phone: "010-9999-8888" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("이름");
    expect(result.message).toContain("회원이 직접");
  });
});
