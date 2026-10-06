import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **방문 통계 쿠키 동의·거부**(계획 2026-10-06 site-analytics).
 * 재는 것: 동의하면 번호를 심고 오늘 앞선 기록에 잇는다 / 거부하면 DB 에서 먼저 잊고 쿠키를 지운다 /
 * 잊기가 실패하면 쿠키를 그대로 두고 503 — 철회를 못 지킨 채 「됐다」고 하지 않는다.
 */
vi.mock("server-only", () => ({}));

const 이은것: Array<Record<string, unknown>> = [];
const 잊은것: string[] = [];
let 잊기된다 = true;
vi.mock("../../../../lib/analytics/record", () => ({
  linkCookie: async (input: Record<string, unknown>) => { 이은것.push(input); },
  forgetCookie: async (id: string) => { 잊은것.push(id); return 잊기된다; },
}));

const { POST } = await import("../consent/route");

const ID = "5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0 Safari/537.36";
const 누르기 = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("https://formwith.fix-up.kr/api/track/consent", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "user-agent": UA, "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  이은것.length = 0;
  잊은것.length = 0;
  잊기된다 = true;
});

describe("동의", () => {
  it("번호가 없으면 새로 심고, 같은 IP·브라우저의 오늘 기록에 잇는다", async () => {
    const res = await 누르기({ consent: true });
    expect(res.status).toBe(204);
    const cookies = res.headers.getSetCookie();
    expect(cookies[0]).toBe("fx_consent=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    const issued = cookies[1]!.match(/^fx_vid=([0-9a-f-]{36}); Path=\/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure$/)?.[1];
    expect(issued).toBeTruthy();
    expect(이은것).toEqual([{ cookieId: issued, ip: "203.0.113.7", userAgent: UA }]);
  });

  it("이미 번호가 있으면 다시 심지 않고 그 번호로 잇는다", async () => {
    const res = await 누르기({ consent: true }, { cookie: `fx_vid=${ID}` });
    expect(res.headers.getSetCookie()).toEqual(["fx_consent=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure"]);
    expect(이은것[0]).toMatchObject({ cookieId: ID });
  });

  it("x-forwarded-proto 가 망가져도 204, 쿠키는 요청 주소의 https 로 심는다", async () => {
    const res = await 누르기({ consent: true }, { "x-forwarded-proto": "ht tp" });
    expect(res.status).toBe(204);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe("fx_consent=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });
});

describe("거부·철회", () => {
  it("DB 에서 먼저 잊고, 쿠키를 지운다", async () => {
    const res = await 누르기({ consent: false }, { cookie: `fx_consent=1; fx_vid=${ID}` });
    expect(res.status).toBe(204);
    expect(잊은것).toEqual([ID]);
    expect(res.headers.getSetCookie()).toEqual([
      "fx_consent=0; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
      "fx_vid=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure",
    ]);
  });

  it("번호가 없으면 잊을 것도 없다 — 거부만 기억한다", async () => {
    const res = await 누르기({ consent: false });
    expect(res.status).toBe(204);
    expect(잊은것).toEqual([]);
  });

  it("잊기가 실패하면 503, 쿠키는 그대로", async () => {
    잊기된다 = false;
    const res = await 누르기({ consent: false }, { cookie: `fx_consent=1; fx_vid=${ID}` });
    expect(res.status).toBe(503);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("거절", () => {
  it("남의 사이트에서 보낸 것은 403, 아무것도 안 한다", async () => {
    const res = await 누르기({ consent: true }, { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(이은것).toEqual([]);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
  it.each([["JSON 아님", "nope"], ["모르는 칸", { consent: true, extra: 1 }], ["값이 참거짓 아님", { consent: "yes" }]])(
    "%s → 400", async (_name, body) => expect((await 누르기(body)).status).toBe(400),
  );
});
