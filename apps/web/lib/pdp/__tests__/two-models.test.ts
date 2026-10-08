import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_MODEL } from "@fixup/pdp-core";
import { PDP_IMAGE_MODELS, isRetiredPdpModel, pdpImageModelOrDefault } from "../image-models";

/**
 * **상세페이지 그림 모델은 셋 — 표준형(기본)·디테일형·속도형**(2026-10-08 오후 사용자 결정).
 *
 * 다른 화면과 같은 등급 이름을 쓴다. 이름표 정본은 packages/shared/src/image-model-names.ts.
 */
describe("상세페이지 모델 셋", () => {
  it("고를 수 있는 것은 표준형·디테일형·속도형 뿐이고, 기본이 먼저다", () => {
    expect(PDP_IMAGE_MODELS.map((model) => model.id)).toEqual(["gpt-image-2.5-flare", "nano-banana-pro", "nano-banana-2.1"]);
    expect(DEFAULT_IMAGE_MODEL).toBe("gpt-image-2.5-flare");
  });

  it("등급 이름으로 보인다 — 실제 모델 이름을 쓰지 않는다", () => {
    expect(PDP_IMAGE_MODELS.map((model) => model.label)).toEqual(["표준형", "디테일형", "속도형"]);
    for (const model of PDP_IMAGE_MODELS) expect(model.label).not.toMatch(/GPT|Nano|Banana/);
  });

  it("다른 모델로 저장된 작업은 기본 모델로 연다", () => {
    for (const old of ["nano-banana", "nano-banana-2", "gpt-image-2", "seedream-5-pro", "모르는값", undefined, null]) {
      expect(pdpImageModelOrDefault(old)).toBe("gpt-image-2.5-flare");
    }
    expect(pdpImageModelOrDefault("nano-banana-pro")).toBe("nano-banana-pro");
    expect(pdpImageModelOrDefault("nano-banana-2.1")).toBe("nano-banana-2.1");
  });

  it("셋 말고는 그림 만들기 요청을 받지 않는다 — 안 보낸 것은 기본 모델이라 괜찮다", () => {
    for (const old of ["nano-banana", "nano-banana-2", "gpt-image-2"]) expect(isRetiredPdpModel(old)).toBe(true);
    for (const ok of ["gpt-image-2.5-flare", "nano-banana-pro", "nano-banana-2.1"]) expect(isRetiredPdpModel(ok)).toBe(false);
    expect(isRetiredPdpModel(undefined)).toBe(false);
  });
});

/*
  **처음 만들기 화면의 크레딧 안내가 실제 차감과 같다**(2026-10-08 독립 리뷰). 전에는 이 한 곳만 옛 계산·「장」
  단위를 써서, 운영(image-v2)에서 6섹션이면 「최대 30장」이라고 보였다 — 실제 차감은 6크레딧이다.
*/
describe("상세페이지 크레딧 안내", () => {
  it("이미지 만들기 안내는 모두 지금 요금 방식으로 계산하고 그 단위로 말한다", async () => {
    const { readFileSync } = await import("node:fs");
    const gallery = readFileSync(new URL("../../../app/create/SectionGallery.tsx", import.meta.url), "utf8");
    const calls = gallery.match(/imageCreditUnits\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) expect(call).toContain("{ policy: creditPolicy }");
    expect(gallery).not.toMatch(/imageCreditUnits\([^)]*\)\}장 차감/);
  });

  it("image-v2 에서는 세 모델 모두 한 장 1크레딧이다", async () => {
    const { imageCreditUnits } = await import("../../credit-cost");
    expect(imageCreditUnits("gpt-image-2.5-flare", 6, { policy: "image-v2" })).toBe(6);
    expect(imageCreditUnits("nano-banana-pro", 6, { policy: "image-v2" })).toBe(6);
    expect(imageCreditUnits("nano-banana-2.1", 6, { policy: "image-v2" })).toBe(6);
  });
});
