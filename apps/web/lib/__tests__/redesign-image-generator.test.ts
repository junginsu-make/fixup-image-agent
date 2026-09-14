import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { modelById, priceCoverage } from "@fixup/sns-core";
import { imageUnitUsd } from "../credit-cost";
import {
  REDESIGN_FAL_MODEL,
  buildRedesignFalRequest,
  imageUrlFrom,
  pixelSizeOf,
} from "../redesign/image-generator";

/**
 * 리디자인이 **다른 도구와 같은 길로** 그림을 만드는가.
 *
 * 실제 호출은 업체가 하지만 **무엇을 보낼지는 우리가 정한다.** 그 부분만
 * 떼어 내면 돈 한 푼 안 쓰고 값으로 잴 수 있다.
 */

const model = modelById(REDESIGN_FAL_MODEL);
const 크기 = "1152x2048";

describe("어떤 모델을 쓰나", () => {
  /** 카드뉴스·포스터의 기본값과 같은 것이어야 한다. */
  it("다른 도구의 기본 모델과 같다", () => {
    expect(REDESIGN_FAL_MODEL).toBe("gpt-image-2.5-flare");
    expect(model.isDefault).toBe(true);
  });

  it("품질이 max 다", () => {
    // 옛 길은 gpt-image-2 의 `high` 였다. 이쪽이 한 단계 위다.
    expect(model.quality).toBe("max");
  });
});

describe("크기 읽기", () => {
  it("가로x세로를 알아본다", () => {
    expect(pixelSizeOf("1152x2048")).toEqual({ width: 1152, height: 2048 });
    expect(pixelSizeOf(" 1024×1536 ")).toEqual({ width: 1024, height: 1536 });
  });

  /** 못 읽으면 던지지 않는다 — 비율이 정한 기본 크기로 떨어질 수 있게. */
  it("모르는 모양이면 undefined 다", () => {
    expect(pixelSizeOf("커다랗게")).toBeUndefined();
    expect(pixelSizeOf("")).toBeUndefined();
  });
});

describe("보낼 것을 만든다", () => {
  const 만든것 = buildRedesignFalRequest({
    model,
    prompt: "히어로 섹션을 다시 그려 줘",
    imageUrls: ["https://fal.example/1.png", "https://fal.example/2.png"],
    size: 크기,
  });

  /** 원본 상세페이지를 늘 함께 보내므로 t2i 가 아니라 i2i 다. */
  it("i2i 엔드포인트로 간다", () => {
    expect(만든것.endpoint).toBe(model.i2i.endpoint);
    expect(만든것.endpoint).toContain("edit");
  });

  it("첨부 주소를 그대로 싣는다", () => {
    expect(만든것.body.image_urls).toEqual(["https://fal.example/1.png", "https://fal.example/2.png"]);
  });

  it("고른 크기를 픽셀로 보낸다", () => {
    expect(만든것.body.image_size).toEqual({ width: 1152, height: 2048 });
  });

  /** 품질은 모델이 정한다. 호출하는 쪽이 정하면 단가표와 갈린다. */
  it("모델이 정한 품질로 간다", () => {
    expect(만든것.body.quality).toBe("max");
  });

  it("프롬프트가 실린다", () => {
    expect(만든것.body.prompt).toContain("히어로 섹션");
  });
});

describe("응답에서 그림 꺼내기", () => {
  it("첫 장의 주소를 쓴다", () => {
    expect(imageUrlFrom({ images: [{ url: "https://fal.example/out.png" }] })).toBe(
      "https://fal.example/out.png",
    );
  });

  /** 없으면 조용히 넘어가면 안 된다 — 빈 그림이 저장되고 크레딧은 깎인다. */
  it("없으면 던진다", () => {
    expect(() => imageUrlFrom({ images: [] })).toThrow();
    expect(() => imageUrlFrom({})).toThrow();
    expect(() => imageUrlFrom(null)).toThrow();
  });
});

describe("단가가 그 모델을 따라간다", () => {
  /**
   * 차감하는 값(`redesign-openai`)과 실제로 쓰는 모델의 표값이 갈라지면,
   * 회원에게 받는 것과 우리가 내는 것이 어긋난다.
   */
  it("2.5 표의 우리 크기 값과 같다", () => {
    const 표값 = priceCoverage(model, "i2i", { width: 1152, height: 2048 }).usd;

    // 표값($0.16464)을 소수 셋째 자리로 맞춘 값을 쓴다.
    expect(imageUnitUsd("redesign-openai")).toBeCloseTo(표값, 2);
  });

  it("옛 값($0.21)으로 돌아가지 않는다", () => {
    expect(imageUnitUsd("redesign-openai")).toBeLessThan(0.2);
  });
});
