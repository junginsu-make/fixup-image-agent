import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  exchange: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), profile: null as any,
  wallet: { user_id: "u1" } as any, profileError: null as any,
}));
vi.mock("../../../../lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({
  auth: { exchangeCodeForSession: state.exchange, getUser: state.getUser, signOut: state.signOut },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.profile, error: state.profileError }) }) }) }),
}) }));
vi.mock("../../../../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.wallet, error: null }) }) }) }),
}) }));
const { GET } = await import("../route");
const req = (query = "code=valid") => new Request(`http://localhost:3000/auth/callback?${query}`, { headers: { host: "evil.example", "x-forwarded-host": "evil.example" } });
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://studio.example.com"); vi.stubEnv("CREDIT_LEDGER", "1");
  state.profile = { status: "active", email_confirmed_at: "now", onboarding_required: true, onboarding_completed_at: null };
  state.profileError = null; state.wallet = { user_id: "u1" };
  state.exchange.mockReset().mockResolvedValue({ error: null });
  state.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1", email: "member@example.invalid", email_confirmed_at: "now" } }, error: null });
  state.signOut.mockReset().mockResolvedValue({ error: null });
});
describe("OAuth callback", () => {
  it("exchanges once and sends a new member to onboarding on the configured origin", async () => {
    const res = await GET(req());
    expect(state.exchange).toHaveBeenCalledExactlyOnceWith("valid");
    expect(res.headers.get("location")).toBe("https://studio.example.com/auth/onboarding");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("keeps a completed account and its requested destination", async () => {
    state.profile.onboarding_completed_at = "earlier";
    expect((await GET(req("code=valid&next=%2Flibrary"))).headers.get("location")).toBe("https://studio.example.com/library");
  });
  it.each(["suspended", "withdrawn"])("does not revive a %s account", async status => {
    state.profile.status = status;
    expect((await GET(req())).headers.get("location")).toBe("https://studio.example.com/access");
  });
  it("handles cancellation without exchanging a code or reflecting provider text", async () => {
    const res = await GET(req("error=access_denied&error_description=PRIVATE"));
    expect(res.headers.get("location")).toBe("https://studio.example.com/login?error=oauth_cancelled");
    expect(state.exchange).not.toHaveBeenCalled();
  });
  it("rejects missing, expired or reused codes", async () => {
    expect((await GET(req(""))).headers.get("location")).toContain("oauth_invalid");
    state.exchange.mockResolvedValue({ error: { message: "private verifier" } });
    expect((await GET(req())).headers.get("location")).toContain("oauth_invalid");
  });
  it("does not send a Kakao account without verified email into an email resend loop", async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: "u1", email: null } }, error: null });
    expect((await GET(req())).headers.get("location")).toContain("oauth_email_required");
    expect(state.signOut).toHaveBeenCalled();
  });
  it("reports missing profiles or ledger as errors rather than accepting legacy quota", async () => {
    state.profileError = { code: "42703" };
    expect((await GET(req())).headers.get("location")).toContain("profile_unavailable");
    state.profileError = null; state.wallet = null;
    expect((await GET(req())).headers.get("location")).toContain("credits_unavailable");
  });
});
