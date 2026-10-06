import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 메일 인증 링크가 도착하는 자리.
 *
 * **`next` 로 바깥 사이트에 보내면 안 된다** (2026-10-06 조사). 예전 검사는
 * 「`/` 로 시작하고 `//` 가 아니면 통과」였는데, 탭·줄바꿈을 섞은
 * `/<탭>/evil.example.com` 이 그 검사를 지나 `https://evil.example.com/` 으로
 * 보내졌다. 인증을 막 끝낸 사람은 우리 사이트라고 믿고 있어 피싱에 쓰인다.
 */
const state = vi.hoisted(() => ({ exchange: vi.fn(), verify: vi.fn() }));
vi.mock("../../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: state.exchange, verifyOtp: state.verify },
  }),
}));
const { GET } = await import("../route");

const ORIGIN = "http://localhost:3000";
const req = (query: string) => new Request(`${ORIGIN}/auth/confirm?${query}`);
const location = async (query: string) => (await GET(req(query))).headers.get("location");

beforeEach(() => {
  state.exchange.mockReset().mockResolvedValue({ error: null });
  state.verify.mockReset().mockResolvedValue({ error: null });
});

describe("메일 인증 뒤 돌아갈 곳", () => {
  it("우리 안의 경로면 그리로 보낸다", async () => {
    expect(await location("token_hash=t&type=signup&next=%2Flibrary")).toBe(`${ORIGIN}/library`);
  });

  it("없으면 /access 로 보낸다", async () => {
    expect(await location("token_hash=t&type=signup")).toBe(`${ORIGIN}/access`);
  });

  it.each([
    ["탭", "%2F%09%2Fevil.example.com"],
    ["줄바꿈", "%2F%0A%2Fevil.example.com"],
    ["역슬래시", "%2F%5Cevil.example.com"],
    ["이중 슬래시", "%2F%2Fevil.example.com"],
    ["완전한 주소", "https%3A%2F%2Fevil.example.com"],
  ])("%s 으로 바깥 사이트에 보내지 않는다", async (_label, next) => {
    const sent = await location(`token_hash=t&type=signup&next=${next}`);
    expect(new URL(sent!).origin).toBe(ORIGIN);
    expect(sent).toBe(`${ORIGIN}/access`);
  });

  it("코드로 들어와도 같은 검사를 거친다", async () => {
    const sent = await location("code=c&next=%2F%09%2Fevil.example.com");
    expect(state.exchange).toHaveBeenCalledExactlyOnceWith("c");
    expect(sent).toBe(`${ORIGIN}/access`);
  });

  it("인증이 실패하면 로그인 화면으로", async () => {
    state.verify.mockResolvedValue({ error: new Error("expired") });
    expect(await location("token_hash=t&type=signup&next=%2Flibrary"))
      .toBe(`${ORIGIN}/login?error=invalid_confirmation`);
  });
});
