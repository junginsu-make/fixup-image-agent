import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn(), profile: { onboarding_required: true }, enabled: true }));
vi.mock("server-only", () => ({}));
vi.mock("react", async original => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: state.rpc, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.profile, error: null }) }) }) }) }) }));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false }));
vi.mock("../credit-ledger", () => ({ isCreditLedgerEnabled: () => state.enabled }));
const { getUsageSummary } = await import("../server");
beforeEach(() => { state.profile = { onboarding_required: true }; state.enabled = true; state.rpc.mockReset(); });
describe("social wallet must not fall back to legacy quota", () => {
  it("returns the actual empty wallet and refreshes to a later manual grant", async () => {
    state.rpc.mockResolvedValueOnce({ data: { pricing_policy: "image-v2", available: 0, balance: 0, reserved: 0, used: 0 } });
    expect((await getUsageSummary("user")).remaining).toBe(0);
    state.rpc.mockResolvedValueOnce({ data: { pricing_policy: "image-v2", available: 10, balance: 10, reserved: 0, used: 0 } });
    expect((await getUsageSummary("user")).remaining).toBe(10);
  });
  it("rejects a missing wallet, missing RPC, or disabled ledger without reading old units", async () => {
    for (const error of [null, { code: "PGRST202" }]) {
      state.rpc.mockReset().mockResolvedValue({ data: null, error });
      await expect(getUsageSummary("user")).rejects.toThrow("크레딧");
      expect(state.rpc).toHaveBeenCalledExactlyOnceWith("credit_summary", { p_user: "user" });
    }
    state.enabled = false; state.rpc.mockClear();
    await expect(getUsageSummary("user")).rejects.toThrow("크레딧"); expect(state.rpc).not.toHaveBeenCalled();
  });
});
