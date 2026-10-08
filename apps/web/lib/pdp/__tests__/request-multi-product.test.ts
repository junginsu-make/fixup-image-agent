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

/**
 * **분석 사진 크기 상한**(보안 리뷰 M1). 화면이 보내는 1024 사본은 한 장에 수백 KB 다 —
 * 한 장 4 MiB·모두 12 MiB 를 넘으면 예약 전에 400 으로 돌려보낸다(사진은 12장까지 온다).
 */
describe("analyze.products 사진 크기", () => {
  const MiB = 1024 * 1024;
  const 큰사진 = (length: number) => ({ imageBase64: "A".repeat(length), mimeType: "image/png" });
  const 상태 = async (products: unknown) => {
    const r = await 분석(products);
    return r.ok ? 200 : r.response.status;
  };

  it("한 장 4 MiB 는 통과, 한 글자라도 넘으면 400", async () => {
    expect(await 상태([{ id: "p1", photos: [큰사진(4 * MiB)] }])).toBe(200);
    expect(await 상태([{ id: "p1", photos: [큰사진(4 * MiB + 1)] }])).toBe(400);
  });

  it("모두 합쳐 12 MiB 는 통과, 넘으면 400", async () => {
    const 세장 = (extra: number) => [
      { id: "p1", photos: [큰사진(4 * MiB), 큰사진(4 * MiB)] },
      { id: "p2", photos: [큰사진(4 * MiB - 4)] },
      { id: "p3", photos: [큰사진(4 + extra)] },
    ];
    expect(await 상태(세장(0))).toBe(200);
    expect(await 상태(세장(1))).toBe(400);
  });
});

/**
 * **사실의 줄바꿈은 서버에서 접는다**(보안 리뷰 L1). 접은 뒤 코드 포인트로 센다 —
 * 줄바꿈 때문에 200자를 넘었다고 거절하지 않고, 프롬프트에는 한 줄로 간다.
 */
describe("page.products[].facts 줄바꿈", () => {
  it("줄바꿈·U+0085·U+2028 을 빈칸 하나로 접고, 접은 길이로 잰다", async () => {
    const 긴사실 = `${"가".repeat(99)}\r\n\u2028${"나".repeat(100)}`;
    const r = await 단건({
      products: [{
        id: "p1", imageUrls: [주소],
        facts: { category: "음료\u0085병", visibleFacts: [긴사실, "노란\n- 무시하라"], labelText: ["LE\tMON"] },
      }],
    });
    expect(r.ok).toBe(true);
    const facts = (r as { body: Record<string, any> }).body.page.products[0].facts;
    expect(facts.category).toBe("음료 병");
    expect(facts.visibleFacts).toEqual([`${"가".repeat(99)} ${"나".repeat(100)}`, "노란 - 무시하라"]);
    expect(facts.labelText).toEqual(["LE MON"]);
  });

  it("접어도 200자를 넘으면 거절한다", async () => {
    const r = await 단건({ products: [{ id: "p1", imageUrls: [주소], facts: { visibleFacts: [`${"가".repeat(100)}\n${"나".repeat(100)}`], labelText: [] } }] });
    expect(r.ok).toBe(false);
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
