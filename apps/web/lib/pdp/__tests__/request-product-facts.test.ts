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
});
