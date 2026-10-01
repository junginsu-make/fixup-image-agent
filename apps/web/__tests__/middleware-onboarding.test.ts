import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ profile: null as any, user: true, refresh: false, claims: vi.fn(), signOut: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (_url: string, _key: string, options: any) => ({
  auth: { getClaims: async () => {
    if (state.refresh) options.cookies.setAll([{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }]);
    return state.claims();
  }, signOut: state.signOut },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.profile }) }) }) }),
}) }));
const { middleware } = await import("../middleware");
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test"); vi.stubEnv("LOCAL_AUTH_BYPASS", "0");
  state.user = true; state.refresh = false; state.profile = { role: "member", status: "active", email_confirmed_at: "now", onboarding_required: true, onboarding_completed_at: null };
  state.claims.mockReset().mockImplementation(async () => ({ data: state.user ? { claims: { sub: "user", session_id: "session" } } : null, error: null })); state.signOut.mockReset();
});
const request = (path: string) => new NextRequest(`https://studio.example.com${path}`);
describe("onboarding routing", () => {
  it("carries refreshed session cookies into the onboarding redirect", async () => {
    state.refresh = true;
    const response = await middleware(request("/create"));
    expect(response.headers.get("location")).toContain("/auth/onboarding");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  });
  it.each(["/create", "/settings", "/signup", "/access"])("sends unfinished users at %s to onboarding", async path => {
    expect((await middleware(request(path))).headers.get("location")).toBe("https://studio.example.com/auth/onboarding");
  });
  it("allows onboarding, then sends completed members home", async () => {
    expect((await middleware(request("/auth/onboarding"))).headers.get("location")).toBeNull();
    state.profile.onboarding_completed_at = "earlier";
    expect((await middleware(request("/auth/onboarding"))).headers.get("location")).toBe("https://studio.example.com/guide");
  });
  it("keeps suspension ahead of onboarding and reports a missing profile without looping", async () => {
    state.profile.status = "suspended";
    expect((await middleware(request("/auth/onboarding"))).headers.get("location")).toBe("https://studio.example.com/access");
    state.profile = null;
    expect((await middleware(request("/auth/onboarding"))).headers.get("location")).toContain("profile_unavailable");
  });
  it("does not expire an old session or remove the verifier before a new OAuth exchange", async () => {
    const req = request("/auth/callback?code=fresh");
    req.cookies.set("fx_session_started", "1.session"); req.cookies.set("sb-example-auth-token-code-verifier", "verifier");
    const response = await middleware(req);
    expect(response.headers.get("location")).toBeNull(); expect(response.cookies.getAll()).toEqual([]);
    expect(state.claims).not.toHaveBeenCalled(); expect(state.signOut).not.toHaveBeenCalled();
  });
  it("does not expose the entire auth prefix to guests", async () => {
    state.user = false;
    expect((await middleware(request("/auth/onboarding"))).headers.get("location")).toContain("signup=required");
    expect((await middleware(request("/auth/callback/other"))).headers.get("location")).toContain("signup=required");
  });
});
