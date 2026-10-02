import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";
const configured = {
  NEXT_PUBLIC_SITE_URL: "https://example.invalid", NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture", SUPABASE_SECRET_KEY: "fixture",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "fixture", GOOGLE_API_KEY: "fixture", FAL_KEY: "fixture",
  ANTHROPIC_API_KEY: "fixture", OPENAI_API_KEY: "fixture", SMTP_HOST: "fixture", SMTP_PORT: "587",
  SMTP_USER: "fixture", SMTP_PASS: "fixture", SMTP_FROM: "fixture",
};
beforeEach(() => { for (const [key, value] of Object.entries(configured)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());
describe("deployment readiness matches the shipped generation tools", () => {
  it("accepts the complete configuration without making paid provider calls", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const response = await GET(); expect(response.status).toBe(200);
    expect(network).not.toHaveBeenCalled(); network.mockRestore();
  });
  it.each(["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "FAL_KEY", "GOOGLE_API_KEY"])("rejects missing %s even when the other settings are present", async key => {
    vi.stubEnv(key, ""); const response = await GET();
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ ok: false, checks: { generation: false } });
  });
  it.each(Object.keys(configured))("does not accept whitespace as configured: %s", async key => {
    vi.stubEnv(key, " \t "); expect((await GET()).status).toBe(503);
  });
});
