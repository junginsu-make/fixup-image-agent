import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_MODEL } from "@fixup/pdp-core";
import { PDP_IMAGE_MODELS, isRetiredPdpModel, pdpImageModelOrDefault } from "../image-models";

/**
 * **상세페이지 그림 모델은 둘 — GPT Image 2.5(기본)와 Nano Banana Pro**(2026-10-08 사용자 결정).
 *
 * 나노바나나 일반판은 그림 만들기 오류(품질 검사 탈락)가 잦았다. 고를 수 있는 것을 둘로 줄이고,
 * 이름은 등급(경제형·표준형)이 아니라 실제 모델 이름으로 보인다. 크레딧은 그대로(한 장 1크레딧).
 */
describe("상세페이지 모델 두 개", () => {
  it("고를 수 있는 것은 GPT Image 2.5 와 Nano Banana Pro 뿐이고, 기본이 먼저다", () => {
    expect(PDP_IMAGE_MODELS.map((model) => model.id)).toEqual(["gpt-image-2.5-flare", "nano-banana-pro"]);
    expect(DEFAULT_IMAGE_MODEL).toBe("gpt-image-2.5-flare");
  });

  it("실제 모델 이름으로 보인다 — 등급 이름(경제형·표준형 등)을 쓰지 않는다", () => {
    expect(PDP_IMAGE_MODELS.map((model) => model.label)).toEqual(["GPT Image 2.5", "Nano Banana Pro"]);
    for (const model of PDP_IMAGE_MODELS) expect(model.label).not.toMatch(/형/);
  });

  it("다른 모델로 저장된 작업은 기본 모델로 연다", () => {
    for (const old of ["nano-banana", "nano-banana-2", "gpt-image-2", "seedream-5-pro", "모르는값", undefined, null]) {
      expect(pdpImageModelOrDefault(old)).toBe("gpt-image-2.5-flare");
    }
    expect(pdpImageModelOrDefault("nano-banana-pro")).toBe("nano-banana-pro");
  });

  it("두 모델 말고는 그림 만들기 요청을 받지 않는다 — 안 보낸 것은 기본 모델이라 괜찮다", () => {
    for (const old of ["nano-banana", "nano-banana-2", "gpt-image-2"]) expect(isRetiredPdpModel(old)).toBe(true);
    expect(isRetiredPdpModel("gpt-image-2.5-flare")).toBe(false);
    expect(isRetiredPdpModel("nano-banana-pro")).toBe(false);
    expect(isRetiredPdpModel(undefined)).toBe(false);
  });
});
