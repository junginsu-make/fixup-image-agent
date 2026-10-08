import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "@fixup/pdp-core";

/**
 * **상세페이지에서는 나노바나나 일반판(경제형)을 고를 수 없다**(2026-10-07 사용자 지시).
 *
 * 운영 기록에서 상세페이지 품질 검사를 3번 다 떨어졌다(다른 모델은 31번 다 통과).
 * 다른 화면(스튜디오·카드뉴스·쉽게)은 계속 쓰므로 모델 목록 자체에서는 지우지 않는다.
 */
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { id: "u1", status: "active" } } }),
}));

const { PDP_IMAGE_MODELS, PDP_RETIRED_MODEL_MESSAGE, pdpImageModelOrDefault } = await import("../image-models");
const { readPdpRequest } = await import("../request");

const post = (body: unknown) =>
  new Request("http://localhost/api/pdp/images", { method: "POST", body: JSON.stringify(body) });
const section = { section_id: "S1", prompt_en: "scene" };

describe("상세페이지 모델 목록", () => {
  it("상세페이지도 세 모델·등급 이름", () => {
    expect(PDP_IMAGE_MODELS.map((m) => m.label)).toEqual(["표준형", "디테일형", "속도형"]);
  });

  it("나노바나나 일반판과 캐릭터 전용 모델은 빠진다", () => {
    const ids = PDP_IMAGE_MODELS.map((model) => model.id);
    expect(ids).not.toContain("nano-banana");
    expect(PDP_IMAGE_MODELS.some((model) => model.characterOnly)).toBe(false);
    expect(ids).toContain(DEFAULT_IMAGE_MODEL);
  });

  it("다른 화면이 쓰는 전체 목록에는 남는다", () => {
    expect(IMAGE_MODELS.some((model) => model.id === "nano-banana")).toBe(true);
  });

  it("저장된 옛 선택·모르는 값은 기본 모델로 연다", () => {
    expect(pdpImageModelOrDefault("nano-banana")).toBe(DEFAULT_IMAGE_MODEL);
    expect(pdpImageModelOrDefault(undefined)).toBe(DEFAULT_IMAGE_MODEL);
    expect(pdpImageModelOrDefault("없는-모델")).toBe(DEFAULT_IMAGE_MODEL);
    // 2026-10-08 오후 사용자 결정: 상세페이지는 보이는 셋만 — 정밀형·속도형 라이트(nano-banana-2)는 기본 모델로 연다.
    expect(pdpImageModelOrDefault("nano-banana-2")).toBe(DEFAULT_IMAGE_MODEL);
    expect(pdpImageModelOrDefault("nano-banana-2.1")).toBe("nano-banana-2.1");
    expect(pdpImageModelOrDefault("gpt-image-2")).toBe(DEFAULT_IMAGE_MODEL);
    expect(pdpImageModelOrDefault("nano-banana-pro")).toBe("nano-banana-pro");
  });
});

describe("서버도 나노바나나 일반판 상세페이지 그림 요청을 받지 않는다", () => {
  const cases = [
    ["single", (imageModel: string) => ({ originalImageBase64: "AAAA", section, page: { imageModel } })],
    ["batch", (imageModel: string) => ({ originalImageBase64: "AAAA", sections: [section], page: { imageModel } })],
    ["keyVisual", (imageModel: string) => ({ imageModel, brief: { offeringName: "상품" }, blueprint: { sections: [section] } })],
  ] as const;

  for (const [kind, body] of cases) {
    it(`${kind}: 거절하고 새로고침하라고 알린다`, async () => {
      const result = await readPdpRequest(post(body("nano-banana")), kind);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(400);
      expect((await result.response.json()).message).toContain("새로고침");
    });

    it(`${kind}: 보이는 셋(표준형·디테일형·속도형)은 받는다`, async () => {
      for (const model of ["gpt-image-2.5-flare", "nano-banana-pro", "nano-banana-2.1"]) {
        const result = await readPdpRequest(post(body(model)), kind);
        expect(result.ok).toBe(true);
      }
    });

    it(`${kind}: 보이는 셋 밖(정밀형·속도형 라이트)도 거절한다`, async () => {
      for (const model of ["gpt-image-2", "nano-banana-2"]) {
        const result = await readPdpRequest(post(body(model)), kind);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect((await result.response.json()).message).toBe(PDP_RETIRED_MODEL_MESSAGE);
      }
    });
  }
});
