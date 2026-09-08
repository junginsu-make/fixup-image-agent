import { describe, expect, it } from "vitest";
import {
  buildFalPayload,
  chunkForModel,
  maxBatchSizeFor,
  resolveEndpoint,
  type FalPayload,
} from "./pdp.image-provider";
import { selectCharacterModel } from "./pdp.character";
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
    // 앞의 셋은 6장 동시 배치 실측이다.
    // 뒤의 셋은 2026-09-03 에 **한 장씩** 재서 6배로 환산했다 — 동시 배치가
    // 완전 병렬이 아니라 실제로는 이보다 짧다. 크게 잡아 두는 쪽이 안전하다.
    //   nano-banana-2      Pro 와 같은 계열, Pro 보다 빠르다고 공표
    //   seedream-5-pro     edit 95초/장  ← 참조를 넣으면 느리다
    //   qwen-image-2-pro   edit 18초/장
    const 실측6장 = {
      "gpt-image-2": 288,
      "nano-banana-pro": 112,
      "nano-banana-2": 100,
      "nano-banana": 90,
      "seedream-5-pro": 95 * 6,
      "qwen-image-2-pro": 18 * 6,
    } as const;

    for (const model of IMAGE_MODELS) {
      const 묶음소요 = (실측6장[model.id] / 6) * model.maxBatchSize;
      expect(묶음소요, model.id).toBeLessThan(300 * 0.7);
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

describe("참조 이미지 장수 상한", () => {
  // 모델마다 받을 수 있는 장수가 다르다. 넘겨서 보내면 fal 이 거절하거나
  // 뒤쪽을 조용히 버린다 — 어느 쪽이든 사용자는 왜 안 반영됐는지 모른다.
  const many = (count: number): ReferenceImage[] =>
    Array.from({ length: count }, (_unused, index) => ({
      kind: "style" as const, base64: `B${index}`, mimeType: "image/png",
    }));

  it("모델마다 상한이 정해져 있다", () => {
    for (const model of IMAGE_MODELS) {
      expect(model.maxReferenceImages).toBeGreaterThan(0);
    }
  });

  it("상한을 넘으면 잘라서 보낸다 — nano 계열도", () => {
    // 전에는 GPT 만 잘랐고 nano 계열은 받은 만큼 다 보냈다.
    for (const model of IMAGE_MODELS) {
      const payload = buildFalPayload(model.id, {
        ...base, references: many(model.maxReferenceImages + 5),
      }) as FalPayload & { image_urls?: string[] };
      expect(payload.image_urls?.length).toBe(model.maxReferenceImages);
    }
  });

  it("상한 안이면 그대로 다 보낸다", () => {
    for (const model of IMAGE_MODELS) {
      const payload = buildFalPayload(model.id, { ...base, references: many(3) }) as FalPayload & {
        image_urls?: string[];
      };
      expect(payload.image_urls?.length).toBe(3);
    }
  });

  it("앞쪽을 남긴다", () => {
    // 순서가 곧 우선순위다. 정체성 기준이 앞에 온다.
    const payload = buildFalPayload("nano-banana", {
      ...base, references: [anchor, ...many(20)],
    }) as FalPayload & { image_urls?: string[] };
    expect(payload.image_urls?.[0]).toContain("image/jpeg");
  });
});

describe("특화 모델", () => {
  // 엔드포인트와 파라미터는 2026-09-03 운영 fal 키로 실제 호출해 확인했다.
  //   bytedance/seedream/v5/pro/text-to-image   200 · 약 10초
  //   bytedance/seedream/v5/pro/edit            200 · 약 95초
  //   fal-ai/qwen-image-2/pro/text-to-image     200 · 약 13초
  //   fal-ai/qwen-image-2/pro/edit              200 · 약 18초
  it("참조가 없으면 text-to-image, 있으면 edit", () => {
    expect(resolveEndpoint("seedream-5-pro", [])).toBe("bytedance/seedream/v5/pro/text-to-image");
    expect(resolveEndpoint("seedream-5-pro", [style])).toBe("bytedance/seedream/v5/pro/edit");
    expect(resolveEndpoint("qwen-image-2-pro", [])).toBe("fal-ai/qwen-image-2/pro/text-to-image");
    expect(resolveEndpoint("qwen-image-2-pro", [style])).toBe("fal-ai/qwen-image-2/pro/edit");
  });

  it("비율을 image_size 이름으로 보낸다", () => {
    // 이 둘은 aspect_ratio 를 모른다. fal 의 preset 이름을 쓴다.
    // fal 의 이름은 헷갈린다 — portrait_4_3 이 세로 3:4 다.
    for (const model of ["seedream-5-pro", "qwen-image-2-pro"] as const) {
      const payload = buildFalPayload(model, { ...base, aspectRatio: "3:4" }) as FalPayload & {
        image_size?: string;
      };
      expect(payload.image_size).toBe("portrait_4_3");
      expect(payload).not.toHaveProperty("aspect_ratio");
    }
  });

  it("모든 비율에 이름이 있다", () => {
    // 하나라도 비면 그 비율에서 요청이 기본값으로 떨어져 다른 크기가 나온다.
    for (const aspectRatio of ["1:1", "3:4", "4:3", "9:16", "16:9"] as const) {
      const payload = buildFalPayload("seedream-5-pro", { ...base, aspectRatio }) as FalPayload & {
        image_size?: string;
      };
      expect(payload.image_size).toBeTruthy();
    }
  });

  it("참조 상한이 10장이다", () => {
    // Seedream 은 참조를 10장까지 받는다. nano 계열(14)보다 좁다.
    const many = Array.from({ length: 15 }, (): ReferenceImage => style);
    const payload = buildFalPayload("seedream-5-pro", { ...base, references: many }) as FalPayload & {
      image_urls?: string[];
    };
    expect(payload.image_urls?.length).toBe(10);
  });
});

describe("결에 맞는 모델", () => {
  it("결마다 정해진 모델이 있다", () => {
    for (const look of ["photoreal", "anime", "3d", "illustration"] as const) {
      expect(selectCharacterModel(look)).toBeTruthy();
    }
  });

  it("실사는 Nano Banana Pro 다", () => {
    // 코드에 남은 실측 결론이다. 바꾸려면 비교를 먼저 한다.
    expect(selectCharacterModel("photoreal")).toBe("nano-banana-pro");
  });

  it("옛 boolean 호출을 그대로 받는다", () => {
    expect(selectCharacterModel(true)).toBe("nano-banana-pro");
    expect(selectCharacterModel(false)).not.toBe("nano-banana-pro");
  });
});
