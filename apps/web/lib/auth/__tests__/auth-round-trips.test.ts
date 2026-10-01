import { describe, expect, it } from "vitest";
import { classifyAuthRequest, createAuthRoundTripCounter } from "../auth-round-trips";

/**
 * **조용히 돌아간 횟수를 센다**(설계 2026-09-29 §3.2).
 *
 * `getClaims()` 는 토큰이 대칭 키(HS256)로 서명됐거나 키 번호가 공개 키 목록에
 * 없으면 **아무 말 없이** `getUser()` 왕복으로 돌아간다(`GoTrueClient.js`
 * getClaims). 그러면 이번 단계의 효과가 0 인데 겉으로는 아무 차이가 없다.
 * 서버 쪽 Supabase 클라이언트의 fetch 를 감싸 실제로 나간 요청을 센다.
 */
const SB = "https://abc.supabase.co";

describe("classifyAuthRequest", () => {
  it.each([
    [`${SB}/auth/v1/user`, "GET", "user"],
    [`${SB}/auth/v1/.well-known/jwks.json`, "GET", "jwks"],
    [`${SB}/auth/v1/user`, "PUT", null], // 비밀번호 바꾸기 — 왕복이 맞다
    [`${SB}/auth/v1/token?grant_type=refresh_token`, "POST", null], // 갱신 — 전과 같다
    [`${SB}/rest/v1/profiles?select=role`, "GET", null],
    ["이건 주소가 아니다", "GET", null],
  ])("%s %s → %s", (url, method, kind) => {
    expect(classifyAuthRequest(url, method)).toBe(kind);
  });
});

function 시계() {
  let now = 1_000_000;
  return { now: () => now, 지나감: (ms: number) => { now += ms; } };
}

describe("createAuthRoundTripCounter", () => {
  it("1분이 지나 다음 요청이 올 때, 그동안 getUser 로 돌아간 횟수를 한 줄 남긴다", () => {
    const clock = 시계();
    const logs: string[] = [];
    const counter = createAuthRoundTripCounter({ now: clock.now, log: (line) => logs.push(line) });

    counter.record("user");
    counter.record("user");
    expect(logs, "1분 안에는 쌓기만 한다 — 100명이면 줄이 넘친다").toEqual([]);
    clock.지나감(60_000);
    counter.record("user");

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("getUser 3회");
  });

  it("남긴 뒤에는 0 부터 다시 센다 — 1분을 닫은 요청은 그 1분에 넣는다", () => {
    const clock = 시계();
    const logs: string[] = [];
    const counter = createAuthRoundTripCounter({ now: clock.now, log: (line) => logs.push(line) });

    counter.record("user");
    clock.지나감(60_000);
    counter.record("user");
    clock.지나감(60_000);
    counter.record("user");

    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain("getUser 2회");
    expect(logs[1]).toContain("getUser 1회");
  });

  it("공개 키 목록을 10분에 한 번 받는 것은 정상이라 남기지 않는다(auth-js 가 10분 보관)", () => {
    const clock = 시계();
    const logs: string[] = [];
    const counter = createAuthRoundTripCounter({ now: clock.now, log: (line) => logs.push(line) });

    counter.record("jwks");
    clock.지나감(10 * 60_000);
    counter.record("jwks");
    clock.지나감(10 * 60_000);
    counter.record("jwks");
    expect(logs).toEqual([]);
  });

  it("공개 키 목록을 1분에 여러 번 받으면 남긴다 — 키 번호가 목록에 없다는 뜻이다", () => {
    const clock = 시계();
    const logs: string[] = [];
    const counter = createAuthRoundTripCounter({ now: clock.now, log: (line) => logs.push(line) });

    counter.record("jwks");
    counter.record("jwks");
    clock.지나감(60_000);
    counter.record("jwks");

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("공개 키 목록 3회");
  });

  it("fetch 는 그대로 넘기고, auth 왕복만 센다", async () => {
    const clock = 시계();
    const logs: string[] = [];
    const sent: string[] = [];
    const counter = createAuthRoundTripCounter({
      now: clock.now,
      log: (line) => logs.push(line),
      baseFetch: async (input) => { sent.push(String(input instanceof Request ? input.url : input)); return new Response("{}"); },
    });

    await counter.fetch(`${SB}/auth/v1/user`, { method: "GET" });
    await counter.fetch(new Request(`${SB}/auth/v1/user`));
    await counter.fetch(new URL(`${SB}/rest/v1/profiles`));
    clock.지나감(60_000);
    await counter.fetch(`${SB}/rest/v1/profiles`);
    await counter.fetch(`${SB}/auth/v1/user`);

    expect(sent).toHaveLength(5);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("getUser 3회");
  });
});
