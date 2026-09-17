import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, pickEndpoint, unitPrice, modelById, modelEndpointLabel } from "../models";

describe("모델 목록", () => {
  /**
   * 2026-09-10: gpt-image-2.5 둘을 **맨 앞에** 더했다. 차례가 뜻을 갖는다 —
   * `poster-core/pricing.ts` 가 첫 픽셀 모델을 쓰고, `create/ModelPicker.tsx`
   * 가 첫 항목에 「기본」을 붙이고, `layout-core/image-request.ts` 가 동점일 때
   * 앞을 고른다.
   *
   * **옛 모델은 안 지운다.** 저장된 작업이 그 id 를 들고 있고 `modelById` 가
   * 모르는 id 에 던진다.
   */
  it("여섯을 담는다", () => {
    expect(IMAGE_MODELS.map((model) => model.id)).toEqual([
      "gpt-image-2.5-flare", "gpt-image-2.5-sunburst",
      "gpt-image-2", "nano-banana-pro", "nano-banana-2", "nano-banana",
    ]);
  });

  /**
   * 기본을 2026-09-10 에 옮겼다. 값·속도·화질을 실측해 정했다
   * (`docs/superpowers/plans/2026-09-10-gpt-image-25.md` §0.2).
   */
  it("GPT Image 2.5 가 기본이다", () => {
    expect(IMAGE_MODELS[0]!.id).toBe("gpt-image-2.5-flare");
    expect(IMAGE_MODELS[0]!.isDefault).toBe(true);
    // 기본은 하나뿐이어야 한다. 둘이면 어느 쪽이 뽑히는지 자리마다 달라진다.
    expect(IMAGE_MODELS.filter((model) => model.isDefault)).toHaveLength(1);
  });

  /**
   * **픽셀 모델의 한계는 서로 같아야 한다.**
   *
   * 광고 마스터 크기가 이 값에서 역산돼 있다(`lib/ad/specs.ts:41`). 기본 모델이
   * 바뀔 때 한계가 한 글자만 달라도 여섯 규격의 실제 생성 크기가 조용히 바뀐다.
   * 2026-09-10 에 fal 실호출로 2.5 가 같은 한계를 쓰는 것을 확인했다.
   */
  it("픽셀 모델들의 한계가 서로 같다", () => {
    const limits = IMAGE_MODELS
      .filter((model) => model.pixelSizeLimits)
      .map((model) => JSON.stringify(model.pixelSizeLimits));
    expect(limits.length).toBeGreaterThan(1);
    expect(new Set(limits).size, "픽셀 모델의 한계가 서로 다르다").toBe(1);
  });

  it("모든 모델이 t2i 와 i2i 엔드포인트를 갖는다", () => {
    for (const model of IMAGE_MODELS) {
      expect(model.t2i.endpoint).toMatch(/^(fal-ai|openai)\//);
      expect(model.i2i.endpoint).toMatch(/\/edit$/);
    }
  });
});

describe("엔드포인트 선택", () => {
  it("레퍼런스가 있으면 i2i", () => {
    // 카드뉴스는 레퍼런스가 필수라 사실상 항상 i2i 다.
    expect(pickEndpoint(modelById("gpt-image-2"), true)).toBe("openai/gpt-image-2/edit");
  });

  it("없으면 t2i", () => {
    // 엔딩 요약 페이지를 레퍼런스 없이 만들 때.
    expect(pickEndpoint(modelById("gpt-image-2"), false)).toBe("openai/gpt-image-2");
  });
});

describe("단가", () => {
  it("nano 는 고정 단가 × 해상도 배수", () => {
    // 우리는 2K 고정이다.
    expect(unitPrice(modelById("nano-banana-2"), "i2i", { width: 1088, height: 1360 })).toBeCloseTo(0.12, 4);
    expect(unitPrice(modelById("nano-banana-pro"), "i2i", { width: 1088, height: 1360 })).toBeCloseTo(0.15, 4);
    expect(unitPrice(modelById("nano-banana"), "i2i", { width: 1088, height: 1360 })).toBeCloseTo(0.039, 4);
  });

  it("GPT 는 t2i 와 i2i 가 다르다", () => {
    const square = { width: 1088, height: 1088 };
    expect(unitPrice(modelById("gpt-image-2"), "t2i", square)).toBeCloseTo(0.211, 4);
    expect(unitPrice(modelById("gpt-image-2"), "i2i", square)).toBeCloseTo(0.219, 4);
  });

  it("GPT 는 픽셀이 아니라 모양으로 표 행을 고른다", () => {
    // 이 표는 픽셀에 비례하지 않는다 — 1024x1536(1,572,864px)이
    // 1024x1024(1,048,576px)보다 싸다. 정사각형이 비싸다.
    const tall = unitPrice(modelById("gpt-image-2"), "i2i", { width: 1088, height: 1360 });
    const square = unitPrice(modelById("gpt-image-2"), "i2i", { width: 1088, height: 1088 });
    expect(tall).toBeCloseTo(0.178, 4);
    expect(square).toBeCloseTo(0.219, 4);
    expect(tall).toBeLessThan(square);
  });

  it("가로형은 가로형 행을 쓴다", () => {
    expect(unitPrice(modelById("gpt-image-2"), "i2i", { width: 2048, height: 1152 })).toBeCloseTo(0.158, 4);
  });
});

describe("참고 이미지 상한", () => {
  it("GPT 는 16장, nano 는 14장", () => {
    expect(modelById("gpt-image-2").maxReferenceImages).toBe(16);
    expect(modelById("nano-banana-2").maxReferenceImages).toBe(14);
    expect(modelById("nano-banana-pro").maxReferenceImages).toBe(14);
  });
});

/**
 * **기획 LLM 에게 「어느 업체의 무슨 모델인가」를 알려 줄 때 쓰는 이름.**
 *
 * 우리 id(`nano-banana-pro`)만으로는 알 수 없다 — 우리가 붙인 이름이기 때문이다.
 * 엔드포인트에는 업체와 모델 계열이 들어 있다(`fal-ai/nano-banana-pro`,
 * `openai/gpt-image-2.5/flare/...`).
 *
 * **사용자에게 보이는 이름이 아니다.** 화면은 「표준형」처럼 우리 이름으로
 * 부른다(`lib/__tests__/model-name.test.ts` 가 그것을 지킨다). 이건 모델에게
 * 보내는 글이라 반대로 진짜 이름이 필요하다.
 */
describe("모델을 LLM 에게 소개하는 이름", () => {
  it("우리 id 와 엔드포인트를 함께 낸다", () => {
    const label = modelEndpointLabel("nano-banana-pro");

    expect(label).toContain("nano-banana-pro");
    expect(label).toContain("fal-ai/nano-banana-pro");
  });

  it("gpt 계열도 업체가 드러난다", () => {
    expect(modelEndpointLabel("gpt-image-2.5-flare")).toContain("openai/");
  });

  /**
   * **모르는 id 에 던지지 않는다.** 기획은 그림을 만들기 전 단계라, 여기서
   * 터지면 04 가 통째로 멎는다. 저장된 옛 작업이 없는 id 를 들고 있을 수 있다.
   */
  it("모르는 id 면 그 id 만 낸다", () => {
    expect(modelEndpointLabel("없는-모델")).toBe("없는-모델");
  });

  it("빈 값이면 빈 값이다", () => {
    expect(modelEndpointLabel("")).toBe("");
  });

  /** 모든 모델이 이름을 낼 수 있어야 한다. 하나라도 터지면 그 작업이 멎는다. */
  it("모든 모델이 이름을 낸다", () => {
    for (const model of IMAGE_MODELS) {
      expect(modelEndpointLabel(model.id), `${model.id} 가 비었다`).toContain(model.id);
    }
  });
});
