import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
}));

const { readPdpRequest } = await import("../request");

const 요청 = (page: unknown) =>
  new Request("http://localhost/api/pdp/images", {
    method: "POST",
    body: JSON.stringify({ originalImageBase64: "AAAA", aspectRatio: "3:4", section: { section_id: "s1" }, page }),
  });

describe("page.productFacts 경계", () => {
  it("상한 안이면 받는다", async () => {
    const read = await readPdpRequest(요청({ productFacts: { visibleFacts: ["a"], labelText: ["b"] } }), "single");
    expect(read.ok).toBe(true);
  });

  it("라벨 13줄이면 거절한다", async () => {
    const read = await readPdpRequest(요청({ productFacts: { visibleFacts: [], labelText: Array(13).fill("x") } }), "single");
    expect(read.ok).toBe(false);
  });

  it("한 줄이 201자면 거절한다", async () => {
    const read = await readPdpRequest(요청({ productFacts: { visibleFacts: ["가".repeat(201)], labelText: [] } }), "single");
    expect(read.ok).toBe(false);
  });

  it("글자 수는 화면처럼 코드 포인트로 센다 — 이모지 200자는 받고 201자는 거절한다", async () => {
    const accepted = await readPdpRequest(요청({ productFacts: { category: "😀".repeat(200), visibleFacts: ["😀".repeat(200)], labelText: ["😀".repeat(200)] } }), "single");
    expect(accepted.ok).toBe(true);
    const rejected = await readPdpRequest(요청({ productFacts: { visibleFacts: [], labelText: ["😀".repeat(201)] } }), "single");
    expect(rejected.ok).toBe(false);
  });
});

const 주소요청 = (productImageUrl: string) =>
  new Request("http://localhost/api/pdp/images", {
    method: "POST",
    body: JSON.stringify({ productImageUrl, aspectRatio: "3:4", section: { section_id: "s1" } }),
  });

describe("productImageUrl 경계", () => {
  const 앞 = "https://v3.fal.media/files/";

  it("2048자는 받고 2049자는 거절한다", async () => {
    expect((await readPdpRequest(주소요청(앞 + "a".repeat(2048 - 앞.length)), "single")).ok).toBe(true);
    expect((await readPdpRequest(주소요청(앞 + "a".repeat(2049 - 앞.length)), "single")).ok).toBe(false);
  });

  it("검사한 그 모양(정규화한 주소)을 넘긴다 — 탭·대문자 호스트가 섞여 와도", async () => {
    const read = await readPdpRequest(주소요청("https://V3.FAL.media/files/a\tb.jpg"), "single");
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect((read.body as { productImageUrl?: string }).productImageUrl).toBe("https://v3.fal.media/files/ab.jpg");
  });
});
