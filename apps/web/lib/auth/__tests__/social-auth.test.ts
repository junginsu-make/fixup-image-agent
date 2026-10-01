import { describe, expect, it } from "vitest";
import { authOrigin, enabledSocialProviders, socialAuthOptions, socialNext } from "../social-auth";
describe("social OAuth redirect contract", () => {
  it("hides providers until explicitly enabled", () => {
    expect(enabledSocialProviders({})).toEqual([]);
    expect(enabledSocialProviders({ NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "1", NEXT_PUBLIC_AUTH_KAKAO_ENABLED: "true" })).toEqual(["google"]);
    expect(enabledSocialProviders({ NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "1", NEXT_PUBLIC_AUTH_KAKAO_ENABLED: "1" })).toEqual(["google", "kakao"]);
  });
  it("requires a configured HTTPS origin in production and restricts HTTP to local development", () => {
    expect(authOrigin("https://studio.example.com/", "production")).toBe("https://studio.example.com");
    for (const url of [undefined, "http://studio.example.com", "https://user:pass@studio.example.com", "https://studio.example.com/path", "https://studio.example.com?x=1"]) {
      expect(() => authOrigin(url, "production")).toThrow();
    }
    expect(authOrigin("http://localhost:3000", "development")).toBe("http://localhost:3000");
    expect(() => authOrigin("http://evil.example.com", "development")).toThrow();
  });
  it("never permits external destinations or auth loops after normalizing the URL", () => {
    for (const next of ["//evil.example.com", "/\\evil.example.com", "/\tevil.example.com", "https://evil.example.com", "/auth/onboarding", "/login", "/x/../auth/callback", "/%61uth/callback", "/%2f%2fevil.example.com", "/.//evil.example.com", "/x/..//evil.example.com", "/%2E//evil.example.com"]) {
      expect(socialNext(next)).toBe("/guide");
    }
    expect(socialNext("/library?kind=poster")).toBe("/library?kind=poster");
  });
  it("requests account choice and uses the service callback, with no provider token scopes", () => {
    for (const provider of ["google", "kakao"] as const) {
      const options = socialAuthOptions(provider, "https://studio.example.com", "/library");
      expect(options.provider).toBe(provider);
      expect(options.options.redirectTo).toBe("https://studio.example.com/auth/callback?next=%2Flibrary");
      expect(options.options.queryParams).toEqual({ prompt: "select_account" });
    }
  });
});
