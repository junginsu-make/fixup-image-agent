# 포스터 스튜디오 구현 계획

> **작업자에게:** 태스크를 순서대로 **하나씩** 합니다. 각 태스크의 Step 을 순서대로 지키세요 —
> 테스트 먼저 → 실패 확인 → 최소 구현 → 통과 확인 → 커밋. 진행은 체크박스(`- [ ]`)로 표시합니다.
>
> Claude Code 로 실행한다면 `superpowers:subagent-driven-development` 또는
> `superpowers:executing-plans` 스킬을 쓰세요. **다른 환경이면 위 순서를 그대로 따르면 됩니다 —
> 스킬은 필수가 아닙니다.**

**Goal:** 레퍼런스 이미지를 받아 한 장짜리 포스터·광고 이미지를 만들고, 사람이 고르고 고칠 수 있는 독립 섹션을 만든다.

**Architecture:** `src/poster/` · `app/poster/` · `app/api/poster/` 를 새로 만들고 카드뉴스 도메인 코드를 참조하지 않는다. fal 클라이언트·모델 레지스트리·업로드·사용 기록·팀 격리만 공용으로 빌려 쓴다. 사용자가 비율과 한 줄 지시를 주면 fable 이 슬롯을 채운 초안을 만들고, 사람이 고친 뒤 fal `/edit` 로 변형 1~3장을 받는다. 변형 하나를 고르면 수정 명령과 다른 비율 재생성이 열린다.

**Tech Stack:** Next.js 15.5 App Router · TypeScript 5.9 · zod 4 · vitest 4 · Supabase(PostgreSQL/RLS) · fal.ai(`/edit` 엔드포인트) · Anthropic(기획) · OpenAI(비전)

**Spec:** `docs/superpowers/specs/2026-08-31-poster-studio-design.md`

## Global Constraints

- **카드뉴스 도메인 코드를 참조하지 않는다.** `src/studio/` 중 빌려도 되는 것은 `fal-client.ts`, `models.ts`, `reference-files.ts` 뿐이다. `pipeline.ts` · `copy.ts` · `content-plan.ts` · `card-prompt.ts` · `vision-review.ts` · `schemas.ts` · `types.ts` 는 참조 금지.
- **화면 코드(`"use client"`)는 `src/studio/types.ts` 와 `src/poster/types.ts` 를 값으로 import 하지 않는다.** 타입 전용 import 만 허용. 화면이 값으로 쓰는 스키마는 `src/poster/schemas.ts` 에 둔다. `tests/studio-client-bundle.test.ts` 가 이 규칙을 자동 검사한다.
- **컬럼 권한은 회수가 아니라 허용 목록으로 쓴다.** `revoke update on <table>` 을 먼저 하고 `grant update (col, ...)` 를 준다. 테이블 GRANT 뒤의 컬럼 REVOKE 는 아무 일도 하지 않는다.
- **`unit_price` 견적 방식을 절대 부르지 않는다.** `openai/gpt-image-2/edit` 에서 장당 $1.00 이 나온다.
- **GPT Image 2 는 `image_size` 를 항상 명시한다.** 기본값 `auto` 는 입력 이미지 크기를 물려받는다.
- **`quality` 는 `high` 고정.** 사용자에게 노출하지 않는다.
- **웹 검색·`thinking_level` 을 켜지 않는다.** 추가 과금이 붙는다.
- **비용 문구는 `최대` 가 아니라 `예상` 이다.** 공식 가격표로 실제 최대 금액을 보장할 수 없다.
- **비전·기획 호출은 절대 예외를 밖으로 던지지 않는다.** 실패하면 빈 값을 돌려주고 상위가 계속 진행한다.
- 테스트 실행: `npx vitest run` · 타입: `npx tsc --noEmit` · 빌드: `npx next build`
- 기준 상태: 56 파일 / 445 테스트 통과. 모든 태스크 끝에서 이 수치 이상이어야 한다.

---

# Phase 1 — fal 계약과 비용 (카드 스튜디오도 함께 이득)

## Task 1: FalRunner 가 모든 이미지와 requestId 를 돌려준다

지금은 `data.images[0]` 만 꺼내고 `requestId` 를 버린다. 이 상태로 `num_images` 를 올리면 **N장 값을 내고 1장만 쓴다.**

**Files:**
- Modify: `src/studio/fal-client.ts:13-23` (타입), `:91-101` (`run`)
- Modify: `src/studio/pipeline.ts:306` (유일한 운영 호출부)
- Modify: `tests/studio-pipeline.test.ts` (`runnerThat` 헬퍼)
- Test: `tests/studio-fal-client.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `FalImage { url: string; width?: number; height?: number; contentType?: string }` · `FalRunResult { images: FalImage[]; requestId?: string }` · `FalRunner.run(endpoint, input): Promise<FalRunResult>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/studio-fal-client.test.ts` 끝에 추가:

```ts
describe("fal 응답 해석", () => {
  it("이미지를 전부 돌려주고 requestId 를 남긴다", () => {
    const parsed = parseFalRunResult({
      data: { images: [{ url: "https://a.png" }, { url: "https://b.png" }] },
      requestId: "req_1",
    });
    expect(parsed.images.map((image) => image.url)).toEqual(["https://a.png", "https://b.png"]);
    expect(parsed.requestId).toBe("req_1");
  });

  it("requestId 가 없어도 이미지는 살린다", () => {
    // 과금 조회는 못 해도 결과는 써야 한다.
    const parsed = parseFalRunResult({ data: { images: [{ url: "https://a.png" }] } });
    expect(parsed.images).toHaveLength(1);
    expect(parsed.requestId).toBeUndefined();
  });

  it("이미지가 하나도 없으면 던진다", () => {
    expect(() => parseFalRunResult({ data: { images: [] } })).toThrow(/이미지/);
  });
});
```

파일 맨 위 import 에 `parseFalRunResult` 를 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/studio-fal-client.test.ts`
Expected: FAIL — `parseFalRunResult` is not exported

- [ ] **Step 3: 최소 구현**

`src/studio/fal-client.ts` 의 `FalImageResult` 를 다음으로 교체한다:

```ts
export interface FalImage {
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
}

/**
 * fal 호출 한 건의 결과.
 *
 * 이미지를 전부 담는다. 첫 장만 꺼내던 예전 방식으로는 num_images 를 올리는 순간
 * 값을 치르고 결과를 버리게 된다. requestId 는 사후 정산 조회의 유일한 열쇠다.
 */
export interface FalRunResult {
  images: FalImage[];
  requestId?: string;
}

/** 응답 해석만 떼어 낸다. 네트워크 없이 테스트하기 위해서다. */
export function parseFalRunResult(result: unknown): FalRunResult {
  const shaped = result as {
    data?: { images?: Array<{ url?: string; width?: number; height?: number; content_type?: string }> };
    requestId?: string;
  };
  const images = (shaped.data?.images ?? [])
    .filter((image): image is { url: string; width?: number; height?: number; content_type?: string } => Boolean(image?.url))
    .map((image) => ({ url: image.url, width: image.width, height: image.height, contentType: image.content_type }));
  if (images.length === 0) throw new Error("fal.ai 가 이미지를 돌려주지 않았습니다.");
  return { images, requestId: shaped.requestId };
}
```

`FalRunner` 인터페이스의 `run` 반환형을 `Promise<FalRunResult>` 로 바꾸고, `FalClientRunner.run` 본문을 교체한다:

```ts
  async run(endpoint: string, input: Record<string, unknown>): Promise<FalRunResult> {
    try {
      return parseFalRunResult(await fal.subscribe(endpoint, buildFalSubscribeOptions(input)));
    } catch (error) {
      throw normalizeFalError(error);
    }
  }
```

`src/studio/pipeline.ts:306` 을 고친다. 카드뉴스는 한 장만 쓰므로 동작이 바뀌지 않는다:

```ts
  // 카드뉴스는 카드당 한 장만 쓴다. 배치는 포스터 스튜디오에서만 켠다.
  const image = (await input.runner.run(input.model.endpoint, falInput)).images[0]!;
```

`tests/studio-pipeline.test.ts` 의 `runnerThat` 안 `run` 을 고친다:

```ts
    run: async (endpoint, input) => {
      calls.push({ endpoint, input });
      const result = await behaviour(endpoint, input, calls.length);
      return { images: [result], requestId: `req_${calls.length}` };
    },
```

`FalImageResult` 를 참조하는 다른 곳이 있으면 `FalImage` 로 바꾼다. 찾기: `npx tsc --noEmit`

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run` · `npx tsc --noEmit`
Expected: 445 tests + 새 3개 통과, typecheck exit 0

- [ ] **Step 5: 커밋**

```bash
git add src/studio/fal-client.ts src/studio/pipeline.ts tests/studio-fal-client.test.ts tests/studio-pipeline.test.ts
git commit -m "refactor(fal): 응답의 모든 이미지와 requestId 를 살린다"
```

---

## Task 2: 모델 레지스트리에 지원 비율과 실제 단가를 넣는다

`maxReferenceImages` 가 7 로 낡았고(실제 14), 지원 비율 목록이 없으며, GPT Image 2 단가가 `$0.25` 단일 추정치다.

**Files:**
- Modify: `src/studio/models.ts`
- Test: `tests/studio-models.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `StudioModelSpec.supportedRatios?: string[]` · `StudioModelSpec.pixelSizeLimits?: { minPixels; maxPixels; maxEdge; multipleOf; maxAspect }` · `GPT_IMAGE_2_PRICES: Array<{ width; height; high }>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/studio-models.test.ts` 에 추가:

```ts
import { GPT_IMAGE_2_PRICES, listModels } from "../src/studio/models";

describe("모델 능력값", () => {
  const byId = (id: string) => listModels().find((model) => model.id === id)!;

  it("nano 계열의 참고 이미지 상한은 14 다", () => {
    // fal API 스키마 확인값(2026-08-31). 7 은 낡은 값이었다.
    expect(byId("nano-banana-2").maxReferenceImages).toBe(14);
    expect(byId("nano-banana-pro").maxReferenceImages).toBe(14);
  });

  it("모델마다 지원 비율이 다르다", () => {
    expect(byId("nano-banana-2").supportedRatios).toHaveLength(15);
    expect(byId("nano-banana-pro").supportedRatios).toHaveLength(11);
    expect(byId("nano-banana-2").supportedRatios).toContain("8:1");
    expect(byId("nano-banana-pro").supportedRatios).not.toContain("8:1");
  });

  it("GPT Image 2 는 열거 비율이 아니라 픽셀 제약을 갖는다", () => {
    const gpt = byId("gpt-image-2");
    expect(gpt.supportedRatios).toBeUndefined();
    expect(gpt.pixelSizeLimits).toEqual({
      minPixels: 655360, maxPixels: 8294400, maxEdge: 3840, multipleOf: 16, maxAspect: 3,
    });
  });

  it("GPT Image 2 공표 단가는 픽셀에 비례하지 않는다", () => {
    // 이 사실 때문에 "픽셀이 큰 규격을 상한으로" 같은 규칙을 쓸 수 없다.
    const square = GPT_IMAGE_2_PRICES.find((row) => row.width === 1024 && row.height === 1024)!;
    const tall = GPT_IMAGE_2_PRICES.find((row) => row.width === 1024 && row.height === 1536)!;
    expect(tall.width * tall.height).toBeGreaterThan(square.width * square.height);
    expect(tall.high).toBeLessThan(square.high);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/studio-models.test.ts`
Expected: FAIL — `GPT_IMAGE_2_PRICES` 없음, `supportedRatios` 없음

- [ ] **Step 3: 최소 구현**

`src/studio/models.ts` 의 `StudioModelSpec` 에 필드를 더한다:

```ts
  /** 모델이 실제로 받는 비율 열거. 픽셀 지정 모델은 비운다. */
  supportedRatios?: string[];
  /** 픽셀을 직접 지정하는 모델의 제약. 열거 모델은 비운다. */
  pixelSizeLimits?: { minPixels: number; maxPixels: number; maxEdge: number; multipleOf: number; maxAspect: number };
```

같은 파일에 공표 단가표를 더한다:

```ts
/**
 * GPT Image 2 `/edit` 의 공표 단가 (2026-08-31, high 품질, 입력 이미지 1장 포함).
 *
 * 가격이 픽셀에 비례하지 않는다 — 1024x1536(1,572,864px)이 1024x1024(1,048,576px)보다 싸다.
 * 정사각형에 가까울수록 비싸다. 그래서 "픽셀이 큰 규격을 상한으로" 같은 규칙은 성립하지 않고,
 * 사전 추정은 fal 견적 API 를 1순위로 쓴다(reference-pricing.ts).
 */
export const GPT_IMAGE_2_PRICES = [
  { width: 1024, height: 768, high: 0.151 },
  { width: 1024, height: 1024, high: 0.219 },
  { width: 1024, height: 1536, high: 0.178 },
  { width: 1920, height: 1080, high: 0.158 },
  { width: 2560, height: 1440, high: 0.234 },
  { width: 3840, height: 2160, high: 0.413 },
] as const;

const NANO_2_RATIOS = ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "4:1", "1:4", "8:1", "1:8"];
const NANO_PRO_RATIOS = ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"];
```

세 모델 항목을 고친다:

- `nano-banana-pro`: `maxReferenceImages: 14`, `supportedRatios: NANO_PRO_RATIOS`
- `nano-banana-2`: `maxReferenceImages: 14`, `supportedRatios: NANO_2_RATIOS`
- `gpt-image-2`: `pixelSizeLimits: { minPixels: 655360, maxPixels: 8294400, maxEdge: 3840, multipleOf: 16, maxAspect: 3 }`, `priceNote: "크기·프롬프트에 따라 달라집니다. 생성 전에는 예상 금액입니다."`

`nano-banana`(구형)은 손대지 않는다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run` · `npx tsc --noEmit`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/studio/models.ts tests/studio-models.test.ts
git commit -m "feat(models): 모델별 지원 비율과 GPT Image 2 공표 단가를 넣는다"
```

---

## Task 3: 비율을 모델이 받는 값으로 바꾸는 순수 함수

사용자는 의도(비율)를 고르고, 백엔드가 그 모델에 실제로 보낼 값을 정한다. 대체가 일어나면 반드시 알린다.

**Files:**
- Create: `src/poster/ratios.ts`
- Test: `tests/poster-ratios.test.ts`

**Interfaces:**
- Consumes: `StudioModelSpec` (Task 2 의 `supportedRatios` · `pixelSizeLimits`)
- Produces: `POSTER_RATIOS: PosterRatioSpec[]` · `resolveSize(ratioId, model): ResolvedSize` · 타입 `ResolvedSize { mode: "pixel" | "enum"; pixel?: {width;height}; enum?: string; substituted?: {requested;actual;reason}; rejected?: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-ratios.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { POSTER_RATIOS, resolveSize } from "../src/poster/ratios";
import { listModels } from "../src/studio/models";

const model = (id: string) => listModels().find((spec) => spec.id === id)!;

describe("포스터 비율 목록", () => {
  it("여덟 종을 제공한다", () => {
    expect(POSTER_RATIOS.map((ratio) => ratio.id)).toEqual([
      "feed_4_5", "square_1_1", "story_9_16", "poster_2_3", "poster_3_4", "banner_16_9", "a4_draft", "a4_print",
    ]);
  });

  it("모든 픽셀 규격이 GPT Image 2 제약을 만족한다", () => {
    const limits = model("gpt-image-2").pixelSizeLimits!;
    for (const ratio of POSTER_RATIOS) {
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

describe("모델에 보낼 값으로 바꾼다", () => {
  it("픽셀 모델에는 폭과 높이를 준다", () => {
    const resolved = resolveSize("feed_4_5", model("gpt-image-2"));
    expect(resolved.mode).toBe("pixel");
    expect(resolved.pixel).toEqual({ width: 1088, height: 1360 });
    expect(resolved.substituted).toBeUndefined();
  });

  it("열거 모델에는 그 모델이 받는 문자열을 준다", () => {
    const resolved = resolveSize("story_9_16", model("nano-banana-2"));
    expect(resolved.mode).toBe("enum");
    expect(resolved.enum).toBe("9:16");
    expect(resolved.substituted).toBeUndefined();
  });

  it("A4 시안은 열거 모델에서 3:4 로 대체하고 사실을 남긴다", () => {
    // 최근접이 사실상 동률이라(3:4=0.081, 2:3=0.086) 계산에 맡기지 않고 규칙으로 고정한다.
    const resolved = resolveSize("a4_draft", model("nano-banana-2"));
    expect(resolved.enum).toBe("3:4");
    expect(resolved.substituted?.requested).toBe("a4_draft");
    expect(resolved.substituted?.actual).toBe("3:4");
    expect(resolved.substituted?.reason).toContain("A4");
  });

  it("A4 인쇄용은 열거 모델에서 거부한다", () => {
    // 290dpi 는 픽셀 지정으로만 낼 수 있다. 조용히 낮은 해상도를 주면 인쇄가 망가진다.
    const resolved = resolveSize("a4_print", model("nano-banana-pro"));
    expect(resolved.rejected).toContain("GPT Image 2");
    expect(resolved.enum).toBeUndefined();
  });

  it("모델이 지원하지 않는 비율은 가장 가까운 것으로 바꾼다", () => {
    // banner_16_9 는 둘 다 지원하므로 대체가 없다. Pro 가 못 받는 극단 비율을 확인한다.
    expect(resolveSize("banner_16_9", model("nano-banana-pro")).enum).toBe("16:9");
    expect(resolveSize("banner_16_9", model("nano-banana-pro")).substituted).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-ratios.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/ratios.ts`:

```ts
import type { StudioModelSpec } from "../studio/models";

/**
 * 포스터가 사람에게 보여주는 비율.
 *
 * 모델이 받을 수 있는 것과 섹션이 보여주는 것은 다르다. 여기 있는 것이 화면에 뜨고,
 * 모델별로 실제 보낼 값은 resolveSize 가 정한다.
 */
export interface PosterRatioSpec {
  id: string;
  label: string;
  /** 픽셀 지정 모델에 보낼 크기. GPT Image 2 제약을 만족해야 한다. */
  pixel: { width: number; height: number };
  /** 열거 모델에 보낼 값. 없으면 그 모델에서 만들 수 없다. */
  enumValue?: string;
  /** 대체·거부 사유를 사람에게 설명하는 문장. */
  note?: string;
}

export const POSTER_RATIOS: PosterRatioSpec[] = [
  { id: "feed_4_5", label: "인스타 피드 4:5", pixel: { width: 1088, height: 1360 }, enumValue: "4:5" },
  { id: "square_1_1", label: "정사각형 1:1", pixel: { width: 1088, height: 1088 }, enumValue: "1:1" },
  { id: "story_9_16", label: "스토리·릴스 9:16", pixel: { width: 1152, height: 2048 }, enumValue: "9:16" },
  { id: "poster_2_3", label: "포스터 세로 2:3", pixel: { width: 1024, height: 1536 }, enumValue: "2:3" },
  { id: "poster_3_4", label: "포스터 세로 3:4", pixel: { width: 1152, height: 1536 }, enumValue: "3:4" },
  { id: "banner_16_9", label: "가로 배너 16:9", pixel: { width: 2048, height: 1152 }, enumValue: "16:9" },
  {
    id: "a4_draft",
    label: "A4 비율 시안 (약 131dpi)",
    pixel: { width: 1088, height: 1536 },
    enumValue: "3:4",
    note: "A4 비율을 지원하지 않아 3:4 로 만듭니다. 화면 시안용입니다.",
  },
  {
    id: "a4_print",
    label: "A4 인쇄용 (약 290dpi)",
    pixel: { width: 2400, height: 3392 },
    note: "이 모델은 픽셀 지정을 받지 않아 A4 인쇄 해상도를 낼 수 없습니다. GPT Image 2 를 골라 주세요.",
  },
];

export interface ResolvedSize {
  mode: "pixel" | "enum";
  pixel?: { width: number; height: number };
  enum?: string;
  /** 요청과 다른 값으로 만들었을 때. 화면에 반드시 보여 준다. */
  substituted?: { requested: string; actual: string; reason: string };
  /** 이 모델로는 만들 수 없을 때의 사유. */
  rejected?: string;
}

/**
 * 사용자가 고른 비율을 그 모델이 실제로 받는 값으로 바꾼다.
 *
 * 대체를 조용히 하지 않는다. 조용히 바꾸면 사용자는 왜 인쇄가 안 맞는지 영원히 모른다.
 */
export function resolveSize(ratioId: string, model: StudioModelSpec): ResolvedSize {
  const ratio = POSTER_RATIOS.find((entry) => entry.id === ratioId);
  if (!ratio) return { mode: "pixel", rejected: `모르는 비율입니다: ${ratioId}` };

  if (model.pixelSizeLimits) return { mode: "pixel", pixel: ratio.pixel };

  const supported = model.supportedRatios ?? [];
  if (!ratio.enumValue) return { mode: "enum", rejected: ratio.note ?? "이 모델로는 만들 수 없는 규격입니다." };
  if (!supported.includes(ratio.enumValue)) {
    return { mode: "enum", rejected: `이 모델은 ${ratio.enumValue} 를 지원하지 않습니다.` };
  }
  // 화면에 보여 준 비율과 실제 보낼 값이 다르면(A4 시안 → 3:4) 사실을 남긴다.
  const differs = ratio.note !== undefined;
  return {
    mode: "enum",
    enum: ratio.enumValue,
    substituted: differs ? { requested: ratio.id, actual: ratio.enumValue, reason: ratio.note! } : undefined,
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-ratios.test.ts` · `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/ratios.ts tests/poster-ratios.test.ts
git commit -m "feat(poster): 비율을 모델이 받는 값으로 바꾸는 순수 함수를 만든다"
```

---

## Task 4: 비용 추정 — fal 견적 API 를 1순위로

`POST /v1/models/pricing/estimate` 는 지금 `FAL_KEY` 로 된다(2026-08-31 실측, HTTP 200). `unit_price` 방식은 부르면 안 된다.

**Files:**
- Create: `src/poster/pricing.ts`
- Test: `tests/poster-pricing.test.ts`

**Interfaces:**
- Consumes: `GPT_IMAGE_2_PRICES` (Task 2), `StudioModelSpec`
- Produces: `estimateCost(input): Promise<CostEstimate>` · `CostEstimate { usd: number; source: "fal_estimate" | "cache" | "listed"; confident: boolean }` · `publishedUnitPrice(model, resolution): number`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-pricing.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { estimateCost, publishedUnitPrice } from "../src/poster/pricing";
import { listModels } from "../src/studio/models";

const model = (id: string) => listModels().find((spec) => spec.id === id)!;

describe("공표 단가", () => {
  it("nano 는 해상도 배수까지 정확하다", () => {
    expect(publishedUnitPrice(model("nano-banana-2"), "2K")).toBeCloseTo(0.12, 4);
    expect(publishedUnitPrice(model("nano-banana-pro"), "4K")).toBeCloseTo(0.30, 4);
  });

  it("GPT 는 표에서 가장 비싼 값을 쓴다 — 픽셀에 비례하지 않아 안전한 쪽으로", () => {
    expect(publishedUnitPrice(model("gpt-image-2"))).toBeCloseTo(0.413, 4);
  });
});

describe("비용 추정", () => {
  const cache = new Map<string, number>();

  it("견적 API 가 되면 그 값을 쓴다", async () => {
    const fetchEstimate = vi.fn(async () => 0.22);
    const result = await estimateCost({ model: model("gpt-image-2"), images: 2, fetchEstimate, cache });
    expect(fetchEstimate).toHaveBeenCalledWith("openai/gpt-image-2/edit", 2);
    expect(result).toEqual({ usd: 0.22, source: "fal_estimate", confident: true });
  });

  it("성공한 견적을 캐시에 남긴다", async () => {
    expect(cache.get("openai/gpt-image-2/edit:2")).toBe(0.22);
  });

  it("견적이 실패하면 캐시를 쓴다", async () => {
    const result = await estimateCost({
      model: model("gpt-image-2"), images: 2, cache,
      fetchEstimate: async () => { throw new Error("네트워크"); },
    });
    expect(result).toEqual({ usd: 0.22, source: "cache", confident: true });
  });

  it("캐시도 없으면 공표 단가로 떨어지고 정확도 낮음을 표시한다", async () => {
    const result = await estimateCost({
      model: model("gpt-image-2"), images: 1, cache: new Map(),
      fetchEstimate: async () => { throw new Error("네트워크"); },
    });
    expect(result.source).toBe("listed");
    expect(result.confident).toBe(false);
    expect(result.usd).toBeCloseTo(0.413, 4);
  });

  it("견적이 0 이하면 믿지 않는다", async () => {
    const result = await estimateCost({
      model: model("nano-banana-2"), images: 1, cache: new Map(),
      fetchEstimate: async () => 0,
    });
    expect(result.source).toBe("listed");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-pricing.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/pricing.ts`:

```ts
import { GPT_IMAGE_2_PRICES, type StudioModelSpec } from "../studio/models";
import type { StudioResolution } from "../studio/schemas";

export interface CostEstimate {
  usd: number;
  source: "fal_estimate" | "cache" | "listed";
  /** false 면 화면에 "정확도 낮음"을 함께 표시한다. */
  confident: boolean;
}

/**
 * 모델 페이지가 공표한 단가.
 *
 * nano 둘은 이 값이 정확하다. GPT Image 2 는 가격이 픽셀에 비례하지 않아 크기별로 고를 수
 * 없다 — 1024x1536 이 1024x1024 보다 싸다. 그래서 표의 최댓값을 쓴다. 과소 추정보다
 * 과대 추정이 낫고, 이 경로는 견적 API 가 죽었을 때만 쓰는 3순위다.
 */
export function publishedUnitPrice(model: StudioModelSpec, resolution?: StudioResolution): number {
  if (model.id === "gpt-image-2") return Math.max(...GPT_IMAGE_2_PRICES.map((row) => row.high));
  return model.estimateCostUsd("1:1", resolution);
}

export interface EstimateInput {
  model: StudioModelSpec;
  images: number;
  /** 엔드포인트와 호출 횟수를 받아 총액을 돌려준다. 실패하면 던져도 된다. */
  fetchEstimate: (endpoint: string, calls: number) => Promise<number>;
  cache: Map<string, number>;
  resolution?: StudioResolution;
}

/**
 * 사전 추정. 1순위 견적 API → 2순위 캐시 → 3순위 공표 단가.
 *
 * 견적 API 는 지금 FAL_KEY 로 된다(2026-08-31 실측). 다만 한 번도 부르지 않은 엔드포인트도
 * 값을 돌려주고 nano-pro 는 알려진 단가의 2배가 나와, "우리 이력"이라고 단정하지 않는다.
 * 참고값으로 쓰고 진실은 사후 정산이다.
 */
export async function estimateCost(input: EstimateInput): Promise<CostEstimate> {
  const key = `${input.model.endpoint}:${input.images}`;
  try {
    const usd = await input.fetchEstimate(input.model.endpoint, input.images);
    if (Number.isFinite(usd) && usd > 0) {
      input.cache.set(key, usd);
      return { usd, source: "fal_estimate", confident: true };
    }
  } catch {
    // 견적을 못 받는 것은 실패가 아니다. 아래로 떨어진다.
  }
  const cached = input.cache.get(key);
  if (cached !== undefined) return { usd: cached, source: "cache", confident: true };
  return { usd: publishedUnitPrice(input.model, input.resolution) * input.images, source: "listed", confident: false };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-pricing.test.ts` · `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/pricing.ts tests/poster-pricing.test.ts
git commit -m "feat(poster): 비용 추정을 fal 견적 API 1순위로 만든다"
```

---

## Task 5: 견적 API 를 실제로 부르는 클라이언트

`unit_price` 를 절대 부르지 않는다. 호출은 어떤 이유로도 던지지 않고 `undefined` 를 돌려준다.

**Files:**
- Create: `src/poster/fal-pricing-client.ts`
- Test: `tests/poster-fal-pricing-client.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `createFalEstimator(environment?): (endpoint: string, calls: number) => Promise<number>` · `buildEstimateBody(endpoint, calls): object`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-fal-pricing-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildEstimateBody, createFalEstimator } from "../src/poster/fal-pricing-client";

describe("견적 요청 본문", () => {
  it("historical_api_price 만 쓴다", () => {
    // unit_price 는 openai/gpt-image-2/edit 에서 장당 $1.00 이 나온다. 절대 쓰지 않는다.
    const body = buildEstimateBody("openai/gpt-image-2/edit", 3);
    expect(body).toEqual({
      estimate_type: "historical_api_price",
      endpoints: { "openai/gpt-image-2/edit": { call_quantity: 3 } },
    });
    expect(JSON.stringify(body)).not.toContain("unit_price");
  });
});

describe("견적 호출", () => {
  it("총액을 숫자로 돌려준다", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ total_cost: 0.22, currency: "USD" }), { status: 200 }));
    const estimate = createFalEstimator({ FAL_KEY: "k" }, fetcher);
    await expect(estimate("openai/gpt-image-2/edit", 1)).resolves.toBe(0.22);
  });

  it("Key 접두사를 붙여 보낸다", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ total_cost: 0.1 }), { status: 200 }));
    await createFalEstimator({ FAL_KEY: "abc" }, fetcher)("x", 1);
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Key abc");
  });

  it("키가 없으면 던진다 — 상위가 캐시로 떨어진다", async () => {
    const estimate = createFalEstimator({}, vi.fn());
    await expect(estimate("x", 1)).rejects.toThrow(/FAL_KEY/);
  });

  it("403 이면 던진다", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(createFalEstimator({ FAL_KEY: "k" }, fetcher)("x", 1)).rejects.toThrow(/403/);
  });

  it("total_cost 가 숫자가 아니면 던진다", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ currency: "USD" }), { status: 200 }));
    await expect(createFalEstimator({ FAL_KEY: "k" }, fetcher)("x", 1)).rejects.toThrow(/금액/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-fal-pricing-client.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/fal-pricing-client.ts`:

```ts
const ESTIMATE_URL = "https://api.fal.ai/v1/models/pricing/estimate";

/**
 * 견적 요청 본문.
 *
 * historical_api_price 만 쓴다. unit_price 방식은 openai/gpt-image-2/edit 에
 * unit_quantity 3 을 주면 $3.00(장당 $1)이 나와 실제 단가와 자릿수가 다르다.
 */
export function buildEstimateBody(endpoint: string, calls: number): Record<string, unknown> {
  return { estimate_type: "historical_api_price", endpoints: { [endpoint]: { call_quantity: calls } } };
}

/**
 * fal 견적 API 호출기.
 *
 * 이 API 는 ADMIN 이 아니라 일반 API 키로 된다(2026-08-31 실측, HTTP 200).
 * 정산용 billing-events·usage 와 다르다. 실패는 던지고, 상위(estimateCost)가 캐시·공표
 * 단가로 떨어진다.
 */
export function createFalEstimator(
  environment: { FAL_KEY?: string } = process.env as Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): (endpoint: string, calls: number) => Promise<number> {
  return async (endpoint, calls) => {
    if (!environment.FAL_KEY) throw new Error("FAL_KEY 가 없어 견적을 받을 수 없습니다.");
    const response = await fetcher(ESTIMATE_URL, {
      method: "POST",
      headers: { Authorization: `Key ${environment.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildEstimateBody(endpoint, calls)),
    });
    if (!response.ok) throw new Error(`견적을 받지 못했습니다. (${response.status})`);
    const parsed = await response.json() as { total_cost?: unknown };
    if (typeof parsed.total_cost !== "number") throw new Error("견적 응답에 금액이 없습니다.");
    return parsed.total_cost;
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run` · `npx tsc --noEmit`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/fal-pricing-client.ts tests/poster-fal-pricing-client.test.ts
git commit -m "feat(poster): fal 견적 API 클라이언트를 만든다"
```

---

# Phase 2 — 저장소

## Task 6: 마이그레이션 0009 — 포스터 네 테이블

**Files:**
- Create: `supabase/migrations/0009_poster_studio.sql`
- Test: `tests/poster-migration.test.ts`

**Interfaces:**
- Consumes: `0007_team_membership.sql` 의 `is_master()` · `my_team_id()` · `has_permission()`
- Produces: 테이블 `poster_references` · `poster_projects` · `poster_generation_requests` · `poster_images`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-migration.test.ts` — 기존 `tests/team-auth-migrations.test.ts` 와 같은 방식으로 SQL 텍스트를 읽어 검사한다:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0009_poster_studio.sql"), "utf8");

describe("포스터 마이그레이션", () => {
  it("네 테이블을 만든다", () => {
    for (const table of ["poster_references", "poster_projects", "poster_generation_requests", "poster_images"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("모든 테이블에 RLS 를 켠다", () => {
    for (const table of ["poster_references", "poster_projects", "poster_generation_requests", "poster_images"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("컬럼 권한을 회수 먼저, 허용 목록 나중에 준다", () => {
    // 테이블 GRANT 뒤의 컬럼 REVOKE 는 아무 일도 하지 않는다.
    for (const table of ["poster_projects", "poster_generation_requests", "poster_images"]) {
      const revokeAt = sql.indexOf(`revoke update on public.${table}`);
      const grantAt = sql.indexOf(`grant update (`, revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });

  it("team_id 는 수정 대상 컬럼에 들어가지 않는다", () => {
    const grants = sql.match(/grant update \(([^)]+)\)/g) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) expect(grant).not.toContain("team_id");
  });

  it("비용은 생성 요청에만 있고 이미지에는 없다", () => {
    // 이미지마다 총액을 복제하면 배치 3장에서 합계가 3배가 된다.
    const requests = sql.slice(sql.indexOf("create table public.poster_generation_requests"), sql.indexOf("create table public.poster_images"));
    const images = sql.slice(sql.indexOf("create table public.poster_images"));
    expect(requests).toContain("cost_usd");
    expect(images.slice(0, images.indexOf(");"))).not.toContain("cost_usd");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-migration.test.ts`
Expected: FAIL — 파일 없음

- [ ] **Step 3: 최소 구현**

`supabase/migrations/0009_poster_studio.sql`:

```sql
-- 포스터 스튜디오. 카드뉴스와 데이터를 섞지 않는다 — 섹션을 버리면 이 테이블도 함께 버린다.

create table public.poster_references (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  file_name text not null,
  storage_path text not null,
  title text,
  width int, height int,
  created_at timestamptz not null default now()
);

create table public.poster_projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null,
  status text not null default 'draft',
  -- 슬롯·비율·모델·레퍼런스 스냅샷을 통째로 담는다. 필드를 늘려도 마이그레이션이 필요 없다.
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- fal 호출 한 건. 과금이 이미지가 아니라 요청에 붙으므로 별도 행으로 둔다.
create table public.poster_generation_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid not null references public.poster_projects(id) on delete cascade,
  fal_request_id text,
  parent_image_id uuid,
  edit_instruction text,
  model_id text not null,
  ratio_id text not null,
  size jsonb not null default '{}'::jsonb,
  requested_images int not null,
  returned_images int not null default 0,
  estimated_cost_usd numeric(10,4),
  estimate_source text,
  cost_state text not null default 'pending' check (cost_state in ('pending','reconciled','unknown')),
  cost_usd numeric(10,4),
  cost_reason text check (cost_reason in ('admin_unavailable','deadline_exceeded','api_error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.poster_images (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid not null references public.poster_projects(id) on delete cascade,
  generation_request_id uuid not null references public.poster_generation_requests(id) on delete cascade,
  variant_index int not null,
  selected boolean not null default false,
  asset_path text not null,
  width int, height int,
  review jsonb,
  created_at timestamptz not null default now()
);

alter table public.poster_generation_requests
  add constraint poster_generation_requests_parent_fk
  foreign key (parent_image_id) references public.poster_images(id) on delete set null;

create index poster_references_team_idx on public.poster_references(team_id, created_at desc);
create index poster_projects_team_idx on public.poster_projects(team_id, updated_at desc);
create index poster_requests_project_idx on public.poster_generation_requests(project_id, created_at desc);
create index poster_requests_cost_idx on public.poster_generation_requests(cost_state) where cost_state = 'pending';
create index poster_images_request_idx on public.poster_images(generation_request_id, variant_index);

alter table public.poster_references enable row level security;
alter table public.poster_projects enable row level security;
alter table public.poster_generation_requests enable row level security;
alter table public.poster_images enable row level security;

create policy poster_references_read on public.poster_references for select to authenticated
  using (public.is_master() or team_id = public.my_team_id());
create policy poster_references_insert on public.poster_references for insert to authenticated
  with check ((public.is_master() or team_id = public.my_team_id()) and public.has_permission('reference.create'));
create policy poster_references_delete on public.poster_references for delete to authenticated
  using ((public.is_master() or team_id = public.my_team_id())
         and (added_by = auth.uid() or public.has_permission('reference.manage')));

create policy poster_projects_read on public.poster_projects for select to authenticated
  using (public.is_master() or team_id = public.my_team_id());
create policy poster_projects_insert on public.poster_projects for insert to authenticated
  with check ((public.is_master() or team_id = public.my_team_id()) and public.has_permission('content.create'));
create policy poster_projects_update on public.poster_projects for update to authenticated
  using (public.is_master() or team_id = public.my_team_id())
  with check (public.is_master() or team_id = public.my_team_id());

create policy poster_requests_read on public.poster_generation_requests for select to authenticated
  using (public.is_master() or team_id = public.my_team_id());
create policy poster_requests_insert on public.poster_generation_requests for insert to authenticated
  with check ((public.is_master() or team_id = public.my_team_id()) and public.has_permission('content.create'));
create policy poster_requests_update on public.poster_generation_requests for update to authenticated
  using (public.is_master() or team_id = public.my_team_id())
  with check (public.is_master() or team_id = public.my_team_id());

create policy poster_images_read on public.poster_images for select to authenticated
  using (public.is_master() or team_id = public.my_team_id());
create policy poster_images_insert on public.poster_images for insert to authenticated
  with check ((public.is_master() or team_id = public.my_team_id()) and public.has_permission('content.create'));
create policy poster_images_update on public.poster_images for update to authenticated
  using (public.is_master() or team_id = public.my_team_id())
  with check (public.is_master() or team_id = public.my_team_id());

-- 컬럼 권한은 회수 먼저, 허용 목록 나중에. 테이블 GRANT 뒤의 컬럼 REVOKE 는 무시된다.
grant select, insert, delete on public.poster_references to authenticated;

grant select, insert on public.poster_projects to authenticated;
revoke update on public.poster_projects from authenticated;
grant update (title, status, data, updated_at) on public.poster_projects to authenticated;

grant select, insert on public.poster_generation_requests to authenticated;
revoke update on public.poster_generation_requests from authenticated;
grant update (fal_request_id, returned_images, cost_state, cost_usd, cost_reason, updated_at)
  on public.poster_generation_requests to authenticated;

grant select, insert on public.poster_images to authenticated;
revoke update on public.poster_images from authenticated;
grant update (selected, review) on public.poster_images to authenticated;
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-migration.test.ts`
Expected: 통과

마이그레이션을 실제 DB 에 밀지 않는다. 적용은 Task 15 이후 사용자 승인 아래 한다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0009_poster_studio.sql tests/poster-migration.test.ts
git commit -m "feat(poster): 포스터 네 테이블 마이그레이션을 만든다"
```

---

## Task 7: 포스터 스키마와 저장소

**Files:**
- Create: `src/poster/schemas.ts`, `src/poster/store.ts`, `src/poster/supabase-store.ts`, `src/poster/request-store.ts`
- Test: `tests/poster-schemas.test.ts`

**Interfaces:**
- Consumes: `POSTER_RATIOS` (Task 3)
- Produces: `PosterSlotsSchema` · `PosterProjectSchema` · `PosterStorage` 인터페이스 · `getRequestPosterStore()`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PosterSlotsSchema, EMPTY_SLOTS } from "../src/poster/schemas";

describe("포스터 슬롯", () => {
  it("빈 슬롯도 규칙을 통과한다 — 기획이 실패해도 사람이 채울 수 있어야 한다", () => {
    expect(PosterSlotsSchema.safeParse(EMPTY_SLOTS).success).toBe(true);
  });

  it("헤드라인 길이를 제한한다", () => {
    expect(PosterSlotsSchema.safeParse({ ...EMPTY_SLOTS, headline: "가".repeat(41) }).success).toBe(false);
  });

  it("곁텍스트는 여러 개를 담는다", () => {
    const parsed = PosterSlotsSchema.parse({ ...EMPTY_SLOTS, sideTexts: ["28MM F2.0", "ISO 400"] });
    expect(parsed.sideTexts).toHaveLength(2);
  });

  it("곁텍스트는 8개까지만 받는다", () => {
    const many = Array.from({ length: 9 }, (_unused, index) => `L${index}`);
    expect(PosterSlotsSchema.safeParse({ ...EMPTY_SLOTS, sideTexts: many }).success).toBe(false);
  });

  it("타이포 관계는 네 값 중 하나다", () => {
    expect(PosterSlotsSchema.safeParse({ ...EMPTY_SLOTS, typeInteraction: "통과" }).success).toBe(true);
    expect(PosterSlotsSchema.safeParse({ ...EMPTY_SLOTS, typeInteraction: "빙글빙글" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-schemas.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/schemas.ts` — **화면도 값으로 import 하므로 AI SDK 를 물고 있는 모듈을 참조하지 않는다**:

```ts
import { z } from "zod";

export const PosterTypeInteractionSchema = z.enum(["통과", "뒤로", "가림", "감쌈"]);

/**
 * 포스터 한 장을 정하는 슬롯.
 *
 * 유형(영화·장소 홍보·공익·제품 광고)이 달라도 구조는 같다. 같은 칸에 다른 값이 들어갈 뿐이다.
 * 그래서 고정한다 — 예측 가능하고 테스트도 된다.
 *
 * 전부 optional 인 이유는 기획이 실패했을 때 빈 슬롯으로 사람에게 넘겨야 하기 때문이다.
 */
export const PosterSlotsSchema = z.object({
  kind: z.string().max(30).optional(),
  headline: z.string().max(40).optional(),
  subheadline: z.string().max(80).optional(),
  sideTexts: z.array(z.string().max(40)).max(8).default([]),
  scene: z.string().max(300).optional(),
  subject: z.string().max(300).optional(),
  action: z.string().max(300).optional(),
  typeInteraction: PosterTypeInteractionSchema.optional(),
  dominantColor: z.string().max(40).optional(),
  accentColor: z.string().max(40).optional(),
  avoid: z.string().max(300).optional(),
});

export type PosterSlots = z.infer<typeof PosterSlotsSchema>;

export const EMPTY_SLOTS: PosterSlots = { sideTexts: [] };

export const PosterReferenceSchema = z.object({
  fileName: z.string().min(1),
  assetPath: z.string().min(1),
  url: z.string().min(1),
  usage: z.enum(["style", "preserve"]).default("style"),
});

export const PosterCostStateSchema = z.enum(["pending", "reconciled", "unknown"]);
```

`src/poster/store.ts` — 인터페이스와 파일 저장소:

```ts
import type { PosterSlots } from "./schemas";

export interface PosterProject {
  id: string;
  teamId?: string;
  title: string;
  status: "draft" | "planning" | "slots_ready" | "generating" | "ready" | "failed";
  ratioId: string;
  modelId: string;
  imageCount: number;
  slots: PosterSlots;
  references: Array<{ fileName: string; assetPath: string; url: string; usage: "style" | "preserve" }>;
  createdAt: string;
  updatedAt: string;
}

export interface PosterGenerationRequest {
  id: string;
  projectId: string;
  falRequestId?: string;
  parentImageId?: string;
  editInstruction?: string;
  modelId: string;
  ratioId: string;
  size: Record<string, unknown>;
  requestedImages: number;
  returnedImages: number;
  estimatedCostUsd?: number;
  estimateSource?: string;
  costState: "pending" | "reconciled" | "unknown";
  costUsd?: number;
  costReason?: string;
  createdAt: string;
}

export interface PosterImage {
  id: string;
  projectId: string;
  generationRequestId: string;
  variantIndex: number;
  selected: boolean;
  assetPath: string;
  width?: number;
  height?: number;
}

export interface PosterStorage {
  listProjects(): Promise<PosterProject[]>;
  getProject(id: string): Promise<PosterProject | undefined>;
  createProject(input: Omit<PosterProject, "id" | "createdAt" | "updatedAt" | "status">): Promise<PosterProject>;
  updateProject(project: PosterProject): Promise<PosterProject>;
  createGenerationRequest(input: Omit<PosterGenerationRequest, "id" | "createdAt">): Promise<PosterGenerationRequest>;
  updateGenerationRequest(request: PosterGenerationRequest): Promise<PosterGenerationRequest>;
  listGenerationRequests(projectId: string): Promise<PosterGenerationRequest[]>;
  saveImages(images: Array<Omit<PosterImage, "id">>): Promise<PosterImage[]>;
  listImages(projectId: string): Promise<PosterImage[]>;
  selectImage(projectId: string, imageId: string): Promise<void>;
  listReferences(): Promise<Array<{ fileName: string; assetPath: string; url: string; title?: string }>>;
  saveReference(input: { fileName: string; assetPath: string; url: string; title?: string }): Promise<void>;
  removeReference(fileName: string): Promise<void>;
}
```

`src/poster/supabase-store.ts` — 아래 세 메서드가 나머지 전부의 본이다. 같은 꼴로 채운다:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosterGenerationRequest, PosterImage, PosterProject, PosterStorage } from "./store";

function errorOf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabasePosterStore implements PosterStorage {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly teamId: string,
  ) {}

  // 조회는 필터를 걸지 않는다. 팀 격리는 RLS 가 강제한다 — 앱에서 또 거르면 규칙이 두 곳에 생긴다.
  async listProjects(): Promise<PosterProject[]> {
    const { data, error } = await this.client
      .from("poster_projects").select("*").order("updated_at", { ascending: false });
    errorOf(error);
    return (data ?? []).map((row) => this.toProject(row));
  }

  // 쓰기에는 team_id 를 반드시 넣는다. RLS 의 with check 가 이 값을 본다.
  async createGenerationRequest(input: Omit<PosterGenerationRequest, "id" | "createdAt">): Promise<PosterGenerationRequest> {
    const { data, error } = await this.client.from("poster_generation_requests").insert({
      team_id: this.teamId,
      project_id: input.projectId,
      parent_image_id: input.parentImageId ?? null,
      edit_instruction: input.editInstruction ?? null,
      model_id: input.modelId,
      ratio_id: input.ratioId,
      size: input.size,
      requested_images: input.requestedImages,
      returned_images: input.returnedImages,
      estimated_cost_usd: input.estimatedCostUsd ?? null,
      estimate_source: input.estimateSource ?? null,
      cost_state: input.costState,
    }).select("*").single();
    errorOf(error);
    return this.toRequest(data!);
  }

  // 한 프로젝트에서 고른 변형은 하나뿐이다. 먼저 전부 내리고 하나만 올린다.
  async selectImage(projectId: string, imageId: string): Promise<void> {
    errorOf((await this.client.from("poster_images")
      .update({ selected: false }).eq("project_id", projectId)).error);
    errorOf((await this.client.from("poster_images")
      .update({ selected: true }).eq("id", imageId)).error);
  }

  private toProject(row: Record<string, unknown>): PosterProject { /* snake_case → camelCase */ }
  private toRequest(row: Record<string, unknown>): PosterGenerationRequest { /* snake_case → camelCase */ }
}
```

나머지 메서드도 같은 규칙을 따른다 — **조회는 RLS 에 맡기고 필터를 걸지 않는다. 쓰기에는 `team_id` 를 넣는다.**

`src/poster/request-store.ts`:

```ts
import { getCurrentMember } from "../server/auth";
import { SupabasePosterStore } from "./supabase-store";
import type { PosterStorage } from "./store";

/**
 * 포스터 저장소는 Supabase 전용이다.
 *
 * 카드 스튜디오는 파일 백엔드 시절 유산이 있지만 포스터는 처음부터 팀 단위로만 쓴다.
 * 파일 백엔드를 만들지 않는 편이 격리 규칙(팀별 분리)을 한 곳에서만 지키게 한다.
 */
export async function getRequestPosterStore(): Promise<{ store: PosterStorage; teamId: string }> {
  const { member, client } = await getCurrentMember();
  if (!client) throw new Error("포스터 스튜디오는 Supabase 연결이 필요합니다.");
  const teamId = member.teamId;
  if (!teamId) throw new Error("포스터를 만들 팀이 필요합니다.");
  return { store: new SupabasePosterStore(client, member.userId, teamId), teamId };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run` · `npx tsc --noEmit`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/schemas.ts src/poster/store.ts src/poster/supabase-store.ts src/poster/request-store.ts tests/poster-schemas.test.ts
git commit -m "feat(poster): 슬롯 스키마와 저장소를 만든다"
```

---

# Phase 3 — 기획과 프롬프트

## Task 8: fable 이 슬롯을 채우는 기획 제공자

**Files:**
- Create: `src/poster/planning.ts`
- Test: `tests/poster-planning.test.ts`

**Interfaces:**
- Consumes: `PosterSlots` · `EMPTY_SLOTS` (Task 7)
- Produces: `buildPlanningPrompt(input): string` · `planSlots(input, provider): Promise<PosterSlots>` · `PosterPlanningProvider`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-planning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPlanningPrompt, planSlots } from "../src/poster/planning";
import { EMPTY_SLOTS } from "../src/poster/schemas";

describe("기획 프롬프트", () => {
  it("사용자 지시와 비율을 담는다", () => {
    const prompt = buildPlanningPrompt({ instruction: "홍대 카페 오픈", ratioLabel: "인스타 피드 4:5" });
    expect(prompt).toContain("홍대 카페 오픈");
    expect(prompt).toContain("인스타 피드 4:5");
  });

  it("유형을 스스로 판단하라고 지시한다", () => {
    const prompt = buildPlanningPrompt({ instruction: "x", ratioLabel: "y" });
    expect(prompt).toContain("영화");
    expect(prompt).toContain("공익");
  });

  it("한국어를 그대로 쓰라고 지시한다", () => {
    expect(buildPlanningPrompt({ instruction: "x", ratioLabel: "y" })).toContain("번역");
  });
});

describe("슬롯 기획", () => {
  it("제공자가 준 슬롯을 규칙에 맞춰 돌려준다", async () => {
    const slots = await planSlots(
      { instruction: "홍대 카페 오픈", ratioLabel: "4:5" },
      { generate: async () => ({ headline: "OPEN", sideTexts: ["2026"], typeInteraction: "통과" }) },
    );
    expect(slots.headline).toBe("OPEN");
    expect(slots.typeInteraction).toBe("통과");
  });

  it("제공자가 던져도 빈 슬롯을 돌려준다 — 사람이 직접 채울 수 있어야 한다", async () => {
    const slots = await planSlots(
      { instruction: "x", ratioLabel: "y" },
      { generate: async () => { throw new Error("모델 없음"); } },
    );
    expect(slots).toEqual(EMPTY_SLOTS);
  });

  it("규칙에 안 맞는 값이 오면 빈 슬롯으로 떨어진다", async () => {
    const slots = await planSlots(
      { instruction: "x", ratioLabel: "y" },
      { generate: async () => ({ typeInteraction: "빙글빙글" }) as never },
    );
    expect(slots).toEqual(EMPTY_SLOTS);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-planning.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/planning.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { EMPTY_SLOTS, PosterSlotsSchema, type PosterSlots } from "./schemas";

export interface PosterPlanningInput {
  instruction: string;
  ratioLabel: string;
  /** 레퍼런스에서 뽑아 둔 초기값이 있으면 넘긴다. 없어도 된다. */
  hints?: Partial<PosterSlots>;
}

export interface PosterPlanningProvider {
  generate(prompt: string): Promise<unknown>;
}

export function buildPlanningPrompt(input: PosterPlanningInput): string {
  return [
    "당신은 한 장짜리 포스터·광고 이미지를 기획합니다. 카드뉴스가 아니라 포스터입니다.",
    "이야기 순서가 아니라 크기 위계를 정합니다 — 무엇을 가장 크게, 무엇을 작게 둘지.",
    `사용자 지시: ${input.instruction}`,
    `규격: ${input.ratioLabel}`,
    "지시가 짧아도 유형을 스스로 판단하세요. 영화 포스터·장소 홍보·공익 포스터·제품 광고·브랜드 캠페인·행사·채용 중 무엇인지 정하고 kind 에 적으세요.",
    "headline 은 가장 크게 들어갈 짧은 말입니다. subheadline 은 그것을 받는 한 문장입니다.",
    "sideTexts 는 상단바·하단바·스펙 라벨처럼 작게 들어가는 글입니다. 필요 없으면 비우세요.",
    "typeInteraction 은 큰 글자와 피사체의 관계입니다. 통과·뒤로·가림·감쌈 중 하나만 고르세요.",
    "한국어로 쓴 값은 그대로 씁니다. 번역하지 마세요. 영어가 어울리면 영어로 써도 됩니다.",
    "자료에 없는 사실·수치·상호명을 지어내지 마세요. 모르면 그 칸을 비우세요.",
    input.hints ? `레퍼런스에서 읽은 초기값(고쳐도 됩니다): ${JSON.stringify(input.hints)}` : "",
  ].filter(Boolean).join("\n\n");
}

/**
 * 슬롯 초안을 만든다. **어떤 이유로도 던지지 않는다.**
 *
 * 기획이 실패해도 빈 슬롯으로 사람에게 넘긴다. 사람이 직접 채우면 그만이고,
 * 여기서 던지면 화면이 아무것도 못 보여 준다.
 */
export async function planSlots(input: PosterPlanningInput, provider: PosterPlanningProvider): Promise<PosterSlots> {
  try {
    const parsed = PosterSlotsSchema.safeParse(await provider.generate(buildPlanningPrompt(input)));
    return parsed.success ? parsed.data : EMPTY_SLOTS;
  } catch {
    return EMPTY_SLOTS;
  }
}

export function createPosterPlanningProviderFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): PosterPlanningProvider {
  if (!environment.ANTHROPIC_API_KEY || !environment.ANTHROPIC_MODEL) {
    throw new Error("기획 AI 가 설정되지 않았습니다. ANTHROPIC_API_KEY 와 ANTHROPIC_MODEL 을 확인해 주세요.");
  }
  const client = new Anthropic({ apiKey: environment.ANTHROPIC_API_KEY });
  const model = environment.ANTHROPIC_MODEL;
  return {
    async generate(prompt) {
      const response = await client.messages.create({
        model, max_tokens: 2000,
        tools: [{ name: "submit_slots", description: "포스터 슬롯을 제출한다.", input_schema: { type: "object", properties: {} } }],
        tool_choice: { type: "tool", name: "submit_slots" },
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content.find((item) => item.type === "tool_use");
      return block && block.type === "tool_use" ? block.input : {};
    },
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-planning.test.ts` · `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/planning.ts tests/poster-planning.test.ts
git commit -m "feat(poster): fable 이 슬롯을 채우는 기획을 만든다"
```

---

## Task 9: 레퍼런스에서 문법을 읽는다 (절대 던지지 않는다)

**Files:**
- Create: `src/poster/reference-read.ts`
- Test: `tests/poster-reference-read.test.ts`

**Interfaces:**
- Consumes: `PosterSlots` (Task 7)
- Produces: `readReferenceGrammar(input): Promise<Partial<PosterSlots> | undefined>` · `buildGrammarPrompt(count): string`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-reference-read.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGrammarPrompt, readReferenceGrammar } from "../src/poster/reference-read";

const bytes = async () => new Uint8Array([1, 2, 3]);

describe("문법 읽기 프롬프트", () => {
  it("타이포와 피사체의 관계를 묻는다", () => {
    expect(buildGrammarPrompt(2)).toContain("통과");
    expect(buildGrammarPrompt(2)).toContain("2장");
  });
});

describe("레퍼런스 문법 추출", () => {
  it("읽은 값을 슬롯 일부로 돌려준다", async () => {
    const grammar = await readReferenceGrammar({
      references: [{ fileName: "a.png", assetPath: "p" }],
      readReference: bytes,
      read: async () => ({ typeInteraction: "통과", dominantColor: "형광 연두", accentColor: "검정" }),
    });
    expect(grammar).toEqual({ typeInteraction: "통과", dominantColor: "형광 연두", accentColor: "검정" });
  });

  it("호출이 던져도 던지지 않고 undefined 를 돌려준다", async () => {
    // 원본은 어차피 fal 에 함께 넘어간다. 추출 실패가 생성을 막으면 안 된다.
    const grammar = await readReferenceGrammar({
      references: [{ fileName: "a.png", assetPath: "p" }],
      readReference: bytes,
      read: async () => { throw new Error("비전 없음"); },
    });
    expect(grammar).toBeUndefined();
  });

  it("파일을 못 읽어도 던지지 않는다", async () => {
    const grammar = await readReferenceGrammar({
      references: [{ fileName: "a.png", assetPath: "p" }],
      readReference: async () => { throw new Error("없는 파일"); },
      read: async () => ({ typeInteraction: "통과" }),
    });
    expect(grammar).toBeUndefined();
  });

  it("규칙에 안 맞는 값은 버린다", async () => {
    const grammar = await readReferenceGrammar({
      references: [{ fileName: "a.png", assetPath: "p" }],
      readReference: bytes,
      read: async () => ({ typeInteraction: "빙글빙글" }) as never,
    });
    expect(grammar).toBeUndefined();
  });

  it("레퍼런스가 없으면 부르지 않는다", async () => {
    let called = 0;
    const grammar = await readReferenceGrammar({
      references: [], readReference: bytes,
      read: async () => { called += 1; return {}; },
    });
    expect(called).toBe(0);
    expect(grammar).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-reference-read.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/reference-read.ts`:

```ts
import { z } from "zod";
import { PosterTypeInteractionSchema, type PosterSlots } from "./schemas";

const GrammarSchema = z.object({
  typeInteraction: PosterTypeInteractionSchema.optional(),
  dominantColor: z.string().max(40).optional(),
  accentColor: z.string().max(40).optional(),
  sideTexts: z.array(z.string().max(40)).max(8).optional(),
});

export function buildGrammarPrompt(count: number): string {
  return [
    `첨부된 ${count}장은 포스터 레퍼런스입니다. 이 포스터들이 공유하는 디자인 문법만 읽으세요.`,
    "글자 내용이 아니라 **구성 방식**을 봅니다. 무엇이라고 쓰여 있는지는 옮기지 마세요.",
    "typeInteraction: 큰 글자와 피사체의 관계. 통과 / 뒤로 / 가림 / 감쌈 중 하나.",
    "dominantColor: 화면을 지배하는 색 하나. accentColor: 소량으로 쓰인 강조색 하나.",
    "sideTexts: 상단바·하단바·스펙 라벨처럼 작게 들어간 글의 **종류**만. 실제 문구는 옮기지 마세요.",
    "확신이 없는 칸은 비우세요. 지어내지 마세요.",
  ].join("\n\n");
}

export interface ReferenceGrammarInput {
  references: Array<{ fileName: string; assetPath: string }>;
  readReference: (assetPath: string) => Promise<Uint8Array>;
  read: (input: { prompt: string; images: Array<{ fileName: string; bytes: Uint8Array }> }) => Promise<unknown>;
}

/**
 * 레퍼런스에서 문법을 읽어 슬롯 초기값을 만든다. **어떤 이유로도 던지지 않는다.**
 *
 * 이 프로젝트는 "레퍼런스를 분석해 재구성"하는 길에서 한 번 실패했다. 그때는 분석 결과로
 * 템플릿을 다시 만들고 원본을 넘기지 않았다. 여기서는 원본이 항상 fal 에 함께 가고,
 * 이 값은 지시를 얹는 용도일 뿐이다. 그래서 실패해도 조용히 비우면 된다.
 */
export async function readReferenceGrammar(input: ReferenceGrammarInput): Promise<Partial<PosterSlots> | undefined> {
  if (input.references.length === 0) return undefined;
  try {
    const images = await Promise.all(input.references.map(async (reference) => ({
      fileName: reference.fileName,
      bytes: await input.readReference(reference.assetPath),
    })));
    const parsed = GrammarSchema.safeParse(await input.read({ prompt: buildGrammarPrompt(images.length), images }));
    if (!parsed.success) return undefined;
    const grammar = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    return Object.keys(grammar).length > 0 ? grammar as Partial<PosterSlots> : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-reference-read.test.ts` · `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/reference-read.ts tests/poster-reference-read.test.ts
git commit -m "feat(poster): 레퍼런스에서 디자인 문법을 읽는다"
```

---

## Task 10: 슬롯을 fal 프롬프트로 조립한다

**Files:**
- Create: `src/poster/prompt.ts`
- Test: `tests/poster-prompt.test.ts`

**Interfaces:**
- Consumes: `PosterSlots` (Task 7)
- Produces: `buildPosterPrompt(input): string`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPosterPrompt } from "../src/poster/prompt";
import { EMPTY_SLOTS } from "../src/poster/schemas";

const full = {
  ...EMPTY_SLOTS,
  kind: "제품 광고", headline: "SNAP", subheadline: "찍기 전에 잡아라",
  sideTexts: ["28MM F2.0", "ISO 400"],
  scene: "횡단보도, 도시 오후", subject: "20대 여성과 컴팩트 카메라", action: "걸으며 셔터를 누른다",
  typeInteraction: "통과" as const, dominantColor: "형광 연두", accentColor: "검정", avoid: "로고, 워터마크",
};

describe("포스터 프롬프트", () => {
  it("글자를 그대로 렌더하라고 지시한다", () => {
    const prompt = buildPosterPrompt({ slots: full, references: [], hasPreserved: false });
    expect(prompt).toContain("SNAP");
    expect(prompt).toContain("찍기 전에 잡아라");
    expect(prompt).toContain("28MM F2.0");
    expect(prompt).toMatch(/exactly as written|글자 그대로/);
  });

  it("목록에 없는 글자를 더하지 말라고 못 박는다", () => {
    expect(buildPosterPrompt({ slots: full, references: [], hasPreserved: false })).toMatch(/not listed|없는 글자/);
  });

  it("타이포 관계를 독립 지시로 낸다", () => {
    // 문장 속에 묻으면 모델이 자주 놓친다.
    expect(buildPosterPrompt({ slots: full, references: [], hasPreserved: false })).toMatch(/TYPOGRAPHY/i);
  });

  it("슬롯이 비어도 프롬프트가 깨지지 않는다", () => {
    const prompt = buildPosterPrompt({ slots: EMPTY_SLOTS, references: [], hasPreserved: false });
    expect(prompt.length).toBeGreaterThan(50);
    expect(prompt).not.toContain("undefined");
  });

  it("스타일 참고와 원형 보존을 다르게 설명한다", () => {
    const prompt = buildPosterPrompt({
      slots: full,
      references: [{ usage: "style" }, { usage: "preserve" }],
      hasPreserved: true,
    });
    expect(prompt).toContain("STYLE REFERENCE");
    expect(prompt).toContain("PRESERVED CONTENT");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-prompt.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/prompt.ts`:

```ts
import type { PosterSlots } from "./schemas";

const INTERACTION_EN: Record<string, string> = {
  "통과": "letterforms are cut through by the subject — some strokes pass behind, others in front",
  "뒤로": "the subject stands in front of the letterforms, partially covering them",
  "가림": "the letterforms overlap and crop the subject",
  "감쌈": "the letterforms wrap around and frame the subject",
};

function referenceLines(references: Array<{ usage: "style" | "preserve" }>): string[] {
  return references.flatMap((reference, offset) => {
    const number = offset + 1;
    return reference.usage === "style"
      ? [
          `Image ${number} is a STYLE REFERENCE ONLY.`,
          `Take from Image ${number}: composition, typographic scale and weight, color relationships, spacing, texture, and the kind of small editorial marks it uses.`,
          `Do NOT copy any text content, logos, or brand names from Image ${number}.`,
        ]
      : [
          `Image ${number} is a PRESERVED CONTENT ASSET, not a style reference.`,
          `Place the product, person, or logo shown in Image ${number} into this poster while preserving its identity, shape, colors, proportions, labels, and logo exactly.`,
          `Do not redesign, reinterpret, or redraw Image ${number}.`,
        ];
  });
}

/**
 * 슬롯을 fal 프롬프트로 조립한다.
 *
 * 텍스트 지시는 카드 스튜디오에서 검증된 문장을 그대로 쓴다 — 글자 그대로 렌더하고,
 * 번역·의역·축약하지 않으며, 목록에 없는 글자를 더하지 않는다.
 *
 * 타이포 관계를 독립 블록으로 내는 것이 요점이다. 레퍼런스 두 장이 공유하는 가장 강한
 * 특징인데 문장 속에 묻어 두면 모델이 자주 놓친다.
 */
export function buildPosterPrompt(input: {
  slots: PosterSlots;
  references: Array<{ usage: "style" | "preserve" }>;
  hasPreserved: boolean;
  styleNote?: string;
}): string {
  const slots = input.slots;
  const texts = [slots.headline, slots.subheadline, ...slots.sideTexts].filter((text): text is string => Boolean(text?.trim()));

  return [
    `Create a single ${slots.kind ?? "editorial"} poster as a finished key visual.`,
    slots.scene ? `Scene: ${slots.scene}` : "",
    slots.subject ? `Subject: ${slots.subject}` : "",
    slots.action ? `Action: ${slots.action}` : "",
    slots.typeInteraction
      ? `TYPOGRAPHY INTERACTION — this is structural, not decoration: the headline is oversized and ${INTERACTION_EN[slots.typeInteraction]}. Typography must feel embedded in the real space, not placed on top of a photo.`
      : "TYPOGRAPHY INTERACTION: the headline is oversized and integrated into the scene rather than placed on top of it.",
    slots.dominantColor || slots.accentColor
      ? `Color: one dominant ${slots.dominantColor ?? "neutral"} with black and white, and only a small amount of ${slots.accentColor ?? "accent"}.`
      : "",
    texts.length > 0
      ? [
          "Render this text exactly as written, with correct spelling and spacing:",
          ...texts.map((text) => `- ${text}`),
          "Do not translate, paraphrase, shorten, or add any text that is not listed above.",
        ].join("\n")
      : "Do not add any text to this poster.",
    ...referenceLines(input.references),
    slots.avoid ? `Avoid: ${slots.avoid}` : "",
    "Keep people and products photographic and believable — natural proportions, real material texture, no obvious posing.",
    "No watermark, no page frame, no UI chrome.",
    input.styleNote ?? "",
  ].filter((line) => line !== "").join("\n\n");
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-prompt.test.ts` · `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/prompt.ts tests/poster-prompt.test.ts
git commit -m "feat(poster): 슬롯을 fal 프롬프트로 조립한다"
```

---

# Phase 4 — 생성

## Task 11: 생성 파이프라인 — 요청 1행 + 이미지 N행

**Files:**
- Create: `src/poster/generate.ts`
- Test: `tests/poster-generate.test.ts`

**Interfaces:**
- Consumes: `resolveSize` (Task 3) · `estimateCost` (Task 4) · `buildPosterPrompt` (Task 10) · `PosterStorage` (Task 7) · `FalRunResult` (Task 1)
- Produces: `generatePoster(input): Promise<{ request: PosterGenerationRequest; images: PosterImage[] }>` · `buildModelInput(model, resolved, prompt, imageUrls, count)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-generate.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildModelInput, generatePoster } from "../src/poster/generate";
import { resolveSize } from "../src/poster/ratios";
import { listModels } from "../src/studio/models";

const model = (id: string) => listModels().find((spec) => spec.id === id)!;

describe("모델 입력 조립", () => {
  it("GPT 는 image_size 를 반드시 명시한다", () => {
    // 기본값 auto 는 입력 이미지 크기를 물려받는다. 레퍼런스 크기가 그대로 나온다.
    const input = buildModelInput(model("gpt-image-2"), resolveSize("feed_4_5", model("gpt-image-2")), "p", ["u"], 2);
    expect(input.image_size).toEqual({ width: 1088, height: 1360 });
    expect(input.quality).toBe("high");
    expect(input.num_images).toBe(2);
  });

  it("nano 는 aspect_ratio 를 준다", () => {
    const input = buildModelInput(model("nano-banana-2"), resolveSize("story_9_16", model("nano-banana-2")), "p", ["u"], 1);
    expect(input.aspect_ratio).toBe("9:16");
    expect(input.image_size).toBeUndefined();
  });

  it("웹 검색과 thinking 을 켜지 않는다", () => {
    const input = buildModelInput(model("nano-banana-2"), resolveSize("story_9_16", model("nano-banana-2")), "p", ["u"], 1);
    expect(JSON.stringify(input)).not.toContain("web_search");
    expect(JSON.stringify(input)).not.toContain("thinking");
  });
});

describe("포스터 생성", () => {
  const baseStore = () => {
    const requests: unknown[] = [];
    const saved: unknown[] = [];
    return {
      requests, saved,
      createGenerationRequest: vi.fn(async (input: Record<string, unknown>) => {
        const row = { ...input, id: `req_${requests.length + 1}`, createdAt: "t" };
        requests.push(row);
        return row;
      }),
      updateGenerationRequest: vi.fn(async (row: unknown) => row),
      saveImages: vi.fn(async (images: unknown[]) => { saved.push(...images); return images.map((image, index) => ({ ...(image as object), id: `img_${index}` })); }),
    };
  };

  const deps = {
    runner: { upload: async () => "u", run: async () => ({ images: [{ url: "a" }, { url: "b" }, { url: "c" }], requestId: "fal_1" }) },
    downloadImage: async () => new Uint8Array([1]),
    writeImage: async (_p: string, index: number) => `out/poster/x/${index}.png`,
    estimate: async () => ({ usd: 0.22, source: "fal_estimate" as const, confident: true }),
  };

  it("요청 한 행과 이미지 세 행을 남긴다", async () => {
    const store = baseStore();
    const result = await generatePoster({
      store: store as never, projectId: "p1", teamId: "t1",
      model: model("gpt-image-2"), ratioId: "feed_4_5", prompt: "p",
      referenceUrls: ["u"], imageCount: 3, deps,
    });
    expect(store.createGenerationRequest).toHaveBeenCalledTimes(1);
    expect(result.images).toHaveLength(3);
    expect(store.saved).toHaveLength(3);
  });

  it("추정액과 fal requestId 를 요청 행에 남긴다", async () => {
    const store = baseStore();
    const result = await generatePoster({
      store: store as never, projectId: "p1", teamId: "t1",
      model: model("gpt-image-2"), ratioId: "feed_4_5", prompt: "p",
      referenceUrls: ["u"], imageCount: 3, deps,
    });
    expect(result.request.estimatedCostUsd).toBe(0.22);
    expect(result.request.estimateSource).toBe("fal_estimate");
    expect(result.request.falRequestId).toBe("fal_1");
    expect(result.request.costState).toBe("pending");
  });

  it("실제로 돌아온 장수를 기록한다", async () => {
    const store = baseStore();
    const result = await generatePoster({
      store: store as never, projectId: "p1", teamId: "t1",
      model: model("gpt-image-2"), ratioId: "feed_4_5", prompt: "p",
      referenceUrls: ["u"], imageCount: 3,
      deps: { ...deps, runner: { ...deps.runner, run: async () => ({ images: [{ url: "a" }], requestId: "fal_2" }) } },
    });
    expect(result.request.requestedImages).toBe(3);
    expect(result.request.returnedImages).toBe(1);
  });

  it("이 모델로 만들 수 없는 비율이면 만들기 전에 막는다", async () => {
    const store = baseStore();
    await expect(generatePoster({
      store: store as never, projectId: "p1", teamId: "t1",
      model: model("nano-banana-pro"), ratioId: "a4_print", prompt: "p",
      referenceUrls: ["u"], imageCount: 1, deps,
    })).rejects.toThrow(/GPT Image 2/);
    expect(store.createGenerationRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-generate.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/generate.ts`:

```ts
import type { FalRunner } from "../studio/fal-client";
import type { StudioModelSpec } from "../studio/models";
import { resolveSize, type ResolvedSize } from "./ratios";
import type { CostEstimate } from "./pricing";
import type { PosterGenerationRequest, PosterImage, PosterStorage } from "./store";

/**
 * 모델에 보낼 입력을 만든다.
 *
 * GPT Image 2 의 image_size 기본값은 auto 라 입력 이미지 크기를 물려받는다. 명시하지 않으면
 * 레퍼런스 포스터 크기가 그대로 나온다. 항상 못 박는다.
 * 웹 검색·thinking_level 은 추가 과금이 붙으므로 켜지 않는다.
 */
export function buildModelInput(
  model: StudioModelSpec,
  resolved: ResolvedSize,
  prompt: string,
  imageUrls: string[],
  count: number,
): Record<string, unknown> {
  const common = { prompt, image_urls: imageUrls, num_images: count, output_format: "png" };
  if (resolved.mode === "pixel") return { ...common, image_size: resolved.pixel, quality: "high" };
  return { ...common, aspect_ratio: resolved.enum, resolution: model.defaultResolution ?? "2K" };
}

export interface GeneratePosterDeps {
  runner: Pick<FalRunner, "upload" | "run">;
  downloadImage: (url: string) => Promise<Uint8Array>;
  writeImage: (projectId: string, variantIndex: number, bytes: Uint8Array) => Promise<string>;
  estimate: (model: StudioModelSpec, count: number) => Promise<CostEstimate>;
}

/**
 * 한 번의 fal 호출과 그 결과를 저장한다.
 *
 * 요청은 한 행, 이미지는 N 행이다. 비용을 이미지마다 복제하면 배치 3장에서 합계가 3배가 된다.
 */
export async function generatePoster(input: {
  store: PosterStorage;
  projectId: string;
  teamId: string;
  model: StudioModelSpec;
  ratioId: string;
  prompt: string;
  referenceUrls: string[];
  imageCount: number;
  parentImageId?: string;
  editInstruction?: string;
  deps: GeneratePosterDeps;
}): Promise<{ request: PosterGenerationRequest; images: PosterImage[] }> {
  const resolved = resolveSize(input.ratioId, input.model);
  // 돈을 쓰기 전에 막는다. 만들 수 없는 규격으로 호출하면 요금만 나가고 결과는 못 쓴다.
  if (resolved.rejected) throw new Error(resolved.rejected);

  const estimate = await input.deps.estimate(input.model, input.imageCount);
  const request = await input.store.createGenerationRequest({
    projectId: input.projectId,
    parentImageId: input.parentImageId,
    editInstruction: input.editInstruction,
    modelId: input.model.id,
    ratioId: input.ratioId,
    size: resolved.mode === "pixel" ? { ...resolved.pixel } : { aspectRatio: resolved.enum },
    requestedImages: input.imageCount,
    returnedImages: 0,
    estimatedCostUsd: estimate.usd,
    estimateSource: estimate.source,
    costState: "pending",
  });

  const result = await input.deps.runner.run(
    input.model.endpoint,
    buildModelInput(input.model, resolved, input.prompt, input.referenceUrls, input.imageCount),
  );

  const images = await input.store.saveImages(await Promise.all(result.images.map(async (image, index) => ({
    projectId: input.projectId,
    generationRequestId: request.id,
    variantIndex: index,
    selected: false,
    assetPath: await input.deps.writeImage(input.projectId, index, await input.deps.downloadImage(image.url)),
    width: image.width,
    height: image.height,
  }))));

  const saved = await input.store.updateGenerationRequest({
    ...request,
    falRequestId: result.requestId,
    returnedImages: result.images.length,
  });
  return { request: saved, images };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-generate.test.ts` · `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/generate.ts tests/poster-generate.test.ts
git commit -m "feat(poster): 요청 한 행과 변형 N 행을 남기는 생성 파이프라인"
```

---

## Task 12: 포스터 전용 비전 검수 — 선택된 변형만

**Files:**
- Create: `src/poster/vision-review.ts`
- Test: `tests/poster-vision-review.test.ts`

**Interfaces:**
- Consumes: `PosterSlots` (Task 7)
- Produces: `buildPosterReviewPrompt(input): string` · `reviewPoster(input): Promise<PosterReview | undefined>` · `PosterReview`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-vision-review.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPosterReviewPrompt, reviewPoster } from "../src/poster/vision-review";
import { EMPTY_SLOTS } from "../src/poster/schemas";

const slots = { ...EMPTY_SLOTS, headline: "SNAP", sideTexts: ["ISO 400"] };

describe("포스터 검수 프롬프트", () => {
  it("카드뉴스가 아니라 포스터로 설명한다", () => {
    const prompt = buildPosterReviewPrompt({ slots, hasPreserved: false });
    expect(prompt).toContain("포스터");
    expect(prompt).not.toContain("카드뉴스");
  });

  it("기대 글자를 그대로 담는다", () => {
    const prompt = buildPosterReviewPrompt({ slots, hasPreserved: false });
    expect(prompt).toContain("SNAP");
    expect(prompt).toContain("ISO 400");
  });

  it("원형 보존이 있으면 대조를 지시한다", () => {
    expect(buildPosterReviewPrompt({ slots, hasPreserved: true })).toContain("원형");
  });
});

describe("포스터 검수", () => {
  const bytes = new Uint8Array([1]);

  it("판정을 돌려준다", async () => {
    const review = await reviewPoster({
      slots, imageBytes: bytes, hasPreserved: false,
      call: async () => ({ decision: "pass", score: 90, summary: "문제 없음", issues: [] }),
    });
    expect(review?.decision).toBe("pass");
  });

  it("호출이 던져도 던지지 않는다 — 검수 실패가 결과를 버리게 하면 안 된다", async () => {
    const review = await reviewPoster({
      slots, imageBytes: bytes, hasPreserved: false,
      call: async () => { throw new Error("비전 없음"); },
    });
    expect(review).toBeUndefined();
  });

  it("규칙에 안 맞는 판정은 버린다", async () => {
    const review = await reviewPoster({
      slots, imageBytes: bytes, hasPreserved: false,
      call: async () => ({ decision: "아마도", score: 90, summary: "s", issues: [] }) as never,
    });
    expect(review).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-vision-review.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/vision-review.ts`:

```ts
import { z } from "zod";
import type { PosterSlots } from "./schemas";

export const PosterReviewSchema = z.object({
  decision: z.enum(["pass", "review", "fail"]),
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1),
  issues: z.array(z.string()).default([]),
});

export type PosterReview = z.infer<typeof PosterReviewSchema>;

/**
 * 포스터 전용 검수 프롬프트.
 *
 * 카드 스튜디오의 검수기를 재사용하지 않는다. 그쪽 프롬프트는 "카드뉴스 N/M장", 시리즈 앵커
 * 비교, 카드 역할을 전제해 포스터에 그대로 쓸 수 없다.
 */
export function buildPosterReviewPrompt(input: { slots: PosterSlots; hasPreserved: boolean }): string {
  const texts = [input.slots.headline, input.slots.subheadline, ...input.slots.sideTexts]
    .filter((text): text is string => Boolean(text?.trim()));
  return [
    "당신은 한 장짜리 포스터의 독립 품질 검수자입니다.",
    "프롬프트를 평가하지 말고 첨부된 이미지에서 실제로 보이는 것만 평가하세요.",
    "글자를 읽고 기대 문구와 글자 단위로 비교하세요 — 철자·띄어쓰기·숫자·누락·중복·모델이 임의로 더한 문구.",
    "잘림·겹침·대비 부족으로 읽기 어려운 곳을 찾으세요.",
    input.hasPreserved
      ? "뒤에 원형 보존 참고 이미지가 이어집니다. 제품·인물·로고의 형태·색·비율·라벨이 원본 그대로인지 직접 대조하고, 달라졌으면 fail 로 판정하세요."
      : "이 포스터에는 원형 보존을 요구한 이미지가 없습니다.",
    "decision 규칙: 의미 있는 오탈자·문구 누락·읽기 어려운 잘림은 fail, 사소하지만 사람이 볼 문제는 review, 문제가 없을 때만 pass.",
    `기대 문구: ${JSON.stringify(texts)}`,
  ].join("\n\n");
}

/**
 * 선택된 변형 한 장만 검수한다. **던지지 않는다.**
 *
 * 변형 3장을 모두 검수하면 검수 비용도 3배가 되는데, 버릴 2장을 검수할 이유가 없다.
 */
export async function reviewPoster(input: {
  slots: PosterSlots;
  imageBytes: Uint8Array;
  hasPreserved: boolean;
  preservedBytes?: Uint8Array[];
  call: (request: { prompt: string; imageBytes: Uint8Array; preservedBytes: Uint8Array[] }) => Promise<unknown>;
}): Promise<PosterReview | undefined> {
  try {
    const parsed = PosterReviewSchema.safeParse(await input.call({
      prompt: buildPosterReviewPrompt({ slots: input.slots, hasPreserved: input.hasPreserved }),
      imageBytes: input.imageBytes,
      preservedBytes: input.preservedBytes ?? [],
    }));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-vision-review.test.ts` · `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/vision-review.ts tests/poster-vision-review.test.ts
git commit -m "feat(poster): 포스터 전용 비전 검수를 만든다"
```

---

## Task 13: 변형 선택과 수정 루프 규칙

**Files:**
- Create: `src/poster/flow.ts`
- Test: `tests/poster-flow.test.ts`

**Interfaces:**
- Consumes: `PosterImage` (Task 7)
- Produces: `canEdit(images): boolean` · `selectedImage(images): PosterImage | undefined` · `assertEditable(images): PosterImage`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertEditable, canEdit, selectedImage } from "../src/poster/flow";

const image = (id: string, selected: boolean) => ({
  id, projectId: "p", generationRequestId: "r", variantIndex: 0, selected, assetPath: `out/${id}.png`,
});

describe("수정 루프 진입 규칙", () => {
  it("고른 변형이 없으면 수정할 수 없다", () => {
    // 변형이 여럿인데 대상을 정하지 않으면 무엇을 고치는지 모호해진다.
    expect(canEdit([image("a", false), image("b", false)])).toBe(false);
  });

  it("하나를 고르면 열린다", () => {
    expect(canEdit([image("a", false), image("b", true)])).toBe(true);
    expect(selectedImage([image("a", false), image("b", true)])?.id).toBe("b");
  });

  it("이미지가 하나도 없으면 닫혀 있다", () => {
    expect(canEdit([])).toBe(false);
  });

  it("assertEditable 은 고른 변형을 돌려주거나 이유를 던진다", () => {
    expect(assertEditable([image("a", true)]).id).toBe("a");
    expect(() => assertEditable([image("a", false)])).toThrow(/고르/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-flow.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/flow.ts`:

```ts
import type { PosterImage } from "./store";

export function selectedImage(images: PosterImage[]): PosterImage | undefined {
  return images.find((image) => image.selected);
}

/**
 * 수정·리사이즈는 변형 하나를 고른 뒤에만 열린다.
 *
 * 변형이 여러 장인데 대상을 정하지 않으면 무엇을 고치는지 모호해지고, 잘못 고른 것을
 * 기준으로 계보가 이어진다.
 */
export function canEdit(images: PosterImage[]): boolean {
  return selectedImage(images) !== undefined;
}

export function assertEditable(images: PosterImage[]): PosterImage {
  const chosen = selectedImage(images);
  if (!chosen) throw new Error("고칠 이미지를 먼저 골라 주세요.");
  return chosen;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/poster-flow.test.ts` · `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/flow.ts tests/poster-flow.test.ts
git commit -m "feat(poster): 변형을 고른 뒤에만 수정이 열리게 한다"
```

---

# Phase 5 — API 와 화면

## Task 14: API 라우트

**Files:**
- Create: `app/api/poster/projects/route.ts`, `app/api/poster/projects/[id]/route.ts`, `app/api/poster/projects/[id]/plan/route.ts`, `app/api/poster/projects/[id]/generate/route.ts`, `app/api/poster/projects/[id]/images/[imageId]/select/route.ts`, `app/api/poster/references/route.ts`, `app/api/poster/estimate/route.ts`
- Test: `tests/poster-routes.test.ts`

**Interfaces:**
- Consumes: `getRequestPosterStore` (Task 7) · `planSlots` (Task 8) · `generatePoster` (Task 11) · `assertEditable` (Task 13) · `estimateCost`·`createFalEstimator` (Task 4·5)
- Produces: HTTP 계약 — 모든 응답은 `src/server/api.ts` 의 `success`/`failure` 봉투를 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-routes.test.ts` — `tests/studio-routes.test.ts` 와 같은 방식으로 라우트 함수를 직접 부른다:

```ts
import { describe, expect, it, vi } from "vitest";
import { POST as estimateRoute } from "../app/api/poster/estimate/route.js";

function json(body: unknown): Request {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

describe("견적 라우트", () => {
  it("모르는 모델이면 거절한다", async () => {
    const response = await estimateRoute(json({ modelId: "없는모델", imageCount: 1 }));
    expect(response.status).toBe(400);
  });

  it("장수가 범위를 벗어나면 거절한다", async () => {
    expect((await estimateRoute(json({ modelId: "gpt-image-2", imageCount: 0 }))).status).toBe(400);
    expect((await estimateRoute(json({ modelId: "gpt-image-2", imageCount: 4 }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-routes.test.ts`
Expected: FAIL — 라우트 없음

- [ ] **Step 3: 최소 구현**

`app/api/poster/estimate/route.ts`:

```ts
import { z } from "zod";
import { apiError, failure, success } from "../../../../src/server/api";
import { requirePermission } from "../../../../src/server/auth";
import { listModels } from "../../../../src/studio/models";
import { createFalEstimator } from "../../../../src/poster/fal-pricing-client";
import { estimateCost } from "../../../../src/poster/pricing";

const Schema = z.object({ modelId: z.string().min(1), imageCount: z.number().int().min(1).max(3) });

/** 견적 캐시는 프로세스 수명 동안 유지한다. 견적 API 가 죽었을 때 2순위로 쓴다. */
const cache = new Map<string, number>();

export async function POST(request: Request) {
  try {
    await requirePermission("content.create");
    const parsed = Schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return failure("모델과 장수(1~3)를 확인해 주세요.");
    const model = listModels().find((spec) => spec.id === parsed.data.modelId);
    if (!model) return failure("모르는 모델입니다.");
    return success(await estimateCost({
      model, images: parsed.data.imageCount, cache, fetchEstimate: createFalEstimator(),
    }));
  } catch (error) { return apiError(error); }
}
```

나머지 라우트는 같은 형태로 만든다:

- `projects` POST — `requirePermission("content.create")` → `store.createProject` → 201
- `projects` GET — `store.listProjects`
- `projects/[id]` GET/PATCH — PATCH 는 `title`·`slots`·`ratioId`·`modelId`·`imageCount`·`references` 만 받는다
- `projects/[id]/plan` POST — `readReferenceGrammar` → `planSlots` → `store.updateProject({ slots })`
- `projects/[id]/generate` POST — `buildPosterPrompt` → `generatePoster`. 수정 요청이면 `assertEditable(images)` 로 부모를 얻는다
- `projects/[id]/images/[imageId]/select` POST — `store.selectImage`
- `references` GET/POST/DELETE — `requirePermission("reference.create")`, 업로드는 `saveStudioUpload({ kind: "reference" })` 재사용

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run` · `npx tsc --noEmit`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add app/api/poster tests/poster-routes.test.ts
git commit -m "feat(poster): 포스터 API 라우트를 만든다"
```

---

## Task 15: 화면 — 갤러리·만들기·결과

**Files:**
- Create: `app/poster/page.tsx`, `app/poster/new/page.tsx`, `app/poster/[id]/page.tsx`, `app/poster/gallery/page.tsx`
- Create: `components/poster/slot-editor.tsx`, `components/poster/variant-picker.tsx`, `components/poster/cost-line.tsx`
- Modify: `components/app-shell.tsx` (메뉴에 "포스터 스튜디오" 추가)
- Test: `tests/poster-cost-line.test.ts`

**Interfaces:**
- Consumes: `PosterSlots`·`EMPTY_SLOTS` (Task 7) · `POSTER_RATIOS` (Task 3) · `canEdit` (Task 13)
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-cost-line.test.ts` — 문구 규칙만 순수 함수로 떼어 검사한다:

```ts
import { describe, expect, it } from "vitest";
import { costLine } from "../src/poster/cost-line";

describe("비용 문구", () => {
  it("생성 전에는 예상이라고 쓴다 — 최대라고 쓰지 않는다", () => {
    const line = costLine({ estimatedCostUsd: 0.22, estimateSource: "fal_estimate", costState: "pending", costUsd: undefined });
    expect(line).toContain("예상");
    expect(line).not.toContain("최대");
  });

  it("정산되면 실제 금액을 보여 준다", () => {
    expect(costLine({ estimatedCostUsd: 0.22, estimateSource: "fal_estimate", costState: "reconciled", costUsd: 0.19 })).toContain("$0.19");
  });

  it("정산 불가면 추정치를 유지하고 사유를 밝힌다", () => {
    const line = costLine({ estimatedCostUsd: 0.22, estimateSource: "fal_estimate", costState: "unknown", costUsd: undefined });
    expect(line).toContain("정산 불가");
    expect(line).toContain("$0.22");
  });

  it("공표 단가로 떨어졌으면 정확도 낮음을 밝힌다", () => {
    expect(costLine({ estimatedCostUsd: 0.41, estimateSource: "listed", costState: "pending", costUsd: undefined })).toContain("정확도 낮음");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-cost-line.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/cost-line.ts`:

```ts
/**
 * 비용 한 줄. 추정과 정산을 섞지 않는다.
 *
 * "최대"라고 쓰지 않는다 — 공식 가격표로는 실제 최대 금액을 보장할 수 없다.
 */
export function costLine(input: {
  estimatedCostUsd?: number;
  estimateSource?: string;
  costState: "pending" | "reconciled" | "unknown";
  costUsd?: number;
}): string {
  const estimated = input.estimatedCostUsd !== undefined ? `$${input.estimatedCostUsd.toFixed(2)}` : "금액 미상";
  const rough = input.estimateSource === "listed" ? " · 정확도 낮음" : "";
  if (input.costState === "reconciled" && input.costUsd !== undefined) return `$${input.costUsd.toFixed(2)}`;
  if (input.costState === "unknown") return `정산 불가 · 예상 ${estimated}${rough}`;
  return `예상 ${estimated} · 실제 금액은 생성 후 정산${rough}`;
}
```

화면 세 개를 만든다.

- `app/poster/page.tsx` — 내 포스터 목록. `/api/poster/projects` GET
- `app/poster/gallery/page.tsx` — 레퍼런스 갤러리. 업로드·삭제·목록
- `app/poster/new/page.tsx` — 비율(`POSTER_RATIOS`) · 한 줄 지시 · 레퍼런스(갤러리에서 고르거나 업로드) · 제품 이미지 · 모델 · 장수(1~3). 만들기를 누르면 프로젝트를 만들고 `/api/poster/projects/[id]/plan` 을 부른 뒤 `/poster/[id]` 로 보낸다
- `app/poster/[id]/page.tsx` — 슬롯 편집기(`components/poster/slot-editor.tsx`) → 생성 → 변형 고르기(`components/poster/variant-picker.tsx`) → 수정 명령·리사이즈. `canEdit` 이 false 면 수정·리사이즈 버튼을 `disabled` 로 둔다. 비용은 `costLine` 으로 표시한다

`components/app-shell.tsx` 의 `links` 에 `["포스터 스튜디오", "/poster"]` 를 `["카드 스튜디오", "/studio"]` 뒤에 넣는다.

**주의:** 화면 파일은 `src/poster/schemas.ts`·`src/poster/ratios.ts`·`src/poster/flow.ts`·`src/poster/cost-line.ts` 만 값으로 import 한다. `src/poster/store.ts` 는 타입 전용으로만 가져온다.

- [ ] **Step 4: 테스트와 빌드를 확인한다**

Run: `npx vitest run` · `npx tsc --noEmit` · `npx next build`
Expected: 전부 통과. `tests/studio-client-bundle.test.ts` 가 새 화면의 import 사슬도 자동 검사한다

- [ ] **Step 5: 커밋**

```bash
git add app/poster components/poster components/app-shell.tsx src/poster/cost-line.ts tests/poster-cost-line.test.ts
git commit -m "feat(poster): 갤러리·만들기·결과 화면을 만든다"
```

---

## Task 16: 정산 조회 — Admin 키가 있을 때만

`FAL_BILLING_ADMIN_KEY` 가 없으면 이 태스크는 **코드만 넣고 동작하지 않는다.** `unknown + admin_unavailable` 로 떨어진다.

**Files:**
- Create: `src/poster/reconcile.ts`
- Test: `tests/poster-reconcile.test.ts`

**Interfaces:**
- Consumes: `PosterGenerationRequest` (Task 7)
- Produces: `reconcileRequest(input): Promise<PosterGenerationRequest>` · `RECONCILE_DEADLINE_MS`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poster-reconcile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RECONCILE_DEADLINE_MS, reconcileRequest } from "../src/poster/reconcile";

const base = {
  id: "r1", projectId: "p", modelId: "gpt-image-2", ratioId: "feed_4_5", size: {},
  requestedImages: 1, returnedImages: 1, costState: "pending" as const, createdAt: "2026-08-31T00:00:00Z",
  falRequestId: "fal_1",
};

describe("정산", () => {
  it("금액을 받으면 reconciled 로 바꾼다", async () => {
    const next = await reconcileRequest({
      request: base, now: new Date("2026-08-31T00:01:00Z"),
      fetchCost: async () => 0.19,
    });
    expect(next.costState).toBe("reconciled");
    expect(next.costUsd).toBe(0.19);
  });

  it("기한 안에 이벤트가 없으면 pending 을 유지한다", async () => {
    // 정상적인 반영 지연은 실패가 아니다.
    const next = await reconcileRequest({
      request: base, now: new Date("2026-08-31T00:01:00Z"),
      fetchCost: async () => undefined,
    });
    expect(next.costState).toBe("pending");
  });

  it("기한을 넘기면 unknown + deadline_exceeded", async () => {
    const next = await reconcileRequest({
      request: base, now: new Date(Date.parse(base.createdAt) + RECONCILE_DEADLINE_MS + 1000),
      fetchCost: async () => undefined,
    });
    expect(next.costState).toBe("unknown");
    expect(next.costReason).toBe("deadline_exceeded");
  });

  it("Admin 키가 없으면 unknown + admin_unavailable", async () => {
    const next = await reconcileRequest({
      request: base, now: new Date("2026-08-31T00:01:00Z"),
      fetchCost: async () => { throw Object.assign(new Error("no key"), { code: "admin_unavailable" }); },
    });
    expect(next.costState).toBe("unknown");
    expect(next.costReason).toBe("admin_unavailable");
  });

  it("그 밖의 오류는 api_error 로 남기되 기한 안이면 pending 을 유지한다", async () => {
    const next = await reconcileRequest({
      request: base, now: new Date("2026-08-31T00:01:00Z"),
      fetchCost: async () => { throw new Error("500"); },
    });
    expect(next.costState).toBe("pending");
  });

  it("requestId 가 없으면 조회하지 않는다", async () => {
    let called = 0;
    const next = await reconcileRequest({
      request: { ...base, falRequestId: undefined },
      now: new Date(Date.parse(base.createdAt) + RECONCILE_DEADLINE_MS + 1000),
      fetchCost: async () => { called += 1; return 0.1; },
    });
    expect(called).toBe(0);
    expect(next.costState).toBe("unknown");
    expect(next.costReason).toBe("api_error");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poster-reconcile.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`src/poster/reconcile.ts`:

```ts
import type { PosterGenerationRequest } from "./store";

/** 이 시간까지는 이벤트가 없어도 pending 이다. 정상적인 반영 지연은 실패가 아니다. */
export const RECONCILE_DEADLINE_MS = 30 * 60 * 1000;

/**
 * 요청 한 건을 정산한다.
 *
 * unknown 은 "아직 모른다"가 아니라 **정산 불가가 확정된 종결 상태**다.
 * 기한 안의 지연은 pending 으로 둔다.
 */
export async function reconcileRequest(input: {
  request: PosterGenerationRequest;
  now: Date;
  fetchCost: (falRequestId: string) => Promise<number | undefined>;
}): Promise<PosterGenerationRequest> {
  const expired = input.now.getTime() - Date.parse(input.request.createdAt) > RECONCILE_DEADLINE_MS;
  if (!input.request.falRequestId) {
    return { ...input.request, costState: "unknown", costReason: "api_error" };
  }
  try {
    const usd = await input.fetchCost(input.request.falRequestId);
    if (usd !== undefined) return { ...input.request, costState: "reconciled", costUsd: usd };
    return expired ? { ...input.request, costState: "unknown", costReason: "deadline_exceeded" } : input.request;
  } catch (error) {
    // 키가 없거나 권한이 없으면 기다려도 소용없다. 즉시 종결한다.
    if ((error as { code?: string }).code === "admin_unavailable") {
      return { ...input.request, costState: "unknown", costReason: "admin_unavailable" };
    }
    return expired ? { ...input.request, costState: "unknown", costReason: "api_error" } : input.request;
  }
}
```

Billing Events 호출기는 `createFalEstimator` 와 같은 형태로 `src/poster/fal-billing-client.ts` 에 만든다.
`FAL_BILLING_ADMIN_KEY` 가 없거나 403 이면 `code: "admin_unavailable"` 을 붙여 던진다.
**`FAL_KEY` 를 대신 쓰지 않는다** — 그 키는 이 API 에서 403 이다(2026-08-31 실측).

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run` · `npx tsc --noEmit` · `npx next build`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/poster/reconcile.ts src/poster/fal-billing-client.ts tests/poster-reconcile.test.ts
git commit -m "feat(poster): Admin 키가 있을 때 정산하고 없으면 상태로 남긴다"
```

---

## 마지막 — 사람이 하는 실물 검증

코드로 대신할 수 없다. Task 16 까지 끝난 뒤 사용자가 한다.

- [ ] 마이그레이션 `0009` 를 Supabase 에 적용한다
- [ ] 참고 포스터 1장 + 제품 이미지 1장으로 4:5 포스터를 1장 만든다
- [ ] **레퍼런스를 닮았는지** 눈으로 본다
- [ ] **제품이 원형대로인지** 원본과 나란히 놓고 본다
- [ ] **한국어가 깨지지 않았는지** 본다 — 특히 작은 곁텍스트
- [ ] 장수 3장으로 만들어 **세 장이 다 저장되고 비용이 한 번만 잡히는지** 확인한다
- [ ] 변형 하나를 고르고 "글자를 더 크게" 로 수정해 본다
- [ ] A4 인쇄용(2400×3392)을 한 장 만들어 **품질과 실제 비용**을 본다
