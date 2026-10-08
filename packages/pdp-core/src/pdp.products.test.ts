import { describe, expect, it } from "vitest";
import { fitProductPhotos, normalizeProductIds, productLabel, productsForSection } from "./pdp.products";

const p = (id: "p1" | "p2" | "p3", n: number) => ({ id, imageUrls: Array.from({ length: n }, (_, i) => `${id}-${i}`) });

describe("섹션 배정 다듬기", () => {
  it("모르는 id·겹침을 버리고 제품 차례로", () => {
    expect(normalizeProductIds(["p2", "x", "p1", "p2"], ["p1", "p2"])).toEqual(["p1", "p2"]);
  });
  it("비거나 배열이 아니면 모든 제품", () => {
    expect(normalizeProductIds([], ["p1", "p2"])).toEqual(["p1", "p2"]);
    expect(normalizeProductIds("p1", ["p1", "p3"])).toEqual(["p1", "p3"]);
    expect(normalizeProductIds(["zz"], ["p1"])).toEqual(["p1"]);
  });
});

describe("섹션 제품 고르기", () => {
  it("배정된 제품만, 페이지 차례로", () => {
    expect(productsForSection([p("p1", 1), p("p2", 1), p("p3", 1)], ["p3", "p1"]).map((x) => x.id)).toEqual(["p1", "p3"]);
  });
  it("배정이 없거나 하나도 안 맞으면 모든 제품", () => {
    expect(productsForSection([p("p1", 1), p("p2", 1)], undefined).map((x) => x.id)).toEqual(["p1", "p2"]);
    expect(productsForSection([p("p1", 1), p("p2", 1)], ["p3"]).map((x) => x.id)).toEqual(["p1", "p2"]);
  });
});

describe("상한 맞추기", () => {
  it("넘지 않으면 그대로", () => {
    const products = [p("p1", 2), p("p2", 2)];
    expect(fitProductPhotos(products, 4)).toEqual({ products, dropped: 0 });
  });
  it("대표는 남기고 뒤에서부터 번갈아 뺀다", () => {
    const { products, dropped } = fitProductPhotos([p("p1", 4), p("p2", 4), p("p3", 4)], 8);
    expect(dropped).toBe(4);
    expect(products.map((x) => x.imageUrls.length)).toEqual([3, 3, 2]);
    expect(products.every((x) => x.imageUrls[0]?.endsWith("-0"))).toBe(true);
  });
  it("제품 수보다 작으면 대표만", () => {
    const { products } = fitProductPhotos([p("p1", 3), p("p2", 3)], 1);
    expect(products.map((x) => x.imageUrls)).toEqual([["p1-0"], ["p2-0"]]);
  });
  it("원본을 바꾸지 않는다", () => {
    const input = [p("p1", 4)];
    fitProductPhotos(input, 1);
    expect(input[0]!.imageUrls).toHaveLength(4);
  });
});

describe("이름", () => {
  it("비면 제품 N", () => {
    expect(productLabel({ id: "p2" })).toBe("제품 2");
    expect(productLabel({ id: "p1", name: " 레몬맛 " })).toBe("레몬맛");
  });
});
