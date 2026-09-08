import { describe, expect, it } from "vitest";
import {
  CREDIT_UNIT_USD, LLM_PLAN_USD, LLM_VISION_READ_USD, creditUnits, llmCostUsd,
} from "../credit";

/**
 * 장과 실제 돈을 잇는다 (2026-09-08 사용자 결정).
 *
 * 전에는 모델마다 정수 가중치를 손으로 매겼는데, 같은 「1장」이 $0.039 에서
 * $0.060 까지 **54% 차이**가 났다. 싼 모델을 쓰는 사람이 손해를 봤다.
 */

describe("얼마면 몇 장인가", () => {
  it("장 하나는 $0.05 다", () => {
    expect(CREDIT_UNIT_USD).toBe(0.05);
  });

  it("**올림한다** — 내림하면 아무리 만들어도 한도가 안 준다", () => {
    // $0.049 짜리가 0장이 되면 공짜로 무한히 만들 수 있다.
    expect(creditUnits(0.049)).toBe(1);
    expect(creditUnits(0.05)).toBe(1);
    expect(creditUnits(0.051)).toBe(2);
  });

  it("반올림도 같은 구멍이 있다 — 그래서 안 쓴다", () => {
    expect(creditUnits(0.024)).toBe(1);
  });

  it("실측한 단가가 이 장수가 된다", () => {
    // 2026-09-08 실측값. 이 표가 바뀌면 시험이 알려 준다.
    expect(creditUnits(0.0390)).toBe(1);  // nano-banana
    expect(creditUnits(0.1200)).toBe(3);  // nano-banana-2
    expect(creditUnits(0.1500)).toBe(3);  // nano-banana-pro
    expect(creditUnits(0.1780)).toBe(4);  // gpt-image-2 · 포스터 2:3
    expect(creditUnits(0.2190)).toBe(5);  // gpt-image-2 · 정사각 (크기가 반영된다)
  });

  it("**크기가 다르면 장수도 다르다** — 정수 가중치로는 못 하던 것", () => {
    expect(creditUnits(0.2190)).toBeGreaterThan(creditUnits(0.1780));
  });

  it("0원이면 0장 — 실패해서 아무것도 안 받았을 때다", () => {
    expect(creditUnits(0)).toBe(0);
    expect(creditUnits(-1)).toBe(0);
  });

  it("이상한 값에도 안 깨진다", () => {
    expect(creditUnits(Number.NaN)).toBe(0);
    expect(creditUnits(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("글 모델 몫", () => {
  it("기획 한 번과 그림 읽기를 따로 센다", () => {
    expect(llmCostUsd({ planCalls: 1 })).toBe(LLM_PLAN_USD);
    expect(llmCostUsd({ visionReads: 1 })).toBe(LLM_VISION_READ_USD);
  });

  it("첨부가 늘면 그만큼 는다 — 한 번으로 안 센다", () => {
    expect(llmCostUsd({ planCalls: 1, visionReads: 3 })).toBeCloseTo(0.014 + 0.030, 4);
  });

  it("아무것도 안 했으면 0원", () => {
    expect(llmCostUsd({})).toBe(0);
  });

  it("음수는 0으로 본다", () => {
    expect(llmCostUsd({ planCalls: -5, visionReads: -2 })).toBe(0);
  });

  it("**그림값에 견주면 작지만 공짜는 아니다**", () => {
    // 첨부 넉 장에 기획 한 번이면 nano-banana 그림 한 장보다 비싸다.
    expect(llmCostUsd({ planCalls: 1, visionReads: 4 })).toBeGreaterThan(0.039);
  });
});
