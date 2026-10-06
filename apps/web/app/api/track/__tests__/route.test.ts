import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **방문 한 줄 받기**(계획 2026-10-06 site-analytics).
 *
 * 재는 것: ① 언제나 204 — 통계가 화면을 막지 않는다 ② 봇·남의 사이트·큰 본문·관리자 화면은 안 적는다
 * ③ 주소의 조회 값·번호, 우리 사이트 referrer 는 지운 채 적는다 ④ 한 IP 가 몰아치면 끊는다
 * ⑤ 번호표(fx_vid)는 동의한 경우에만 — 없으면 새로 심고, 거부했으면 있어도 안 쓴다.
 */
vi.mock("server-only", () => ({}));

const 적은것: Array<Record<string, unknown>> = [];
let 기록이터진다 = false;
vi.mock("../../../../lib/analytics/record", () => ({
  recordPageView: async (view: Record<string, unknown>) => {
    if (기록이터진다) throw new Error("db down");
    적은것.push(view);
  },
  pruneSoon: () => undefined,
}));
let 로그인 = null as string | null;
vi.mock("../../../../lib/analytics/viewer", () => ({ currentUserId: async () => 로그인 }));

const { POST } = await import("../route");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const ID = "5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
let ipSeq = 0;
function 보내기(body: unknown, headers: Record<string, string> = {}) {
  ipSeq += 1;
  return POST(new Request("https://formwith.fix-up.kr/api/track", {
    method: "POST",
    headers: { "user-agent": CHROME, "x-forwarded-for": `198.51.100.${ipSeq}`, "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

beforeEach(() => {
  적은것.length = 0;
  기록이터진다 = false;
  로그인 = null;
});

describe("적는다", () => {
  it("첫 화면 — 지운 주소·유입 도메인·utm·기기·로그인 회원", async () => {
    로그인 = "member-1";
    const res = await 보내기({
      path: "/library/3f2c9a1e-1b2c-4d5e-8f90-123456789abc",
      entry: true,
      referrer: "https://www.instagram.com/p/abc?igsh=secret",
      search: "utm_source=Instagram&utm_campaign=launch",
    });
    expect(res.status).toBe(204);
    expect(적은것).toEqual([expect.objectContaining({
      path: "/library/:id", entry: true, referrerHost: "instagram.com", userId: "member-1", cookieId: null,
      utm: { source: "instagram", medium: null, campaign: "launch" }, device: "desktop", browser: "chrome",
      visitor: expect.stringMatching(/^[0-9a-f]{64}$/),
    })]);
    // 원래 IP·브라우저 정보는 DB 쪽으로 넘기지 않는다 — 하루 값만.
    expect(적은것[0]).not.toHaveProperty("ip");
    expect(적은것[0]).not.toHaveProperty("userAgent");
  });

  it("화면 이동 — referrer·utm 을 보내도 entry 가 아니면 버린다", async () => {
    await 보내기({ path: "/guide", entry: false, referrer: "https://naver.com/", search: "utm_source=x" });
    expect(적은것[0]).toMatchObject({ path: "/guide", referrerHost: null, utm: { source: null, medium: null, campaign: null } });
  });

  it("우리 사이트에서 온 referrer 는 유입이 아니다", async () => {
    await 보내기({ path: "/", entry: true, referrer: "https://formwith.fix-up.kr/guide" });
    expect(적은것[0]).toMatchObject({ referrerHost: null });
  });

  it("DB 가 터져도 204", async () => {
    기록이터진다 = true;
    expect((await 보내기({ path: "/", entry: true })).status).toBe(204);
  });
});

describe("번호표(fx_vid) — 동의한 경우에만", () => {
  it("동의 안 함(쿠키 없음) — 번호 없음, 쿠키도 안 심는다", async () => {
    const res = await 보내기({ path: "/", entry: true });
    expect(적은것[0]).toMatchObject({ cookieId: null });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("동의 + 번호 있음 — 그 번호를 쓰고 다시 심지 않는다", async () => {
    const res = await 보내기({ path: "/", entry: false }, { cookie: `fx_consent=1; fx_vid=${ID}` });
    expect(적은것[0]).toMatchObject({ cookieId: ID });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("동의 + 번호 없음(또는 이상한 값) — 새 번호를 만들어 HttpOnly 로 심는다", async () => {
    for (const cookie of ["fx_consent=1", "fx_consent=1; fx_vid=not-a-uuid"]) {
      적은것.length = 0;
      const res = await 보내기({ path: "/", entry: false }, { cookie });
      const issued = 적은것[0]!.cookieId as string;
      expect(issued).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(res.headers.getSetCookie()).toEqual([`fx_vid=${issued}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure`]);
    }
  });

  it("거부(fx_consent=0) — 번호가 남아 있어도 쓰지 않는다", async () => {
    await 보내기({ path: "/", entry: false }, { cookie: `fx_consent=0; fx_vid=${ID}` });
    expect(적은것[0]).toMatchObject({ cookieId: null });
  });
});

describe("안 적는다 — 그래도 204", () => {
  it.each([
    ["봇", { path: "/", entry: true }, { "user-agent": "kakaotalk-scrap/1.0" }],
    ["남의 사이트에서 보낸 것", { path: "/", entry: true }, { "sec-fetch-site": "cross-site" }],
    ["관리자 화면", { path: "/admin/system", entry: false }, {}],
    ["API 주소", { path: "/api/track", entry: false }, {}],
    ["/ 로 시작하지 않는 주소", { path: "https://evil.example/", entry: true }, {}],
    ["모르는 칸", { path: "/", entry: true, extra: 1 }, {}],
    ["entry 빠짐", { path: "/" }, {}],
  ])("%s", async (_name, body, headers) => {
    const res = await 보내기(body, headers as Record<string, string>);
    expect(res.status).toBe(204);
    expect(적은것).toEqual([]);
  });

  it("JSON 이 아닌 본문", async () => {
    expect((await 보내기("not json")).status).toBe(204);
    expect(적은것).toEqual([]);
  });

  it("4KB 넘는 본문", async () => {
    expect((await 보내기({ path: `/${"a".repeat(5000)}`, entry: true })).status).toBe(204);
    expect(적은것).toEqual([]);
  });
});

describe("어떤 경우에도 204", () => {
  it("x-forwarded-proto 가 망가져 있어도 204 (주소 해석이 던져도)", async () => {
    const res = await 보내기({ path: "/", entry: true }, { "x-forwarded-proto": "ht tp", "x-forwarded-host": "formwith.fix-up.kr" });
    expect(res.status).toBe(204);
  });

  it("content-length 가 4KB 를 넘으면 본문을 읽지 않고 버린다", async () => {
    const res = await 보내기({ path: "/", entry: true }, { "content-length": "999999" });
    expect(res.status).toBe(204);
    expect(적은것).toEqual([]);
  });
});

describe("몰아치기", () => {
  it("한 IP 가 1분에 60번을 넘으면 그 뒤는 안 적는다", async () => {
    for (let i = 0; i < 65; i += 1) {
      await POST(new Request("https://formwith.fix-up.kr/api/track", {
        method: "POST",
        headers: { "user-agent": CHROME, "sec-fetch-site": "same-origin", "x-forwarded-for": "192.0.2.250" },
        body: JSON.stringify({ path: "/", entry: false }),
      }));
    }
    expect(적은것).toHaveLength(60);
  });
});
