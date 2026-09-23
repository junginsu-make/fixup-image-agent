import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_START_COOKIE } from "../lib/auth/session-window";

/**
 * 로그인 유지 24시간과 「이미 로그인되어 있습니다」 (2026-09-23 사용자).
 *
 * 미들웨어를 **진짜로 호출한다.** 계산만 따로 검사하면, 그 계산을 미들웨어가
 * 안 부르거나 다른 자리에서 불러도 통과한다. 실제로 그 자리 때문에 생긴 일이라
 * (로그인 화면이 조용히 홈으로 돌려보냄) 배선까지 잡아야 한다.
 */
let currentUser: { id: string } | null = { id: "user-1" };
let profile: { role: string; status: string; email_confirmed_at: string | null } = {
  role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z",
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
  }),
}));

const { middleware } = await import("../middleware");

const AUTH_COOKIE = "sb-bbuweuvylystagohqlhf-auth-token";
const 하루 = 24 * 60 * 60 * 1000;

function 요청(path: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(new URL(`http://54.180.68.212${path}`));
  for (const [name, value] of Object.entries(cookies)) request.cookies.set(name, value);
  return request;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("LOCAL_AUTH_BYPASS", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  currentUser = { id: "user-1" };
  profile = { role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z" };
});

describe("로그인 유지 24시간", () => {
  it("처음 들어오면 로그인 시각을 쿠키에 적는다", async () => {
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token" }));
    const started = response.cookies.get(SESSION_START_COOKIE);
    expect(started).toBeDefined();
    expect(Number(started!.value)).toBeGreaterThan(Date.now() - 5_000);
    expect(started!.httpOnly).toBe(true);
    expect(response.status).toBe(200);
  });

  it("24시간 안에는 시작 시각을 늘리지 않는다", async () => {
    const 어제 = String(Date.now() - 20 * 60 * 60 * 1000);
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 어제 }));
    expect(response.cookies.get(SESSION_START_COOKIE)).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it("24시간이 지나면 로그인 쿠키를 지우고 로그인 화면으로 보낸다", async () => {
    const response = await middleware(요청("/create", {
      [AUTH_COOKIE]: "token", [`${AUTH_COOKIE}.0`]: "조각", [SESSION_START_COOKIE]: String(Date.now() - 하루 - 1000),
    }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?expired=1");
    for (const name of [AUTH_COOKIE, `${AUTH_COOKIE}.0`, SESSION_START_COOKIE]) {
      expect(response.cookies.get(name)?.maxAge).toBe(0);
    }
  });

  it("API 도 함께 막는다 — 화면만 막으면 반쪽이다", async () => {
    const response = await middleware(요청("/api/library", {
      [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: String(Date.now() - 하루 - 1000),
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: "session_expired" });
  });

  it("로그인하지 않은 사람에게는 시작 시각을 적지 않는다", async () => {
    currentUser = null;
    const response = await middleware(요청("/login"));
    expect(response.cookies.get(SESSION_START_COOKIE)).toBeUndefined();
  });
});

describe("이미 로그인된 사람의 로그인 화면", () => {
  it("홈으로 돌려보내지 않는다 — 화면이 계정을 알려 주고 고르게 한다", async () => {
    const response = await middleware(요청("/login", { [AUTH_COOKIE]: "token" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("가입·비밀번호 찾기는 그대로 홈으로 돌려보낸다", async () => {
    for (const path of ["/signup", "/forgot-password"]) {
      const response = await middleware(요청(path, { [AUTH_COOKIE]: "token" }));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).not.toContain(path);
    }
  });
});
