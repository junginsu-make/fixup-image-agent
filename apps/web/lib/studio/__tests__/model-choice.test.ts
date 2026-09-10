import { describe, expect, it } from "vitest";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { feasibleModels, type ModelNeed } from "../model-choice";

const need: ModelNeed = { attachmentCount: 2, ratioId: "4:5", variants: 4 };

/**
 * 목록에 모델이 하나 늘 때마다 고칠 숫자를 여기 두지 않는다.
 *
 * 전에는 `toHaveLength(4)` 와 `toEqual(["gpt-image-2"])` 처럼 **그때의 목록**을
 * 박아 뒀다. 그러면 모델을 하나 더할 때 같이 깨지는데, 그건 회귀가 아니라
 * 잡음이라 다음 사람이 숫자만 바꾸고 지나간다 — 정작 걸러내기가 망가져도
 * 같은 모양으로 깨져서 구별이 안 된다. 그래서 **관계를 잠근다.**
 */
const 픽셀모델 = IMAGE_MODELS.filter((model) => model.pixelSizeLimits).map((model) => model.id);

describe("쓸 수 있는 모델만 남긴다", () => {
  it("조건이 무난하면 다 남는다", () => {
    const result = feasibleModels({ ...need, variants: 1 });
    expect(result.usable).toHaveLength(IMAGE_MODELS.length);
  });

  it("첨부가 많으면 못 받는 모델을 뺀다", () => {
    // nano-banana 는 7장까지다. 넘겨서 보내면 그냥 실패한다.
    const result = feasibleModels({ ...need, attachmentCount: 10 });
    expect(result.usable.map((entry) => entry.id)).not.toContain("nano-banana");
    expect(result.usable.map((entry) => entry.id)).toContain("gpt-image-2");
  });

  it("왜 뺐는지 남긴다", () => {
    // 이유가 없으면 사용자에게 "그 모델은 왜 안 되나요"를 답할 수 없다.
    const result = feasibleModels({ ...need, attachmentCount: 10 });
    const dropped = result.dropped.find((entry) => entry.id === "nano-banana");
    expect(dropped?.reason).toMatch(/7장/);
  });

  it("모델이 지원하지 않는 비율은 뺀다", () => {
    // 4:1 은 nano-banana-2 만 받는다.
    const result = feasibleModels({ ...need, ratioId: "4:1" });
    expect(result.usable.map((entry) => entry.id)).toContain("nano-banana-2");
    expect(result.usable.map((entry) => entry.id)).not.toContain("nano-banana-pro");
  });

  it("픽셀을 직접 지정해야 하는 규격은 픽셀 모델만 남는다", () => {
    // A4 인쇄용이 그렇다(POSTER_RATIOS 의 pixelOnly).
    expect(픽셀모델.length).toBeGreaterThan(0);
    const result = feasibleModels({ ...need, pixelOnly: true });
    expect(result.usable.map((entry) => entry.id)).toEqual(픽셀모델);
  });

  it("한 번에 여러 장을 못 만드는 모델은 그 이유로 빠진다", () => {
    // nano-banana 는 batchMax 가 1 이다. 4장을 한 번에 달라고 하면 못 한다.
    const result = feasibleModels({ ...need, variants: 4 });
    const dropped = result.dropped.find((entry) => entry.id === "nano-banana");
    expect(dropped?.reason ?? "").toMatch(/한 번에|1장/);
  });

  it("한 장씩이면 batchMax 로 빼지 않는다", () => {
    const result = feasibleModels({ ...need, variants: 1 });
    expect(result.usable.map((entry) => entry.id)).toContain("nano-banana");
  });
});

describe("고르는 것은 코드가 하지 않는다", () => {
  it("남은 것에 값과 성질을 붙여 준다", () => {
    // 코드는 못 쓰는 것만 걸러낸다. 그중에서 무엇이 좋을지는 LLM 이 정한다.
    const [first] = feasibleModels({ ...need, variants: 1 }).usable;
    expect(first).toHaveProperty("label");
    expect(first).toHaveProperty("approxUsd");
    expect(typeof first?.approxUsd).toBe("number");
  });

  it("모르는 비율이어도 픽셀 모델은 남는다", () => {
    // GPT 계열은 비율 목록이 아니라 픽셀을 받는다. 목록에 없다고 못 만드는 게 아니다.
    const result = feasibleModels({ ...need, ratioId: "없는비율" });
    expect(result.usable.map((entry) => entry.id)).toEqual(픽셀모델);
  });

  it("아무것도 못 쓰면 빈 목록을 준다", () => {
    // 참고 그림 20장은 어느 모델도 못 받는다(가장 많이 받는 것이 16장).
    const result = feasibleModels({ ...need, attachmentCount: 20 });
    expect(result.usable).toEqual([]);
    expect(result.dropped).toHaveLength(IMAGE_MODELS.length);
  });
});
