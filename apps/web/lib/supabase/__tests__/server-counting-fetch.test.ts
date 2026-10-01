import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **서버 쪽 클라이언트는 auth 왕복을 세는 fetch 를 쓴다**(설계 2026-09-29 §3.2).
 *
 * 세는 함수가 있어도 클라이언트에 안 달면 0 만 보인다 — 「돌아감 0회」가
 * 진짜 0 인지 안 단 것인지 가를 수 없다. 배선을 직접 잡는다.
 */
const seen = vi.hoisted(() => ({ options: null as null | { global?: { fetch?: unknown } } }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { global?: { fetch?: unknown } }) => {
    seen.options = options;
    return {};
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  seen.options = null;
});

describe("createSupabaseServerClient", () => {
  it("auth 왕복을 세는 fetch 를 단다", async () => {
    const { createSupabaseServerClient } = await import("../server");
    const { authRoundTrips } = await import("../../auth/auth-round-trips");

    await createSupabaseServerClient();

    expect(seen.options?.global?.fetch).toBe(authRoundTrips.fetch);
  });
});
