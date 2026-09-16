import { describe, expect, it } from "vitest";
import { DEFAULT_VARIANTS, estimatePosterCost, MAX_VARIANTS, MIN_VARIANTS } from "../pricing";
import { modelById, pickEndpoint } from "@fixup/sns-core";

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

/**
 * **레퍼런스가 없으면 t2i, 있으면 i2i — 자동으로.**
 *
 * 사용자에게 묻지 않는다(`pickEndpoint` 머리말). 이 규칙이 세 군데를 한꺼번에
 * 가른다: 부를 엔드포인트, 매길 단가, 그리고 fal 에 `image_urls` 를 실을지.
 *
 * 세 곳이 따로 판단하면 어느 날 하나가 어긋난다 — 그때는 t2i 로 부르면서 i2i
 * 값을 청구하거나, 그 반대가 된다. 그래서 **같은 입력으로 셋을 함께 잰다.**
 *
 * 2026-09-16 에 레퍼런스를 선택으로 풀면서 이 갈래가 처음으로 실제 사용자
 * 경로에 올랐다. 그전까지는 코드만 있고 한 번도 안 타던 길이었다.
 */
describe("첨부 유무가 모드를 가른다", () => {
  const MODELS = ["nano-banana", "nano-banana-2", "nano-banana-pro", "gpt-image-2"];

  for (const modelId of MODELS) {
    it(`${modelId}: 첨부가 없으면 t2i 종점으로 간다`, () => {
      const model = modelById(modelId);

      expect(pickEndpoint(model, false)).toBe(model.t2i.endpoint);
      expect(pickEndpoint(model, true)).toBe(model.i2i.endpoint);
    });

    it(`${modelId}: 두 종점이 실제로 다르다`, () => {
      const model = modelById(modelId);
      // 같으면 위 시험이 통과해도 아무것도 안 갈린 것이다.
      expect(model.t2i.endpoint).not.toBe(model.i2i.endpoint);
    });
  }

  /** 첨부 없이도 값이 나와야 한다. 못 내면 만들기 전에 거절된다. */
  it("첨부가 없어도 값을 낸다", () => {
    const estimate = estimatePosterCost({
      modelId: "nano-banana-2", ratioId: "2:3", variants: 1, hasReferences: false,
    });

    expect(estimate.rejected).toBeUndefined();
    expect(estimate.totalUsd).toBeGreaterThan(0);
  });

  /** 장수를 곱하는 것은 모드와 무관하다. 여기가 어긋나면 과금이 어긋난다. */
  it("장수를 곱하는 것은 모드와 무관하다", () => {
    const one = estimatePosterCost({
      modelId: "nano-banana-2", ratioId: "2:3", variants: 1, hasReferences: false,
    });
    const three = estimatePosterCost({
      modelId: "nano-banana-2", ratioId: "2:3", variants: 3, hasReferences: false,
    });

    expect(three.totalUsd).toBeCloseTo((one.totalUsd ?? 0) * 3, 6);
  });
});
