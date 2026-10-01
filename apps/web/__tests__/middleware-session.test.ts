import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_START_COOKIE, sessionStartValue } from "../lib/auth/session-window";

/**
 * 로그인 유지 24시간과 「이미 로그인되어 있습니다」 (2026-09-23 사용자).
 *
 * 미들웨어를 **진짜로 호출한다.** 계산만 따로 검사하면, 그 계산을 미들웨어가
 * 안 부르거나 다른 자리에서 불러도 통과한다. 실제로 그 자리 때문에 생긴 일이라
 * (로그인 화면이 조용히 홈으로 돌려보냄) 배선까지 잡아야 한다.
 */
let currentUser: { id: string } | null = { id: "user-1" };
/** 이번 로그인의 세션 번호. 로그인할 때마다 Supabase 가 새로 준다. */
let currentSessionId: string | null = "session-1";
let profile: { role: string; status: string; email_confirmed_at: string | null } | null = {
  role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z",
};

/** 미들웨어가 서버 쪽 로그인을 끊은 기록. */
const 끊은것: Array<{ scope?: string }> = [];
/** 미들웨어가 Supabase 클라이언트를 만들 때 넘긴 설정. */
const 받은설정: Array<{ global?: { fetch?: unknown } }> = [];
/** profiles 를 어느 회원 번호로 읽었나. */
const 읽은번호: unknown[] = [];
/** 이번 요청에서 getClaims 가 토큰을 갱신하나 — 만료가 가까우면 Supabase 가 그렇게 한다. */
let 갱신한다 = false;

/**
 * **로그인 확인은 `getClaims` 다**(설계 2026-09-29 §3.2). `getUser`·`getSession` 을
 * 부르면 시험이 터진다 — 앞의 것은 Supabase 왕복이고, 뒤의 것은 서명을 안 본 값이다.
 */
const 금지 = (name: string) => async () => {
  throw new Error(`${name} 를 불렀다 — 미들웨어의 로그인 확인은 getClaims 여야 한다(설계 §3.2)`);
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    global?: { fetch?: unknown };
    cookies: { setAll: (cookies: Array<{ name: string; value: string; options: object }>) => void };
  }) => {
    받은설정.push(options);
    return {
      auth: {
        getClaims: async () => {
          // 진짜 getClaims 는 만료가 가까우면 getSession 안에서 갱신하고 setAll 로 쿠키를 다시 쓴다.
          if (갱신한다) options.cookies.setAll([{ name: AUTH_COOKIE, value: "새토큰", options: { path: "/" } }]);
          return {
            data: currentUser ? { claims: { sub: currentUser.id, session_id: currentSessionId ?? undefined } } : null,
            error: null,
          };
        },
        getUser: 금지("getUser"),
        getSession: 금지("getSession"),
        signOut: async (options?: { scope?: string }) => { 끊은것.push(options ?? {}); return { error: null }; },
      },
      from: () => ({ select: () => ({ eq: (_column: string, id: unknown) => {
        읽은번호.push(id);
        return { single: async () => ({ data: profile }) };
      } }) }),
    };
  },
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
  currentSessionId = "session-1";
  끊은것.length = 0;
  받은설정.length = 0;
  읽은번호.length = 0;
  갱신한다 = false;
  profile = { role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z" };
});

/** 이번 로그인(session-1)에 묶인 시작 시각. */
const 시작 = (전: number, 세션 = "session-1") => sessionStartValue(Date.now() - 전, 세션);

describe("로그인 유지 24시간", () => {
  it("처음 들어오면 로그인 시각을 이번 로그인에 묶어 적는다", async () => {
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token" }));
    const started = response.cookies.get(SESSION_START_COOKIE);
    expect(started).toBeDefined();
    const [시각, 세션] = started!.value.split(".");
    expect(Number(시각)).toBeGreaterThan(Date.now() - 5_000);
    expect(세션).toBe("session-1");
    expect(started!.httpOnly).toBe(true);
    expect(response.status).toBe(200);
  });

  it("24시간 안에는 시작 시각을 늘리지 않는다", async () => {
    const response = await middleware(요청("/create", {
      [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(20 * 60 * 60 * 1000),
    }));
    expect(response.cookies.get(SESSION_START_COOKIE)).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it("24시간이 지나면 로그인 쿠키를 지우고 로그인 화면으로 보낸다", async () => {
    const response = await middleware(요청("/create", {
      [AUTH_COOKIE]: "token", [`${AUTH_COOKIE}.0`]: "조각", [SESSION_START_COOKIE]: 시작(하루 + 1000),
    }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?expired=1");
    for (const name of [AUTH_COOKIE, `${AUTH_COOKIE}.0`, SESSION_START_COOKIE]) {
      expect(response.cookies.get(name)?.maxAge).toBe(0);
    }
  });

  /**
   * **서버 쪽 로그인도 끊는다**(2026-09-29 독립 리뷰).
   *
   * 쿠키만 지우면 만료 전에 복사해 둔 토큰이 24시간 뒤에도 계속 쓰인다. 이
   * 기기의 로그인만 끊는다(`scope: "local"`) — 다른 기기는 제 24시간을 따로 잰다.
   */
  it("24시간이 지나면 이 기기의 서버 쪽 로그인도 끊는다", async () => {
    await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(하루 + 1000) }));

    expect(끊은것).toEqual([{ scope: "local" }]);
  });

  it("24시간 안이면 끊지 않는다", async () => {
    await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(20 * 60 * 60 * 1000) }));

    expect(끊은것).toEqual([]);
  });

  /**
   * **공개 화면은 그 자리에서 손님으로 연다**(2026-09-29 독립 리뷰).
   *
   * 만료가 실제로 걸리면서, 시간이 지난 사람이 첫 화면·설명서를 열어도 로그인
   * 화면으로 끌려갔다. 특히 메일 인증 링크(`/auth/confirm?token_hash=…`)는 그
   * 값을 잃어 인증이 안 됐다. 로그인 쿠키를 지운 채 **같은 주소로** 다시 보낸다.
   */
  it.each([
    ["/guide/account", ""],
    ["/auth/confirm", "?token_hash=abc&type=email&next=/access"],
  ])("공개 화면 %s 는 로그인을 지우고 같은 주소로 다시 연다", async (path, query) => {
    const response = await middleware(요청(`${path}${query}`, {
      [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(하루 + 1000),
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://54.180.68.212${path}${query}`);
    expect(response.cookies.get(AUTH_COOKIE)?.maxAge).toBe(0);
    expect(response.cookies.get(SESSION_START_COOKIE)?.maxAge, "시작 시각을 안 지우면 되돌아와 또 만료된다").toBe(0);
  });

  /** 로그인 화면은 그대로 「시간이 지났다」는 안내와 함께 연다. */
  it("로그인 화면은 만료 안내와 함께 연다", async () => {
    const response = await middleware(요청("/login", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(하루 + 1000) }));

    expect(response.headers.get("location")).toContain("/login?expired=1");
  });

  it("API 도 함께 막는다 — 화면만 막으면 반쪽이다", async () => {
    const response = await middleware(요청("/api/library", {
      [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(하루 + 1000),
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: "session_expired" });
  });

  /**
   * **브라우저가 24시간 뒤에도 시작 시각을 들고 와야 만료를 잰다**(2026-09-29).
   *
   * 위 두 시험은 24시간 지난 시작 시각을 **손으로 넣어서** 통과했다. 그런데
   * 진짜 브라우저는 그 쿠키를 **수명(maxAge)이 다하면 버린다.** 수명이 정확히
   * 24시간이었으므로, 끊어야 할 그 순간에 쿠키가 먼저 사라졌다. 다음 요청은
   * 「처음 들어옴」으로 읽혀 새 24시간이 시작됐고, 로그인은 로그인 쿠키
   * (`@supabase/ssr` 기본 400일)만큼 이어졌다 — 제한이 없었던 셈이다.
   *
   * 그래서 시작 시각 쿠키는 **로그인 쿠키만큼 오래 산다.** 만료는 쿠키 수명이
   * 아니라 적힌 시각으로 잰다.
   */
  it("시작 시각 쿠키는 로그인 쿠키만큼(400일) 산다", async () => {
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token" }));
    const maxAge = response.cookies.get(SESSION_START_COOKIE)!.maxAge!;

    expect(maxAge, "24시간이면 끊어야 할 순간에 쿠키가 먼저 사라진다").toBeGreaterThanOrEqual(400 * 24 * 60 * 60);
  });

  it("실제 브라우저처럼 — 24시간 1초 뒤 다음 요청에서 로그인 화면으로 보낸다", async () => {
    // 1) 처음 들어온다. 서버가 시작 시각 쿠키를 준다.
    const 처음 = await middleware(요청("/create", { [AUTH_COOKIE]: "token" }));
    const 받은쿠키 = 처음.cookies.get(SESSION_START_COOKIE)!;

    // 2) 24시간 1초가 지났다. 브라우저는 수명이 남은 쿠키만 보낸다.
    //    같은 로그인이므로 세션 번호는 그대로다 — 시각만 그만큼 앞으로 당겨 흉내 낸다.
    const 지난초 = 하루 / 1000 + 1;
    const 아직있나 = 받은쿠키.maxAge! > 지난초;
    const 보낼쿠키: Record<string, string> = { [AUTH_COOKIE]: "token" };
    const [받은시각, 받은세션] = 받은쿠키.value.split(".");
    if (아직있나) 보낼쿠키[SESSION_START_COOKIE] = sessionStartValue(Number(받은시각) - 지난초 * 1000, 받은세션!);

    const 다음 = await middleware(요청("/create", 보낼쿠키));

    expect(아직있나, "브라우저가 시작 시각을 먼저 버렸다 — 만료를 잴 수 없다").toBe(true);
    expect(다음.status).toBe(307);
    expect(다음.headers.get("location")).toContain("/login?expired=1");
  });

  /**
   * **로그아웃하고 며칠 뒤 다시 로그인해도 바로 튕기지 않는다**(2026-09-29).
   *
   * 시작 시각 쿠키가 오래 살게 되면서 로그아웃 뒤에도 남는다. 그 옛 시각으로
   * 재면, 다시 로그인하자마자 「24시간 지남」으로 내보낸다. 로그인하면 세션
   * 번호가 바뀌므로 **다른 로그인의 시각은 새로 센다.**
   */
  it("로그아웃 뒤 며칠 지나 다시 로그인하면 새 24시간이 시작된다", async () => {
    currentSessionId = "session-2";
    const response = await middleware(요청("/create", {
      [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(3 * 하루, "session-1"),
    }));

    expect(response.status, "다시 로그인했는데 바로 내보냈다").toBe(200);
    expect(response.cookies.get(SESSION_START_COOKIE)!.value).toMatch(/^\d+\.session-2$/);
  });

  /** 같은 브라우저에서 계정을 바꿔 들어온 사람은 앞사람의 시각을 물려받지 않는다. */
  it("계정을 바꿔 들어오면 앞사람의 시각을 물려받지 않는다", async () => {
    currentSessionId = "other-user-session";
    const response = await middleware(요청("/create", {
      [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(23 * 60 * 60 * 1000, "session-1"),
    }));

    expect(response.cookies.get(SESSION_START_COOKIE)!.value).toMatch(/^\d+\.other-user-session$/);
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

/**
 * **로그인 확인을 바꿔도 문은 그대로다**(설계 2026-09-29 §3.2).
 *
 * 토큰 서명은 「누구인가」만 말한다. 정지·탈퇴·지워진 회원은 토큰이 멀쩡해도
 * 못 들어와야 한다 — 그 판정은 지금처럼 요청마다 `profiles` 에서 읽는다.
 */
describe("getClaims 로 바꾼 뒤", () => {
  it("auth 서버 왕복 없이 들여보낸다 — getUser 를 부르면 이 시험이 터진다", async () => {
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(response.status).toBe(200);
  });

  it("만료가 가까워 getClaims 가 토큰을 갱신하면 새 로그인 쿠키를 응답에 싣는다", async () => {
    갱신한다 = true;
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(AUTH_COOKIE)?.value, "갱신한 토큰을 브라우저에 안 주면 다음 요청이 또 갱신하다 끊긴다").toBe("새토큰");
  });

  it("Supabase 클라이언트에 auth 왕복을 세는 fetch 를 단다", async () => {
    const { authRoundTrips } = await import("../lib/auth/auth-round-trips");
    await middleware(요청("/create", { [AUTH_COOKIE]: "token" }));
    expect(받은설정[0]?.global?.fetch).toBe(authRoundTrips.fetch);
  });

  it("profiles 는 서명을 확인한 토큰의 회원 번호(sub)로 읽는다", async () => {
    currentUser = { id: "user-9" };
    await middleware(요청("/create", { [AUTH_COOKIE]: "token" }));
    expect(읽은번호).toEqual(["user-9"]);
  });

  it.each(["suspended", "withdrawn", "pending"])("profiles 가 %s 이면 /access 로 보낸다", async (status) => {
    profile = { role: "member", status, email_confirmed_at: "2026-09-01T00:00:00Z" };
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(response.headers.get("location")).toBe("http://54.180.68.212/access");
  });

  it("profiles 행이 없으면(지운 계정) /access 로 보낸다 — 토큰만 남은 사람", async () => {
    profile = null;
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(response.headers.get("location")).toBe("http://54.180.68.212/access");
  });

  it("관리자 화면은 profiles.role 로 연다 — 토큰의 role 이 아니다", async () => {
    const 회원 = await middleware(요청("/admin", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(회원.status, "일반 회원이 관리자 화면에 들어갔다").toBe(307);

    profile = { role: "admin", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z" };
    const 관리자 = await middleware(요청("/admin", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(관리자.status).toBe(200);
  });
});
