# 그림 모델 세 개로 정리 (표준형·디테일형·속도형) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원이 고를 수 있는 그림 모델을 세 개(표준형·디테일형·속도형)로 줄이고, 이름·설명을 한 곳에서 관리해 모델을 고르거나 보여 주는 모든 화면이 같은 이름·같은 버튼·같은 설명을 쓰게 한다.

**Architecture:** 이름표 정본을 `packages/shared/src/image-model-names.ts` 한 파일에 둔다(의존이 없는 패키지라 sns-core·pdp-core·redesign-core·web 이 모두 읽을 수 있다). 두 목록(`sns-core` `IMAGE_MODELS`, `pdp-core` `IMAGE_MODELS`)은 **전부 남기고**(옛 작업이 id 를 들고 있다) 이름을 정본에서 받는다. 「고르기·자동 대체」는 보이는 세 개만, 「저장된 id 찾기」는 전체 목록을 쓰도록 두 갈래로 나눈다. 화면은 공용 부품 `ImageModelPicker` 하나로 바꾼다.

**Tech Stack:** pnpm 모노레포, Next.js(App Router), TypeScript, zod, vitest, fal 큐 API, Supabase(Postgres) 마이그레이션.

**Spec:** 이 대화의 결정(2026-10-08) — 요약은 아래 「결정 사항」. 조사 근거: `docs/fal-image-models.md`(사용자 조사, 메인 폴더 미추적 파일), fal 공식 입력 명세(`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=google/nano-banana-2.1`, `.../edit`).

## 결정 사항 (사용자, 2026-10-08)

| 이름 | id | 설명(마우스 올리면) | 보임 |
|---|---|---|---|
| 표준형 (기본) | `gpt-image-2.5-flare` | 어떤 그림이든 고르게 잘 만드는 기본 모델입니다. 특히 글자가 많은 그림에서 한글을 정확하게 그립니다. | 예 |
| 디테일형 | `nano-banana-pro` | 질감과 인물 표현이 섬세합니다. 특히 여러 장에서 같은 인물을 일관되게 유지하는 데 뛰어납니다. | 예 |
| 속도형 | `nano-banana-2.1` (신규) | 고른 품질로 그림을 만들고, 특히 여러 장을 빠르게 만드는 데 뛰어납니다. 참고 그림을 많이 받을 수 있습니다. | 예 |
| 이전 방식 | `gpt-image-2.5-sunburst`, `gpt-image-2`, `nano-banana-2`, `nano-banana`, `seedream-5-pro`, `qwen-image-2-pro` | — | 아니오 (목록에는 남김) |

- 기본값은 지금 그대로: 모든 기능 표준형, 캐릭터는 그림체 「실사」·「자동」이면 디테일형.
- 상세페이지의 실제 모델 이름 표시(10-08 결정)는 **되돌린다** — 모든 곳을 등급 이름으로 통일(사용자 지시).
- 리디자인: 세 모델 중 고른다. 분석 AI 는 그림 모델을 따른다 — 표준형 → OpenAI, 디테일형·속도형 → Google.
- 설명은 다른 모델과 견주지 않는다. 「다 좋지만 특히 이것이 뛰어나다」로 쓴다.
- 배포 후 사용자가 속도형을 직접 골라 비교한다. 크레딧 규칙 정리는 이 작업 **다음**에 따로 한다.

## Global Constraints

- 이름·설명 문구는 위 표 그대로. 다른 곳에 손으로 다시 적지 않는다 — 정본을 읽는다.
- 회원 화면에 실제 모델 이름(「GPT Image」「Nano Banana」 등)을 쓰지 않는다. `apps/web/lib/__tests__/model-name.test.ts` 가 지킨다. 상세페이지 예외(`상세페이지_모델_이름`)는 지운다.
- 숨긴 id 는 `sns-core` `IMAGE_MODELS`, `pdp-core` `IMAGE_MODELS`·`ImageModelId`·`ENDPOINTS`, `apps/web/app/api/sns/projects/schema.ts` enum, DB `model_prices` 에서 **지우지 않는다.**
- 속도형은 항상 `resolution: "2K"` 로 부른다(fal 기본값이 1K 이고 1K 에서 작은 글씨가 흐리다 — DeepMind 모델 카드).
- 속도형 단가는 실측 전 어림 **$0.09/장**(fal 공표 2K $0.059·편집 $0.063 + 긴 프롬프트·참고 그림 토큰을 더한 위쪽 값). 적게 잡는 쪽이 위험하다는 기존 원칙(`sns-core/models.ts` `priceCoverage` 주석)을 따른다.
- 새 의존성(패키지)을 들이지 않는다. 설명 띄우기는 CSS(`group-hover`/`focus-within`)로 한다.
- 파일 800줄·함수 50줄 상한(전역 규칙). 불변 패턴.
- `docs/DEPLOY.md` 「매 배포」 그대로 배포하고, 개발 일지(`docs/devlog/`)를 적는다.

## Review Focus

1. **옛 작업을 다시 열 때**(카드뉴스·이미지 만들기·쉽게·상세페이지·캐릭터에서 숨긴 모델로 만든 것) — 화면이 깨지지 않고, 고르기는 표준형(캐릭터는 그림체 기본)으로 켜져 있으며, 새로 만들면 보이는 모델로 간다. → Task 3·5·7 테스트
2. **숨긴 모델로 만든 그림을 고칠 때** — 처음 만든 모델로 그대로 고친다. 조용히 다른 모델로 바뀌거나 오류가 나지 않는다. → Task 2 테스트(`chooseModelForRatio` 가 숨긴 원하는 모델을 전체 목록에서 찾는다)
3. **카드뉴스의 아주 길쭉한 칸(4:1 등)** — 지금은 nano-banana-2 로 가는데, 이제 속도형으로 간다. → Task 2 테스트(`planSlotImage`)
4. **휴대폰(마우스 없음)** — 고른 모델의 설명이 늘 버튼 아래에 보인다. → Task 4 테스트
5. **설명 전 리디자인 작업**(저장된 `model: "google"`, `imageModel` 없음) — 지금처럼 Google 분석 + 디테일형으로 그린다. → Task 8 테스트

---

## File Structure

| 파일 | 할 일 |
|---|---|
| `packages/shared/src/image-model-names.ts` (신규) | 이름표 정본: id → 이름·설명·보임, 조회 함수 |
| `packages/shared/src/__tests__/image-model-names.test.ts` (신규) | 정본 시험 |
| `packages/shared/src/index.ts` | 내보내기 한 줄 |
| `packages/sns-core/src/models.ts` | 속도형 항목 추가, 차례 바꿈, 이름을 정본에서, `VISIBLE_IMAGE_MODELS`·`visibleModelOrDefault` |
| `packages/sns-core/src/model-choice.ts` | 대체 후보는 보이는 것만, 원하는 모델은 전체에서 찾기 |
| `packages/layout-core/src/image-request.ts` | 같은 원칙 |
| `packages/sns-core/src/ratios.ts` | 「정밀형 계열로만」 문구 → 정본 이름 |
| `packages/pdp-core/src/types.ts` | `ImageModelId` 에 속도형, 이름을 정본에서 |
| `packages/pdp-core/src/pdp.image-provider.ts` | 끝점·2K·system_prompt |
| `apps/web/app/_components/image-model-picker.tsx` (신규) | 공용 고르기 부품 |
| `apps/web/lib/model-name.ts` | 정본 사용 |
| `apps/web/lib/pdp/image-models.ts` | 실제 이름 제거, 보이는 세 개 |
| 고르기 화면 8곳 | 공용 부품으로 교체 (Task 5·6·7·8) |
| 서버 검증 | `api/sns/projects/schema.ts`, `api/characters/route.ts` GET 목록 |
| 문구 | 설명서·랜딩·약관·README·관리자·비용 계산 화면 (Task 9) |
| `supabase/migrations/202610080002_nano_banana_21_price.sql` (신규) | 속도형 단가 행 |

---

### Task 0: 작업 폴더 준비와 기준선

**Files:** 없음 (확인만)

- [ ] **Step 1: 의존성 설치**

Run: `pnpm install --frozen-lockfile` (작업 폴더 `.worktrees/image-model-lineup`)
Expected: 성공

- [ ] **Step 2: 기준선 — 고치기 전 전체 검사가 초록인지**

Run: `pnpm -r typecheck` 그리고 `pnpm -r test`
Expected: 실패 0. 실패가 있으면 이 작업과 무관한지 기록하고 사용자에게 보고한 뒤 진행.

---

### Task 1: 이름표 정본

**Files:**
- Create: `packages/shared/src/image-model-names.ts`
- Create: `packages/shared/src/__tests__/image-model-names.test.ts`
- Modify: `packages/shared/src/index.ts` (끝에 `export * from "./image-model-names";`)

**Interfaces:**
- Produces:
  - `IMAGE_MODEL_NAMES: readonly ImageModelName[]` — `{ id: string; name: string; summary: string; visible: boolean }`
  - `VISIBLE_IMAGE_MODEL_IDS: readonly string[]` — `["gpt-image-2.5-flare","nano-banana-pro","nano-banana-2.1"]` (이 차례)
  - `RETIRED_MODEL_NAME = "이전 방식"`
  - `imageModelName(id: string | null | undefined): string` — 모르는 id·숨긴 id → `"이전 방식"`, 빈 값 → `"—"`
  - `imageModelSummary(id: string): string` — 보이는 것만 문장, 나머지 `""`
  - `isVisibleImageModel(id: string | null | undefined): boolean`

- [ ] **Step 1: 실패하는 시험 쓰기**

```ts
// packages/shared/src/__tests__/image-model-names.test.ts
import { describe, expect, it } from "vitest";
import {
  IMAGE_MODEL_NAMES, VISIBLE_IMAGE_MODEL_IDS, RETIRED_MODEL_NAME,
  imageModelName, imageModelSummary, isVisibleImageModel,
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

  it("한 id 는 한 번만 적힌다", () => {
    const ids = IMAGE_MODEL_NAMES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @fixup/shared test -- image-model-names` → FAIL(모듈 없음)

- [ ] **Step 3: 구현**

```ts
// packages/shared/src/image-model-names.ts
/**
 * **그림 모델의 회원용 이름과 설명 — 정본은 여기 하나다**(2026-10-08 사용자 결정).
 *
 * 그동안 이름이 세 군데(sns-core·pdp-core·상세페이지 목록)에 따로 적혀 같은 말이
 * 다른 모델을 가리켰다(「정밀형」이 셋). 이제 목록들은 이름을 여기서 받는다.
 *
 * **숨긴 모델도 지우지 않는다.** 저장된 작업이 그 id 를 들고 있다. 고르는
 * 화면에만 안 보이고, 이름은 「이전 방식」으로 읽힌다.
 *
 * 실제 모델 이름은 적지 않는다 — 회원 화면 검사(`model-name.test.ts`)가 이
 * 폴더도 훑는다.
 */
export interface ImageModelName {
  id: string;
  name: string;
  /** 마우스를 올리면 보이는 한 문장. 다른 모델과 견주지 않는다. */
  summary: string;
  visible: boolean;
}

export const RETIRED_MODEL_NAME = "이전 방식";

const retired = (id: string): ImageModelName => ({ id, name: RETIRED_MODEL_NAME, summary: "", visible: false });

export const IMAGE_MODEL_NAMES: readonly ImageModelName[] = [
  {
    id: "gpt-image-2.5-flare",
    name: "표준형",
    summary: "어떤 그림이든 고르게 잘 만드는 기본 모델입니다. 특히 글자가 많은 그림에서 한글을 정확하게 그립니다.",
    visible: true,
  },
  {
    id: "nano-banana-pro",
    name: "디테일형",
    summary: "질감과 인물 표현이 섬세합니다. 특히 여러 장에서 같은 인물을 일관되게 유지하는 데 뛰어납니다.",
    visible: true,
  },
  {
    id: "nano-banana-2.1",
    name: "속도형",
    summary: "고른 품질로 그림을 만들고, 특히 여러 장을 빠르게 만드는 데 뛰어납니다. 참고 그림을 많이 받을 수 있습니다.",
    visible: true,
  },
  retired("gpt-image-2.5-sunburst"),
  retired("gpt-image-2"),
  retired("nano-banana-2"),
  retired("nano-banana"),
  retired("seedream-5-pro"),
  retired("qwen-image-2-pro"),
];

const BY_ID = new Map(IMAGE_MODEL_NAMES.map((entry) => [entry.id, entry] as const));

export const VISIBLE_IMAGE_MODEL_IDS: readonly string[] = IMAGE_MODEL_NAMES.filter((entry) => entry.visible).map((entry) => entry.id);

export function imageModelName(id: string | null | undefined): string {
  if (!id) return "—";
  return BY_ID.get(id)?.name ?? RETIRED_MODEL_NAME;
}

export function imageModelSummary(id: string): string {
  return BY_ID.get(id)?.summary ?? "";
}

export function isVisibleImageModel(id: string | null | undefined): boolean {
  return id != null && BY_ID.get(id)?.visible === true;
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter @fixup/shared test -- image-model-names` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 그림 모델 이름표 정본(표준형·디테일형·속도형)"`

---

### Task 2: 공용 목록(sns-core)·자동 대체·레이아웃

**Files:**
- Modify: `packages/sns-core/src/models.ts:107-222` (목록), `:304` 주변 영향 없음
- Modify: `packages/sns-core/src/model-choice.ts:155-181` (`chooseModelForRatio`)
- Modify: `packages/layout-core/src/image-request.ts:134-178` (`planSlotImage`)
- Modify: `packages/sns-core/src/ratios.ts:95,102` (이유 문구)
- Test: `packages/sns-core/src/__tests__/models.test.ts`, `model-choice.test.ts`, `ratios.test.ts`; `packages/layout-core/src/__tests__/image-request.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `imageModelName`, `imageModelSummary`, `isVisibleImageModel`
- Produces:
  - `IMAGE_MODELS` (전체 7개, 차례: flare, nano-banana-pro, nano-banana-2.1, sunburst, gpt-image-2, nano-banana-2, nano-banana)
  - `VISIBLE_IMAGE_MODELS: ImageModel[]` — 보이는 셋, 정본 차례
  - `visibleModelOrDefault(id: string | null | undefined): string` — 보이면 그대로, 아니면 `isDefault` 의 id
  - `chooseModelForRatio(ratioId, desiredId, candidates = VISIBLE_IMAGE_MODELS)` — 원하는 모델은 **전체** `IMAGE_MODELS` 에서 찾고, 그 모델이 비율을 만들 수 있으면 그대로(숨긴 것이어도 — 고치기 경로), 못 만들면 `candidates` 에서 고른다
  - `planSlotImage(rect, desiredId)` — 같은 원칙, 대체 후보는 보이는 셋

- [ ] **Step 1: 실패하는 시험 쓰기** (기존 파일에 추가·수정)

```ts
// models.test.ts — id 차례 잠금을 바꾼다
expect(IMAGE_MODELS.map((m) => m.id)).toEqual([
  "gpt-image-2.5-flare", "nano-banana-pro", "nano-banana-2.1",
  "gpt-image-2.5-sunburst", "gpt-image-2", "nano-banana-2", "nano-banana",
]);
expect(VISIBLE_IMAGE_MODELS.map((m) => m.label)).toEqual(["표준형", "디테일형", "속도형"]);
it("속도형은 2K 로 부르고 끝점이 google 경로다", () => {
  const speed = modelById("nano-banana-2.1");
  expect(speed.t2i.endpoint).toBe("google/nano-banana-2.1");
  expect(speed.i2i.endpoint).toBe("google/nano-banana-2.1/edit");
  expect(speed.fixedResolution).toBe("2K");
  expect(unitPrice(speed, "t2i", { width: 1088, height: 1360 })).toBe(0.09);
});
it("숨긴 모델로 저장된 값은 기본으로 연다", () => {
  expect(visibleModelOrDefault("nano-banana")).toBe("gpt-image-2.5-flare");
  expect(visibleModelOrDefault("nano-banana-2.1")).toBe("nano-banana-2.1");
});

// model-choice.test.ts
it("숨긴 모델로 만든 그림은 그 모델로 그대로 고친다", () => {
  expect(chooseModelForRatio("4:5", "gpt-image-2")).toMatchObject({ modelId: "gpt-image-2", switched: false });
});
it("대체는 보이는 모델로만 — A4 인쇄용이면 표준형", () => {
  expect(chooseModelForRatio("a4-print", "nano-banana-2.1")).toMatchObject({ modelId: "gpt-image-2.5-flare", switched: true });
});

// image-request.test.ts
it("4:1 칸은 속도형이 만든다 (숨긴 nano-banana-2 가 아니라)", () => {
  expect(planSlotImage({ width: 2000, height: 500 }, "gpt-image-2.5-flare").model.id).toBe("nano-banana-2.1");
});
```

반환 모양(`modelId`·`switched` 등)은 현재 `chooseModelForRatio` 의 실제 반환 형태에 맞춰 적는다 — 먼저 `model-choice.ts:155-181` 을 읽고 필드 이름을 확인한다.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @fixup/sns-core test` 와 `pnpm --filter @fixup/layout-core test` → 새 시험 FAIL

- [ ] **Step 3: 구현**

`models.ts` — 속도형 항목(`nano-banana-pro` 바로 뒤):

```ts
{
  id: "nano-banana-2.1",
  label: imageModelName("nano-banana-2.1"),
  family: "nano-banana",
  note: imageModelSummary("nano-banana-2.1"),
  /*
    **단가는 실측 전 어림이다**(2026-10-08). fal 은 토큰으로 매긴다 — 공표값은 2K
    $0.059(생성)·$0.063(참고 2장 편집), 짧은 프롬프트 기준이다. 우리 프롬프트는
    길고 참고 그림이 붙어 그 위로 나온다. 적게 잡는 쪽이 위험해 위쪽 값으로 둔다.
    실측하면 이 줄과 `model_prices` 행을 함께 고친다.
  */
  t2i: { endpoint: "google/nano-banana-2.1", flatUsd: 0.09 },
  i2i: { endpoint: "google/nano-banana-2.1/edit", flatUsd: 0.09 },
  maxReferenceImages: 14,
  batchMax: 4,
  supportedRatios: NANO_RATIOS_15,
  // fal 기본은 1K 다. 1K 에서 작은 글씨가 흐리다(DeepMind 모델 카드) — 2K 로 못 박는다.
  fixedResolution: "2K",
  resolutionMultiplier: 1,
},
```

- 다른 항목의 `label`·`note` 를 `imageModelName(id)`·`imageModelSummary(id)` 로 바꾼다(숨긴 것은 `note` 를 빈 문자열이 아니라 지운다 — 화면이 쓰지 않는다).
- 배열 차례를 Produces 대로 바꾸고, 차례 주석(`:107-114`)에 「보이는 셋이 앞, 숨긴 것이 뒤. `planSlotImage` 동점이면 앞을 고른다 — 속도형이 nano-banana-2 보다 앞이어야 한다」를 더한다.
- 끝에:

```ts
/** 고르는 화면과 자동 대체가 쓰는 목록. 저장된 id 를 찾을 때는 `IMAGE_MODELS`·`modelById`. */
export const VISIBLE_IMAGE_MODELS: ImageModel[] = IMAGE_MODELS.filter((model) => isVisibleImageModel(model.id));

export function visibleModelOrDefault(id: string | null | undefined): string {
  if (isVisibleImageModel(id)) return id as string;
  return (IMAGE_MODELS.find((model) => model.isDefault) ?? IMAGE_MODELS[0]!).id;
}
```

`model-choice.ts` `chooseModelForRatio` — 원하는 모델 찾기를 `IMAGE_MODELS`(전체)로, 대체 후보 순회를 새 인자 `candidates: ImageModel[] = VISIBLE_IMAGE_MODELS` 로 바꾼다. 원래 목록 인자를 받던 호출부가 있으면(조사: `poster/new-client.tsx:252`, `generate/route.ts:147`, `edit/route.ts:183`, `easy/photo-check.ts:44`) 인자를 지우거나 `VISIBLE_IMAGE_MODELS` 를 넘긴다.

`image-request.ts` `planSlotImage` — 후보 순회를 `VISIBLE_IMAGE_MODELS` 로, 원하는 모델 찾기는 `modelById` 그대로.

`ratios.ts:95,102` — `"…정밀형 계열로만 만들 수 있습니다."` 를 `` `…${imageModelName("gpt-image-2.5-flare")}으로만 만들 수 있습니다.` `` 로(조사 처리는 `withJosa` 가 있으면 그것으로).

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter @fixup/sns-core test && pnpm --filter @fixup/layout-core test && pnpm --filter @fixup/poster-core test` → PASS. 기존 시험 중 이름(「속도형」=pro 등)을 잠근 것은 새 이름으로 고친다: `sns-core/__tests__/model-choice.test.ts:78-79`, `layout-core/__tests__/image-request.test.ts:31-32`, `poster-core/__tests__/generate.test.ts:85`.
- [ ] **Step 5: 비용 화면 검사**(공용 목록을 바꿨으므로 — 메모리 「비용 화면 검사는 PR CI 에 없다」) — Run: `pnpm build:cost-forecast && pnpm check:cost-forecast` → 성공. `apps/web/lib/admin/cost-forecast/work-profiles.ts:144` 의 `nano: "nano-banana"` 연결은 그대로 둔다(시뮬레이터의 옛 경제형 줄). 깨지면 그 연결을 `"nano-banana-2.1"` 로 바꾸고 `forecast-ui.js:15,66` 별칭을 같이 고친다.
- [ ] **Step 6: 커밋** — `git commit -m "feat: 속도형 추가·고르기와 자동 대체는 보이는 세 모델만"`

---

### Task 3: 상세페이지·캐릭터 쪽 목록(pdp-core)

**Files:**
- Modify: `packages/pdp-core/src/types.ts:198-374`
- Modify: `packages/pdp-core/src/pdp.image-provider.ts:56-73, 206-223`
- Modify: `packages/pdp-core/src/pdp.character.ts:787-824` (주석만 — 실사=디테일형 이름 반영)
- Modify: `README.md` 「### 이미지 모델」 표 (`pdp.model-doc.test.ts` 가 잠금)
- Test: `packages/pdp-core/src/pdp.image-provider.test.ts`, `pdp.model-doc.test.ts`, `pdp.character.test.ts`

**Interfaces:**
- Consumes: Task 1 정본
- Produces: `ImageModelId` 에 `"nano-banana-2.1"`; `IMAGE_MODELS` 각 `label`·`description` 이 정본에서 옴; `VISIBLE_PDP_MODELS: ImageModelInfo[]`(보이는 셋, 정본 차례)

- [ ] **Step 1: 실패하는 시험**

```ts
// pdp.image-provider.test.ts
it("속도형은 google 경로·2K·system_prompt 를 쓴다", () => {
  const input = { prompt: "p", systemPrompt: "s", aspectRatio: "3:4" as const, references: [] };
  expect(resolveEndpoint("nano-banana-2.1", [])).toBe("google/nano-banana-2.1");
  expect(buildFalPayload("nano-banana-2.1", input)).toMatchObject({ resolution: "2K", system_prompt: "s", aspect_ratio: "3:4" });
});
// types 시험(새 파일 또는 pdp.image-provider.test.ts 에)
it("보이는 목록은 셋", () => {
  expect(VISIBLE_PDP_MODELS.map((m) => m.label)).toEqual(["표준형", "디테일형", "속도형"]);
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @fixup/pdp-core test` → FAIL
- [ ] **Step 3: 구현**
  - `ImageModelId` 에 `| "nano-banana-2.1"`.
  - `IMAGE_MODEL_CREDIT_WEIGHT` 에 `"nano-banana-2.1": 2` (화면 표시용, 주석대로 실제 차감과 무관).
  - `IMAGE_MODELS` 에 속도형 항목: `{ id: "nano-banana-2.1", label: imageModelName(...), description: imageModelSummary(...), creditWeight: 2, expectedBatchSeconds: 120, maxBatchSize: 6, maxReferenceImages: 14 }` — `expectedBatchSeconds` 는 **실측 전이라 디테일형 값을 그대로** 둔다고 주석.
  - 모든 항목 `label` 을 `imageModelName(id)` 로, 보이는 셋의 `description` 을 `imageModelSummary(id)` 로. 숨긴 것의 `description` 은 그대로 둔다(화면에 안 나간다). `characterOnly` 칸과 주석은 지운다 — 캐릭터도 이제 보이는 셋만 쓴다.
  - 끝에 `export const VISIBLE_PDP_MODELS = VISIBLE_IMAGE_MODEL_IDS.flatMap((id) => IMAGE_MODELS.filter((m) => m.id === id));`
  - `ENDPOINTS` 에 `"nano-banana-2.1": { textToImage: "google/nano-banana-2.1", edit: "google/nano-banana-2.1/edit" }`.
  - `buildFalPayload` 의 `if (model === "nano-banana-pro")` 를 `if (model === "nano-banana-pro" || model === "nano-banana-2.1")` 로 — 두 모델 모두 fal 명세에 `resolution`·`system_prompt` 가 있다(2026-10-08 명세 확인).
  - `README.md` 표를 새 목록대로(모델 일곱 줄 + 보임 여부).
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter @fixup/pdp-core test` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 상세페이지·캐릭터 목록에 속도형, 이름은 정본에서"`

---

### Task 4: 공용 고르기 부품

**Files:**
- Create: `apps/web/app/_components/image-model-picker.tsx`
- Create: `apps/web/app/_components/__tests__/image-model-picker.test.tsx`

**Interfaces:**
- Consumes: Task 1 `VISIBLE_IMAGE_MODEL_IDS`, `imageModelName`, `imageModelSummary`
- Produces:

```ts
export interface ImageModelPickerProps {
  value: string;                       // 지금 고른 id (숨긴 id 가 와도 된다 — 아무 버튼도 안 켜지고 설명은 기본 문구)
  onChange: (id: string) => void;
  ids?: readonly string[];             // 기본 VISIBLE_IMAGE_MODEL_IDS
  disabled?: boolean;
  /** 「자동」 같은 맨 앞 선택지. 캐릭터가 쓴다. */
  auto?: { label: string; hint: string; active: boolean; onPick: () => void };
  legend?: string;                     // 기본 "그림 모델"
}
export function ImageModelPicker(props: ImageModelPickerProps): JSX.Element
```

- [ ] **Step 1: 실패하는 시험** (`@testing-library/react` 가 이미 쓰이는지 `apps/web/app/create/__tests__/pdp-model-picker.test.tsx` 를 열어 같은 방식으로)

```tsx
it("세 버튼과 고른 모델의 설명이 늘 보인다", () => {
  render(<ImageModelPicker value="nano-banana-pro" onChange={() => {}} />);
  expect(screen.getAllByRole("radio").map((b) => b.textContent)).toEqual(
    expect.arrayContaining([expect.stringContaining("표준형"), expect.stringContaining("디테일형"), expect.stringContaining("속도형")]),
  );
  expect(screen.getByTestId("model-summary").textContent).toContain("질감과 인물 표현이 섬세합니다");
});
it("버튼마다 설명이 붙어 있다(마우스·키보드 포커스로 보임)", () => {
  render(<ImageModelPicker value="gpt-image-2.5-flare" onChange={() => {}} />);
  expect(screen.getByRole("radio", { name: /속도형/ }).getAttribute("aria-describedby")).toBeTruthy();
});
it("누르면 그 id 를 알린다", () => {
  const onChange = vi.fn();
  render(<ImageModelPicker value="gpt-image-2.5-flare" onChange={onChange} />);
  fireEvent.click(screen.getByRole("radio", { name: /속도형/ }));
  expect(onChange).toHaveBeenCalledWith("nano-banana-2.1");
});
it("기본 모델에는 「기본」 표시", () => {
  render(<ImageModelPicker value="nano-banana-pro" onChange={() => {}} />);
  expect(screen.getByRole("radio", { name: /표준형/ }).textContent).toContain("기본");
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- image-model-picker` → FAIL
- [ ] **Step 3: 구현** — 라디오 그룹(`role="radiogroup"`, 버튼은 `role="radio"` `aria-checked`). 각 버튼은 `relative group` 이고 안에 설명 말풍선 `<span id=… role="tooltip" className="pointer-events-none absolute … hidden group-hover:block group-focus-visible:block">` 를 둔다(새 패키지 없이 CSS). 버튼 줄 아래에 `<p data-testid="model-summary">` 로 **고른 모델의 설명을 늘 보인다** — 휴대폰은 마우스가 없어서 이것이 설명을 보는 길이다. 버튼 모양은 `@fixup/ui` 의 `Button`(`size="sm"`, 고른 것 `variant="default"`, 나머지 `"secondary"`) — `poster/new-client.tsx:766-774` 와 같은 모양. 「기본」 표시는 `VISIBLE_IMAGE_MODEL_IDS[0]` 이 아니라 `IMAGE_MODELS.find(m => m.isDefault)` 로 정한다(sns-core).
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 공용 그림 모델 고르기 — 마우스 올리면 설명, 고른 모델 설명은 늘 보임"`

---

### Task 5: 카드뉴스·이미지 만들기·쉽게 모드 화면

**Files:**
- Modify: `apps/web/app/sns/_components/spec-picker.tsx:100` (기본 `<select>` → `ImageModelPicker`)
- Modify: `apps/web/app/sns/rerun-seed.ts:177` (다시 열 때 `visibleModelOrDefault`)
- Modify: `apps/web/app/poster/new-client.tsx:762-781` (버튼 → `ImageModelPicker`), `:352` (`setModelId(visibleModelOrDefault(seed.modelId))`), `:188`
- Modify: `apps/web/app/easy/_components/model-bar.tsx:111-171`, `apps/web/app/easy/_components/load.ts:36-59` (`easyImageModels` 를 보이는 셋 + 정본 이름으로 — 화면 이름이 id 이던 것을 고친다)
- Modify: `apps/web/app/easy/_components/cardnews-card.tsx:74` (`<select>` → `ImageModelPicker`)
- Modify: `apps/web/app/easy/cardnews-options.ts:34,47,62` (모르는·숨긴 값 → `visibleModelOrDefault`)
- Modify: `apps/web/app/easy/options.ts:50,73` (대화에 찍히는 모델 id → `imageModelName`)
- Modify: `apps/web/app/easy/split.ts:24-34` (`CHAT_MIN` 이 가장 긴 id 기준 — 한국어 이름 기준으로 다시 잰 값으로; 줄이지 못하면 그대로 두고 주석만)
- Test: `apps/web/app/sns/__tests__/*`, `apps/web/app/easy/__tests__/options.test.ts`, `cardnews-options.test.ts`, `photo-check.test.ts`, `poster/__tests__/*` 중 이름·목록을 잠근 것

**Interfaces:**
- Consumes: Task 2 `VISIBLE_IMAGE_MODELS`, `visibleModelOrDefault`; Task 4 `ImageModelPicker`

- [ ] **Step 1: 실패하는 시험** — 각 화면마다 하나씩:

```ts
// easy/__tests__/options.test.ts (또는 load 시험)
it("쉽게 모드 모델 목록은 보이는 셋, 이름은 한국어", () => {
  expect(easyImageModels().map((m) => m.label)).toEqual(["표준형", "디테일형", "속도형"]);
});
// easy/__tests__/cardnews-options.test.ts
it("숨긴 모델로 저장된 카드뉴스 조건은 표준형으로 연다", () => {
  expect(readCardOptions({ modelId: "nano-banana" }).modelId).toBe("gpt-image-2.5-flare");
});
// sns/__tests__ (rerun-seed)
it("숨긴 모델로 만든 카드뉴스를 다시 열면 표준형이 켜진다", () => { /* rerun-seed 의 반환 modelId 확인 */ });
```

함수 이름(`readCardOptions` 등)은 실제 파일의 내보내기 이름에 맞춘다 — 먼저 파일을 연다.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- easy sns poster` → 새 시험 FAIL
- [ ] **Step 3: 구현** — 위 Files 목록 그대로. 서버로 보내는 값은 늘 `ImageModelPicker` 가 준 id 이므로 숨긴 id 가 새로 나가지 않는다.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test` → PASS (이름·목록 잠금 시험은 새 값으로 고친다)
- [ ] **Step 5: 커밋** — `git commit -m "feat: 카드뉴스·이미지 만들기·쉽게 모드 모델 고르기 통일"`

---

### Task 6: 상세페이지 화면

**Files:**
- Modify: `apps/web/lib/pdp/image-models.ts` (실제 이름 표 삭제 → `VISIBLE_PDP_MODELS`)
- Modify: `apps/web/app/create/ModelPicker.tsx:31-75` (라디오 카드 → `ImageModelPicker`, 또는 같은 정본을 쓰는 카드 유지 — 아래 Step 3)
- Modify: `apps/web/lib/__tests__/model-name.test.ts` (`상세페이지_모델_이름` 예외 삭제)
- Test: `apps/web/lib/pdp/__tests__/two-models.test.ts`, `pdp-image-models.test.ts`, `apps/web/app/create/__tests__/pdp-model-picker.test.tsx`

**Interfaces:**
- Consumes: Task 2 `VISIBLE_IMAGE_MODELS`(sns-core — 상세페이지 목록은 지금도 공용 목록의 설명·차감을 쓴다); Task 4 `ImageModelPicker`
- Produces: `PDP_IMAGE_MODELS`(= 보이는 셋), `isRetiredPdpModel`, `pdpImageModelOrDefault` — 이름과 시그니처는 그대로

- [ ] **Step 1: 실패하는 시험**

```ts
// pdp-image-models.test.ts
it("상세페이지도 세 모델·등급 이름", () => {
  expect(PDP_IMAGE_MODELS.map((m) => m.label)).toEqual(["표준형", "디테일형", "속도형"]);
});
it("숨긴 모델은 은퇴로 본다", () => {
  expect(isRetiredPdpModel("nano-banana-2")).toBe(true);
  expect(isRetiredPdpModel("nano-banana-2.1")).toBe(false);
});
```

`two-models.test.ts` 는 「둘」을 잠근 시험이다 — 셋으로 고치고 파일 이름은 그대로 둔다(이름 바꾸기는 요청 밖).

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — `PDP_MODEL_NAMES` 를 지우고 `export const PDP_IMAGE_MODELS = VISIBLE_IMAGE_MODELS;` (`@fixup/sns-core` 의 것 — 지금도 설명·차감은 공용 목록을 쓴다는 주석 그대로). 위 주석 블록은 「2026-10-08 오후 사용자 결정: 상세페이지도 등급 이름, 모델 셋」으로 고친다. `ModelPicker.tsx` 는 `ImageModelPicker` 로 바꾼다 — 상세페이지는 세로 카드였으나 통일이 사용자 지시다.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test -- pdp create model-name` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 상세페이지 모델 고르기를 공용 부품·등급 이름으로"`

---

### Task 7: 캐릭터

> **다른 터미널 주의.** `CharacterStudio.tsx`·`api/characters/route.ts` 는 2026-10-08 #308 로 크게 바뀌었고 그 작업이 이어질 수 있다. 이 Task 시작 직전에 `git fetch && git log origin/master -3 -- apps/web/app/characters apps/web/app/api/characters` 로 새 커밋을 보고, 있으면 먼저 rebase 한다.

**Files:**
- Modify: `apps/web/app/api/characters/route.ts:133-137` (GET 이 주는 목록 → `VISIBLE_PDP_MODELS`)
- Modify: `apps/web/app/characters/CharacterStudio.tsx:577-583` (손으로 적은 `MODEL_BY_LOOK` → `selectCharacterModel` 사용), `:747-776` (버튼 → `ImageModelPicker` + `auto`), `:304` (옛 캐릭터의 숨긴 모델 → 그림체 기본)
- Test: `apps/web/app/characters/__tests__/*`, `apps/web/app/api/characters/__tests__/*`

**Interfaces:**
- Consumes: Task 3 `VISIBLE_PDP_MODELS`, `selectCharacterModel`; Task 4 `ImageModelPicker` 의 `auto`

- [ ] **Step 1: 실패하는 시험**

```ts
it("캐릭터 GET 목록은 보이는 셋", async () => {
  const body = await (await GET(req)).json();
  expect(body.models.map((m: { label: string }) => m.label)).toEqual(["표준형", "디테일형", "속도형"]);
});
it("숨긴 모델로 저장된 캐릭터를 열면 그림체 기본 모델이 켜진다", () => { /* openedValues 시험 확장 — opened-character.test.ts */ });
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 서버 POST 검증(`route.ts:61`, `views/route.ts:31`)은 **전체 id 그대로**(옛 캐릭터 각도 다시 만들기). 화면 버튼 줄의 「{label} 로 만듭니다」(조사 손붙임)는 `withJosa` 로 고친다.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 캐릭터 모델 고르기를 보이는 세 모델·공용 부품으로"`

---

### Task 8: 리디자인 — 세 모델, 분석 AI 는 그림 모델을 따른다

**Files:**
- Modify: `apps/web/app/redesign/redesign-model.ts:12,153-206` (`Model`=분석 업체는 내부값으로 남기고, 화면 선택은 그림 모델 id)
- Modify: `apps/web/app/redesign/redesign-panels.tsx:432-446`, `redesign-results.tsx:412-417` (두 카드 → `ImageModelPicker`)
- Modify: `apps/web/app/redesign/redesign-wizard.tsx:78,191-194,633-636,743-744`, `redesign-working.tsx:45-64`
- Modify: `apps/web/lib/redesign/image-generator.ts:46-48` (`redesignFalModelFor(choice, imageModel?)`)
- Modify: `apps/web/lib/pdp/request.ts:123,250` (리디자인 요청에 `imageModel` 받기 — 보이는 셋만)
- Modify: `packages/redesign-core/src/generate.ts:403,554,625,873,900,990,1229-1231,1265,1273`, `edit-section.ts:72,157,189,231` (「정밀형/속도형」 문구 → 정본 이름, LLM 에게 알리는 모델 이름을 실제로 그리는 모델로)
- Test: `apps/web/app/redesign/__tests__/*`, `apps/web/app/api/redesign/__tests__/*`, `apps/web/lib/__tests__/redesign-image-generator.test.ts`

**Interfaces:**
- Produces:
  - `analysisProviderFor(imageModel: string): "openai" | "google"` — `gpt-image-*` → `"openai"`, 그 외 → `"google"` (`apps/web/app/redesign/redesign-model.ts`)
  - `redesignFalModelFor(choice: string | undefined, imageModel?: string): string` — `imageModel` 이 보이는 셋이면 그것, 없으면 지금처럼 `choice==="google" ? "nano-banana-pro" : "gpt-image-2.5-flare"`

- [ ] **Step 1: 실패하는 시험**

```ts
it("분석 AI 는 그림 모델을 따른다", () => {
  expect(analysisProviderFor("gpt-image-2.5-flare")).toBe("openai");
  expect(analysisProviderFor("nano-banana-pro")).toBe("google");
  expect(analysisProviderFor("nano-banana-2.1")).toBe("google");
});
it("옛 리디자인(google, imageModel 없음)은 디테일형으로 그린다", () => {
  expect(redesignFalModelFor("google")).toBe("nano-banana-pro");
  expect(redesignFalModelFor("google", "nano-banana-2.1")).toBe("nano-banana-2.1");
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 화면은 그림 모델을 고르고, 보낼 때 `model: analysisProviderFor(imageModel)` 와 `imageModel` 을 함께 보낸다. 키 확인(`serverOpenaiKeyConfigured`/`serverGoogleKeyConfigured`)은 `analysisProviderFor(imageModel)` 로. 처리방침의 「리디자인 속도형 = Google」(`_landing/legal/documents.ts:45`)은 Task 9 에서 「리디자인 디테일형·속도형」으로 고친다.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 리디자인도 세 모델 중 고르기 — 분석 AI 는 그림 모델을 따른다"`

---

### Task 9: 이름이 보이는 글 전부 — 설명서·랜딩·약관·관리자

**Files:**
- Modify: `apps/web/app/guide/credits/page.tsx:32-40,152-157,183-184,200-205`, `guide/cardnews/page.tsx:31,49-56,393,433,521`, `guide/image/page.tsx:60,257,385,404`, `guide/redesign/page.tsx:128-136`, `guide/detail-page/page.tsx:18`
- Modify: `apps/web/app/_landing/credit-facts.ts:50-65` (`LANDING_CREDITS` 열쇠 → 표준형·디테일형·속도형, `LANDING_COST_SPREAD` 는 보이는 셋으로)
- Modify: `apps/web/app/_landing/landing-content.ts:37,71,109,114-116,133,154,187,225,230-232,249` (한국어·영어)
- Modify: `apps/web/app/_landing/legal/documents.ts:39,45`
- Modify: `apps/web/lib/model-name.ts` (정본 `imageModelName` 을 그대로 내보냄; `RETIRED_MODEL_NAME` 도 정본 것)
- Modify: `apps/web/lib/studio/model-choice.ts:57-65` `NOTES` (숨긴 모델 줄 지우지 말고 보이는 셋 문구를 정본과 맞춤)
- Modify: `apps/web/app/admin/ModelCatalogPanel.tsx`·`apps/web/lib/model-catalog.ts` (보임 여부 칸 추가 — 관리자는 실제 이름도 본다)
- Test: `apps/web/app/guide/__tests__/guide-content.test.ts:198-213`, `_landing/__tests__/header-and-about.test.ts:324`, `lib/__tests__/model-name.test.ts`, `admin/__tests__/model-catalog-panel.test.ts`, `lib/__tests__/model-catalog.test.ts`

- [ ] **Step 1: 실패하는 시험** — 「사라진 이름이 회원 글에 없다」를 `model-name.test.ts` 에 더한다:

```ts
it("사라진 등급 이름이 회원 글에 없다", () => {
  const 사라진 = ["정밀형", "정밀형 플러스", "속도형 라이트", "경제형"];
  const 걸린 = 화면들.flatMap(({ path, source }) =>
    문자열들(source).filter((s) => 사라진.some((n) => s.includes(n))).map((s) => `${path}: ${s}`));
  expect(걸린).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- model-name` → FAIL (걸린 목록이 위 Files 와 같아야 한다 — 다르면 빠진 곳을 Files 에 더한다)
- [ ] **Step 3: 구현** — 문구를 정본 이름으로. 약관 `:39` 「(표준형·디테일형·속도형 등)」, 처리방침 `:45` 리디자인 「디테일형·속도형」. 영어판은 Standard / Detail / Speed.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "docs: 설명서·랜딩·약관의 모델 이름을 세 등급으로"`

---

### Task 10: 단가표(DB)와 서버 검증 목록

**Files:**
- Create: `supabase/migrations/202610080002_nano_banana_21_price.sql`
- Modify: `apps/web/app/api/sns/projects/schema.ts:83-90` (enum 에 `"nano-banana-2.1"`)
- Test: `apps/web/app/api/sns/__tests__/projects.test.ts:44-52` (목록 일치 시험 — 그대로 통과해야 함)

- [ ] **Step 1: 시험 실행으로 불일치 확인** — Run: `pnpm --filter web test -- projects` → FAIL(enum 에 2.1 없음)
- [ ] **Step 2: 구현**

```sql
-- 속도형(nano-banana-2.1) 단가를 단가표에 넣는다.
--
-- **코드보다 먼저 적용한다.** 집계가 `left join model_prices` 라 행이 없으면
-- 그 사이 만든 그림이 $0 으로 남는다(202609100001 머리 주석).
--
-- 값은 실측 전 어림이다. fal 은 토큰으로 매긴다 — 공표 2K $0.059(생성)·
-- $0.063(참고 2장 편집)은 짧은 프롬프트 기준이고 우리 것은 길다. 위쪽 값으로 둔다.
-- 실측하면 이 행과 sns-core 의 flatUsd 를 함께 고친다.
insert into public.model_prices (model, label, unit_cost_usd, note) values
  ('nano-banana-2.1', 'Nano Banana 2.1', 0.09000,
   '실측 전 어림(2026-10-08). fal 토큰 과금 — 공표 2K $0.059·편집 $0.063 위로 잡음. 회원 이름: 속도형.')
on conflict (model) do nothing;
```

`model_prices` 의 열과 충돌 열 이름은 `202609100001_gpt_image_25_prices.sql` 과 같게 맞춘다(먼저 연다).

- [ ] **Step 3: 로컬 DB 검사** — 메모리 「PR 전 CI 전체를 로컬에서」: 로컬 Postgres 17 에 마이그레이션 전체를 적용하는 기존 검사 명령(`package.json` 의 DB 검사 스크립트)을 돌린다 → 성공
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test -- projects` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 속도형 단가 행·카드뉴스 검증 목록"`

---

### Task 11: 전체 검증·리뷰·배포·일지

- [ ] **Step 1: 전체 검사** — Run: `pnpm -r typecheck`, `pnpm -r test`, `pnpm build:cost-forecast && pnpm check:cost-forecast`, 로컬 DB 검사 → 모두 실패 0
- [ ] **Step 2: 화면 확인** — dev 서버(이 작업 폴더 전용 포트)에서 카드뉴스·이미지 만들기·쉽게·상세페이지·캐릭터·리디자인의 고르기가 세 버튼·설명 말풍선·고른 모델 설명 줄로 보이는지, 폭 375px 에서도 보이는지 스크린샷으로 확인
- [ ] **Step 3: 독립 리뷰** — `code-reviewer` 에이전트에 `git diff origin/master...HEAD` 전체를 맡긴다. 발견된 문제를 고친 뒤 다시 Step 1
- [ ] **Step 4: PR** — `git push -u origin feat/image-model-lineup`, PR 본문에 시험 계획 포함
- [ ] **Step 5: 배포 전 확인** — 메모리 「배포 전 다른 터미널 확인」: master 에 남의 머지·마이그레이션이 섞였는지 본다. **마이그레이션 `202610080002` 를 운영 Supabase 에서 먼저 실행**(사용자에게 실행 요청 또는 승인 후 실행)
- [ ] **Step 6: 배포** — `docs/DEPLOY.md` 「매 배포」 그대로. 확인: 서비스 active, 로컬 200, `current` 가 새 릴리스, 빌드 안에 「디테일형」 문구 존재
- [ ] **Step 7: 설명서 색인** — 설명서 문구가 바뀌었으므로 도우미 색인을 다시 만든다(`npx tsx` 경로 — 메모리 「운영 접속 키·도우미 색인 명령」). 옛 판이 쌓이므로 지우기는 **사용자에게 묻는다**
- [ ] **Step 8: 개발 일지** — `docs/DEPLOY.md` 「개발 일지에 적는다」 그대로, PR 링크를 보고에 포함

---

## 이 계획에 넣지 않은 것 (사용자가 뒤로 미룸)

- 크레딧과 원가의 규칙 정리 — 이 작업 배포 뒤 따로
- 속도형 실측(비용·한글) — 배포 뒤 사용자가 직접 비교. 실측하면 `flatUsd` 0.09 와 `model_prices` 행을 고친다
- 리디자인 외 분석 경로 변경 없음
