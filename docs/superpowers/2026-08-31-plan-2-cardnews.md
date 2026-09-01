# 계획 2 — 카드뉴스 만들기

> **작업자에게:** 태스크를 순서대로 **하나씩** 합니다. 각 태스크의 Step 을 순서대로 지키세요 —
> 테스트 먼저 → 실패 확인 → 최소 구현 → 통과 확인 → 커밋. 진행은 체크박스(`- [ ]`)로 표시합니다.
>
> Claude Code 로 실행한다면 `superpowers:subagent-driven-development` 또는
> `superpowers:executing-plans` 스킬을 쓰세요. **다른 환경이면 위 순서를 그대로 따르면 됩니다 —
> 스킬은 필수가 아닙니다.**

**Goal:** 내용과 참고 이미지를 받아 카드뉴스 여러 장을 만든다. 레퍼런스를 실제로 닮게 만드는 것이 목표다.

**Architecture:** `packages/sns-core` 에 도메인을 담고 `apps/web/app/sns` 에 화면을 둔다. 기존 CardForge 의 실패를 되풀이하지 않기 위해 셋을 바꾼다 — **앵커를 넣지 않고**, **목적(goal) 을 이미지 프롬프트에 넣지 않고**, **LLM 이 이미지 프롬프트를 직접 쓴다**. 원본 참고 이미지는 항상 fal 에 함께 넘어간다.

**Tech Stack:** pnpm 모노레포 · Next.js App Router · TypeScript · shadcn/ui · zod · vitest · Supabase · fal.ai · Anthropic(기획·원고) · OpenAI(백업·검수)

**Spec:** `docs/2026-08-31-sns-integration-design.md` (§6)

**Prerequisite:** 계획 1 이 끝나 있어야 한다. 로컬 Supabase 가 떠 있어야 한다(계획 1 Task 2). 라이브러리 묶음 세트와 수집함이 없으면 이 계획의 절반이 성립하지 않는다.

## Global Constraints

- **앵커를 만들지 않는다.** 이전 카드 결과를 다음 카드 입력에 넣지 않는다. 기존 CardForge 가 `Match its palette... exactly. Only the content differs.` 로 속지를 표지 복사본으로 만들었다.
- **목적(goal) 프리셋과 「목적 관리」 화면을 만들지 않는다.** 말투는 입력 화면의 한 줄 메모로 받는다.
- **첨부 이미지를 분석해 재구성하지 않는다.** 2026-07-30 결정 — *"이미지 생성 모델에 그냥 첨부해서 생성하게 하는 게 좋다"*. LLM 이 쓴 문장은 지시를 얹는 것이지 원본을 대체하지 않는다. **원본은 항상 함께 넘어간다.**
- **fal 은 이미지별 역할 라벨을 받지 않는다.** `image_urls` 배열뿐이다. 역할은 **프롬프트 문장으로만** 전달된다.
- **우선순위를 프롬프트에 명시한다.** 그대로 넣을 것 > 따라 만들 카드뉴스 > 장면 지시.
- **엔드포인트는 코드가 고른다.** `imageUrls.length > 0 ? i2i : t2i`. 사용자에게 묻지 않는다.
- **해상도 선택을 노출하지 않는다.** nano 는 2K 고정, GPT 는 비율별 픽셀 고정.
- **`quality` 는 `high` 고정.** 웹 검색·`thinking_level` 을 켜지 않는다.
- **비용은 생성 요청 한 행에만 기록한다.** 카드마다 복제하면 8장에서 합계가 8배가 된다.
- **자동 재생성을 하지 않는다.** 검수가 반려해도 사람이 누를 때만 다시 만든다.
- **씨앗 저장소의 스키마 규약을 따른다.** 소유자 칸은 `user_id`, 참조는 `public.profiles(id)`,
  RLS 는 `(select auth.uid()) = user_id`. 컬럼 권한은 회수 먼저, 허용 목록 나중에.
- **이미지는 Storage 버킷 `library` 에 `{user_id}/sns/{project_id}/{index}.png` 로 넣는다.**
  로컬 디스크에 쓰지 않는다. 경로 첫 칸이 `user_id` 라 기존 Storage 정책이 그대로 적용된다.
- **`place_as_is` 와 사용자가 올린 마지막 장은 검수하지 않는다.** AI 를 거치지 않은 원본이다.
- **「원본 그대로 쓸 장」의 위치는 사람이 정한다.** AI 에게 맡기지 않는다.
- **운영 Supabase 와 EC2 를 건드리지 않는다.** 마이그레이션은 `pnpm db:reset` 으로 로컬에만 적용한다.
  `supabase db push` 금지. 운영 적용과 배포는 **계획 4** 에서 마지막에 한다.
- 명령: `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm db:reset`

---

# Phase 1 — 모델과 크기

## Task 1: 이미지 모델 레지스트리

t2i 와 i2i 는 다른 엔드포인트이고 **GPT Image 2 는 단가도 다르다.**

**Files:**
- Create: `packages/sns-core/src/models.ts`
- Test: `packages/sns-core/src/__tests__/models.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `IMAGE_MODELS: ImageModel[]` · `pickEndpoint(model, hasReferences)` · `unitPrice(model, mode, size)` · 타입 `ImageModel` · `ImageMode = "t2i" | "i2i"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/sns-core/src/__tests__/models.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, pickEndpoint, unitPrice, modelById } from "../models";

describe("모델 목록", () => {
  it("넷을 담는다", () => {
    expect(IMAGE_MODELS.map((model) => model.id)).toEqual([
      "gpt-image-2", "nano-banana-pro", "nano-banana-2", "nano-banana",
    ]);
  });

  it("GPT Image 2 가 기본이다", () => {
    expect(IMAGE_MODELS[0]!.id).toBe("gpt-image-2");
    expect(IMAGE_MODELS[0]!.isDefault).toBe(true);
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`packages/sns-core/src/models.ts`:

```ts
export type ImageMode = "t2i" | "i2i";

export interface PixelSize { width: number; height: number }

export interface PriceRow { width: number; height: number; usd: number }

export interface ModeSpec {
  endpoint: string;
  /** 고정 단가 모델. nano 계열. */
  flatUsd?: number;
  /** 크기별 표. GPT Image 2. high 품질 기준. */
  table?: PriceRow[];
}

export interface ImageModel {
  id: string;
  label: string;
  isDefault?: boolean;
  t2i: ModeSpec;
  i2i: ModeSpec;
  maxReferenceImages: number;
  batchMax: number;
  /** 열거로 비율을 받는 모델. 픽셀 지정 모델은 비운다. */
  supportedRatios?: string[];
  /** 픽셀을 직접 지정하는 모델의 제약. */
  pixelSizeLimits?: { minPixels: number; maxPixels: number; maxEdge: number; multipleOf: number; maxAspect: number };
  /** nano 계열이 쓰는 고정 해상도. 사용자에게 노출하지 않는다. */
  fixedResolution?: "0.5K" | "1K" | "2K" | "4K";
  /** 고정 해상도에 곱할 배수. */
  resolutionMultiplier?: number;
}

/** fal 모델 페이지 공표값 (2026-08-31 확인). high 품질 기준. */
const GPT_T2I: PriceRow[] = [
  { width: 1024, height: 768, usd: 0.145 },
  { width: 1024, height: 1024, usd: 0.211 },
  { width: 1024, height: 1536, usd: 0.165 },
  { width: 1920, height: 1080, usd: 0.158 },
  { width: 2560, height: 1440, usd: 0.222 },
  { width: 3840, height: 2160, usd: 0.401 },
];

const GPT_I2I: PriceRow[] = [
  { width: 1024, height: 768, usd: 0.151 },
  { width: 1024, height: 1024, usd: 0.219 },
  { width: 1024, height: 1536, usd: 0.178 },
  { width: 1920, height: 1080, usd: 0.158 },
  { width: 2560, height: 1440, usd: 0.234 },
  { width: 3840, height: 2160, usd: 0.413 },
];

const NANO_RATIOS_15 = ["auto","21:9","16:9","3:2","4:3","5:4","1:1","4:5","3:4","2:3","9:16","4:1","1:4","8:1","1:8"];
const NANO_RATIOS_11 = ["auto","21:9","16:9","3:2","4:3","5:4","1:1","4:5","3:4","2:3","9:16"];

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    isDefault: true,
    t2i: { endpoint: "openai/gpt-image-2", table: GPT_T2I },
    i2i: { endpoint: "openai/gpt-image-2/edit", table: GPT_I2I },
    maxReferenceImages: 16,
    batchMax: 4,
    pixelSizeLimits: { minPixels: 655360, maxPixels: 8294400, maxEdge: 3840, multipleOf: 16, maxAspect: 3 },
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    t2i: { endpoint: "fal-ai/nano-banana-pro", flatUsd: 0.15 },
    i2i: { endpoint: "fal-ai/nano-banana-pro/edit", flatUsd: 0.15 },
    maxReferenceImages: 14,
    batchMax: 4,
    supportedRatios: NANO_RATIOS_11,
    fixedResolution: "2K",
    resolutionMultiplier: 1,
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    t2i: { endpoint: "fal-ai/nano-banana-2", flatUsd: 0.08 },
    i2i: { endpoint: "fal-ai/nano-banana-2/edit", flatUsd: 0.08 },
    maxReferenceImages: 14,
    batchMax: 4,
    supportedRatios: NANO_RATIOS_15,
    fixedResolution: "2K",
    resolutionMultiplier: 1.5,
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    t2i: { endpoint: "fal-ai/nano-banana", flatUsd: 0.039 },
    i2i: { endpoint: "fal-ai/nano-banana/edit", flatUsd: 0.039 },
    maxReferenceImages: 7,
    batchMax: 1,
    supportedRatios: NANO_RATIOS_11,
  },
];

export function modelById(id: string): ImageModel {
  const found = IMAGE_MODELS.find((model) => model.id === id);
  if (!found) throw new Error(`모르는 모델입니다: ${id}`);
  return found;
}

/**
 * 어느 엔드포인트로 부를지.
 *
 * 사용자에게 묻지 않는다. 레퍼런스가 있으면 편집이고 없으면 생성이다.
 */
export function pickEndpoint(model: ImageModel, hasReferences: boolean): string {
  return hasReferences ? model.i2i.endpoint : model.t2i.endpoint;
}

/**
 * 표에서 요청 크기에 맞는 행을 고른다.
 *
 * 픽셀 수로 고르면 틀린다. 이 표는 픽셀에 비례하지 않는다 — 정사각형이 비싸다.
 * 가로세로비가 가장 가까운 행을 먼저 보고, 같으면 픽셀이 가까운 쪽을 쓴다.
 */
function pickRow(table: PriceRow[], size: PixelSize): PriceRow {
  const aspect = size.width / size.height;
  const pixels = size.width * size.height;
  return [...table].sort((first, second) => {
    const firstAspect = Math.abs(first.width / first.height - aspect);
    const secondAspect = Math.abs(second.width / second.height - aspect);
    if (Math.abs(firstAspect - secondAspect) > 0.05) return firstAspect - secondAspect;
    return Math.abs(first.width * first.height - pixels) - Math.abs(second.width * second.height - pixels);
  })[0]!;
}

/** 장당 단가. fal 이 공표한 값으로 계산한다. */
export function unitPrice(model: ImageModel, mode: ImageMode, size: PixelSize): number {
  const spec = mode === "i2i" ? model.i2i : model.t2i;
  if (spec.flatUsd !== undefined) {
    return Number((spec.flatUsd * (model.resolutionMultiplier ?? 1)).toFixed(4));
  }
  if (!spec.table) throw new Error(`${model.id} 에 단가 정보가 없습니다.`);
  return pickRow(spec.table, size).usd;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/models.ts packages/sns-core/src/__tests__/models.test.ts
git commit -m "feat(sns): 이미지 모델 레지스트리 — t2i/i2i 와 공표 단가"
```

---

## Task 2: 비율을 모델이 받는 값으로

**Files:**
- Create: `packages/sns-core/src/ratios.ts`
- Test: `packages/sns-core/src/__tests__/ratios.test.ts`

**Interfaces:**
- Consumes: `ImageModel` (Task 1)
- Produces: `CARD_RATIOS: RatioSpec[]` · `resolveSize(ratioId, model): ResolvedSize`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { CARD_RATIOS, resolveSize } from "../ratios";
import { modelById } from "../models";

describe("비율 목록", () => {
  it("넷을 제공한다", () => {
    expect(CARD_RATIOS.map((ratio) => ratio.id)).toEqual(["4:5", "1:1", "9:16", "16:9"]);
  });

  it("모든 픽셀이 GPT Image 2 제약을 만족한다", () => {
    const limits = modelById("gpt-image-2").pixelSizeLimits!;
    for (const ratio of CARD_RATIOS) {
      const { width, height } = ratio.pixel;
      expect(width % limits.multipleOf).toBe(0);
      expect(height % limits.multipleOf).toBe(0);
      expect(width * height).toBeGreaterThanOrEqual(limits.minPixels);
      expect(width * height).toBeLessThanOrEqual(limits.maxPixels);
      expect(Math.max(width, height)).toBeLessThanOrEqual(limits.maxEdge);
      expect(Math.max(width, height) / Math.min(width, height)).toBeLessThanOrEqual(limits.maxAspect);
    }
  });
});

describe("모델에 보낼 값", () => {
  it("GPT 는 픽셀을 준다", () => {
    const resolved = resolveSize("4:5", modelById("gpt-image-2"));
    expect(resolved.mode).toBe("pixel");
    expect(resolved.pixel).toEqual({ width: 1088, height: 1360 });
  });

  it("nano 는 비율 문자열과 고정 해상도를 준다", () => {
    const resolved = resolveSize("9:16", modelById("nano-banana-2"));
    expect(resolved.mode).toBe("enum");
    expect(resolved.aspectRatio).toBe("9:16");
    expect(resolved.resolution).toBe("2K");
  });

  it("네 비율은 모든 모델이 지원한다 — 대체가 없다", () => {
    for (const ratio of CARD_RATIOS) {
      for (const id of ["gpt-image-2", "nano-banana-pro", "nano-banana-2"]) {
        expect(resolveSize(ratio.id, modelById(id)).rejected).toBeUndefined();
      }
    }
  });

  it("모르는 비율은 거절한다", () => {
    expect(resolveSize("21:9", modelById("gpt-image-2")).rejected).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

```ts
import type { ImageModel } from "./models";

export interface RatioSpec {
  id: string;
  label: string;
  pixel: { width: number; height: number };
}

/** 네 비율 모두 nano 11종 목록에 있어 대체가 일어나지 않는다. */
export const CARD_RATIOS: RatioSpec[] = [
  { id: "4:5",  label: "인스타 피드 4:5",   pixel: { width: 1088, height: 1360 } },
  { id: "1:1",  label: "정사각형 1:1",      pixel: { width: 1088, height: 1088 } },
  { id: "9:16", label: "스토리·릴스 9:16",  pixel: { width: 1152, height: 2048 } },
  { id: "16:9", label: "가로 16:9",         pixel: { width: 2048, height: 1152 } },
];

export interface ResolvedSize {
  mode: "pixel" | "enum";
  pixel?: { width: number; height: number };
  aspectRatio?: string;
  resolution?: string;
  rejected?: string;
}

export function resolveSize(ratioId: string, model: ImageModel): ResolvedSize {
  const ratio = CARD_RATIOS.find((entry) => entry.id === ratioId);
  if (!ratio) return { mode: "pixel", rejected: `모르는 비율입니다: ${ratioId}` };

  if (model.pixelSizeLimits) return { mode: "pixel", pixel: ratio.pixel };

  if (!model.supportedRatios?.includes(ratio.id)) {
    return { mode: "enum", rejected: `${model.label} 은 ${ratio.id} 를 지원하지 않습니다.` };
  }
  return { mode: "enum", aspectRatio: ratio.id, resolution: model.fixedResolution ?? "2K" };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/ratios.ts packages/sns-core/src/__tests__/ratios.test.ts
git commit -m "feat(sns): 비율을 모델이 받는 값으로 바꾼다"
```

---

# Phase 2 — 첨부 이미지와 장수

## Task 3: 첨부 이미지 네 종류

**Files:**
- Create: `packages/sns-core/src/attachments.ts`
- Test: `packages/sns-core/src/__tests__/attachments.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `AttachmentKind` · `Attachment` · `groupAttachments(list)` · `validateAttachments(list)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { groupAttachments, validateAttachments } from "../attachments";

const item = (kind: string, patch = {}) => ({
  id: Math.random().toString(36).slice(2),
  kind, assetPath: "p", url: "u", ...patch,
});

describe("첨부 분류", () => {
  it("네 종류로 나눈다", () => {
    const grouped = groupAttachments([
      item("keep_identity"),
      item("place_as_is"),
      item("style_reference", { role: "cover" }),
      item("ending"),
    ]);
    expect(grouped.keepIdentity).toHaveLength(1);
    expect(grouped.placeAsIs).toHaveLength(1);
    expect(grouped.styleReferences).toHaveLength(1);
    expect(grouped.ending).toBeDefined();
  });

  it("따라 만들 카드뉴스만 역할을 갖는다", () => {
    const grouped = groupAttachments([
      item("style_reference", { role: "cover" }),
      item("style_reference", { role: "body" }),
      item("style_reference", { role: "body" }),
    ]);
    expect(grouped.styleByRole.cover).toHaveLength(1);
    expect(grouped.styleByRole.body).toHaveLength(2);
    expect(grouped.styleByRole.ending).toHaveLength(0);
  });
});

describe("첨부 검증", () => {
  it("여덟 장을 넘으면 막는다", () => {
    const nine = Array.from({ length: 9 }, () => item("style_reference", { role: "body" }));
    expect(validateAttachments(nine, 8)).toContain("첨부 이미지는 8장까지");
  });

  it("따라 만들 카드뉴스가 하나도 없으면 막는다", () => {
    // 이 시스템의 본체다. 없으면 무엇을 닮게 만들지가 없다.
    expect(validateAttachments([item("keep_identity")], 8)).toContain("따라 만들 카드뉴스");
  });

  it("표지 역할이 둘이면 막는다", () => {
    const two = [
      item("style_reference", { role: "cover" }),
      item("style_reference", { role: "cover" }),
    ];
    expect(validateAttachments(two, 8)).toContain("표지");
  });

  it("마지막 장이 둘이면 막는다", () => {
    expect(validateAttachments([item("ending"), item("ending"), item("style_reference", { role: "cover" })], 8))
      .toContain("마지막 장");
  });

  it("인물을 그대로 넣을 것이 둘이면 막는다", () => {
    // 얼굴이 둘이면 모델이 절충해 제3의 인물을 만든다. 2026-07-30 결정.
    const two = [
      item("keep_identity", { subject: "person" }),
      item("keep_identity", { subject: "person" }),
      item("style_reference", { role: "cover" }),
    ];
    expect(validateAttachments(two, 8)).toContain("인물");
  });

  it("문제가 없으면 빈 배열", () => {
    expect(validateAttachments([item("style_reference", { role: "cover" })], 8)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

```ts
/**
 * 첨부 이미지 네 종류.
 *
 * 2026-07-30 상세페이지 참조 정책을 카드뉴스에 옮긴 것이다.
 * 그대로 지키는 것(identity)과 비슷하게 따라가는 것(design language)을 가른다.
 */
export type AttachmentKind =
  | "keep_identity"    // 그대로 넣을 것 — 제품·인물·로고. 각도는 바뀌어도 정체성 유지
  | "place_as_is"      // 원본 그대로 쓸 장 — 표·포스터. AI 를 안 거치고 여백을 둬 배치
  | "style_reference"  // 따라 만들 카드뉴스 — 그대로 주고 내용만 갈아 끼움
  | "ending";          // 마지막 장

export type StyleRole = "cover" | "body" | "ending";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  assetPath: string;
  url: string;
  /** style_reference 만 갖는다. */
  role?: StyleRole;
  /** keep_identity 가 사람인지 물건인지. 사람은 하나만 허용한다. */
  subject?: "person" | "object";
}

export interface GroupedAttachments {
  keepIdentity: Attachment[];
  placeAsIs: Attachment[];
  styleReferences: Attachment[];
  styleByRole: Record<StyleRole, Attachment[]>;
  ending?: Attachment;
}

export function groupAttachments(list: Attachment[]): GroupedAttachments {
  const styleReferences = list.filter((item) => item.kind === "style_reference");
  return {
    keepIdentity: list.filter((item) => item.kind === "keep_identity"),
    placeAsIs: list.filter((item) => item.kind === "place_as_is"),
    styleReferences,
    styleByRole: {
      cover: styleReferences.filter((item) => item.role === "cover"),
      body: styleReferences.filter((item) => item.role === "body"),
      ending: styleReferences.filter((item) => item.role === "ending"),
    },
    ending: list.find((item) => item.kind === "ending"),
  };
}

/** 만들기 전에 막는다. 생성 뒤에 알면 돈만 나간다. */
export function validateAttachments(list: Attachment[], max: number): string[] {
  const issues: string[] = [];
  const grouped = groupAttachments(list);

  if (list.length > max) issues.push(`첨부 이미지는 ${max}장까지 올릴 수 있습니다.`);
  if (grouped.styleReferences.length === 0) {
    issues.push("따라 만들 카드뉴스를 한 장 이상 올려 주세요. 이걸 기준으로 만듭니다.");
  }
  if (grouped.styleByRole.cover.length > 1) issues.push("표지로 지정한 그림은 한 장이어야 합니다.");
  if (grouped.styleByRole.ending.length > 1) issues.push("엔딩으로 지정한 그림은 한 장이어야 합니다.");
  if (list.filter((item) => item.kind === "ending").length > 1) {
    issues.push("마지막 장 이미지는 한 장만 넣을 수 있습니다.");
  }
  if (grouped.keepIdentity.filter((item) => item.subject === "person").length > 1) {
    issues.push("그대로 넣을 인물은 한 명만 지정해 주세요. 둘이면 얼굴이 섞입니다.");
  }
  return issues;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/attachments.ts packages/sns-core/src/__tests__/attachments.test.ts
git commit -m "feat(sns): 첨부 이미지 네 종류와 검증"
```

---

## Task 4: 장수 계산

AI 에게 "몇 장?"을 묻지 않는다. 자리 수를 알려 주고 그 안을 채우게 한다.

**Files:**
- Create: `packages/sns-core/src/card-count.ts`
- Test: `packages/sns-core/src/__tests__/card-count.test.ts`

**Interfaces:**
- Consumes: `GroupedAttachments` (Task 3)
- Produces: `planSlots(input): SlotPlan` · `SlotPlan { total; cover; placeAsIs; aiBody; ending; issues }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { planSlots } from "../card-count";

describe("자리 계산", () => {
  it("고른 장수에서 예약분을 빼고 남은 자리를 AI 에게 준다", () => {
    // 6장 = 표지 1 + 원본 2 + AI 속지 2 + 마지막 1
    const plan = planSlots({ requested: 6, placeAsIsCount: 2, hasEndingImage: true });
    expect(plan).toMatchObject({ total: 6, cover: 1, placeAsIs: 2, aiBody: 2, ending: 1 });
    expect(plan.issues).toEqual([]);
  });

  it("마지막 장 이미지가 없어도 마지막 자리는 있다", () => {
    // 없으면 AI 가 요약 마무리 페이지를 만든다. 자리는 그대로 차지한다.
    const plan = planSlots({ requested: 5, placeAsIsCount: 0, hasEndingImage: false });
    expect(plan).toMatchObject({ total: 5, cover: 1, placeAsIs: 0, aiBody: 3, ending: 1 });
  });

  it("예약분이 고른 장수를 넘으면 막는다", () => {
    // 원본 5 + 표지 1 + 마지막 1 = 7 > 6
    const plan = planSlots({ requested: 6, placeAsIsCount: 5, hasEndingImage: true });
    expect(plan.issues[0]).toContain("6장");
    expect(plan.aiBody).toBe(0);
  });

  it("자리가 딱 맞으면 AI 자리가 0 이어도 통과한다", () => {
    const plan = planSlots({ requested: 6, placeAsIsCount: 4, hasEndingImage: true });
    expect(plan.aiBody).toBe(0);
    expect(plan.issues).toEqual([]);
  });

  it("AI 추천이면 예약분을 뺀 뒤 남은 자리를 AI 가 정한다", () => {
    const plan = planSlots({ requested: "auto", placeAsIsCount: 2, hasEndingImage: true });
    expect(plan.total).toBe("auto");
    expect(plan.placeAsIs).toBe(2);
    // 최소 = 표지 1 + 원본 2 + 마지막 1 = 4, 최대 8
    expect(plan.autoRange).toEqual({ min: 4, max: 8 });
  });

  it("고를 수 있는 장수는 4~8 이다", () => {
    expect(planSlots({ requested: 3, placeAsIsCount: 0, hasEndingImage: false }).issues[0]).toContain("4~8");
    expect(planSlots({ requested: 9, placeAsIsCount: 0, hasEndingImage: false }).issues[0]).toContain("4~8");
  });
});

describe("원본 장의 자리 배정", () => {
  it("자리를 안 정하면 앞에서부터 채운다", () => {
    // 6장 · 원본 2 → 표지 / 원본1 / 원본2 / AI / AI / 마지막
    const layout = layoutCards({ total: 6, placeAsIs: [{ id: "p1" }, { id: "p2" }], hasEndingImage: true });
    expect(layout.map((slot) => slot.kind)).toEqual([
      "cover", "place_as_is", "place_as_is", "generated", "generated", "ending_image",
    ]);
  });

  it("자리를 정하면 그 자리에 넣는다", () => {
    // 각각 2·4번째 속지 → 표지 / AI / 원본1 / AI / 원본2 / 마지막
    const layout = layoutCards({
      total: 6,
      placeAsIs: [{ id: "p1", bodySlot: 2 }, { id: "p2", bodySlot: 4 }],
      hasEndingImage: true,
    });
    expect(layout.map((slot) => slot.kind)).toEqual([
      "cover", "generated", "place_as_is", "generated", "place_as_is", "ending_image",
    ]);
  });

  it("자리가 겹치면 알린다", () => {
    const layout = layoutCards({
      total: 6, placeAsIs: [{ id: "p1", bodySlot: 2 }, { id: "p2", bodySlot: 2 }], hasEndingImage: true,
    });
    expect(layout).toHaveProperty("issues");
  });

  it("속지 구간을 벗어난 자리는 알린다", () => {
    // 6장이면 속지는 2~5번. 6번은 마지막 장 자리다.
    const layout = layoutCards({
      total: 6, placeAsIs: [{ id: "p1", bodySlot: 6 }], hasEndingImage: true,
    });
    expect(layout).toHaveProperty("issues");
  });

  it("마지막 장 이미지가 없으면 그 자리는 generated 다", () => {
    // AI 가 요약 마무리 페이지를 만든다.
    const layout = layoutCards({ total: 5, placeAsIs: [], hasEndingImage: false });
    expect(layout[4]!.kind).toBe("generated");
    expect(layout[4]!.role).toBe("ending");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

```ts
export const MIN_CARDS = 4;
export const MAX_CARDS = 8;

export interface SlotPlan {
  total: number | "auto";
  cover: number;
  placeAsIs: number;
  aiBody: number;
  ending: number;
  /** total 이 auto 일 때 AI 가 고를 수 있는 범위. */
  autoRange?: { min: number; max: number };
  issues: string[];
}

/**
 * 카드 자리를 나눈다.
 *
 * AI 에게 "몇 장 만들래?" 를 묻지 않는다. 표지·원본·마지막 장은 코드가 세고,
 * AI 는 남은 속지 자리만 채운다. 그래야 같은 입력에 같은 장수가 나온다.
 */
export function planSlots(input: {
  requested: number | "auto";
  placeAsIsCount: number;
  hasEndingImage: boolean;
}): SlotPlan {
  const cover = 1;
  const ending = 1;   // 이미지가 없으면 AI 가 요약 마무리 페이지를 만든다. 자리는 차지한다.
  const reserved = cover + input.placeAsIsCount + ending;
  const issues: string[] = [];

  if (input.requested === "auto") {
    return {
      total: "auto", cover, placeAsIs: input.placeAsIsCount, aiBody: 0, ending,
      autoRange: { min: Math.max(MIN_CARDS, reserved), max: MAX_CARDS },
      issues: reserved > MAX_CARDS
        ? [`원본 그대로 쓸 장이 많아 ${MAX_CARDS}장을 넘습니다. ${reserved - MAX_CARDS}장을 빼 주세요.`]
        : [],
    };
  }

  if (input.requested < MIN_CARDS || input.requested > MAX_CARDS) {
    issues.push(`전체 장수는 ${MIN_CARDS}~${MAX_CARDS}장 중에서 고를 수 있습니다.`);
    return { total: input.requested, cover, placeAsIs: input.placeAsIsCount, aiBody: 0, ending, issues };
  }

  const aiBody = input.requested - reserved;
  if (aiBody < 0) {
    issues.push(
      `${input.requested}장에 들어갈 수 없습니다. ` +
      `표지 1 + 원본 ${input.placeAsIsCount} + 마지막 1 = ${reserved}장이 이미 찹니다.`,
    );
  }

  return {
    total: input.requested, cover, placeAsIs: input.placeAsIsCount,
    aiBody: Math.max(0, aiBody), ending, issues,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/card-count.ts packages/sns-core/src/__tests__/card-count.test.ts
git commit -m "feat(sns): 자리 계산 — AI 에게 장수를 묻지 않는다"
```

---

# Phase 3 — 기획과 원고

## Task 5: 카드 구조 기획

**Files:**
- Create: `packages/sns-core/src/planning.ts`
- Test: `packages/sns-core/src/__tests__/planning.test.ts`

**Interfaces:**
- Consumes: `SlotPlan` (Task 4)
- Produces: `buildPlanPrompt(input)` · `planCards(input, provider): Promise<CardPlan[]>` · `CardPlan { index; role; intent; visualBrief }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { buildPlanPrompt, planCards } from "../planning";

const base = {
  sourceText: "AI 자동화는 단일 업무부터 시작해야 한다. ...",
  slots: { total: 6, cover: 1, placeAsIs: 2, aiBody: 2, ending: 1, issues: [] },
  toneNote: "친구에게 말하듯 가볍게",
  language: "ko" as const,
};

describe("기획 프롬프트", () => {
  it("몇 장이 아니라 몇 자리를 채우라고 말한다", () => {
    const prompt = buildPlanPrompt(base);
    expect(prompt).toContain("속지 2");
    expect(prompt).not.toMatch(/몇 장으로 만들|장수를 정하/);
  });

  it("원본 그대로 쓸 장이 이미 자리를 차지한다고 알린다", () => {
    expect(buildPlanPrompt(base)).toContain("원본");
  });

  it("말투 메모를 담는다", () => {
    expect(buildPlanPrompt(base)).toContain("친구에게 말하듯 가볍게");
  });

  it("말투 메모가 없으면 그 줄을 넣지 않는다", () => {
    const prompt = buildPlanPrompt({ ...base, toneNote: undefined });
    expect(prompt).not.toContain("말투");
  });

  it("자료에 없는 것을 지어내지 말라고 못 박는다", () => {
    expect(buildPlanPrompt(base)).toMatch(/지어내|없는 사실/);
  });
});

describe("기획", () => {
  it("자리 수만큼 카드를 만든다", async () => {
    const cards = await planCards(base, {
      generate: async () => ({
        cards: [
          { index: 1, role: "cover", intent: "훅", visualBrief: "표지 장면" },
          { index: 2, role: "body", intent: "설명1", visualBrief: "장면1" },
          { index: 3, role: "body", intent: "설명2", visualBrief: "장면2" },
        ],
      }),
    });
    expect(cards).toHaveLength(3);
    expect(cards[0]!.role).toBe("cover");
  });

  it("제공자가 던지면 빈 배열을 돌려준다 — 사람이 직접 채울 수 있어야 한다", async () => {
    const cards = await planCards(base, { generate: async () => { throw new Error("모델 없음"); } });
    expect(cards).toEqual([]);
  });

  it("규칙에 안 맞는 응답은 버린다", async () => {
    const cards = await planCards(base, { generate: async () => ({ cards: [{ index: "하나" }] }) as never });
    expect(cards).toEqual([]);
  });

  it("자리보다 많이 오면 잘라낸다", async () => {
    const cards = await planCards(base, {
      generate: async () => ({
        cards: Array.from({ length: 10 }, (_u, i) => ({
          index: i + 1, role: i === 0 ? "cover" : "body", intent: "x", visualBrief: "y",
        })),
      }),
    });
    // 표지 1 + AI 속지 2 = 3. 원본과 마지막 장은 AI 가 기획하지 않는다.
    expect(cards).toHaveLength(3);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

`planning.ts` 는 zod 로 응답을 검증하고, 자리 수(`cover + aiBody`)만큼 자른다.
**던지지 않는다** — 실패하면 빈 배열을 돌려주고 사람이 직접 채운다.

프롬프트 뼈대:

```ts
export function buildPlanPrompt(input: PlanInput): string {
  const aiSlots = input.slots.cover + input.slots.aiBody;
  return [
    "한국어 인스타그램 카드뉴스의 구조를 짭니다.",
    `채울 자리는 표지 1자리와 속지 ${input.slots.aiBody}자리입니다. 정확히 ${aiSlots}장을 계획하세요.`,
    input.slots.placeAsIs > 0
      ? `이 밖에 사용자가 올린 원본 ${input.slots.placeAsIs}장이 속지 자리를 이미 차지합니다. 그것은 계획하지 마세요.`
      : "",
    "마지막 장은 따로 처리하므로 계획하지 마세요.",
    input.toneNote ? `말투: ${input.toneNote}` : "",
    "각 카드마다 무엇을 말할지(intent)와 어떤 그림이 어울릴지(visualBrief)를 적으세요.",
    "자료에 없는 사실·수치·고유명사를 지어내지 마세요.",
    `자료: ${input.sourceText}`,
  ].filter(Boolean).join("\n\n");
}
```

제공자는 Anthropic 을 메인, OpenAI 를 백업으로 쓴다. **폴백 구조를 CardForge 에서 복사한다.**

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/planning.ts packages/sns-core/src/__tests__/planning.test.ts
git commit -m "feat(sns): 자리를 채우는 기획을 만든다"
```

---

## Task 6: 원고

**Files:**
- Create: `packages/sns-core/src/copy.ts`
- Test: `packages/sns-core/src/__tests__/copy.test.ts`

**Interfaces:**
- Consumes: `CardPlan` (Task 5)
- Produces: `buildCopyPrompt(input)` · `writeCopy(input, provider): Promise<CardCopy[]>` · `CardCopy { index; headline; body?; accent?; footnote? }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe("원고 프롬프트", () => {
  it("언어를 지정한다", () => {
    expect(buildCopyPrompt({ ...base, language: "en" })).toContain("English");
    expect(buildCopyPrompt({ ...base, language: "ko" })).toContain("한국어");
  });

  it("글자 수를 숫자로 못 박지 않는다", () => {
    // 2026-08-20 결정 — 내용에 따라 적절한 양이 달라진다. LLM 이 판단하게 유도한다.
    const prompt = buildCopyPrompt(base);
    expect(prompt).not.toMatch(/\d+\s*자/);
    expect(prompt).toMatch(/읽기 벅차지 않게|한눈에 들어오는/);
  });

  it("자료에 없는 것을 지어내지 말라고 못 박는다", () => {
    expect(buildCopyPrompt(base)).toMatch(/지어내|없는 사실/);
  });
});

describe("원고 쓰기", () => {
  it("카드마다 제목을 채운다", async () => {
    const copy = await writeCopy(base, {
      generate: async () => ({ cards: [{ index: 1, headline: "제목", body: "본문" }] }),
    });
    expect(copy[0]!.headline).toBe("제목");
  });

  it("긴 제목을 자르지 않는다", async () => {
    // 2026-08-20 결정 — 글자수로 막지 않는다. 길면 그림에서 작게 넣는다.
    const result = await writeCopy(input, {
      generate: async () => ({ cards: [{ index: 1, headline: "가".repeat(100) }] }),
    });
    expect(result.copies[0]!.headline).toHaveLength(100);
  });

  it("실패하면 빈 배열 — 사람이 직접 쓸 수 있어야 한다", async () => {
    expect(await writeCopy(base, { generate: async () => { throw new Error("x"); } })).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

칸은 넷이다 — `headline` · `body` · `accent` · `footnote`.

**글자수 상한을 두지 않는다.** 2026-08-20 사용자 결정이다 — 내용에 따라 적절한 양이
달라지므로 숫자로 못 박지 말고 LLM 이 판단하게 유도한다. 내용이 꼭 필요해서 길어지면
막지 말고, 그림 단계에서 글자를 작게 넣어 소화한다. **자르지 않는다** — 잘린 문장은
오류 없이 말이 끊긴다. 04 화면에서 사람이 보고 고친다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/copy.ts packages/sns-core/src/__tests__/copy.test.ts
git commit -m "feat(sns): 카드 원고를 쓴다"
```

---

# Phase 4 — 프롬프트와 생성

## Task 7: 이미지 프롬프트 — LLM 이 쓰고 코드가 뼈대를 씌운다

이번 재구축의 핵심이다. 기존 CardForge 는 코드가 고정 틀에 값을 끼워 넣었고 규칙이 쌓여 참조를 덮었다.

**Files:**
- Create: `packages/sns-core/src/image-prompt.ts`
- Test: `packages/sns-core/src/__tests__/image-prompt.test.ts`

**Interfaces:**
- Consumes: `GroupedAttachments` (Task 3) · `CardCopy` (Task 6)
- Produces: `buildAttachmentBlock(images)` · `buildFrame(input)` · `composePrompt(frame, llmBody)` · `writeImagePrompt(input, provider)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { buildAttachmentBlock, buildFrame, composePrompt } from "../image-prompt";

const images = [
  { kind: "style_reference" as const, role: "body" as const },
  { kind: "keep_identity" as const, subject: "object" as const },
];

describe("첨부 이미지 설명", () => {
  it("번호와 역할을 문장으로 알린다", () => {
    // fal 은 이미지별 라벨을 안 받는다. 프롬프트 문장이 유일한 전달 수단이다.
    const block = buildAttachmentBlock(images);
    expect(block).toContain("Image 1");
    expect(block).toContain("Image 2");
  });

  it("따라 만들 카드뉴스는 내용만 바꾸라고 한다", () => {
    const block = buildAttachmentBlock([images[0]!]);
    expect(block).toMatch(/replace only the content|내용만/i);
    // 기존의 "색·배치만 가져오고 삽화는 가져오지 마라" 를 쓰지 않는다.
    expect(block).not.toContain("specific illustrations");
  });

  it("그대로 넣을 것은 정체성을 지키되 각도는 자유라고 한다", () => {
    const block = buildAttachmentBlock([images[1]!]);
    expect(block).toMatch(/identity|정체성/i);
    expect(block).toMatch(/angle|각도/i);
  });

  it("우선순위를 명시한다", () => {
    // 제품·인물 > 스타일 > 장면 지시. 2026-07-30 결정.
    expect(buildAttachmentBlock(images)).toMatch(/takes priority|우선/i);
  });
});

describe("다국어", () => {
  it("언어 이름만 바뀐다", () => {
    const ko = buildFrame({ copy: { index: 1, headline: "제목" }, images: [], size: { width: 1088, height: 1360 }, language: "ko" });
    const en = buildFrame({ copy: { index: 1, headline: "Title" }, images: [], size: { width: 1088, height: 1360 }, language: "en" });
    expect(ko).toContain("Korean text");
    expect(en).toContain("English text");
  });

  it("번역 금지 지시는 언어와 무관하게 붙는다", () => {
    for (const language of ["ko", "en", "ja", "zh"]) {
      const frame = buildFrame({ copy: { index: 1, headline: "x" }, images: [], size: { width: 1088, height: 1088 }, language });
      expect(frame).toMatch(/Do not translate/);
    }
  });
});

describe("코드가 씌우는 뼈대", () => {
  const frame = buildFrame({
    copy: { index: 2, headline: "제목입니다", body: "본문입니다", footnote: "출처" },
    images,
    size: { width: 1088, height: 1360 },
    language: "ko",
  });

  it("글자를 그대로 렌더하라고 한다", () => {
    expect(frame).toContain("제목입니다");
    expect(frame).toContain("본문입니다");
    expect(frame).toMatch(/exactly as written/i);
  });

  it("목록에 없는 글자를 더하지 말라고 한다", () => {
    expect(frame).toMatch(/not listed/i);
  });

  it("규격을 담는다", () => {
    expect(frame).toContain("1088");
    expect(frame).toContain("1360");
  });

  it("앵커를 넣지 않는다", () => {
    // 이전 카드 결과를 넣고 "똑같이 만들어라" 하던 것이 속지를 표지로 만들었다.
    expect(frame).not.toMatch(/card 1 of this same series/i);
    expect(frame).not.toMatch(/Only the content differs/i);
  });

  it("목적·서사 규칙을 넣지 않는다", () => {
    // 서사 규칙은 글 쓸 때 쓰는 것이고 그림 모델에게는 소음이다.
    expect(frame).not.toMatch(/Narrative rule|서사 규칙/);
  });
});

describe("합치기", () => {
  it("LLM 이 쓴 본문이 뼈대 안에 들어간다", () => {
    const composed = composePrompt("FRAME", "LLM 이 쓴 장면 설명");
    expect(composed).toContain("FRAME");
    expect(composed).toContain("LLM 이 쓴 장면 설명");
  });

  it("LLM 본문이 비어도 프롬프트가 성립한다", () => {
    // 프롬프트 작성이 실패해도 원본 이미지는 그대로 넘어간다. 막지 않는다.
    const composed = composePrompt("FRAME", "");
    expect(composed).toContain("FRAME");
    expect(composed).not.toContain("undefined");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

```ts
/**
 * 이미지 프롬프트.
 *
 * 코드는 뼈대만 씌운다 — 첨부 이미지 번호·역할, 글자 그대로 렌더, 규격, 우선순위.
 * 장면·구도·스타일은 LLM 이 쓴다. 코드가 형용사 목록을 미리 정하지 않는다.
 *
 * 넣지 않는 것 둘:
 *   · 앵커(이전 카드 결과) — 속지를 표지 복사본으로 만들었다
 *   · 목적·서사 규칙 — 그림 모델에게 소음이다. 글은 이미 아래에 확정돼 있다
 */

export function buildAttachmentBlock(images: Array<{ kind: string; role?: string; subject?: string }>): string {
  const lines = [
    "Follow the instruction for each attached image separately. Image numbers match attachment order.",
  ];
  images.forEach((image, offset) => {
    const number = offset + 1;
    if (image.kind === "style_reference") {
      lines.push(
        `Image ${number} is the CARD-NEWS REFERENCE for this card. Reproduce its layout, typography, ` +
        `color system, texture, and rendering style (photographic / illustrated / 3D) as closely as possible, ` +
        `and replace only the content with the text and scene described below.`,
      );
    } else if (image.kind === "keep_identity") {
      lines.push(
        `Image ${number} is a PRESERVED SUBJECT. Keep its identity exactly — shape, proportions, colors, ` +
        `materials, labels and logo text. The camera angle and lighting may change to fit this card, ` +
        `but it must remain recognisably the same ${image.subject === "person" ? "person" : "object"}.`,
      );
    }
  });
  lines.push(
    "Priority when instructions conflict: PRESERVED SUBJECT takes priority over the CARD-NEWS REFERENCE, " +
    "which takes priority over the scene description.",
  );
  return lines.join("\n");
}

export function buildFrame(input: {
  copy: { index: number; headline: string; body?: string; accent?: string; footnote?: string };
  images: Array<{ kind: string; role?: string; subject?: string }>;
  size: { width: number; height: number };
  language: string;
}): string {
  const texts = [
    ["HEADLINE", input.copy.headline],
    ["BODY", input.copy.body],
    ["ACCENT", input.copy.accent],
    ["FOOTNOTE", input.copy.footnote],
  ].filter(([, value]) => Boolean(value?.trim()));

  return [
    buildAttachmentBlock(input.images),
    "",
    `Render this ${input.language === "ko" ? "Korean" : input.language} text exactly as written, with correct spelling and spacing:`,
    ...texts.map(([label, value]) => `  ${label}: ${value}`),
    // 위에 적은 글자는 그대로. 배경 글자는 금지가 아니라 자제다 —
    // 간판·표지판 같은 것까지 막으면 그림이 어색해진다. 2026-08-20 결정.
    "Do not translate, paraphrase, or shorten the text listed above.",
    "Keep incidental background text sparse. This is a card, not a page full of words.",
    "",
    `Output size ${input.size.width}x${input.size.height}. No outer border, no page frame, no UI chrome.`,
  ].join("\n");
}

export function composePrompt(frame: string, llmBody: string): string {
  return llmBody.trim() ? `${llmBody.trim()}\n\n${frame}` : frame;
}
```

`writeImagePrompt` 는 **LLM 에게 첨부 이미지를 직접 보여주고** 장면 설명을 받는다.
**던지지 않는다** — 실패하면 빈 문자열을 돌려주고 뼈대만으로 생성한다.
원본 이미지는 어차피 함께 넘어간다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/image-prompt.ts packages/sns-core/src/__tests__/image-prompt.test.ts
git commit -m "feat(sns): LLM 이 쓰고 코드가 뼈대를 씌우는 이미지 프롬프트"
```

---

## Task 8: 원본 그대로 쓸 장 — 여백을 둬 규격에 맞춘다

**Files:**
- Create: `packages/sns-core/src/letterbox.ts`
- Test: `packages/sns-core/src/__tests__/letterbox.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `letterboxPlan(source, target): LetterboxPlan`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { letterboxPlan } from "../letterbox";

describe("여백 계산", () => {
  it("가로가 넓으면 위아래에 여백", () => {
    const plan = letterboxPlan({ width: 1600, height: 900 }, { width: 1088, height: 1360 });
    expect(plan.drawWidth).toBe(1088);
    expect(plan.drawHeight).toBe(612);
    expect(plan.offsetX).toBe(0);
    expect(plan.offsetY).toBe(374);
  });

  it("세로가 길면 좌우에 여백", () => {
    const plan = letterboxPlan({ width: 900, height: 1600 }, { width: 1088, height: 1088 });
    expect(plan.drawHeight).toBe(1088);
    expect(plan.drawWidth).toBe(612);
    expect(plan.offsetY).toBe(0);
    expect(plan.offsetX).toBe(238);
  });

  it("비율이 같으면 여백이 없다", () => {
    const plan = letterboxPlan({ width: 544, height: 680 }, { width: 1088, height: 1360 });
    expect(plan.offsetX).toBe(0);
    expect(plan.offsetY).toBe(0);
    expect(plan.drawWidth).toBe(1088);
  });

  it("잘라내지 않는다 — 그린 영역이 항상 규격 안에 들어간다", () => {
    // 표는 글자가 잘리면 못 쓴다. 어떤 비율이 와도 잘라내지 않는다.
    for (const source of [{ width: 4000, height: 100 }, { width: 100, height: 4000 }]) {
      const plan = letterboxPlan(source, { width: 1088, height: 1360 });
      expect(plan.drawWidth).toBeLessThanOrEqual(1088);
      expect(plan.drawHeight).toBeLessThanOrEqual(1360);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

```ts
export interface LetterboxPlan {
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
}

/**
 * 원본을 잘라내지 않고 규격 안에 넣는다.
 *
 * 표·도표는 글자가 잘리면 못 쓴다. 그래서 crop 이 아니라 letterbox 다.
 * 여백 색은 원본 가장자리 평균색을 쓴다(구현 시 sharp 로 뽑는다).
 */
export function letterboxPlan(
  source: { width: number; height: number },
  target: { width: number; height: number },
): LetterboxPlan {
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const drawWidth = Math.round(source.width * scale);
  const drawHeight = Math.round(source.height * scale);
  return {
    drawWidth,
    drawHeight,
    offsetX: Math.round((target.width - drawWidth) / 2),
    offsetY: Math.round((target.height - drawHeight) / 2),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/letterbox.ts packages/sns-core/src/__tests__/letterbox.test.ts
git commit -m "feat(sns): 원본 그대로 쓸 장을 여백으로 맞춘다"
```

---

## Task 9: 카드뉴스 테이블

**Files:**
- Create: `supabase/migrations/202608310002_sns.sql`
- Test: `packages/sns-core/src/__tests__/migration.test.ts`

**Interfaces:**
- Produces: `sns_projects` · `sns_generation_requests` · `sns_cards`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe("카드뉴스 마이그레이션", () => {
  it("세 테이블을 만든다", () => {
    for (const table of ["sns_projects", "sns_generation_requests", "sns_cards"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("기존 테이블을 건드리지 않는다", () => {
    expect(sql).not.toMatch(/drop table/);
    expect(sql).not.toMatch(/alter table[\s\S]*drop column/);
  });

  it("비용은 생성 요청에만 있고 카드에는 없다", () => {
    // 카드마다 총액을 복제하면 8장에서 합계가 8배가 된다.
    const requests = sql.slice(sql.indexOf("create table public.sns_generation_requests"), sql.indexOf("create table public.sns_cards"));
    const cards = sql.slice(sql.indexOf("create table public.sns_cards"));
    expect(requests).toContain("cost_usd");
    expect(cards.slice(0, cards.indexOf(");"))).not.toContain("cost_usd");
  });

  it("소유자 규약을 따른다", () => {
    expect(sql).toContain("references public.profiles(id)");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).not.toContain("auth.users(id)");
  });

  it("asset_path 는 Storage 경로다", () => {
    // 로컬 디스크에 쓰면 배포할 때마다 사라지고 두 서버에서 안 보인다.
    expect(sql).toContain("asset_path");
  });

  it("컬럼 권한을 회수 먼저, 허용 목록 나중에", () => {
    for (const table of ["sns_projects", "sns_generation_requests", "sns_cards"]) {
      const revokeAt = sql.indexOf(`revoke update on public.${table}`);
      const grantAt = sql.indexOf("grant update (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

```sql
create table public.sns_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- 수집함에서 왔으면 그 후보. **"제작함" 은 이 값으로 판정한다.**
  -- ingest_candidates.status 에 requested 를 두지 않는다 —
  -- 회원이 Supabase REST 로 직접 그 글자를 넣을 수 있어 프로젝트 없이 제작함이 된다.
  candidate_id uuid references public.ingest_candidates(id) on delete set null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','planning','copy_ready','generating','ready','failed')),
  ratio text not null,
  language text not null default 'ko',
  model_id text not null,
  card_count_mode text not null default 'auto' check (card_count_mode in ('auto','fixed')),
  card_count int,
  tone_note text,
  -- 첨부 이미지·자리 계획·자료 스냅샷. 필드를 늘려도 마이그레이션이 필요 없다.
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- fal 호출 한 건. 과금이 이미지가 아니라 요청에 붙는다.
create table public.sns_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.sns_projects(id) on delete cascade,
  card_index int not null,
  fal_request_id text,
  model_id text not null,
  mode text not null check (mode in ('t2i','i2i')),
  size jsonb not null default '{}'::jsonb,
  requested_images int not null default 1,
  returned_images int not null default 0,
  unit_cost_usd numeric(10,4),
  cost_usd numeric(10,4),
  created_at timestamptz not null default now()
);

create table public.sns_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.sns_projects(id) on delete cascade,
  index int not null,
  -- place_as_is 는 생성하지 않고 원본을 여백으로 맞춰 넣는다.
  kind text not null default 'generated' check (kind in ('generated','place_as_is','ending_image')),
  role text not null check (role in ('cover','body','ending')),
  copy jsonb not null default '{}'::jsonb,
  prompt text,
  asset_path text,
  status text not null default 'pending'
    check (status in ('pending','generating','review_required','done','failed')),
  review jsonb,
  error text,
  unique (project_id, index)
);

create index sns_projects_user_idx on public.sns_projects(user_id, updated_at desc);
create index sns_cards_project_idx on public.sns_cards(project_id, index);
create index sns_requests_project_idx on public.sns_generation_requests(project_id, created_at desc);

alter table public.sns_projects enable row level security;
alter table public.sns_generation_requests enable row level security;
alter table public.sns_cards enable row level security;

create policy "members manage own sns projects" on public.sns_projects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "members manage own sns requests" on public.sns_generation_requests for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "members manage own sns cards" on public.sns_cards for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, delete on public.sns_projects to authenticated;
revoke update on public.sns_projects from authenticated;
grant update (title, status, ratio, language, model_id, card_count_mode, card_count, tone_note, data, updated_at)
  on public.sns_projects to authenticated;

-- **비용 행은 회원이 쓰지 못한다. 읽기만 연다.**
-- 회원이 cost_usd 를 고칠 수 있으면 비용 장부를 믿을 수 없다.
-- 서버가 admin 클라이언트로 쓰고, user_id 는 로그인 세션에서만 가져온다.
grant select on public.sns_generation_requests to authenticated;
revoke insert, update, delete on public.sns_generation_requests from authenticated;

grant select, insert, delete on public.sns_cards to authenticated;
revoke update on public.sns_cards from authenticated;
grant update (copy, prompt, asset_path, status, review, error) on public.sns_cards to authenticated;
```

- [ ] **Step 4: 통과 확인 후 로컬 DB 에 적용**

```bash
pnpm test
pnpm db:reset
```

**`db push` 를 쓰지 않는다.** 운영 적용은 계획 4 에서 한다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/202608310002_sns.sql packages/sns-core/src/__tests__/migration.test.ts
git commit -m "feat(sns): 카드뉴스 테이블을 만든다"
```

---

## Task 10: 생성 파이프라인

**Files:**
- Create: `packages/sns-core/src/generate.ts`
- Test: `packages/sns-core/src/__tests__/generate.test.ts`

**Interfaces:**
- Consumes: Task 1·2·3·7·8
- Produces: `generateCard(input): Promise<GeneratedCard>` · `buildModelInput(model, mode, resolved, prompt, imageUrls)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe("모델 입력", () => {
  it("GPT 는 image_size 를 명시한다", () => {
    // 기본값 auto 는 입력 이미지 크기를 물려받는다. 레퍼런스 크기가 그대로 나온다.
    const input = buildModelInput(modelById("gpt-image-2"), "i2i",
      resolveSize("4:5", modelById("gpt-image-2")), "p", ["u"]);
    expect(input.image_size).toEqual({ width: 1088, height: 1360 });
    expect(input.quality).toBe("high");
  });

  it("nano 는 aspect_ratio 와 resolution 을 준다", () => {
    const input = buildModelInput(modelById("nano-banana-2"), "i2i",
      resolveSize("9:16", modelById("nano-banana-2")), "p", ["u"]);
    expect(input.aspect_ratio).toBe("9:16");
    expect(input.resolution).toBe("2K");
  });

  it("웹 검색과 thinking 을 켜지 않는다", () => {
    const input = buildModelInput(modelById("nano-banana-2"), "i2i",
      resolveSize("4:5", modelById("nano-banana-2")), "p", ["u"]);
    const text = JSON.stringify(input);
    expect(text).not.toContain("web_search");
    expect(text).not.toContain("thinking");
  });
});

describe("카드 생성", () => {
  it("요청 한 행을 남기고 비용을 한 번만 기록한다", async () => {
    const requests: unknown[] = [];
    const result = await generateCard({
      /* ... */
      saveRequest: async (row) => { requests.push(row); return { ...row, id: "r1" }; },
    });
    expect(requests).toHaveLength(1);
    expect(result.request.costUsd).toBeCloseTo(0.178, 4);
  });

  it("레퍼런스가 있으면 i2i 로 부른다", async () => {
    const called: string[] = [];
    await generateCard({ /* ... */ imageUrls: ["u"], runner: { run: async (endpoint) => { called.push(endpoint); return { images: [{ url: "a" }] }; } } });
    expect(called[0]).toBe("openai/gpt-image-2/edit");
  });

  it("레퍼런스가 없으면 t2i 로 부른다", async () => {
    const called: string[] = [];
    await generateCard({ /* ... */ imageUrls: [], runner: { run: async (endpoint) => { called.push(endpoint); return { images: [{ url: "a" }] }; } } });
    expect(called[0]).toBe("openai/gpt-image-2");
  });

  it("이전 카드 결과를 입력에 넣지 않는다", async () => {
    // 앵커를 만들지 않는다. 그것이 속지를 표지 복사본으로 만들었다.
    let sent: string[] = [];
    await generateCard({ /* ... */ previousCardUrl: "https://prev.png",
      runner: { run: async (_e, input) => { sent = (input as { image_urls: string[] }).image_urls; return { images: [{ url: "a" }] }; } } });
    expect(sent).not.toContain("https://prev.png");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/sns-core test`

- [ ] **Step 3: 최소 구현**

`generateCard` 는 순서대로 한다:

```
① resolveSize 로 크기를 정한다. rejected 면 부르기 전에 던진다 (돈을 쓰기 전에)
② pickEndpoint 로 t2i/i2i 를 고른다
③ unitPrice 로 단가를 계산한다
④ sns_generation_requests 에 한 행을 넣는다
⑤ fal 을 부른다
⑥ 결과를 저장하고 요청 행에 fal_request_id · returned_images · cost_usd 를 채운다
```

**`previousCardUrl` 같은 인자를 받지 않는다.** 앵커를 만들 여지를 코드에 두지 않는다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/sns-core test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add packages/sns-core/src/generate.ts packages/sns-core/src/__tests__/generate.test.ts
git commit -m "feat(sns): 카드 생성 파이프라인"
```

---

## Task 11: 검수 — 자동 재생성을 하지 않는다

**Files:**
- Create: `packages/sns-core/src/review.ts`
- Test: `packages/sns-core/src/__tests__/review.test.ts`

**Interfaces:**
- Produces: `buildReviewPrompt(input)` · `reviewCard(input): Promise<CardReview | undefined>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe("검수 프롬프트", () => {
  it("기대 글자를 담는다", () => {
    expect(buildReviewPrompt({ copy: { headline: "제목", body: "본문" }, hasPreserved: false }))
      .toContain("제목");
  });

  it("그대로 넣을 것이 있으면 대조를 지시한다", () => {
    expect(buildReviewPrompt({ copy: { headline: "x" }, hasPreserved: true })).toMatch(/원본|대조/);
  });

  it("프롬프트가 아니라 이미지를 보라고 한다", () => {
    expect(buildReviewPrompt({ copy: { headline: "x" }, hasPreserved: false })).toMatch(/실제로 보이는/);
  });
});

describe("검수 대상", () => {
  it("AI 가 그린 카드만 검수한다", () => {
    expect(shouldReview({ kind: "generated" })).toBe(true);
  });

  it("원본 그대로 쓴 장은 검수하지 않는다", () => {
    // AI 를 안 거친 사용자 원본이다. 글자가 틀릴 리 없고 검수하면 돈만 나간다.
    expect(shouldReview({ kind: "place_as_is" })).toBe(false);
  });

  it("사용자가 올린 마지막 장도 검수하지 않는다", () => {
    expect(shouldReview({ kind: "ending_image" })).toBe(false);
  });
});

describe("검수", () => {
  it("판정을 돌려준다", async () => {
    const review = await reviewCard({ /* ... */ call: async () => ({ decision: "pass", score: 90, summary: "ok", issues: [] }) });
    expect(review?.decision).toBe("pass");
  });

  it("호출이 던져도 던지지 않는다", async () => {
    // 검수 실패가 만든 카드를 버리게 하면 안 된다.
    expect(await reviewCard({ /* ... */ call: async () => { throw new Error("x"); } })).toBeUndefined();
  });

  it("규칙에 안 맞는 판정은 버린다", async () => {
    expect(await reviewCard({ /* ... */ call: async () => ({ decision: "아마도" }) as never })).toBeUndefined();
  });
});
```

- [ ] **Step 2~5**

구현은 zod 검증 + 던지지 않기. **자동 재생성 코드를 만들지 않는다.**
`fail` 이면 카드 상태를 `review_required` 로 두고 **사람이 다시 만들기를 누를 때까지 기다린다.**

다시 만들 때는 반려 사유를 **LLM 에게 되돌려 프롬프트를 다시 쓰게** 한다. 뒤에 덧붙이지 않는다.

```bash
git add packages/sns-core/src/review.ts packages/sns-core/src/__tests__/review.test.ts
git commit -m "feat(sns): 검수 — 자동 재생성 없이 사람이 판단한다"
```

---

# Phase 5 — 화면

## Task 12: 만들기 화면 (01 내용 · 02 이미지 · 03 규격)

**Files:**
- Create: `apps/web/app/sns/page.tsx` · `apps/web/app/sns/new/page.tsx` · `new-client.tsx`
- Create: `apps/web/app/sns/_components/source-input.tsx` · `attachment-picker.tsx` · `spec-picker.tsx`
- Create: `apps/web/app/api/sns/projects/route.ts`
- Test: `apps/web/app/api/sns/__tests__/projects.test.ts`

**Interfaces:**
- Consumes: Task 3·4·9 · 계획 1 의 라이브러리 묶음 세트
- Produces: `POST /api/sns/projects`

- [ ] **Step 1~5**

`StepBar` 를 쓴다(계획 1 Task 3).

```
[ 01 내용 ] [ 02 이미지 ] [ 03 규격 ] [ 04 원고 확인 ] [ 05 결과 ]
```

**01 내용** — 네 갈래를 `Tabs` 로. 직접 쓰기 / 유튜브 주소 / 웹 주소 / 질문해서 찾기.
말투 메모는 선택 입력 한 줄.

**02 이미지** — 라이브러리에서 고르거나 올린다. 각 이미지에 종류를 지정한다.
`validateAttachments` 의 문제를 **그 자리에서** 보여준다.

**03 규격** — 비율 4종 · 전체 장수(AI 추천 + 4~8) · 언어 · 모델.
`planSlots` 결과를 **그 자리에서** 보여준다.

```
6장 = 표지 1 + 원본 2 + AI 속지 2 + 마지막 1
예상 비용  $1.07  (GPT Image 2 · 6장)
```

**돈이 드는 버튼 옆에 금액을 쓴다.**

```bash
git commit -m "feat(sns): 만들기 화면 — 내용·이미지·규격"
```

---

## Task 13: 원고 확인과 결과 화면 (04 · 05)

**Files:**
- Create: `apps/web/app/sns/[id]/page.tsx` · `copy-review.tsx` · `result-board.tsx`
- Create: `apps/web/app/api/sns/projects/[id]/plan/route.ts` · `generate/route.ts` · `cards/[index]/route.ts`
- Test: `apps/web/app/api/sns/__tests__/flow.test.ts`

- [ ] **Step 1~5**

**04 원고 확인** — 카드마다 네 칸을 고칠 수 있다. **여기서 고친 글자가 그대로 이미지에 박힌다.**

**05 결과** — 카드가 하나씩 채워진다. 무엇을 하는 중인지 문장으로 쓴다.
카드마다 다시 만들기. 검수에서 걸린 카드는 사유를 보여주고 사람이 판단.
내려받기(낱장·전체 zip). **게시글 문구·해시태그 복사** — 클립보드 API 로 확실히.

**프로젝트가 실제로 만들어진 뒤에** 수집 후보를 `requested` 로 표시한다.

```bash
git commit -m "feat(sns): 원고 확인과 결과 화면"
```

---

# 이 계획이 끝나면

```
수집함이나 직접 입력에서 카드뉴스를 끝까지 만들 수 있다
레퍼런스를 닮은 카드가 나온다 (앵커 없음, LLM 이 쓴 프롬프트)
장수가 흔들리지 않는다
비용이 요청 단위로 정확히 쌓인다
```

# 사람이 확인할 것 — 코드로 대신할 수 없다

- [ ] 표지 1 + 속지 2 를 올려 **속지가 표지 복사본이 아닌지** 본다 ← 이번 재구축의 목적
- [ ] 레퍼런스와 결과를 나란히 놓고 **닮았는지** 본다
- [ ] 제품 이미지를 넣어 **원형이 유지되는지** 본다
- [ ] 한국어가 깨지지 않는지 본다 — 특히 작은 글자
- [ ] 표를 「원본 그대로 쓸 장」으로 넣어 **여백이 자연스러운지** 본다
- [ ] 6장을 골라 **정확히 6장이 나오는지** 본다
- [ ] 같은 조건으로 GPT Image 2 와 Nano Banana Pro 를 **나란히 비교**한다
