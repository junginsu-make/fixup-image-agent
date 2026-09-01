import { describe, expect, it } from "vitest";
import type { Attachment } from "@fixup/sns-core";
import { estimateCost } from "../../../sns/cost-estimate";

describe("카드별 예상 비용", () => {
  it("역할에 맞는 레퍼런스가 있는 카드만 i2i 로 계산한다", () => {
    const coverReference: Attachment = {
      id: "cover-reference",
      kind: "style_reference",
      role: "cover",
      assetPath: "local/cover.png",
      url: "/cover.png",
    };

    const estimate = estimateCost({
      ratio: "4:5",
      modelId: "gpt-image-2",
      totalCards: 4,
      attachments: [coverReference],
    });

    expect(estimate.generatedCount).toBe(4);
    expect(estimate.usd).toBeCloseTo(0.178 + 0.165 * 3, 10);
  });

  it("원본 그대로 쓸 장과 사용자가 올린 엔딩은 비용에서 뺀다", () => {
    const attachments: Attachment[] = [
      { id: "original", kind: "place_as_is", assetPath: "local/original.png", url: "/original.png" },
      { id: "ending", kind: "ending", assetPath: "local/ending.png", url: "/ending.png" },
    ];

    const estimate = estimateCost({
      ratio: "4:5",
      modelId: "gpt-image-2",
      totalCards: 4,
      attachments,
    });

    expect(estimate.generatedCount).toBe(2);
    expect(estimate.usd).toBeCloseTo(0.165 * 2, 10);
  });
});
