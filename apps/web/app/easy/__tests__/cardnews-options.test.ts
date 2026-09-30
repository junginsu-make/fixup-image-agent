import { describe, expect, it } from "vitest";
import { creditUnits, llmCostUsd } from "@fixup/shared";
import { estimateCost } from "../../sns/cost-estimate";
import { cardCost, cardOptionsFrom, projectSpecFrom, readCardOptions } from "../cardnews-options";

describe("카드뉴스 조건 (2단계 설계 §7)", () => {
  it("말 · 고른 것 · 기본값 차례", () => {
    expect(cardOptionsFrom({ said: {}, chosen: {} })).toEqual({
      ratio: "4:5", count: "auto", language: "ko", modelId: "gpt-image-2.5-flare", look: "auto",
    });
    expect(cardOptionsFrom({ said: { ratio: "1:1", look: "anime" }, chosen: { ratio: "9:16" }, imageModel: "nano-banana-2" }))
      .toMatchObject({ ratio: "9:16", look: "anime", modelId: "nano-banana-2" });
  });

  it("카드뉴스가 못 만드는 비율 · 모르는 모델은 기본으로", () => {
    expect(cardOptionsFrom({ said: { ratio: "2:3" }, chosen: {}, imageModel: "없는모델" }))
      .toMatchObject({ ratio: "4:5", modelId: "gpt-image-2.5-flare" });
  });

  it("화면이 보낸 조건은 아는 값만", () => {
    expect(readCardOptions({ ratio: "1:1", count: 6, language: "fr", look: "3d", modelId: "x" }))
      .toEqual({ ratio: "1:1", count: 6, look: "3d" });
    expect(readCardOptions({ count: 12 })).toEqual({});
  });

  it("장수를 작업 입력 모양으로", () => {
    expect(projectSpecFrom({ ratio: "4:5", count: 6, language: "ko", modelId: "m", look: "auto" }))
      .toEqual({ ratio: "4:5", cardCountMode: "fixed", cardCount: 6, language: "ko", modelId: "m", look: "auto" });
    expect(projectSpecFrom({ ratio: "4:5", count: "auto", language: "ko", modelId: "m", look: "auto" }).cardCount).toBeUndefined();
  });

  /** 버튼의 값 = 카드뉴스 `generate` 가 잡는 값(`generate/route.ts:70-72`). */
  it("새 방식은 원고 장수만큼 크레딧", () => {
    expect(cardCost({ policy: "image-v2", ratio: "4:5", modelId: "gpt-image-2.5-flare", attachments: [], cards: [{ index: 1 }, { index: 2 }] }))
      .toEqual({ units: 2, label: "약 2크레딧" });
  });

  /** 설계 §11: 새 방식은 원본 그대로 · 마지막 장도 한 장씩 센다(`creditImagePlan(cards.length)`). */
  it("새 방식은 원본 그대로 장도 센다", () => {
    const cards = [{ index: 1 }, { index: 2, kind: "place_as_is" }, { index: 3, kind: "ending_image" }];
    expect(cardCost({ policy: "image-v2", ratio: "4:5", modelId: "gpt-image-2.5-flare", attachments: [], cards }).units).toBe(3);
  });

  it("옛 방식은 카드뉴스 예약과 같은 셈", () => {
    const cards = [{ index: 1 }, { index: 2 }, { index: 3 }];
    const est = estimateCost({ ratio: "4:5", modelId: "gpt-image-2.5-flare", totalCards: 3, attachments: [], cards });
    const units = creditUnits(est.usd + llmCostUsd({ planCalls: 1 + est.generatedCount }));
    expect(cardCost({ policy: "cost-v1", ratio: "4:5", modelId: "gpt-image-2.5-flare", attachments: [], cards }))
      .toEqual({ units, label: `약 ${units}장` });
  });
});
