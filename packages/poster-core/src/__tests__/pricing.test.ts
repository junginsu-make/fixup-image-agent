import { describe, expect, it } from "vitest";
import { DEFAULT_VARIANTS, estimatePosterCost, MAX_VARIANTS, MIN_VARIANTS } from "../pricing";

describe("포스터 비용 추정", () => {
  it("레퍼런스가 있으면 i2i 단가를 쓴다", () => {
    const result = estimatePosterCost({
      modelId: "gpt-image-2",
      ratioId: "2:3",
      variants: 1,
      hasReferences: true,
    });
    expect(result.mode).toBe("i2i");
    expect(result.unitUsd).toBe(0.178);
    expect(result.totalUsd).toBe(0.178);
  });

  it("레퍼런스가 없으면 t2i 단가를 쓴다", () => {
    const result = estimatePosterCost({
      modelId: "gpt-image-2",
      ratioId: "2:3",
      variants: 1,
      hasReferences: false,
    });
    expect(result.mode).toBe("t2i");
    expect(result.unitUsd).toBe(0.165);
  });

  it("변형 N장이면 단가 × N 이다 — 포스터는 N장을 다 저장하므로 다 낸다", () => {
    const result = estimatePosterCost({
      modelId: "gpt-image-2",
      ratioId: "2:3",
      variants: 3,
      hasReferences: true,
    });
    expect(result.variants).toBe(3);
    expect(result.totalUsd).toBeCloseTo(0.534, 4);
  });

  it("A4 인쇄용을 nano 로 고르면 거절 사유를 그대로 전한다", () => {
    const result = estimatePosterCost({
      modelId: "nano-banana-pro",
      ratioId: "a4-print",
      variants: 1,
      hasReferences: true,
    });
    expect(result.rejected).toMatch(/인쇄/);
    expect(result.totalUsd).toBeUndefined();
  });

  it("거절당하면 금액을 지어내지 않는다", () => {
    const result = estimatePosterCost({
      modelId: "gpt-image-2",
      ratioId: "없는비율",
      variants: 1,
      hasReferences: false,
    });
    expect(result.rejected).toBeTruthy();
    expect(result.unitUsd).toBeUndefined();
    expect(result.totalUsd).toBeUndefined();
  });

  it("변형 수가 1~3 밖이면 거절한다", () => {
    for (const variants of [0, 4]) {
      const result = estimatePosterCost({
        modelId: "gpt-image-2",
        ratioId: "2:3",
        variants,
        hasReferences: true,
      });
      expect(result.rejected).toMatch(/1~3/);
    }
  });

  it("표에 없는 큰 크기는 가장 비싼 값으로 잡고 근사임을 알린다", () => {
    // 2400×3392 는 814만 픽셀이다. 비율만 보면 1024×1536($0.165) 행에 붙는데
    // 5배 큰 이미지를 같은 값으로 계산하게 된다. 적게 잡는 쪽이 위험하다.
    const print = estimatePosterCost({
      modelId: "gpt-image-2", ratioId: "a4-print", variants: 1, hasReferences: false,
    });
    const draft = estimatePosterCost({
      modelId: "gpt-image-2", ratioId: "a4-draft", variants: 1, hasReferences: false,
    });
    expect(print.unitUsd!).toBeGreaterThan(draft.unitUsd!);
    expect(print.approximate).toBe(true);
    expect(draft.approximate).toBeUndefined();
  });

  it("표가 덮는 크기는 근사 표시가 없다 — 카드뉴스와 같은 값이어야 한다", () => {
    const result = estimatePosterCost({
      modelId: "gpt-image-2", ratioId: "4:5", variants: 1, hasReferences: true,
    });
    expect(result.unitUsd).toBe(0.178);
    expect(result.approximate).toBeUndefined();
  });

  it("모르는 모델은 금액이 아니라 사유를 준다", () => {
    const result = estimatePosterCost({
      modelId: "없는모델", ratioId: "2:3", variants: 1, hasReferences: false,
    });
    expect(result.rejected).toBeTruthy();
    expect(result.totalUsd).toBeUndefined();
  });
});

/**
 * 안 고르면 몇 장인가 (2026-09-08 사용자 결정).
 *
 * 3장으로 시작하고 있었다 — 한 장만 보려던 사람도 세 배를 내고, 그것도 누르기
 * 전에는 모른다.
 */
describe("기본 장수", () => {
  it("한 장이다", () => {
    expect(DEFAULT_VARIANTS).toBe(1);
  });

  it("**싼 쪽에 둔다** — 더 필요하면 올리면 되지만 나간 돈은 못 돌려받는다", () => {
    expect(DEFAULT_VARIANTS).toBe(MIN_VARIANTS);
  });

  it("만들 수 있는 범위 안이다", () => {
    expect(DEFAULT_VARIANTS).toBeGreaterThanOrEqual(MIN_VARIANTS);
    expect(DEFAULT_VARIANTS).toBeLessThanOrEqual(MAX_VARIANTS);
  });
});

/**
 * **같은 비율을 따라갈 때 값이 맞는가.**
 *
 * `POSTER_RATIOS` 의 `match-source` 픽셀은 자리표시 1088×1088 이고, 실제 크기는
 * `buildPosterJob` 이 `sizeFromSource` 로 따로 구한다. 견적이 그 사실을 모르면
 * 두 값이 만나는 자리가 없어 크기별 단가표를 쓰는 모델에서 값이 그대로 틀린다.
 */
describe("첨부한 그림과 같은 비율", () => {
  const base = { modelId: "gpt-image-2", ratioId: "match-source", variants: 1, hasReferences: true };

  it("첨부 크기를 넘기면 그 크기로 값을 낸다", () => {
    const wide = estimatePosterCost({ ...base, sourceSize: { width: 3840, height: 2160 } });
    const square = estimatePosterCost({ ...base, sourceSize: { width: 1024, height: 1024 } });

    expect(wide.rejected).toBeUndefined();
    expect(square.rejected).toBeUndefined();
    // 크기가 다르면 값도 달라야 한다 — 같으면 크기를 안 보고 있다는 뜻이다.
    expect(wide.unitUsd).not.toBe(square.unitUsd);
  });

  it("크기를 모르면 거절하지 않고 어림으로 표시한다", () => {
    // 작업을 만들 때와 첫 화면의 예상 비용은 아직 첨부를 안 쟀다. 거절하면
    // 광고·같은 비율 작업을 아예 못 만든다.
    const estimate = estimatePosterCost(base);

    expect(estimate.rejected).toBeUndefined();
    expect(estimate.approximate).toBe(true);
    expect(estimate.unitUsd).toBeGreaterThan(0);
  });

  it("다른 비율은 첨부 크기를 봐도 답이 안 바뀐다", () => {
    const withSize = estimatePosterCost({
      ...base, ratioId: "1:1", sourceSize: { width: 3840, height: 2160 },
    });
    const without = estimatePosterCost({ ...base, ratioId: "1:1" });

    expect(withSize.unitUsd).toBe(without.unitUsd);
  });
});
