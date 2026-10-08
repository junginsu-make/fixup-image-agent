import { describe, expect, it } from "vitest";
import { creditUnits, llmCostUsd } from "@fixup/shared";
import { estimateCost } from "../../sns/cost-estimate";
import { cardCost, cardOptionsFrom, optionsOfProject, projectSpecFrom, readCardOptions } from "../cardnews-options";

describe("카드뉴스 조건 (2단계 설계 §7)", () => {
  it("말 · 고른 것 · 기본값 차례", () => {
    expect(cardOptionsFrom({ said: {}, chosen: {} })).toEqual({
      ratio: "4:5", count: 6, language: "ko", modelId: "gpt-image-2.5-flare", look: "auto",
    });
    expect(cardOptionsFrom({ said: { ratio: "1:1", look: "anime" }, chosen: { ratio: "9:16" }, imageModel: "nano-banana-pro" }))
      .toMatchObject({ ratio: "9:16", look: "anime", modelId: "nano-banana-pro" });
  });

  /**
   * **기본 장수는 6장**(2026-09-30 사용자 결정 A). 「자동」이면 기존 기획이 AI 가 고른 전체
   * 장수와 카드 수를 맞대 보고 1장만 어긋나도 원고를 버린다(`sns-core/planning.ts:78-85`).
   * 실제로 두 번 중 두 번 주 모델이 거기서 실패했다. 「자동」은 고르면 쓸 수 있다.
   */
  it("기본 장수는 6장, 「자동」은 골랐을 때만, 전에 자동으로 만든 원고는 자동 그대로", () => {
    expect(cardOptionsFrom({ said: {}, chosen: {} }).count).toBe(6);
    expect(cardOptionsFrom({ said: {}, chosen: { count: "auto" } }).count).toBe("auto");
    expect(optionsOfProject({ ratio: "4:5", language: "ko", modelId: "gpt-image-2.5-flare", cardCountMode: "auto", data: {} }).count)
      .toBe("auto");
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

describe("숨긴 모델은 표준형으로 연다", () => {
  it("저장된 조건의 숨긴 모델", () => {
    expect(readCardOptions({ modelId: "nano-banana" }).modelId).toBe("gpt-image-2.5-flare");
  });

  it("작업에서 되읽을 때도", () => {
    expect(optionsOfProject({ ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "auto", data: {} }).modelId)
      .toBe("gpt-image-2.5-flare");
  });

  it("대화의 이미지 모델이 숨긴 것이어도", () => {
    expect(cardOptionsFrom({ said: {}, chosen: {}, imageModel: "gpt-image-2" }).modelId).toBe("gpt-image-2.5-flare");
  });

  it("보이는 모델은 그대로", () => {
    expect(readCardOptions({ modelId: "nano-banana-pro" }).modelId).toBe("nano-banana-pro");
  });
});
