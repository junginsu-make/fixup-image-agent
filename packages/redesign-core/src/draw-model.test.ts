import { describe, expect, it, vi } from "vitest";
import { generateSections } from "./generate";
import { editSection } from "./edit-section";

/**
 * **글 모델에게 알리는 그림 모델이 실제로 그리는 모델이어야 한다**(2026-10-08).
 *
 * 리디자인도 세 모델(표준형·디테일형·속도형) 중에서 고른다. 전에는 프롬프트에
 * 「이미지 생성 모델: 정밀형 (gpt-image-2-2026-04-21)」이 박혀 있었다 — fal 로
 * gpt-image-2.5 나 Nano Banana 가 그리는데도 옛 직접 호출 id 를 알렸다.
 */

const 이미지 = { name: "원본.png", type: "image/png", buffer: Buffer.from("AAA") };
const 분석 = {
  product_inferred: { category: "보습 크림", confidence: 0.8 },
  diagnostic_summary: "원본은 글자가 작다",
  strategy: "효능을 근거와 함께 앞세운다",
  page_blueprint: [{ section_id: "S1", name: "히어로" }],
  verified_facts: ["용량 50ml"],
};

const 그린다 = () => {
  const 프롬프트: string[] = [];
  const generateImage = async (request: { prompt: string }) => {
    프롬프트.push(request.prompt);
    return { buffer: Buffer.from("IMG"), mimeType: "image/png" };
  };
  return { 프롬프트, generateImage };
};

const 생성입력 = (over: Record<string, unknown> = {}) => ({
  model: "google", googleKey: "g-test", files: [이미지] as never,
  request: "밝게", channel: "smartstore", ratio: "9:16", count: 1, startSection: 1,
  analysis: 분석, onUsage: () => {}, onImageUsage: () => {},
  ...over,
});

describe("리디자인 생성 — 실제로 그리는 모델을 알린다", () => {
  it("**그리는 모델을 주면 그 이름과 엔드포인트가 프롬프트에 실린다**", async () => {
    const { 프롬프트, generateImage } = 그린다();
    const drawModel = { id: "nano-banana-2.1", endpoint: "nano-banana-2.1 (google/nano-banana-2.1/edit)" };

    const result = await generateSections(생성입력({ generateImage, drawModel }) as never);

    expect(프롬프트[0]).toContain("이미지 생성 모델: 속도형 (nano-banana-2.1 (google/nano-banana-2.1/edit))");
    expect(프롬프트[0]).not.toContain("gemini-3.1-flash-image-preview");
    expect(result.project.modelLabel).toBe("속도형");
    expect(result.project.imageModel).toBe("nano-banana-2.1");
  });

  it("**같은 Google 분석이라도 디테일형이면 디테일형이라 알린다**", async () => {
    const { 프롬프트, generateImage } = 그린다();
    const drawModel = { id: "nano-banana-pro", endpoint: "nano-banana-pro (fal-ai/nano-banana-pro/edit)" };

    const result = await generateSections(생성입력({ generateImage, drawModel }) as never);

    expect(프롬프트[0]).toContain("이미지 생성 모델: 디테일형");
    expect(result.project.modelLabel).toBe("디테일형");
  });

  it("**옛 이름 「정밀형」·「속도형(옛 Google)」을 쓰지 않는다** — 그리는 모델을 모르면 이전 방식", async () => {
    const { 프롬프트, generateImage } = 그린다();

    const result = await generateSections(생성입력({ model: "openai", openaiKey: "sk", generateImage }) as never);

    expect(프롬프트[0]).not.toContain("정밀형");
    expect(result.project.modelLabel).not.toBe("정밀형");
  });

  it("**키가 없을 때의 말에 옛 이름이 없다**", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("부르면 안 된다"); });
    try {
      await expect(generateSections(생성입력({ googleKey: "", drawModel: { id: "nano-banana-2.1", endpoint: "x" } }) as never))
        .rejects.toThrow(/속도형/);
      await expect(generateSections(생성입력({ model: "openai", openaiKey: "" }) as never))
        .rejects.toThrow(/^(?!.*정밀형).*API 키/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("리디자인 섹션 고치기 — 옛 이름을 쓰지 않는다", () => {
  const 그림 =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("**키가 없으면 고른 모델 이름으로 말한다**", async () => {
    await expect(editSection({
      model: "google", imageUrl: 그림, request: "밝게", googleKey: "",
      drawModel: { id: "nano-banana-pro", endpoint: "x" }, onImageUsage: () => {},
    } as never)).rejects.toThrow(/디테일형/);
  });

  it("**모델을 모르면 옛 이름 없이 말한다**", async () => {
    await expect(editSection({ model: "openai", imageUrl: 그림, request: "밝게", openaiKey: "", onImageUsage: () => {} } as never))
      .rejects.toThrow(/^(?!.*정밀형).*API 키/);
  });
});
