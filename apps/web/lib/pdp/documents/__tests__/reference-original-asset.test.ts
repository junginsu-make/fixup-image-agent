import { describe, expect, it } from "vitest";
import { assetPath, validateDocument, type ServerDocument } from "../model";

/** 제품 원본(설계 2026-10-08 §4.6)은 참조 안의 `originalAssetId` 로 이어진다. 없는 그림을 가리키면 저장을 거절한다. */
const user = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333";
const hash = (c: string) => c.repeat(64);
const asset = (c: string) => ({ path: assetPath(user, id, hash(c), "image/png"), sha256: hash(c), bytes: 10, mimeType: "image/png" as const });
const doc = (references: unknown[], assets: ServerDocument["assets"]): ServerDocument => ({
  schemaVersion: 3, id, title: "작업", stage: "input", sourceMode: "image", assets,
  body: { sections: [], inputs: { additionalInfo: "" }, settings: {}, references, blueprint: {}, editor: null },
} as ServerDocument);

describe("참조의 originalAssetId", () => {
  it("있는 그림을 가리키면 저장된다", () => {
    const d = doc([{ role: "product", assetId: "a", originalAssetId: "o", enabled: true }], { a: asset("a"), o: asset("b") });
    expect(() => validateDocument(d, user, id)).not.toThrow();
  });
  it("없는 그림을 가리키면 거절한다", () => {
    const d = doc([{ role: "product", assetId: "a", originalAssetId: "missing", enabled: true }], { a: asset("a") });
    expect(() => validateDocument(d, user, id)).toThrow("첨부 그림이 누락됐습니다.");
  });
});

/** 제품 칸(설계 2026-10-08 §3.2): 제품 참조가 `productId`·`productName`·`photoIndex` 를 더 실어도 통과하고 남는다. */
describe("제품 참조의 제품 칸", () => {
  it("제품 id·이름·사진 차례를 실은 참조가 저장된다", () => {
    const references = [
      { role: "product", assetId: "a", originalAssetId: "o", productId: "p1", productName: "레몬맛", photoIndex: 0, enabled: true, instruction: "라벨 그대로" },
      { role: "product", assetId: "o", productId: "p2", productName: "", photoIndex: 1, enabled: true },
    ];
    const d = doc(references, { a: asset("a"), o: asset("b") });
    expect(validateDocument(d, user, id).body.references).toEqual(references);
  });

  /** 제품 칸 값도 모양을 본다(보안 리뷰 L5). 선언하지 않으면 `.passthrough()` 로 무엇이든 지나간다. */
  const 상태 = (references: unknown[], body: Record<string, unknown> = {}) => {
    const d = doc(references, { a: asset("a") });
    try {
      validateDocument({ ...d, body: { ...d.body, ...body } } as ServerDocument, user, id);
      return 200;
    } catch (error) {
      return (error as { status?: number }).status;
    }
  };
  const 참조 = (extra: Record<string, unknown>) => ({ role: "product", assetId: "a", enabled: true, ...extra });

  it("모르는 제품 id·긴 이름·범위 밖 사진 차례는 400", () => {
    expect(상태([참조({ productId: "p9" })])).toBe(400);
    expect(상태([참조({ productName: "가".repeat(61) })])).toBe(400);
    expect(상태([참조({ photoIndex: 4 })])).toBe(400);
    expect(상태([참조({ photoIndex: -1 })])).toBe(400);
    expect(상태([참조({ photoIndex: 1.5 })])).toBe(400);
    expect(상태([참조({ productName: 3 })])).toBe(400);
  });

  it("칸 목록(productSlots)과 분석 열쇠(planningProductsKey)도 모양을 본다", () => {
    expect(상태([], { productSlots: [{ id: "p1", name: "레몬맛" }, { id: "p2", name: "" }] })).toBe(200);
    expect(상태([], { productSlots: [{ id: "p4", name: "" }] })).toBe(400);
    expect(상태([], { productSlots: [{ id: "p1", name: "가".repeat(61) }] })).toBe(400);
    expect(상태([], { productSlots: ["p1", "p2", "p3", "p1"].map((slotId) => ({ id: slotId, name: "" })) })).toBe(400);
    // 열쇠는 JSON 글이다(`productsKey`). 괄호 없이 긴 글자 덩어리는 그림 데이터로 막히므로 실제 모양으로 잰다.
    expect(상태([], { planningProductsKey: `[${"k".repeat(3999)}` })).toBe(200);
    expect(상태([], { planningProductsKey: `[${"k".repeat(4000)}` })).toBe(400);
    expect(상태([], { planningProductsKey: 7 })).toBe(400);
  });

  it("제품 칸이 없는 옛 문서는 그대로 통과한다", () => {
    expect(상태([참조({})])).toBe(200);
    expect(상태([참조({ productId: "p3", productName: "😀".repeat(30), photoIndex: 3 })])).toBe(200);
  });
});
