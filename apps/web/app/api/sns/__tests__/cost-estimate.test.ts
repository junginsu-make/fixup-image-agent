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

  it("그림 칸이 여럿인 틀은 칸마다 한 번씩 센다", () => {
    // 칸 하나가 fal 요청 하나다. 카드당 한 번으로 세면 예약이 실제 지출의
    // 1/N 이 되고, 넘치는 지출은 확정 때 상한에 깎여 장부에서 사라진다.
    const box = { x: 0, y: 0, width: 0.5, height: 0.5 } as const;
    const twoSlots = {
      slots: [
        { kind: "image" as const, box },
        { kind: "image" as const, box: { ...box, x: 0.5 } },
      ],
    };

    const flat = estimateCost({
      ratio: "4:5", modelId: "gpt-image-2", totalCards: 4, attachments: [],
    });
    const withLayout = estimateCost({
      ratio: "4:5", modelId: "gpt-image-2", totalCards: 4, attachments: [],
      cards: [{ index: 2, layout: twoSlots }],
    });

    // 2번 카드 하나가 한 번에서 두 번으로 늘어난다.
    expect(withLayout.generatedCount).toBe(flat.generatedCount + 1);
    expect(withLayout.usd).toBeGreaterThan(flat.usd);
  });

  it("틀을 안 넘기면 지금까지처럼 카드당 한 번으로 센다", () => {
    // 첫 화면의 「예상 비용」은 아직 어떤 틀이 붙을지 모른다.
    const withoutCards = estimateCost({
      ratio: "4:5", modelId: "gpt-image-2", totalCards: 4, attachments: [],
    });
    const withEmptyCards = estimateCost({
      ratio: "4:5", modelId: "gpt-image-2", totalCards: 4, attachments: [],
      cards: [{ index: 2, layout: null }],
    });
    expect(withEmptyCards).toEqual(withoutCards);
  });
});
