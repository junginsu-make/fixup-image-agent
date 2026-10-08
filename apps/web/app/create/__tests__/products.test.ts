import { describe, expect, it } from "vitest";
import {
  addPhotos,
  addProduct,
  makePrimary,
  normalizeProducts,
  primaryPhoto,
  productsFromLegacy,
  productsKey,
  productsReady,
  removePhoto,
  removeProduct,
  renameProduct,
  type PdpProductDraft,
} from "../products";
import type { PreparedImageDraft } from "../pdp-drafts";

/** 제품 칸(설계 2026-10-08 §3): 제품 3개·제품당 사진 4장·이름 30자, p1 은 못 지운다. */
const photo = (tag: string): PreparedImageDraft => ({
  base64: `${tag}-BASE64`, mimeType: "image/jpeg", previewUrl: `data:image/jpeg;base64,${tag}`, fileName: `${tag}.jpg`,
});
const one: PdpProductDraft[] = [{ id: "p1", name: "", photos: [photo("a")] }];

describe("옛 사진 한 장 → 제품 목록", () => {
  it("사진이 있으면 제품 1·사진 1장", () => {
    expect(productsFromLegacy(photo("a"))).toEqual([{ id: "p1", name: "", photos: [photo("a")] }]);
  });
  it("없으면 빈 목록", () => {
    expect(productsFromLegacy(null)).toEqual([]);
  });
});

describe("대표 사진", () => {
  it("제품 1 의 첫 사진이다", () => {
    const list: PdpProductDraft[] = [{ id: "p2", name: "", photos: [photo("z")] }, { id: "p1", name: "", photos: [photo("a"), photo("b")] }];
    expect(primaryPhoto(list)?.fileName).toBe("a.jpg");
  });
  it("제품 1 에 사진이 없으면 null", () => {
    expect(primaryPhoto([{ id: "p1", name: "", photos: [] }])).toBeNull();
    expect(primaryPhoto([])).toBeNull();
  });
});

describe("제품 더하기·빼기", () => {
  it("빈 칸을 다음 빈 id 로 더하고, 3개면 그대로", () => {
    const two = addProduct(one);
    expect(two.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(two[1]).toEqual({ id: "p2", name: "", photos: [] });
    const three = addProduct(two);
    expect(addProduct(three).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });
  it("가운데를 지웠으면 그 id 를 다시 쓴다", () => {
    const three = addProduct(addProduct(one));
    expect(addProduct(removeProduct(three, "p2")).map((p) => p.id)).toEqual(["p1", "p3", "p2"]);
  });
  it("빈 목록에 더하면 제품 1", () => {
    expect(addProduct([]).map((p) => p.id)).toEqual(["p1"]);
  });
  it("제품 1 은 못 지운다", () => {
    const two = addProduct(one);
    expect(removeProduct(two, "p1").map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(removeProduct(two, "p2").map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("이름", () => {
  it("코드 포인트 30자로 자른다", () => {
    const long = "😀".repeat(31);
    const renamed = renameProduct(one, "p1", long);
    expect(Array.from(renamed[0].name)).toHaveLength(30);
    expect(renameProduct(one, "p1", "레몬맛")[0].name).toBe("레몬맛");
  });
});

describe("사진", () => {
  it("제품당 4장까지 받고 넘친 장수를 돌려준다", () => {
    const { products, skipped } = addPhotos(one, "p1", [photo("b"), photo("c"), photo("d"), photo("e")]);
    expect(products[0].photos.map((p) => p.fileName)).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    expect(skipped).toBe(1);
  });
  it("빈 목록에 제품 1 사진을 넣으면 제품 1 이 생긴다", () => {
    const { products, skipped } = addPhotos([], "p1", [photo("a")]);
    expect(products).toEqual(one);
    expect(skipped).toBe(0);
  });
  it("없는 제품에는 넣지 않는다", () => {
    const { products, skipped } = addPhotos(one, "p3", [photo("b")]);
    expect(products).toEqual(one);
    expect(skipped).toBe(1);
  });
  it("지우기·대표 바꾸기", () => {
    const { products } = addPhotos(one, "p1", [photo("b"), photo("c")]);
    expect(removePhoto(products, "p1", 1)[0].photos.map((p) => p.fileName)).toEqual(["a.jpg", "c.jpg"]);
    expect(makePrimary(products, "p1", 2)[0].photos.map((p) => p.fileName)).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
    expect(makePrimary(products, "p1", 9)[0].photos.map((p) => p.fileName)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });
});

describe("불변", () => {
  it("어떤 함수도 받은 목록을 고치지 않는다", () => {
    const before: PdpProductDraft[] = [{ id: "p1", name: "a", photos: [photo("a"), photo("b")] }, { id: "p2", name: "", photos: [] }];
    const snapshot = structuredClone(before);
    Object.freeze(before); before.forEach((p) => { Object.freeze(p); Object.freeze(p.photos); });
    addProduct(before); removeProduct(before, "p2"); renameProduct(before, "p1", "새 이름");
    addPhotos(before, "p2", [photo("c")]); removePhoto(before, "p1", 0); makePrimary(before, "p1", 1);
    expect(before).toEqual(snapshot);
  });
});

describe("저장된 제품 칸 다듬기", () => {
  const keep = (p: PreparedImageDraft) => (p.base64 ? p : null);
  it("아는 id 만, 겹침 없이, 이름은 글자만 30자, 사진은 4장·빈 사진은 버린다", () => {
    const raw = [
      { id: "p1", name: 5, photos: [photo("a"), { ...photo("x"), base64: "" }, photo("b"), photo("c"), photo("d"), photo("e")] },
      { id: "p1", name: "겹침", photos: [] },
      { id: "p7", name: "모름", photos: [photo("z")] },
      { id: "p2", name: "다".repeat(40) },
    ];
    expect(normalizeProducts(raw, keep)).toEqual([
      { id: "p1", name: "", photos: [photo("a"), photo("b"), photo("c"), photo("d")] },
      { id: "p2", name: "다".repeat(30), photos: [] },
    ]);
  });
  it("배열이 아니거나 제품 1 이 없으면 null", () => {
    expect(normalizeProducts(undefined, keep)).toBeNull();
    expect(normalizeProducts([{ id: "p2", name: "", photos: [photo("a")] }], keep)).toBeNull();
  });
});

describe("만들 준비", () => {
  it("모든 칸에 사진이 1장 이상이어야 한다", () => {
    expect(productsReady(one)).toBe(true);
    expect(productsReady(addProduct(one))).toBe(false);
    expect(productsReady([])).toBe(false);
  });
});

describe("분석 일치 열쇠", () => {
  it("같은 목록이면 같고, 이름·사진·차례가 바뀌면 다르다", () => {
    const { products } = addPhotos(one, "p1", [photo("b")]);
    const key = productsKey(products);
    expect(productsKey(structuredClone(products))).toBe(key);
    expect(productsKey(renameProduct(products, "p1", "레몬"))).not.toBe(key);
    expect(productsKey(makePrimary(products, "p1", 1))).not.toBe(key);
    expect(productsKey(removePhoto(products, "p1", 1))).not.toBe(key);
    expect(productsKey(addProduct(products))).not.toBe(key);
  });
  it("길이가 같아도 사진 base64 끝이 다르면 다르다", () => {
    const other: PdpProductDraft[] = [{ id: "p1", name: "", photos: [{ ...photo("a"), base64: "a-BASE6Y" }] }];
    expect(other[0].photos[0].base64).toHaveLength(photo("a").base64.length);
    expect(productsKey(other)).not.toBe(productsKey(one));
  });
});
