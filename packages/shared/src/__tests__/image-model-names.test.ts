import { describe, expect, it } from "vitest";
import {
  IMAGE_MODEL_NAMES, VISIBLE_IMAGE_MODEL_IDS, RETIRED_MODEL_NAME,
  imageModelName, imageModelStrength, imageModelSummary, isVisibleImageModel,
} from "../image-model-names";

describe("그림 모델 이름표", () => {
  it("보이는 것은 셋 — 표준형·디테일형·속도형 차례", () => {
    expect(VISIBLE_IMAGE_MODEL_IDS).toEqual(["gpt-image-2.5-flare", "nano-banana-pro", "nano-banana-2.1"]);
    expect(VISIBLE_IMAGE_MODEL_IDS.map(imageModelName)).toEqual(["표준형", "디테일형", "속도형"]);
  });

  it("숨긴 모델은 모두 「이전 방식」", () => {
    for (const id of ["gpt-image-2.5-sunburst", "gpt-image-2", "nano-banana-2", "nano-banana", "seedream-5-pro", "qwen-image-2-pro"]) {
      expect(isVisibleImageModel(id)).toBe(false);
      expect(imageModelName(id)).toBe(RETIRED_MODEL_NAME);
    }
  });

  it("모르는 id 는 원본을 돌려주지 않는다", () => {
    expect(imageModelName("some-new-model")).toBe("이전 방식");
    expect(imageModelName(undefined)).toBe("—");
  });

  it("설명은 견주는 말 없이 그 모델의 장점만", () => {
    for (const id of VISIBLE_IMAGE_MODEL_IDS) {
      const text = imageModelSummary(id);
      expect(text).toContain("특히");
      expect(text).not.toMatch(/보다|에 비해|느립|약합|못 /);
    }
  });

  it("짧은 말은 보이는 셋에만 있다", () => {
    for (const id of VISIBLE_IMAGE_MODEL_IDS) expect(imageModelStrength(id)).not.toBe("");
    for (const entry of IMAGE_MODEL_NAMES.filter((e) => !e.visible)) expect(imageModelStrength(entry.id)).toBe("");
    expect(imageModelStrength("unknown")).toBe("");
  });

  it("한 id 는 한 번만 적힌다", () => {
    const ids = IMAGE_MODEL_NAMES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
