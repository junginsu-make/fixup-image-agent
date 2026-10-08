import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({ authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }) }));
const { readPdpRequest } = await import("../request");

const 주소 = "https://v3.fal.media/files/a/b.jpg";
const 사진 = { imageBase64: "AAAA", mimeType: "image/png" };
const section = { section_id: "S1", prompt_en: "scene" };

const 읽기 = (kind: "analyze" | "single" | "batch", body: unknown) =>
  readPdpRequest<Record<string, any>>(new Request("http://localhost/test", { method: "POST", body: JSON.stringify(body) }), kind);

const 분석 = (products: unknown, extra: Record<string, unknown> = {}) =>
  읽기("analyze", { imageBase64: "AAAA", mimeType: "image/png", products, ...extra });
const 단건 = (page: unknown, sec: unknown = section, extra: Record<string, unknown> = {}) =>
  읽기("single", { section: sec, page, ...extra });

describe("analyze.products", () => {
  it("정상 — 제품 둘, 사진 여럿", async () => {
    const r = await 분석([{ id: "p1", name: "컵", photos: [사진, 사진] }, { id: "p2", photos: [사진] }]);
    expect(r.ok).toBe(true);
  });
  it("제품 4개는 거절", async () => {
    const list = ["p1", "p2", "p3", "p1"].map((id) => ({ id, photos: [사진] }));
    expect((await 분석(list)).ok).toBe(false);
  });
  it("사진 5장은 거절", async () => {
    expect((await 분석([{ id: "p1", photos: Array(5).fill(사진) }])).ok).toBe(false);
  });
  it("사진 0장은 거절", async () => {
    expect((await 분석([{ id: "p1", photos: [] }])).ok).toBe(false);
  });
  it("이름 31자는 거절, 30자는 통과(코드 포인트)", async () => {
    expect((await 분석([{ id: "p1", name: "가".repeat(31), photos: [사진] }])).ok).toBe(false);
    expect((await 분석([{ id: "p1", name: "😀".repeat(30), photos: [사진] }])).ok).toBe(true);
  });
  it("id 겹침·모르는 id 거절", async () => {
    expect((await 분석([{ id: "p1", photos: [사진] }, { id: "p1", photos: [사진] }])).ok).toBe(false);
    expect((await 분석([{ id: "p9", photos: [사진] }])).ok).toBe(false);
  });
  it("products 가 있어도 옛 imageBase64 는 여전히 필요하다", async () => {
    const r = await 읽기("analyze", { mimeType: "image/png", products: [{ id: "p1", photos: [사진] }] });
    expect(r.ok).toBe(false);
  });
  it("products 가 없으면 지금처럼 통과", async () => {
    expect((await 읽기("analyze", { imageBase64: "AAAA", mimeType: "image/png" })).ok).toBe(true);
  });
});

describe("page.products", () => {
  it("주소·그림이 없어도 page.products 만 있으면 통과, 주소는 정규화", async () => {
    const r = await 단건({ products: [{ id: "p1", name: "컵", imageUrls: [" https://V3.fal.media/files/a/b.jpg".trim()], facts: { visibleFacts: ["a"], labelText: [] } }] });
    expect(r.ok).toBe(true);
  });
  it("fal 아닌 주소 거절", async () => {
    expect((await 단건({ products: [{ id: "p1", imageUrls: ["https://example.com/a.jpg"] }] })).ok).toBe(false);
  });
  it("사진 5장·제품 4개·이름 31자·id 겹침 거절", async () => {
    expect((await 단건({ products: [{ id: "p1", imageUrls: Array(5).fill(주소) }] })).ok).toBe(false);
    expect((await 단건({ products: ["p1", "p2", "p3", "p1"].map((id) => ({ id, imageUrls: [주소] })) })).ok).toBe(false);
    expect((await 단건({ products: [{ id: "p1", name: "가".repeat(31), imageUrls: [주소] }] })).ok).toBe(false);
    expect((await 단건({ products: [{ id: "p1", imageUrls: [주소] }, { id: "p1", imageUrls: [주소] }] })).ok).toBe(false);
  });
  it("facts 는 2단계 스키마를 쓴다 — 줄 수 초과 거절", async () => {
    const facts = { visibleFacts: Array(9).fill("a"), labelText: [] };
    expect((await 단건({ products: [{ id: "p1", imageUrls: [주소], facts }] })).ok).toBe(false);
  });
  it("빈 products 는 거절하고, 일괄도 page.products 로 통과", async () => {
    expect((await 단건({ products: [] }, section, { originalImageBase64: "AAAA" })).ok).toBe(false);
    const r = await 읽기("batch", { sections: [section], page: { products: [{ id: "p1", imageUrls: [주소] }] } });
    expect(r.ok).toBe(true);
  });
  it("page.products 가 없고 주소·그림도 없으면 여전히 거절", async () => {
    expect((await 단건({})).ok).toBe(false);
  });
});

describe("section.product_ids", () => {
  const 본문 = { originalImageBase64: "AAAA" };
  it("정상 통과", async () => {
    const r = await 단건({}, { ...section, product_ids: ["p1", "p3"] }, 본문);
    expect(r.ok).toBe(true);
  });
  it("모르는 id·4개는 거절", async () => {
    expect((await 단건({}, { ...section, product_ids: ["p9"] }, 본문)).ok).toBe(false);
    expect((await 단건({}, { ...section, product_ids: ["p1", "p2", "p3", "p1"] }, 본문)).ok).toBe(false);
  });
});
