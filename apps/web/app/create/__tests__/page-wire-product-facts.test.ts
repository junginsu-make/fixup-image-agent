import { describe, expect, it } from "vitest";
import { buildPageWire } from "../page-wire";

const base = { imageModel: "gpt-image-2.5-flare" as const, userInstruction: "" };
const reading = { category: "병", visibleFacts: ["초록 유리"], labelText: ["500ml"], distinctiveTraits: ["x"], unknowns: ["y"] };

describe("페이지 값의 제품 사실", () => {
  it("실물 사진 경로면 제품 자체의 사실만 싣는다", () => {
    expect(buildPageWire({ ...base, anchorKind: "product-photo", productReading: reading }).productFacts)
      .toEqual({ category: "병", visibleFacts: ["초록 유리"], labelText: ["500ml"] });
  });

  it("글 경로(대표 이미지)에는 싣지 않는다", () => {
    expect(buildPageWire({ ...base, anchorKind: "key-visual", productReading: reading }).productFacts).toBeUndefined();
  });

  it("판독이 없으면 없다", () => {
    expect(buildPageWire({ ...base, anchorKind: "product-photo" }).productFacts).toBeUndefined();
  });
});
