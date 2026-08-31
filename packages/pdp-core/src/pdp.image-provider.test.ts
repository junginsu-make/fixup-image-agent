import { describe, expect, it } from "vitest";
import {
  buildFalPayload,
  chunkForModel,
  creditUnitsFor,
  maxBatchSizeFor,
  resolveEndpoint,
  type FalPayload,
} from "./pdp.image-provider";
import { IMAGE_MODELS, type ImageModelId, type ReferenceImage } from "./types";

const anchor: ReferenceImage = { kind: "anchor", base64: "AAAA", mimeType: "image/jpeg" };
const style: ReferenceImage = { kind: "style", base64: "BBBB", mimeType: "image/png" };

const base = {
  prompt: '{"task":"korean_ecommerce_detail_page_section"}',
  systemPrompt: "You are an art director.",
  aspectRatio: "9:16" as const,
  references: [] as ReferenceImage[],
};

describe("엔드포인트 선택", () => {
  // 참조 이미지가 있으면 edit, 없으면 text-to-image 로 간다.
  it("참조가 없으면 text-to-image", () => {
    expect(resolveEndpoint("gpt-image-2", [])).toBe("openai/gpt-image-2");
    expect(resolveEndpoint("nano-banana-pro", [])).toBe("fal-ai/nano-banana-pro");
    expect(resolveEndpoint("nano-banana", [])).toBe("fal-ai/nano-banana");
  });

  it("참조가 있으면 edit 엔드포인트", () => {
    expect(resolveEndpoint("gpt-image-2", [anchor])).toBe("openai/gpt-image-2/edit");
    expect(resolveEndpoint("nano-banana-pro", [anchor])).toBe("fal-ai/nano-banana-pro/edit");
  });
});

describe("GPT Image 2 페이로드", () => {
  it("픽셀 크기와 high 품질을 쓴다", () => {
    const p = buildFalPayload("gpt-image-2", base) as FalPayload & {
      image_size: { width: number; height: number };
    };
    // 문서 제약: 16의 배수, 최대변 3840, 비율 ≤3:1, 픽셀 655,360~8,294,400
    expect(p.image_size.width % 16).toBe(0);
    expect(p.image_size.height % 16).toBe(0);
    expect(p.image_size.width * p.image_size.height).toBeLessThanOrEqual(8_294_400);
    expect(p.image_size.width * p.image_size.height).toBeGreaterThanOrEqual(655_360);
    expect(p.quality).toBe("high");
  });

  it("aspect_ratio 를 쓰지 않는다 (GPT 는 픽셀 지정)", () => {
    expect(buildFalPayload("gpt-image-2", base)).not.toHaveProperty("aspect_ratio");
  });

  it("참조 이미지를 image_urls 에 data URI 로 싣는다", () => {
    const p = buildFalPayload("gpt-image-2", { ...base, references: [anchor, style] }) as FalPayload & {
      image_urls: string[];
    };
    expect(p.image_urls).toHaveLength(2);
    expect(p.image_urls[0]).toBe("data:image/jpeg;base64,AAAA");
    expect(p.image_urls[1]).toBe("data:image/png;base64,BBBB");
  });

  it("참조가 16장을 넘으면 잘라낸다 (문서 상한)", () => {
    const many = Array.from({ length: 20 }, () => anchor);
    const p = buildFalPayload("gpt-image-2", { ...base, references: many }) as FalPayload & {
      image_urls: string[];
    };
    expect(p.image_urls).toHaveLength(16);
  });

  it("system_prompt 를 지원하지 않으므로 프롬프트에 합친다", () => {
    const p = buildFalPayload("gpt-image-2", base);
    expect(p).not.toHaveProperty("system_prompt");
    expect(String(p.prompt)).toContain("You are an art director.");
  });
});

describe("Nano Banana Pro 페이로드", () => {
  it("aspect_ratio 와 2K 해상도를 쓴다", () => {
    const p = buildFalPayload("nano-banana-pro", base);
    expect(p.aspect_ratio).toBe("9:16");
    expect(p.resolution).toBe("2K");
  });

  it("system_prompt 를 분리해 싣는다 — 실측에서 시간이 40% 줄었다", () => {
    const p = buildFalPayload("nano-banana-pro", base);
    expect(p.system_prompt).toBe("You are an art director.");
    expect(String(p.prompt)).not.toContain("You are an art director.");
  });

  it("픽셀 크기를 쓰지 않는다", () => {
    expect(buildFalPayload("nano-banana-pro", base)).not.toHaveProperty("image_size");
  });
});

describe("Nano Banana 페이로드", () => {
  it("aspect_ratio 만 쓰고 해상도·시스템 프롬프트는 없다", () => {
    const p = buildFalPayload("nano-banana", base);
    expect(p.aspect_ratio).toBe("9:16");
    expect(p).not.toHaveProperty("resolution");
    expect(p).not.toHaveProperty("system_prompt");
  });
});

describe("화면비 매핑", () => {
  it("모든 화면비가 GPT 의 픽셀 제약을 만족한다", () => {
    for (const ratio of ["1:1", "3:4", "4:3", "9:16", "16:9"] as const) {
      const p = buildFalPayload("gpt-image-2", { ...base, aspectRatio: ratio }) as FalPayload & {
        image_size: { width: number; height: number };
      };
      const px = p.image_size.width * p.image_size.height;
      expect(p.image_size.width % 16, `${ratio} width`).toBe(0);
      expect(p.image_size.height % 16, `${ratio} height`).toBe(0);
      expect(px, `${ratio} pixels`).toBeGreaterThanOrEqual(655_360);
      expect(px, `${ratio} pixels`).toBeLessThanOrEqual(8_294_400);
      expect(Math.max(p.image_size.width, p.image_size.height)).toBeLessThanOrEqual(3840);
    }
  });

  it("Nano Banana 계열은 화면비를 그대로 넘긴다", () => {
    expect(buildFalPayload("nano-banana-pro", { ...base, aspectRatio: "3:4" }).aspect_ratio).toBe("3:4");
  });
});

describe("크레딧 계산", () => {
  it("모델별 가중치 × 장수", () => {
    expect(creditUnitsFor("gpt-image-2", 6)).toBe(24);
    expect(creditUnitsFor("nano-banana-pro", 6)).toBe(18);
    expect(creditUnitsFor("nano-banana", 6)).toBe(6);
  });

  it("한 장이면 가중치 그대로", () => {
    expect(creditUnitsFor("gpt-image-2", 1)).toBe(4);
  });

  // 마이그레이션으로 상한을 60 으로 올린다. 최대 7섹션 × 4 = 28 이 들어가야 한다.
  it("최대 조합이 상한 60 을 넘지 않는다", () => {
    expect(creditUnitsFor("gpt-image-2", 7)).toBeLessThanOrEqual(60);
  });
});

describe("묶음 크기", () => {
  it("GPT 는 3장, 나머지는 6장", () => {
    expect(maxBatchSizeFor("gpt-image-2")).toBe(3);
    expect(maxBatchSizeFor("nano-banana-pro")).toBe(6);
    expect(maxBatchSizeFor("nano-banana")).toBe(6);
  });

  it("모르는 모델은 가장 보수적인 값으로 떨어진다", () => {
    expect(maxBatchSizeFor("made-up-model" as ImageModelId)).toBe(3);
  });

  // 함수 상한이 300초다. 한 묶음이 여기 닿으면 예약한 크레딧이 finalize 되지 못한다.
  // 실측(6장 기준)을 묶음 크기로 환산해 여유가 남는지 본다.
  it("모든 모델의 한 묶음이 300초 상한 안에 넉넉히 들어간다", () => {
    const 실측6장 = { "gpt-image-2": 288, "nano-banana-pro": 112, "nano-banana": 90 } as const;

    for (const model of IMAGE_MODELS) {
      const 묶음소요 = (실측6장[model.id] / 6) * model.maxBatchSize;
      expect(묶음소요).toBeLessThan(300 * 0.7);
    }
  });

  it("안내에 쓰는 예상 소요가 실제 묶음 크기와 어긋나지 않는다", () => {
    const gpt = IMAGE_MODELS.find((m) => m.id === "gpt-image-2")!;
    expect(gpt.expectedBatchSeconds).toBe(150); // 288초 6장 → 3장이면 절반
    expect(gpt.maxBatchSize).toBe(3);
  });
});

describe("묶음 나누기", () => {
  it("모델 상한대로 자른다", () => {
    expect(chunkForModel([1, 2, 3, 4, 5, 6], "gpt-image-2")).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(chunkForModel([1, 2, 3, 4, 5, 6], "nano-banana-pro")).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("나누어떨어지지 않으면 마지막 묶음이 짧다", () => {
    expect(chunkForModel([1, 2, 3, 4], "gpt-image-2")).toEqual([[1, 2, 3], [4]]);
  });

  it("빈 목록은 묶음도 없다", () => {
    expect(chunkForModel([], "gpt-image-2")).toEqual([]);
  });

  it("장수를 잃거나 순서를 바꾸지 않는다", () => {
    const 원본 = [1, 2, 3, 4, 5, 6, 7];
    expect(chunkForModel(원본, "gpt-image-2").flat()).toEqual(원본);
  });
});
