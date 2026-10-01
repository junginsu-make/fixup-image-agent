import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_START_COOKIE, sessionStartValue } from "../lib/auth/session-window";

/**
 * 비회원이 회원 화면을 열면 **첫 화면 + 회원가입 안내**로 간다
 * (2026-09-30 사용자, 설계 §3.5 · D3).
 *
 * 미들웨어를 **진짜로 호출한다** — `middleware-session.test.ts` 와 같은 까닭이다.
 * 주소 만드는 함수만 따로 재면, 미들웨어가 그 함수를 안 불러도 통과한다.
 */
let currentUser: { id: string } | null = null;
let profile: { role: string; status: string; email_confirmed_at: string | null } = {
  role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z",
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({
        data: currentUser ? { claims: { sub: currentUser.id, session_id: "session-1" } } : null,
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
  }),
}));

const { middleware } = await import("../middleware");

const 주소 = "http://54.180.68.212";
const AUTH_COOKIE = "sb-bbuweuvylystagohqlhf-auth-token";
const 하루 = 24 * 60 * 60 * 1000;

function 요청(path: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(new URL(`${주소}${path}`));
  for (const [name, value] of Object.entries(cookies)) request.cookies.set(name, value);
  return request;
}

/** 비회원이 가야 할 곳. */
const 안내로 = (next: string) => `${주소}/?signup=required&next=${encodeURIComponent(next)}`;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("LOCAL_AUTH_BYPASS", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  currentUser = null;
  profile = { role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z" };
});

describe("비회원이 회원 화면을 열면", () => {
  it.each(["/create", "/sns", "/sns/abc123", "/poster/new", "/library", "/settings", "/easy", "/access"])(
    "%s 는 첫 화면 + 회원가입 안내로 간다",
    async (path) => {
      const response = await middleware(요청(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(안내로(path));
    },
  );

  it("로그인 화면으로 보내지 않는다 — 아직 가입하지 않은 사람에게 로그인 칸은 막다른 길이다", async () => {
    const response = await middleware(요청("/create"));

    expect(response.headers.get("location")).not.toContain("/login");
  });

  /** 지금까지 로그인 분기도 경로만 실었다. 이번에 바꾸지 않는다. */
  it("주소의 물음표 뒤는 next 에 싣지 않는다 — 지금까지와 같다", async () => {
    const response = await middleware(요청("/create?tab=2"));

    expect(response.headers.get("location")).toBe(안내로("/create"));
  });

  it.each(["/aboutus", "/guides", "/login-help", "/signup2"])(
    "공개 화면과 이름만 비슷한 %s 는 공개가 아니다",
    async (path) => {
      const response = await middleware(요청(path));

      expect(response.headers.get("location")).toBe(안내로(path));
    },
  );

  /** 꺼 둔 화면은 로그인 여부보다 먼저 홈으로 간다(`lib/access/__tests__/routes.test.ts`). 순서를 지킨다. */
  it("꺼 둔 화면은 지금처럼 홈으로 — 안내로 보내지 않는다", async () => {
    const response = await middleware(요청("/inbox"));

    expect(response.headers.get("location")).toBe(`${주소}/guide`);
  });
});

describe("비회원에게 열린 화면은 그대로", () => {
  it.each([
    "/", "/about", "/guide", "/guide/account", "/login", "/signup",
    "/forgot-password", "/reset-password", "/auth/confirm", "/auth/signout",
  ])("%s 는 그대로 연다", async (path) => {
    const response = await middleware(요청(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("API 와 만료는 그대로", () => {
  it("API 는 화면으로 보내지 않는다 — 401 은 각 라우트가 낸다", async () => {
    const response = await middleware(요청("/api/library"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("로그인 유지 시간이 지난 회원은 지금처럼 /login?expired=1", async () => {
    currentUser = { id: "user-1" };
    const response = await middleware(요청("/create", {
      [AUTH_COOKIE]: "token",
      [SESSION_START_COOKIE]: sessionStartValue(Date.now() - 하루 - 1000, "session-1"),
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?expired=1");
    expect(response.headers.get("location")).not.toContain("signup=required");
  });
});

describe("/demo 를 지운 뒤 (D8)", () => {
  it("비회원은 첫 화면 + 회원가입 안내 — 404 가 아니다", async () => {
    const response = await middleware(요청("/demo"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(안내로("/demo"));
  });

  /** 미들웨어는 지나가고, 페이지가 없으니 Next 가 404 를 낸다(배포 뒤 브라우저로 확인 — Task 5). */
  it("회원은 미들웨어를 그대로 지난다", async () => {
    currentUser = { id: "user-1" };
    const response = await middleware(요청("/demo", { [AUTH_COOKIE]: "token" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
