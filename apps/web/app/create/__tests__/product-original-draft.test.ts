import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createPdpDocument, documentToDraft, type PdpDocumentV3 } from "../document-state";
import { deletePdpDraft, getPdpDraft, savePdpDraft, type PdpDraftInput, type PreparedImageDraft } from "../pdp-drafts";
import type { PdpProductDraft } from "../products";

/** 원본은 1024 사본과 **따로** 남는다(설계 2026-10-08 §4.6). 다시 열어도 원본으로 만든다. */
const draft = (original?: { base64: string; mimeType: string }) =>
  ({
    preparedImage: { base64: "SMALL", mimeType: "image/jpeg", previewUrl: "data:image/jpeg;base64,SMALL", fileName: "p.jpg", ...(original ? { original } : {}) },
    modelImage: null, modelImageUsage: null, result: null, additionalInfo: "", desiredTone: "", aspectRatio: "3:4",
    appState: "upload", notice: "",
  }) as unknown as PdpDraftInput;

describe("제품 원본 임시저장", () => {
  it("원본이 있으면 저장했다 다시 열어도 원본이 그대로", () => {
    const reopened = documentToDraft(createPdpDocument(draft({ base64: "ORIGINAL", mimeType: "image/png" })));
    expect(reopened.preparedImage?.base64).toBe("SMALL");
    expect(reopened.preparedImage?.original).toEqual({ base64: "ORIGINAL", mimeType: "image/png" });
  });

  it("원본이 없는 옛 작업은 원본 없이 열린다", () => {
    const reopened = documentToDraft(createPdpDocument(draft()));
    expect(reopened.preparedImage?.original).toBeUndefined();
  });

  it("1024 사본 그림 안에 원본이 겹쳐 담기지 않는다", () => {
    const doc = createPdpDocument(draft({ base64: "ORIGINAL", mimeType: "image/png" }));
    const ref = doc.references.find((r) => r.role === "product")!;
    expect(Object.hasOwn(doc.assets[ref.assetId], "original")).toBe(false);
    expect(doc.assets[ref.originalAssetId!].base64).toBe("ORIGINAL");
  });
});

const savedIds: string[] = [];
afterEach(async () => { await Promise.all(savedIds.splice(0).map(deletePdpDraft)); });
const saveAndRead = async (input: PdpDraftInput) => {
  const saved = await savePdpDraft({ ...input, id: `product-${crypto.randomUUID()}` });
  savedIds.push(saved.id);
  return (await getPdpDraft(saved.id))!;
};

/** 1·2단계 빈틈: 로컬 초안(IndexedDB)을 다시 읽을 때 `original` 이 떨어졌다. */
describe("로컬 초안 다시 열기", () => {
  it("원본이 남는다", async () => {
    const reopened = await saveAndRead(draft({ base64: "ORIGINAL", mimeType: "image/png" }));
    expect(reopened.preparedImage?.original).toEqual({ base64: "ORIGINAL", mimeType: "image/png" });
  });

  it("빈 원본은 버린다", async () => {
    const reopened = await saveAndRead(draft({ base64: "", mimeType: "image/png" }));
    expect(reopened.preparedImage?.base64).toBe("SMALL");
    expect(reopened.preparedImage?.original).toBeUndefined();
  });
});

const photo = (tag: string, original = true): PreparedImageDraft => ({
  base64: `${tag}-1024`, mimeType: "image/jpeg", previewUrl: `data:image/jpeg;base64,${tag}-1024`, fileName: `${tag}.jpg`,
  ...(original ? { original: { base64: `${tag}-ORIGINAL`, mimeType: "image/png" } } : {}),
});
const twoProducts: PdpProductDraft[] = [
  { id: "p1", name: "레몬맛", photos: [photo("a"), photo("b", false)] },
  { id: "p2", name: "", photos: [photo("c")] },
];
const withProducts = (products: PdpProductDraft[]) =>
  ({ ...draft(), preparedImage: products[0].photos[0], products, attachmentIntents: { anchor: "라벨 그대로" } }) as PdpDraftInput;
const resultWithKey = (sections: unknown[]) => ({
  originalImage: "AAAA", analyzedProductsKey: "KEY",
  blueprint: { executiveSummary: "", scorecard: [], blueprintList: [], sections },
});

/** 제품 칸(설계 2026-10-08 §3.2). 옛 작업은 「제품 1, 사진 1장」으로 읽는다. */
describe("초안의 제품 목록", () => {
  it("옛 초안(사진 한 장)은 제품 1·사진 1장", async () => {
    const reopened = await saveAndRead(draft({ base64: "ORIGINAL", mimeType: "image/png" }));
    expect(reopened.products).toEqual([{ id: "p1", name: "", photos: [reopened.preparedImage] }]);
  });

  it("제품 목록을 저장했다 다시 열면 같고, 대표 사진도 함께 남는다", async () => {
    const reopened = await saveAndRead(withProducts(twoProducts));
    expect(reopened.products).toEqual(twoProducts);
    expect(reopened.preparedImage).toEqual(twoProducts[0].photos[0]);
  });

  it("분석 일치 열쇠가 남는다", async () => {
    const input = { ...withProducts(twoProducts), result: resultWithKey([{ section_id: "s1" }]) } as unknown as PdpDraftInput;
    expect((await saveAndRead(input)).result?.analyzedProductsKey).toBe("KEY");
  });
});

describe("서버 문서의 제품 목록", () => {
  it("제품 2개·사진 3장·원본을 왕복하면 같은 목록", () => {
    const reopened = documentToDraft(createPdpDocument(withProducts(twoProducts)));
    expect(reopened.products).toEqual(twoProducts);
    expect(reopened.preparedImage).toEqual(twoProducts[0].photos[0]);
  });

  it("사진마다 참조 하나, 지시는 제품 1 첫 사진에만", () => {
    const refs = createPdpDocument(withProducts(twoProducts)).references.filter((r) => r.role === "product");
    expect(refs.map((r) => [r.productId, r.productName, r.photoIndex, r.instruction])).toEqual([
      ["p1", "레몬맛", 0, "라벨 그대로"], ["p1", "레몬맛", 1, undefined], ["p2", "", 0, undefined],
    ]);
    expect(refs.map((r) => Boolean(r.originalAssetId))).toEqual([true, false, true]);
  });

  it("참조 차례가 섞여도 photoIndex 대로 묶는다", () => {
    const doc = createPdpDocument(withProducts(twoProducts));
    const shuffled: PdpDocumentV3 = { ...doc, references: [doc.references[1], doc.references[0], doc.references[2]] };
    expect(documentToDraft(shuffled).products).toEqual(twoProducts);
  });

  it("옛 문서(productId 없는 제품 참조 하나)는 제품 1·사진 1장", () => {
    const doc = createPdpDocument(draft({ base64: "ORIGINAL", mimeType: "image/png" }));
    const old: PdpDocumentV3 = {
      ...doc, references: doc.references.map(({ productId: _id, productName: _name, photoIndex: _index, ...ref }) => ref),
    };
    const reopened = documentToDraft(old);
    expect(reopened.products).toHaveLength(1);
    expect(reopened.products?.[0].id).toBe("p1");
    expect(reopened.products?.[0].photos).toEqual([reopened.preparedImage]);
    expect(reopened.preparedImage?.original).toEqual({ base64: "ORIGINAL", mimeType: "image/png" });
  });

  it("분석 일치 열쇠가 남는다", () => {
    const input = { ...withProducts(twoProducts), result: resultWithKey([]) } as unknown as PdpDraftInput;
    expect(documentToDraft(createPdpDocument(input)).result?.analyzedProductsKey).toBe("KEY");
  });
});
