# 상세페이지 제품 보존 — 구현 계획 (0·1·2단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 첨부한 제품이 섹션마다 바뀌지 않게, 그림 모델에 **원본 사진**을 넘기고 프롬프트 **양 끝**에서 제품 보존을 말한다(각도는 자유).

**Architecture:** 1단계는 `pdp-core` 안에서 프롬프트만 바꾼다 — 새 모듈 `pdp.product-fidelity.ts` 가 제품 블록(앞)·마지막 확인(뒤)·시스템 한 줄을 만들고, `generateSectionImageInternal` 이 그 자리에 끼운다. 사진에서 읽은 제품 정보(`productReading`)는 페이지 값(`page.productFacts`)으로 실려 온다. 2단계는 원본을 새 라우트 `/api/pdp/product-photo` 로 **한 번** fal 저장소에 올리고, 섹션 요청에는 그 주소(`productImageUrl`)만 싣는다 — 포스터·카드뉴스·리디자인이 이미 쓰는 길(`lib/fal/upload.ts`)과 같다.

**Tech Stack:** TypeScript, Next.js App Router(`apps/web`), `@fixup/pdp-core`, zod, sharp, `@fal-ai/client`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-pdp-product-fidelity-design.md`

**3단계(제품 칸·여러 각도·여러 제품, 설계 §3·§5·§6.1·§6.2)는 이 계획에 없다.** 2단계가 머지된 뒤 그때의 코드를 다시 읽고 별도 계획(`2026-10-08-pdp-multi-product.md`)으로 쓴다. 3단계는 분석 스키마·섹션 구조·두 큰 화면 파일(`PdpMakerClient.tsx` 2,684줄, `PdpEditor.tsx` 3,551줄)을 바꾸는데, 그 파일들은 2단계에서 바뀐다 — 지금 그 코드를 계획에 적으면 실행 때는 틀린 줄을 가리킨다.

## Global Constraints

- 모든 응답·주석·커밋 설명은 한국어. 주석은 둘레 코드처럼 「왜」를 적는다.
- 불변: 객체·배열을 고치지 않고 새로 만든다.
- 함수 50줄·파일 800줄 상한. `PdpEditor.tsx`·`PdpMakerClient.tsx` 는 이미 넘었다 — **새 로직은 별도 파일**에 두고 화면 파일에는 부르는 줄만 더한다.
- `console.log` 금지(둘레처럼 `console.warn`/`console.error` + `errorLogText`).
- 각도 자유는 유지한다(설계 D3). `ROLE_RULES.anchor` 의 「Do NOT copy the reference's camera angle…」 줄과 시스템의 「Vary it between sections」 줄을 지우지 않는다.
- 글 경로(`anchorKind: "key-visual"`, 앵커 역할 `mood-only`)는 바이트도 프롬프트도 지금 그대로다.
- 크레딧 계산·예약·정산 순서는 바꾸지 않는다.
- 상한 값: 제품 사실 8줄·라벨 12줄·각 200자, 사진 20MB·40백만 화소, 모델 긴 변 3840px, 업로드 시간당 60회(`reference_analyze` 칸 공유).
- 커밋은 단계별로 하되 **푸시·PR·배포는 사용자가 요청할 때만**(`docs/DEPLOY.md`).
- PR 전 로컬에서 CI 전체: `pnpm -r typecheck`, `pnpm -r test`, 그리고 `pnpm check:cost-forecast`(pdp-core 를 바꾸므로 — 메모리 「비용 화면 검사는 PR CI 에 없다」).

## Review Focus

1. **휴대폰 사진의 회전 정보(EXIF orientation)** — 원본을 그대로 넘기면 모델이 누운 사진으로 읽을 수 있다. 1024 사본은 캔버스가 바로 세워 줬다. → Task 6 이 회전 정보가 1 이 아니면 바로 세워 다시 굽는다(시험 포함).
2. **원본이 없는 옛 작업** — 1024 사본만 있다. 그것을 같은 라우트로 올려 주소로 만들어야 한다. → Task 10 시험.
3. **한 시간이 지난 주소** — 편집기를 오래 열어 두면 fal 주소가 지워진다. → Task 10 이 남은 시간 10분 아래면 다시 올린다(시험 포함).
4. **`shape-only`(제품 보존 끔 + 디자인 레퍼런스)** — 사용자가 색을 양보했다. 제품 블록이 「색을 지켜라」로 그 선택을 뒤집으면 안 된다. → Task 1·2 시험.
5. **제품 블록이 각도를 굳히는가** — 시험으로는 못 잰다. Task 4·11 의 고치기 전·후 비교에서 사람이 본다.

---

## 0단계 — 재기

### Task 0: fal 동작 실측 (값이 든다 — 시작 전 사용자에게 장수·대략 값 확인)

**Files:**
- Create(커밋 안 함): `<scratchpad>/probe-product-photo.mjs`
- Modify: `docs/superpowers/specs/2026-10-08-pdp-product-fidelity-design.md` §9.1 아래에 결과 표

**Interfaces:**
- Produces: `FAL_STORAGE_HOSTS` 값(Task 6), `FIT_TO_MODEL_EDGE` 값(Task 6), 값 차이 여부(사용자 보고)

- [ ] **Step 1: 사용자에게 묻는다** — 「fal 로 그림 약 6장(GPT Image 2.5 3장, Nano Banana Pro 3장)을 만들어 재겠습니다. 진행할까요?」 답을 받기 전에는 Step 2 로 가지 않는다.

- [ ] **Step 2: 시험 사진 두 장을 만든다** (같은 내용, 크기만 다름)

```bash
cd /c/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/pdp-product-fidelity/apps/web
node -e "
const sharp=require('sharp');
const svg=(w,h)=>Buffer.from('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"'+w+'\" height=\"'+h+'\"><rect width=\"100%\" height=\"100%\" fill=\"#f4efe6\"/><rect x=\"'+w*0.35+'\" y=\"'+h*0.15+'\" width=\"'+w*0.3+'\" height=\"'+h*0.7+'\" rx=\"40\" fill=\"#2d6a4f\"/><text x=\"50%\" y=\"50%\" font-size=\"'+w*0.03+'\" text-anchor=\"middle\" fill=\"#fff\">FIXUP LEMON 500ml</text></svg>');
const out=process.argv[1];
Promise.all([
  sharp(svg(4032,3024)).jpeg({quality:92}).toFile(out+'/big-4032.jpg'),
  sharp(svg(4032,3024)).resize(1024).jpeg({quality:84}).toFile(out+'/small-1024.jpg'),
]).then(()=>console.log('ok'));
" "$SCRATCH"
```

`$SCRATCH` 는 세션 scratchpad 경로다. 출력: `ok`

- [ ] **Step 3: 실측 스크립트를 쓴다** (`$SCRATCH/probe-product-photo.mjs`)

```js
// 0단계 실측: fal 저장소 주소의 호스트, 4032px 참조를 받는가, 크기에 따라 값이 다른가.
import { createFalClient } from "@fal-ai/client";
import { readFileSync } from "node:fs";

const key = process.env.FAL_KEY;
if (!key) throw new Error("FAL_KEY 가 없습니다");
const fal = createFalClient({ credentials: key });
const dir = process.argv[2];

async function upload(name) {
  const bytes = readFileSync(`${dir}/${name}`);
  return fal.storage.upload(new Blob([bytes], { type: "image/jpeg" }), { lifecycle: { expiresIn: "1h" } });
}

const big = await upload("big-4032.jpg");
const small = await upload("small-1024.jpg");
console.log("UPLOAD_HOST", new URL(big).host, new URL(small).host);

const prompt = "Show this exact bottle on a wooden table, seen from a slight side angle.";
for (const [model, endpoint, extra] of [
  ["gpt", "openai/gpt-image-2.5/flare/edit", { image_size: { width: 1536, height: 2048 }, quality: "max", output_format: "png" }],
  ["nano", "fal-ai/nano-banana-pro/edit", { aspect_ratio: "3:4", resolution: "2K", output_format: "png" }],
]) {
  for (const [label, url] of [["big", big], ["small", small]]) {
    const started = Date.now();
    try {
      const result = await fal.subscribe(endpoint, { input: { prompt, image_urls: [url], num_images: 1, ...extra } });
      console.log("RESULT", model, label, "ok", Date.now() - started, "ms", result.requestId, JSON.stringify(result.data.images?.[0]?.url));
    } catch (error) {
      console.log("RESULT", model, label, "error", error?.status, String(error?.message).slice(0, 300));
    }
  }
}
```

- [ ] **Step 4: 돌린다**

```bash
cd /c/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/pdp-product-fidelity/apps/web
FAL_KEY=<운영과 같은 키를 사용자가 넣는다> node "$SCRATCH/probe-product-photo.mjs" "$SCRATCH"
```

키는 대화에 적지 않는다 — 사용자에게 `! FAL_KEY=… node …` 로 직접 돌리도록 안내한다.
Expected: `UPLOAD_HOST …` 한 줄, `RESULT …` 네 줄.

- [ ] **Step 5: 값을 확인한다** — fal 대시보드의 요청별 비용(또는 `lib/fal/pool/receipt.ts` 가 남기는 영수증)을 `requestId` 로 찾아 big/small 값이 같은지 본다. 다르면 사용자에게 먼저 알리고 멈춘다.

- [ ] **Step 6: 결정을 적는다** — 설계 §9.1 아래에:

```markdown
#### 0단계 결과 (YYYY-MM-DD)

| 항목 | 결과 | 결정 |
|---|---|---|
| fal 저장소 호스트 | (UPLOAD_HOST 값) | `FAL_STORAGE_HOSTS = [...]` |
| 4032px 참조 — GPT Image 2.5 | ok / error | ok 면 `FIT_TO_MODEL_EDGE = false` |
| 4032px 참조 — Nano Banana Pro | ok / error | 둘 중 하나라도 error 면 `true` |
| 크기에 따른 값 | 같음 / 다름 | 다르면 사용자 보고 |
```

---

## 1단계 — 프롬프트

### Task 1: 제품 블록 모듈

**Files:**
- Create: `packages/pdp-core/src/pdp.product-fidelity.ts`
- Create: `packages/pdp-core/src/pdp.product-fidelity.test.ts`
- Modify: `packages/pdp-core/src/index.ts` (export 추가)

**Interfaces:**
- Consumes: `AnchorRole` (`./pdp.product-anchor`), `ProductReading` (`./pdp.product-reading`)
- Produces:
  - `interface ProductFacts { category?: string; visibleFacts: string[]; labelText: string[] }`
  - `const PRODUCT_FACT_LIMITS = { facts: 8, labels: 12, chars: 200 } as const`
  - `productFactsFrom(reading?: Pick<ProductReading, "category" | "visibleFacts" | "labelText"> | null): ProductFacts | undefined`
  - `productFidelityHead(input: { imageNumber: number; anchorRole: AnchorRole; facts?: ProductFacts; companion?: string }): string`
  - `productFidelityTail(input: { imageNumber: number; anchorRole: AnchorRole }): string`
  - `productFidelitySystemLine(anchorRole: AnchorRole): string`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, it } from "vitest";
import {
  PRODUCT_FACT_LIMITS,
  productFactsFrom,
  productFidelityHead,
  productFidelitySystemLine,
  productFidelityTail,
} from "./pdp.product-fidelity";

/**
 * 제품 블록은 **지킬 것과 바꿔도 되는 것을 한 문단에** 말한다.
 * 「모양 그대로」만 쓰면 모델이 찍힌 각도까지 베낀다(pdp.reference-policy.ts 머리말).
 */
const 지킬것줄 = (text: string) => text.split("\n").find((line) => line.startsWith("Keep unchanged:")) ?? "";
const 바꿔도줄 = (text: string) => text.split("\n").find((line) => line.startsWith("Free to change:")) ?? "";

describe("제품 블록(앞)", () => {
  it("몇 번째 그림이 제품인지, 지킬 것과 바꿔도 되는 것을 함께 말한다", () => {
    const head = productFidelityHead({ imageNumber: 1, anchorRole: "identity" });
    expect(head).toContain("Image 1");
    expect(지킬것줄(head)).toMatch(/colour/);
    expect(지킬것줄(head)).toMatch(/label/);
    expect(바꿔도줄(head)).toMatch(/camera angle/);
    expect(head).toMatch(/new angle is expected/);
  });

  it("보존을 끈 경우(shape-only)에는 색·마감을 바꿔도 되는 쪽에 둔다 — 사용자가 고른 것을 뒤집지 않는다", () => {
    const head = productFidelityHead({ imageNumber: 2, anchorRole: "shape-only" });
    expect(지킬것줄(head)).not.toMatch(/colour/);
    expect(바꿔도줄(head)).toMatch(/colour/);
    expect(지킬것줄(head)).toMatch(/label/);
  });

  it("만든 대표 이미지(mood-only)에는 아무 말도 안 한다", () => {
    expect(productFidelityHead({ imageNumber: 1, anchorRole: "mood-only" })).toBe("");
    expect(productFidelityTail({ imageNumber: 1, anchorRole: "mood-only" })).toBe("");
    expect(productFidelitySystemLine("mood-only")).toBe("");
  });

  it("사진에서 읽은 글자는 따옴표로, 보이는 면에서만, 사진이 맞다고 말한다", () => {
    const head = productFidelityHead({
      imageNumber: 1,
      anchorRole: "identity",
      facts: { category: "음료 병", visibleFacts: ["짙은 초록 유리병"], labelText: ['FIXUP "LEMON"', "500ml"] },
    });
    expect(head).toContain("짙은 초록 유리병");
    expect(head).toContain(JSON.stringify('FIXUP "LEMON"'));
    expect(head).toContain(JSON.stringify("500ml"));
    expect(head).toMatch(/only where that face of the product is visible/);
    expect(head).toMatch(/the photo is correct/);
    expect(head).toMatch(/ignore anything that describes how the photo was taken/);
  });

  it("사실이 없으면 사실 문단을 싣지 않는다", () => {
    const head = productFidelityHead({ imageNumber: 1, anchorRole: "identity" });
    expect(head).not.toMatch(/Product facts/);
    expect(head).not.toMatch(/Label text/);
  });

  it("인물·캐릭터가 함께 붙을 때만 둘 다 알아보게 하라는 줄을 싣는다", () => {
    expect(productFidelityHead({ imageNumber: 1, anchorRole: "identity" })).not.toMatch(/both be clearly recognisable/);
    expect(productFidelityHead({ imageNumber: 1, anchorRole: "identity", companion: "character" }))
      .toMatch(/The product and the character must both be clearly recognisable/);
  });
});

describe("마지막 확인(뒤)·시스템 한 줄", () => {
  it("뒤에서 같은 제품인지 다시 확인시킨다", () => {
    const tail = productFidelityTail({ imageNumber: 3, anchorRole: "identity" });
    expect(tail).toContain("Image 3");
    expect(tail).toMatch(/colour/);
  });

  it("shape-only 의 마지막 확인은 색을 묻지 않는다", () => {
    expect(productFidelityTail({ imageNumber: 1, anchorRole: "shape-only" })).not.toMatch(/colour/);
  });

  it("시스템 한 줄은 제품을 그대로 두고 장면은 새로 고르라고 한다", () => {
    const line = productFidelitySystemLine("identity");
    expect(line).toMatch(/real product/);
    expect(line).toMatch(/fresh camera angle/);
  });
});

describe("productFactsFrom", () => {
  it("상한까지만 담고 길면 자른다", () => {
    const facts = productFactsFrom({
      category: "가".repeat(300),
      visibleFacts: Array.from({ length: 20 }, (_, i) => `사실${i}`),
      labelText: Array.from({ length: 20 }, (_, i) => `라벨${i}`),
    })!;
    expect(facts.category).toHaveLength(PRODUCT_FACT_LIMITS.chars);
    expect(facts.visibleFacts).toHaveLength(PRODUCT_FACT_LIMITS.facts);
    expect(facts.labelText).toHaveLength(PRODUCT_FACT_LIMITS.labels);
  });

  it("빈 칸만 있으면 없다고 답한다", () => {
    expect(productFactsFrom({ category: " ", visibleFacts: [""], labelText: [] })).toBeUndefined();
    expect(productFactsFrom(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/pdp-core exec vitest run src/pdp.product-fidelity.test.ts`
Expected: FAIL — `Failed to resolve import "./pdp.product-fidelity"`

- [ ] **Step 3: 구현한다**

```ts
import type { AnchorRole } from "./pdp.product-anchor";
import type { ProductReading } from "./pdp.product-reading";

/**
 * **첨부한 제품을 섹션마다 같은 제품으로**(설계 2026-10-08 §6·§7).
 *
 * 전에는 제품 규칙이 프롬프트 중간 뒤쪽(`buildReferenceRoleDirective`)에 한 번뿐이었고,
 * Nano Banana Pro 의 시스템 문장에는 제품 말이 아예 없었다. 긴 프롬프트에서 중간
 * 문장은 힘을 잃는다(2026-09-04 실측) — 그래서 앞과 뒤에 한 번씩 더 말한다.
 *
 * **각도는 묶지 않는다**(사용자 결정 D3). 「지킬 것」과 「바꿔도 되는 것」을 늘
 * 한 문단에 둔다 — 「모양 그대로」만 쓰면 모델이 찍힌 각도까지 베낀다.
 */

export interface ProductFacts {
  category?: string;
  visibleFacts: string[];
  labelText: string[];
}

/** 화면·서버·코어가 같은 수를 본다. 두 벌이면 화면이 보낸 것을 서버가 거절한다. */
export const PRODUCT_FACT_LIMITS = { facts: 8, labels: 12, chars: 200 } as const;

const clip = (value: unknown) => Array.from(String(value ?? "").trim()).slice(0, PRODUCT_FACT_LIMITS.chars).join("");
const clipList = (values: unknown, limit: number) =>
  (Array.isArray(values) ? values : []).map(clip).filter(Boolean).slice(0, limit);

/** 판독에서 **제품 자체의 사실**만 뽑는다. 다 비면 없다고 답한다 — 빈 문단은 모델이 채우려 든다. */
export function productFactsFrom(
  reading?: Pick<ProductReading, "category" | "visibleFacts" | "labelText"> | null,
): ProductFacts | undefined {
  if (!reading) return undefined;
  const category = clip(reading.category);
  const visibleFacts = clipList(reading.visibleFacts, PRODUCT_FACT_LIMITS.facts);
  const labelText = clipList(reading.labelText, PRODUCT_FACT_LIMITS.labels);
  if (!category && !visibleFacts.length && !labelText.length) return undefined;
  return { ...(category ? { category } : {}), visibleFacts, labelText };
}

/** `shape-only` 는 사용자가 색·마감을 레퍼런스에 양보한 경우다(`pdp.product-anchor.ts`). */
function keepAndFree(role: AnchorRole) {
  const keepsColour = role !== "shape-only";
  return {
    keep: keepsColour
      ? "silhouette and proportions, defining parts, colour, material and finish, seams and hardware, and every logo and label text on the faces that are visible"
      : "silhouette and proportions, defining parts, seams and hardware, and every logo and label text on the faces that are visible",
    free: keepsColour
      ? "camera angle, distance, crop, background, lighting and where the product sits in the frame"
      : "colour palette, material finish (follow the design reference), camera angle, distance, crop, background, lighting and where the product sits in the frame",
  };
}

function factsBlock(facts: ProductFacts): string[] {
  const lines: string[] = [];
  const items = [...(facts.category ? [`Category: ${facts.category}`] : []), ...facts.visibleFacts];
  if (items.length) {
    lines.push(
      "Product facts read from the photo (about the product itself — ignore anything that describes how the photo was taken, such as its angle or background):",
      ...items.map((item) => `- ${item}`),
    );
  }
  if (facts.labelText.length) {
    lines.push(
      `Label text: ${facts.labelText.map((text) => JSON.stringify(text)).join(", ")}. ` +
        "Render it exactly, but only where that face of the product is visible at the chosen angle. " +
        "Never turn the product just to show the label, and never move the label to another face.",
    );
  }
  if (lines.length) lines.push("If any of this text disagrees with the attached photo, the photo is correct.");
  return lines;
}

export function productFidelityHead(input: {
  imageNumber: number;
  anchorRole: AnchorRole;
  facts?: ProductFacts;
  /** 함께 붙은 인물·캐릭터를 부르는 말. 없으면 그 줄을 안 싣는다. */
  companion?: string;
}): string {
  if (input.anchorRole === "mood-only") return "";
  const { keep, free } = keepAndFree(input.anchorRole);
  return [
    `PRODUCT FIDELITY — Image ${input.imageNumber} is the real product being sold. Reproduce this exact product, not a similar one.`,
    `Keep unchanged: ${keep}.`,
    `Free to change: ${free} — choose these for this section.`,
    "Showing the product from a new angle is expected; changing the product itself is not.",
    ...(input.facts ? factsBlock(input.facts) : []),
    ...(input.companion
      ? [`The product and the ${input.companion} must both be clearly recognisable. Do not shrink, crop or hide one to make room for the other.`]
      : []),
  ].join("\n");
}

export function productFidelityTail(input: { imageNumber: number; anchorRole: AnchorRole }): string {
  if (input.anchorRole === "mood-only") return "";
  const same = input.anchorRole === "shape-only"
    ? "same shape, proportions and label text"
    : "same shape, proportions, colour, material and label text";
  return `Final check: the product in your image must be the exact product in Image ${input.imageNumber} — ${same}. Only the camera, background and lighting may differ.`;
}

export function productFidelitySystemLine(anchorRole: AnchorRole): string {
  if (anchorRole === "mood-only") return "";
  return "The attached product photo is the real product being sold: reproduce that exact product in every section while choosing a fresh camera angle and scene for each one.";
}
```

`index.ts` 에 더한다:

```ts
export {
  PRODUCT_FACT_LIMITS,
  productFactsFrom,
  productFidelityHead,
  productFidelitySystemLine,
  productFidelityTail,
  type ProductFacts,
} from "./pdp.product-fidelity";
```

- [ ] **Step 4: 통과하는지 본다**

Run: `pnpm --filter @fixup/pdp-core exec vitest run src/pdp.product-fidelity.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 커밋**

```bash
git add packages/pdp-core/src/pdp.product-fidelity.ts packages/pdp-core/src/pdp.product-fidelity.test.ts packages/pdp-core/src/index.ts
git commit -m "feat(pdp): 제품 보존 블록 — 지킬 것·바꿔도 되는 것을 한 문단에

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: 섹션 프롬프트 양 끝·시스템에 끼운다

**Files:**
- Modify: `packages/pdp-core/src/types.ts` (`ImageGenOptions` 에 `productFacts?: ProductFacts`)
- Modify: `packages/pdp-core/src/pdp.service.ts:899-973` (프롬프트·시스템 조립)
- Create: `packages/pdp-core/src/pdp.product-fidelity-wiring.test.ts`

**Interfaces:**
- Consumes: Task 1 의 네 함수
- Produces: `ImageGenOptions.productFacts?: ProductFacts` (Task 3 이 채운다)

- [ ] **Step 1: 실패하는 시험을 쓴다** — fal 로 나가는 진짜 프롬프트를 붙잡는다(`pdp.attachment-intent.test.ts` 와 같은 방식).

```ts
import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import type { SectionBlueprint } from "./types";

/**
 * 제품 블록이 **실제로 fal 에 가는 프롬프트의 양 끝**에 있는가.
 * 모듈 시험만으로는 배선이 빠져도 통과한다(2026-09-08 카드뉴스에서 그랬다).
 */
const section = (): SectionBlueprint =>
  ({ section_id: "s1", section_name: "히어로", headline: "제목", subheadline: "부제",
     prompt_en: "a clean product photo on a table", layout_notes: "", bullets: [] }) as unknown as SectionBlueprint;

async function sent(options: Record<string, unknown>) {
  const captured: Array<{ prompt: string; systemPrompt: string }> = [];
  await (new PdpService() as never as { generateSectionImageInternal(input: unknown): Promise<unknown> })
    .generateSectionImageInternal({
      originalImageBase64: "iVBORw0KGgo=",
      section: section(),
      aspectRatio: "3:4",
      options: { style: "studio", withModel: false, outputMode: "editable", ...options },
      client: { llm: { generate: async () => ({ text: "{}" }) }, models: { generateContent: async () => ({ text: "{}" }) } },
      generateImage: async (_model: unknown, input: { prompt: string; systemPrompt: string }) => {
        captured.push(input);
        return { base64: "IMG", mimeType: "image/jpeg" };
      },
    });
  return captured[0]!;
}

describe("제품 블록 배선", () => {
  it("앞 블록은 장면 JSON 보다 앞, 마지막 확인은 역할 지시보다 뒤", async () => {
    const { prompt } = await sent({});
    const head = prompt.indexOf("PRODUCT FIDELITY");
    const json = prompt.indexOf('"task"');
    const roles = prompt.indexOf("Reference images (");
    const tail = prompt.indexOf("Final check:");
    expect(head).toBeGreaterThanOrEqual(0);
    expect(head).toBeLessThan(json);
    expect(roles).toBeGreaterThan(json);
    expect(tail).toBeGreaterThan(roles);
  });

  it("사용자 지시가 있으면 지시가 맨 앞·맨 뒤를 지킨다", async () => {
    const { prompt } = await sent({ userInstruction: "왼쪽에 놓아 주세요" });
    expect(prompt.indexOf("USER INSTRUCTION")).toBeLessThan(prompt.indexOf("PRODUCT FIDELITY"));
    expect(prompt.indexOf("Final check:")).toBeLessThan(prompt.indexOf("Before drawing, re-read"));
  });

  it("시스템 문장에도 제품 한 줄이 있다 — Nano Banana Pro 는 이것을 system_prompt 로 받는다", async () => {
    const { systemPrompt } = await sent({});
    expect(systemPrompt).toMatch(/real product being sold/);
  });

  it("각도 자유 문장은 그대로 남는다(D3)", async () => {
    const { prompt, systemPrompt } = await sent({});
    expect(prompt).toMatch(/Do NOT copy the reference's camera angle/);
    expect(systemPrompt).toMatch(/Vary it between sections/);
  });

  it("글 경로의 대표 이미지(key-visual)에는 제품 블록이 없다", async () => {
    const { prompt, systemPrompt } = await sent({ anchorKind: "key-visual" });
    expect(prompt).not.toMatch(/PRODUCT FIDELITY|Final check:/);
    expect(systemPrompt).not.toMatch(/real product being sold/);
  });

  it("보존을 끄고 레퍼런스를 붙이면 색은 바꿔도 되는 쪽", async () => {
    const { prompt } = await sent({
      preserveProductImage: false,
      styleReferenceImages: [{ base64: "REF", mimeType: "image/png" }],
    });
    const free = prompt.split("\n").find((line) => line.startsWith("Free to change:")) ?? "";
    expect(free).toMatch(/colour/);
  });

  it("읽어 둔 라벨 글자가 실린다", async () => {
    const { prompt } = await sent({ productFacts: { visibleFacts: [], labelText: ["FIXUP 500ml"] } });
    expect(prompt).toContain(JSON.stringify("FIXUP 500ml"));
  });

  it("캐릭터가 실제로 실릴 때만 둘 다 알아보게 하라는 줄", async () => {
    expect((await sent({})).prompt).not.toMatch(/both be clearly recognisable/);
    const { prompt } = await sent({
      withModel: true,
      characterReferences: [{ base64: "CH", mimeType: "image/png", identityPrompt: "흰 고양이", kind: "animal", look: "photoreal" }],
    });
    expect(prompt).toMatch(/both be clearly recognisable/);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/pdp-core exec vitest run src/pdp.product-fidelity-wiring.test.ts`
Expected: FAIL — 첫 시험에서 `expected -1 to be greater than or equal to 0`

- [ ] **Step 3: 구현한다**

`types.ts` — `ImageGenOptions` 의 `conceptOnly` 아래에:

```ts
  /**
   * **사진에서 읽은 제품 사실**(설계 2026-10-08 §7). 구성안의 `productReading` 에서
   * 화면이 뽑아 보낸다(`productFactsFrom`). 글 경로에는 없다.
   */
  productFacts?: ProductFacts;
```

(`import type { ProductFacts } from "./pdp.product-fidelity";` 를 위에 더한다. 순환이 생기면 `ProductFacts` 를 `types.ts` 로 옮기고 모듈이 거기서 가져온다.)

`pdp.service.ts` — 위에 import:

```ts
import { productFidelityHead, productFidelitySystemLine, productFidelityTail } from "./pdp.product-fidelity";
```

프롬프트 조립(지금 `const prompt = [` 블록)을 바꾼다:

```ts
      /*
        **제품 보존을 양 끝에서 한 번 더**(설계 2026-10-08 §6). 역할 지시(중간)는 그대로
        두고, 앞에서 「무엇을 지키고 무엇은 바꿔도 되는지」를, 뒤에서 「같은 제품인지」를
        말한다. 사용자 지시가 여전히 맨 앞·맨 뒤다.
      */
      const anchorNumber = references.findIndex((reference) => reference.kind === "anchor") + 1;
      const companion = references.some((reference) => reference.kind === "person")
        ? carried ? carriedSubjectNoun(carried.kind) : "person"
        : undefined;
      const fidelityHead = anchorNumber
        ? productFidelityHead({ imageNumber: anchorNumber, anchorRole, facts: options.productFacts, companion })
        : "";
      const fidelityTail = anchorNumber ? productFidelityTail({ imageNumber: anchorNumber, anchorRole }) : "";

      const prompt = [
        userInstructionHead(options.userInstruction, { identityFirst: true }),
        fidelityHead,
        buildImageJson(section, promptOptions),
        buildReferenceRoleDirective(references, {
          hasUserInstruction: Boolean(options.userInstruction),
          anchorRole,
          character: carried,
        }),
        characterIdentity,
        retryDirective ? `Correction required: ${retryDirective}` : "",
        fidelityTail,
        userInstructionTail(options.userInstruction),
      ]
        .filter(Boolean)
        .join("\n\n");
```

시스템 문장(`systemPrompt: buildImageSystemPrompt(promptOptions),`)을 바꾼다:

```ts
          // 제품이 실릴 때만 한 줄. Nano Banana Pro 는 이 문장을 system_prompt 로 받는다.
          systemPrompt: [buildImageSystemPrompt(promptOptions), anchorNumber ? productFidelitySystemLine(anchorRole) : ""]
            .filter(Boolean)
            .join(" "),
```

`carriedSubjectNoun` 은 `@fixup/shared` 에서 이미 쓰는 이름이다 — `pdp.service.ts` 의 import 줄에 없으면 더한다.

- [ ] **Step 4: 통과하는지 본다**

Run: `pnpm --filter @fixup/pdp-core exec vitest run src/pdp.product-fidelity-wiring.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 뮤테이션 확인** — `fidelityHead,` 줄을 지우고 Step 4 를 다시 돌려 FAIL(1·2번 시험)을 본다. `fidelityTail,` 줄도 같은 식. 되돌리고 PASS 를 다시 본다.

- [ ] **Step 6: pdp-core 전체 시험** — 기존 프롬프트 시험이 문장 순서·개수를 재고 있으면 여기서 깨진다.

Run: `pnpm --filter @fixup/pdp-core test`
Expected: PASS. 깨진 시험이 있으면 **그 시험이 제품 블록이 새로 들어간 것 때문에 깨졌을 때만** 기대값을 고친다(예: 「프롬프트의 첫 단락은 사용자 지시」). 규칙을 지키는 단정(인물 보존·각도 자유·레퍼런스 서열)은 약하게 만들지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add packages/pdp-core/src
git commit -m "feat(pdp): 제품 보존을 프롬프트 앞·뒤와 시스템 문장에

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: 읽어 둔 제품 사실을 페이지 값으로 실어 보낸다

**Files:**
- Modify: `packages/pdp-core/src/pdp.image-options.ts` (`PageImageInputs`·`PageImageWire`·`pageInputsFromWire`·`buildSectionImageOptions`)
- Modify: `packages/pdp-core/src/pdp.image-options.test.ts`
- Modify: `apps/web/lib/pdp/request.ts` (`page.productFacts` zod)
- Modify: `apps/web/app/create/page-wire.ts` (`PageWireInputs.productReading`, `buildPageWire`)
- Modify: `apps/web/app/create/PdpEditor.tsx` (`pageWire()` 에 한 줄)
- Test: `apps/web/app/create/__tests__/page-wire-product-facts.test.ts` (새)
- Test: `apps/web/lib/pdp/__tests__/request-product-facts.test.ts` (새)

**Interfaces:**
- Consumes: `ProductFacts`, `productFactsFrom`, `PRODUCT_FACT_LIMITS` (Task 1), `ImageGenOptions.productFacts` (Task 2)
- Produces: `PageImageWire.productFacts?: ProductFacts`, `PageWireInputs.productReading?: ProductReading | null`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`pdp.image-options.test.ts` 에 더한다:

```ts
describe("제품 사실", () => {
  it("페이지 값이 섹션 옵션까지 그대로 간다", () => {
    const facts = { category: "병", visibleFacts: ["초록 유리"], labelText: ["500ml"] };
    const options = buildSectionImageOptions(pageInputsFromWire({ productFacts: facts }), {
      section: { section_id: "s1" } as never,
      index: 0,
    });
    expect(options.productFacts).toEqual(facts);
  });
});
```

`apps/web/app/create/__tests__/page-wire-product-facts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPageWire } from "../page-wire";

const base = { imageModel: "gpt-image-2.5-flare" as const, userInstruction: "" };
const reading = { category: "병", visibleFacts: ["초록 유리"], labelText: ["500ml"], distinctiveTraits: ["x"], unknowns: ["y"] };

describe("페이지 값의 제품 사실", () => {
  it("실물 사진 경로면 제품 자체의 사실만 싣는다", () => {
    expect(buildPageWire({ ...base, anchorKind: "product-photo", productReading: reading }).productFacts)
      .toEqual({ category: "병", visibleFacts: ["초록 유리"], labelText: ["500ml"] });
  });

  it("글 경로(대표 이미지)에는 싣지 않는다", () => {
    expect(buildPageWire({ ...base, anchorKind: "key-visual", productReading: reading }).productFacts).toBeUndefined();
  });

  it("판독이 없으면 없다", () => {
    expect(buildPageWire({ ...base, anchorKind: "product-photo" }).productFacts).toBeUndefined();
  });
});
```

`apps/web/lib/pdp/__tests__/request-product-facts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
}));

const { readPdpRequest } = await import("../request");

const 요청 = (page: unknown) =>
  new Request("http://localhost/api/pdp/images", {
    method: "POST",
    body: JSON.stringify({ originalImageBase64: "AAAA", aspectRatio: "3:4", section: { section_id: "s1" }, page }),
  });

describe("page.productFacts 경계", () => {
  it("상한 안이면 받는다", async () => {
    const read = await readPdpRequest(요청({ productFacts: { visibleFacts: ["a"], labelText: ["b"] } }), "single");
    expect(read.ok).toBe(true);
  });

  it("라벨 13줄이면 거절한다", async () => {
    const read = await readPdpRequest(요청({ productFacts: { visibleFacts: [], labelText: Array(13).fill("x") } }), "single");
    expect(read.ok).toBe(false);
  });

  it("한 줄이 201자면 거절한다", async () => {
    const read = await readPdpRequest(요청({ productFacts: { visibleFacts: ["가".repeat(201)], labelText: [] } }), "single");
    expect(read.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/pdp-core exec vitest run src/pdp.image-options.test.ts` → FAIL(`productFacts` undefined)
Run: `pnpm --filter @fixup/web exec vitest run app/create/__tests__/page-wire-product-facts.test.ts lib/pdp/__tests__/request-product-facts.test.ts` → FAIL(첫 파일: undefined, 둘째: 13줄·201자가 통과 — `page` 가 passthrough 라서)

- [ ] **Step 3: 구현한다**

`pdp.image-options.ts`:

```ts
// PageImageInputs 와 PageImageWire 둘 다에:
  /** 사진에서 읽은 제품 사실(설계 2026-10-08 §7). 실물 사진 경로에만 있다. */
  productFacts?: ProductFacts;

// pageInputsFromWire 의 반환 객체에:
    productFacts: wire.productFacts,

// buildSectionImageOptions 의 반환 객체에(styleReferenceImages 아래):
    productFacts: page.productFacts,
```

(`import type { ProductFacts } from "./pdp.product-fidelity";`)

`apps/web/lib/pdp/request.ts` — import 에 `PRODUCT_FACT_LIMITS` 를 더하고 `page` 객체에:

```ts
  /*
    **사진에서 읽은 제품 사실**(설계 2026-10-08 §7). 프롬프트에 그대로 실리므로 길이를
    묶는다. 수는 코어에 한 벌이다 — 화면(`productFactsFrom`)이 같은 수로 자른다.
  */
  productFacts: z.object({
    category: text.max(PRODUCT_FACT_LIMITS.chars).optional(),
    visibleFacts: z.array(text.max(PRODUCT_FACT_LIMITS.chars)).max(PRODUCT_FACT_LIMITS.facts),
    labelText: z.array(text.max(PRODUCT_FACT_LIMITS.chars)).max(PRODUCT_FACT_LIMITS.labels),
  }).strict().optional(),
```

`apps/web/app/create/page-wire.ts` — `PageWireInputs` 에:

```ts
  /** 구성안의 제품 판독. 실물 사진 경로에서만 쓴다(설계 2026-10-08 §7). */
  productReading?: Pick<ProductReading, "category" | "visibleFacts" | "labelText"> | null;
```

`buildPageWire` 반환 객체에:

```ts
    // 대표 이미지(글 경로)는 우리가 만든 그림이라 「제품 사실」이 없다.
    productFacts: input.anchorKind === "key-visual" ? undefined : productFactsFrom(input.productReading),
```

(import: `import { conceptOnlyNotice, productFactsFrom } from "@fixup/pdp-core";`, `import type { ProductReading } from "@fixup/pdp-core";` — `ProductReading` 이 index 에서 안 나가면 `index.ts` 에 type export 를 더한다.)

`PdpEditor.tsx` 의 `pageWire()` 안 `personSource,` 아래에:

```ts
      // 사진에서 읽은 제품 사실. 그림 프롬프트의 제품 블록에 실린다(설계 2026-10-08 §7).
      productReading: initialResult.blueprint.productReading,
```

- [ ] **Step 4: 통과하는지 본다** — Step 2 의 두 명령이 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/pdp-core/src apps/web/lib/pdp apps/web/app/create
git commit -m "feat(pdp): 사진에서 읽은 제품 사실을 그림 프롬프트로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: 1단계 마무리 — 전체 검사·독립 리뷰·비교

- [ ] **Step 1: CI 전체를 로컬에서**

```bash
cd /c/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/pdp-product-fidelity
pnpm -r typecheck && pnpm -r test && pnpm check:cost-forecast
```

Expected: 에러 0, 실패 0. 출력 끝줄을 그대로 보고에 붙인다.

- [ ] **Step 2: 독립 리뷰** — `code-reviewer` 에이전트에 `git diff origin/master...HEAD` 와 설계 §6·§7 을 주고 리뷰받는다. CRITICAL·HIGH 는 고치고 다시 Step 1.

- [ ] **Step 3: 고치기 전·후 비교** — 장수·대략 값을 사용자에게 묻고 승인 뒤에만. 설계 §9.3 의 조합 중 1단계 해당분(제품 사진 2장 × 섹션 3종 × 모델 2개 × 캐릭터 없음·있음, 전/후). 결과를 나란히 보여 주고 **각도가 사진 쪽으로 굳었는지**를 사용자와 함께 본다. 굳었으면 Task 1 문구를 고치고 Task 1~4 를 다시.

- [ ] **Step 4: 사용자에게 1단계 배포 여부를 묻는다.** 배포는 `docs/DEPLOY.md` 「매 배포」 + 개발 일지까지.

---

## 2단계 — 원본을 주소로

### Task 5: 코어가 주소 참조를 받는다

**Files:**
- Modify: `packages/pdp-core/src/types.ts` (`ReferenceImage.url?`, `PdpGenerateImageRequest`)
- Modify: `packages/pdp-core/src/pdp.image-provider.ts:169-171` (`toDataUri`)
- Modify: `packages/pdp-core/src/pdp.service.ts` (`generateSectionImage`·`generateSectionImageInternal` 의 요청 모양, 앵커 담기)
- Test: `packages/pdp-core/src/pdp.image-provider.test.ts`, `packages/pdp-core/src/pdp.product-fidelity-wiring.test.ts`

**Interfaces:**
- Produces: `ReferenceImage.url?: string`; `PdpGenerateImageRequest = { originalImageBase64?: string; productImageUrl?: string; section; aspectRatio; desiredTone?; options? }`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`pdp.image-provider.test.ts` 에:

```ts
describe("주소 참조", () => {
  const 주소앵커: ReferenceImage = { kind: "anchor", base64: "", mimeType: "image/jpeg", url: "https://v3.fal.media/files/a/b.jpg" };

  it.each(["gpt-image-2.5-flare", "nano-banana-pro"] as const)("%s: 주소는 그대로, base64 는 data: 로", (model) => {
    const payload = buildFalPayload(model, { ...base, references: [주소앵커, style] });
    expect(payload.image_urls).toEqual(["https://v3.fal.media/files/a/b.jpg", "data:image/png;base64,BBBB"]);
  });
});
```

`pdp.product-fidelity-wiring.test.ts` 에(같은 `sent` 를 쓰되 `originalImageBase64` 대신 주소):

```ts
it("제품 주소가 오면 첫 참조가 그 주소다", async () => {
  const refs: Array<{ url?: string; base64: string }> = [];
  await (new PdpService() as never as { generateSectionImageInternal(input: unknown): Promise<unknown> })
    .generateSectionImageInternal({
      productImageUrl: "https://v3.fal.media/files/a/b.jpg",
      section: section(),
      aspectRatio: "3:4",
      options: { style: "studio", withModel: false, outputMode: "editable" },
      client: { llm: { generate: async () => ({ text: "{}" }) }, models: { generateContent: async () => ({ text: "{}" }) } },
      generateImage: async (_m: unknown, input: { references: Array<{ url?: string; base64: string }> }) => {
        refs.push(...input.references);
        return { base64: "IMG", mimeType: "image/jpeg" };
      },
    });
  expect(refs[0]).toMatchObject({ url: "https://v3.fal.media/files/a/b.jpg" });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/pdp-core exec vitest run src/pdp.image-provider.test.ts src/pdp.product-fidelity-wiring.test.ts`
Expected: FAIL — 첫째는 `data:image/jpeg;base64,` 가 나옴, 둘째는 `sanitizeBase64Payload` 가 빈 값으로 던지거나 url 이 없음.

- [ ] **Step 3: 구현한다**

`types.ts` — `ReferenceImage` 에:

```ts
  /**
   * **이미 올려 둔 주소**(설계 2026-10-08 §4). 있으면 `base64` 대신 이것을 fal 에 넘긴다.
   * 원본 사진을 요청마다 몸통에 싣지 않으려는 것이다 — 서버가 큰 그림을 30~90초 쥐고 있게 된다.
   */
  url?: string;
```

`PdpGenerateImageRequest`:

```ts
export interface PdpGenerateImageRequest {
  /** 옛 길·글 경로. `productImageUrl` 이 있으면 안 쓴다. */
  originalImageBase64?: string;
  /** 제품 원본을 올려 둔 fal 주소(설계 2026-10-08 §4). */
  productImageUrl?: string;
  section: SectionBlueprint;
  aspectRatio: AspectRatio;
  desiredTone?: string;
  options?: ImageGenOptionsInput;
}
```

`pdp.image-provider.ts`:

```ts
/** 올려 둔 주소가 있으면 그대로, 없으면 `data:` 로 싣는다. */
function toDataUri(reference: ReferenceImage) {
  return reference.url || `data:${reference.mimeType};base64,${reference.base64}`;
}
```

`pdp.service.ts` — `generateSectionImage(request: {…})` 와 `generateSectionImageInternal(request: {…})` 의 요청 모양에서 `originalImageBase64: string;` 을 다음으로 바꾼다:

```ts
    originalImageBase64?: string;
    productImageUrl?: string;
```

`generateSectionImageInternal` 첫 부분:

```ts
    // 주소가 오면 몸통의 그림은 없다. 빈 값을 다듬으면 「그림이 깨졌다」로 던진다.
    const originalImageBase64 = request.productImageUrl ? "" : sanitizeBase64Payload(request.originalImageBase64 ?? "");
```

앵커 담기:

```ts
        references.push({
          kind: "anchor",
          base64: originalImageBase64,
          mimeType: DEFAULT_IMAGE_MIME,
          ...(request.productImageUrl ? { url: request.productImageUrl } : {}),
          intent: options.attachmentIntents?.anchor,
        });
```

`grep -n "originalImageBase64" packages/pdp-core/src/pdp.service.ts` 로 다른 쓰임을 확인한다. 앵커 말고 쓰는 곳이 있으면 그 자리도 주소일 때의 동작을 정하고 시험을 더한다.

- [ ] **Step 4: 통과하는지 본다** — Step 2 명령 PASS, 이어서 `pnpm --filter @fixup/pdp-core test` PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/pdp-core/src
git commit -m "feat(pdp): 코어가 제품 사진 주소를 참조로 받는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: 주소 검사·원본 손질

**Files:**
- Create: `apps/web/lib/pdp/fal-storage-url.ts` (순수 — 화면도 들일 수 있다)
- Create: `apps/web/lib/pdp/product-photo.ts` (`server-only`, sharp)
- Test: `apps/web/lib/pdp/__tests__/product-photo.test.ts`

**Interfaces:**
- Consumes: `inspectUploadedImage` (`lib/pdp/image-gate.ts`), Task 0 의 호스트·`FIT_TO_MODEL_EDGE` 값
- Produces:
  - `FAL_STORAGE_HOSTS: readonly string[]`, `isFalStorageUrl(value: string): boolean`
  - `PRODUCT_PHOTO_MAX_BYTES = 20 * 1024 * 1024`, `PRODUCT_PHOTO_MAX_EDGE = 3840`, `FIT_TO_MODEL_EDGE: boolean`
  - `prepareProductPhoto(bytes: Buffer, fitToModelEdge?: boolean): Promise<PreparedProductPhoto>`
  - `type PreparedProductPhoto = { ok: true; bytes: Buffer; mimeType: string; width: number; height: number } | { ok: false; status: 400 | 413; message: string }`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

const { isFalStorageUrl } = await import("../fal-storage-url");
const { prepareProductPhoto, PRODUCT_PHOTO_MAX_EDGE } = await import("../product-photo");

const jpeg = (width: number, height: number, orientation?: number) => {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 80 } } }).jpeg({ quality: 90 });
  return (orientation ? image.withMetadata({ orientation }) : image).toBuffer();
};

describe("fal 저장소 주소만 받는다", () => {
  it.each([
    ["https://v3.fal.media/files/a/b.jpg", true],
    ["https://fal.media/files/a.jpg", true],
    ["http://v3.fal.media/files/a.jpg", false],
    ["https://fal.media.evil.com/a.jpg", false],
    ["https://evilfal.media/a.jpg", false],
    ["https://user:pw@v3.fal.media/a.jpg", false],
    ["https://v3.fal.media:8443/a.jpg", false],
    ["data:image/png;base64,AAAA", false],
    ["not a url", false],
  ])("%s → %s", (value, expected) => {
    expect(isFalStorageUrl(value)).toBe(expected);
  });
});

describe("원본 손질", () => {
  it("상한 아래 원본은 바이트를 그대로 둔다", async () => {
    const bytes = await jpeg(2000, 1500);
    const prepared = await prepareProductPhoto(bytes, true);
    expect(prepared.ok && prepared.bytes.equals(bytes)).toBe(true);
  });

  it("긴 변이 3840 을 넘으면 맞출 때만 3840 으로", async () => {
    const bytes = await jpeg(4032, 3024);
    const fitted = await prepareProductPhoto(bytes, true);
    expect(fitted.ok && Math.max(fitted.width, fitted.height)).toBe(PRODUCT_PHOTO_MAX_EDGE);
    const kept = await prepareProductPhoto(bytes, false);
    expect(kept.ok && kept.bytes.equals(bytes)).toBe(true);
  });

  it("회전 정보가 있으면 바로 세워 굽는다 — 모델이 누운 사진으로 읽지 않게", async () => {
    const bytes = await jpeg(300, 200, 6);
    const prepared = await prepareProductPhoto(bytes, false);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect([prepared.width, prepared.height]).toEqual([200, 300]);
    expect((await sharp(prepared.bytes).metadata()).orientation ?? 1).toBe(1);
  });

  it("그림이 아니면 400", async () => {
    const prepared = await prepareProductPhoto(Buffer.from("hello"), true);
    expect(prepared).toMatchObject({ ok: false, status: 400 });
  });

  it("20MB 를 넘으면 413", async () => {
    const prepared = await prepareProductPhoto(Buffer.alloc(20 * 1024 * 1024 + 1), true);
    expect(prepared).toMatchObject({ ok: false, status: 413 });
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run lib/pdp/__tests__/product-photo.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현한다**

`apps/web/lib/pdp/fal-storage-url.ts`:

```ts
/**
 * **우리가 fal 저장소에 올린 주소만 그림 모델에 넘긴다**(설계 2026-10-08 §4.5).
 *
 * 서버는 이 주소를 내려받지 않는다 — fal 만 가져간다. 그래도 아무 주소나 받으면
 * 남의 그림이나 엉뚱한 곳을 모델 입력으로 끼울 수 있다. 호스트는 0단계 실측으로
 * 정했다(설계 §9.1 「0단계 결과」).
 */
export const FAL_STORAGE_HOSTS: readonly string[] = ["fal.media"];

export function isFalStorageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return FAL_STORAGE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}
```

`apps/web/lib/pdp/product-photo.ts`:

```ts
import "server-only";
import sharp from "sharp";
import { inspectUploadedImage } from "./image-gate";

/**
 * **제품 원본을 그대로 넘기되, 모델이 못 쓰는 것만 손본다**(설계 2026-10-08 §4.3).
 *
 * 전에는 화면이 1024px·JPEG 84% 로 줄였다. 라벨 글자가 흐려져 모델이 짐작해 채웠다.
 * 이제 원본이다. 손보는 것은 둘뿐이다.
 *
 * 1. **회전 정보** — 휴대폰 사진은 픽셀을 누인 채 「세워 보라」는 표만 단다. 1024 사본은
 *    캔버스가 세워 줬는데 원본을 그대로 보내면 모델이 누운 사진으로 읽는다.
 * 2. **모델이 받는 최대(긴 변 3840px)를 넘는 것** — 0단계 실측으로 정한 `FIT_TO_MODEL_EDGE`
 *    가 켜졌을 때만.
 */
export const PRODUCT_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const PRODUCT_PHOTO_MAX_EDGE = 3840;
/** 설계 §9.1 「0단계 결과」로 정한다. */
export const FIT_TO_MODEL_EDGE = true;

export type PreparedProductPhoto =
  | { ok: true; bytes: Buffer; mimeType: string; width: number; height: number }
  | { ok: false; status: 400 | 413; message: string };

const FORMAT: Record<string, "jpeg" | "png" | "webp"> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function prepareProductPhoto(
  bytes: Buffer,
  fitToModelEdge = FIT_TO_MODEL_EDGE,
): Promise<PreparedProductPhoto> {
  if (bytes.length === 0) return { ok: false, status: 400, message: "이미지가 없습니다." };
  if (bytes.length > PRODUCT_PHOTO_MAX_BYTES) {
    return { ok: false, status: 413, message: "이미지 용량이 너무 큽니다. 20MB 이하로 올려 주세요." };
  }
  const inspected = await inspectUploadedImage(bytes);
  if (!inspected.ok) {
    return { ok: false, status: inspected.reason === "too_many_pixels" ? 413 : 400, message: inspected.message };
  }

  const orientation = (await sharp(bytes, { limitInputPixels: false }).metadata()).orientation ?? 1;
  const tooLarge = fitToModelEdge && Math.max(inspected.width, inspected.height) > PRODUCT_PHOTO_MAX_EDGE;
  if (orientation === 1 && !tooLarge) {
    return { ok: true, bytes, mimeType: inspected.mimeType, width: inspected.width, height: inspected.height };
  }

  const format = FORMAT[inspected.mimeType] ?? "jpeg";
  let pipeline = sharp(bytes, { limitInputPixels: false }).rotate();
  if (tooLarge) {
    pipeline = pipeline.resize({ width: PRODUCT_PHOTO_MAX_EDGE, height: PRODUCT_PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true });
  }
  const { data, info } = await pipeline
    .toFormat(format, format === "png" ? {} : { quality: 95 })
    .toBuffer({ resolveWithObject: true });
  return { ok: true, bytes: data, mimeType: inspected.mimeType, width: info.width, height: info.height };
}
```

Task 0 결과로 `FAL_STORAGE_HOSTS`·`FIT_TO_MODEL_EDGE` 값을 맞추고, 호스트가 바뀌면 Step 1 의 표도 같이 고친다.

- [ ] **Step 4: 통과하는지 본다** — Step 2 명령 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/pdp/fal-storage-url.ts apps/web/lib/pdp/product-photo.ts apps/web/lib/pdp/__tests__/product-photo.test.ts
git commit -m "feat(pdp): 제품 원본 검사 — 회전 바로잡기, 모델 상한 맞추기, fal 주소 확인

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: `POST /api/pdp/product-photo`

**Files:**
- Create: `apps/web/app/api/pdp/product-photo/route.ts`
- Test: `apps/web/app/api/pdp/__tests__/product-photo-route.test.ts`

**Interfaces:**
- Consumes: `prepareProductPhoto`, `PRODUCT_PHOTO_MAX_BYTES`, `isFalStorageUrl` (Task 6), `createFalUploader` (`lib/fal/upload.ts`), `authenticateApiMember`·`reserveAiUsage`·`settleAiUsage` (`lib/membership/api`), `freeCreditPlan` (`lib/membership/credit-ledger`), `readBoundedBody`·`BodyLimitError` (`lib/pdp/request`)
- Produces: `POST` → `200 { ok: true, url: string, expiresAt: number }` | `4xx/5xx { ok: false, message: string }`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

let member: { ok: boolean; member?: { userId: string }; response?: Response } = { ok: true, member: { userId: "u1" } };
const settled: boolean[] = [];
const uploaded: Array<{ bytes: number; contentType: string }> = [];
let uploadUrl = "https://v3.fal.media/files/a/b.jpg";
let uploadFails = false;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => member,
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1", usage: {} }),
  settleAiUsage: async (_r: unknown, success: boolean) => { settled.push(success); return {}; },
}));
vi.mock("../../../../lib/fal/upload", () => ({
  createFalUploader: () => ({
    uploadReference: async (bytes: Uint8Array, contentType: string) => {
      if (uploadFails) throw new Error("fal 500 internal detail");
      uploaded.push({ bytes: bytes.byteLength, contentType });
      return uploadUrl;
    },
  }),
}));

const { POST } = await import("../product-photo/route");

const 올린다 = (body: BodyInit) =>
  new Request("http://localhost/api/pdp/product-photo", { method: "POST", headers: { "content-type": "image/jpeg" }, body });
const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#2d6a4f" } }).jpeg().toBuffer();

beforeEach(() => {
  member = { ok: true, member: { userId: "u1" } };
  settled.length = 0;
  uploaded.length = 0;
  uploadUrl = "https://v3.fal.media/files/a/b.jpg";
  uploadFails = false;
});

describe("제품 원본 올리기", () => {
  it("로그인 안 했으면 그 답을 그대로", async () => {
    member = { ok: false, response: new Response(null, { status: 401 }) };
    expect((await POST(올린다(await jpeg()))).status).toBe(401);
    expect(uploaded).toHaveLength(0);
  });

  it("그림이면 fal 에 한 번 올리고 주소와 만료 시각을 준다", async () => {
    const response = await POST(올린다(await jpeg()));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, url: "https://v3.fal.media/files/a/b.jpg" });
    expect(body.expiresAt).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
    expect(uploaded).toEqual([{ bytes: expect.any(Number), contentType: "image/jpeg" }]);
    expect(settled).toEqual([true]);
  });

  it("딱지만 그림인 글자는 400, 올리지 않는다", async () => {
    expect((await POST(올린다("hello"))).status).toBe(400);
    expect(uploaded).toHaveLength(0);
  });

  it("20MB 를 넘으면 413", async () => {
    expect((await POST(올린다(new Uint8Array(20 * 1024 * 1024 + 2048)))).status).toBe(413);
  });

  it("fal 이 실패하면 내부 문구 없이 502, 정산은 실패로", async () => {
    uploadFails = true;
    const response = await POST(올린다(await jpeg()));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("internal detail");
    expect(settled).toEqual([false]);
  });

  it("돌아온 주소가 fal 저장소가 아니면 쓰지 않는다", async () => {
    uploadUrl = "https://example.com/a.jpg";
    expect((await POST(올린다(await jpeg()))).status).toBe(502);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/api/pdp/__tests__/product-photo-route.test.ts`
Expected: FAIL — 라우트 없음.

- [ ] **Step 3: 구현한다**

```ts
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { createFalUploader } from "../../../../lib/fal/upload";
import { errorLogText } from "../../../../lib/easy/log-text";
import { BodyLimitError, readBoundedBody } from "../../../../lib/pdp/request";
import { isFalStorageUrl } from "../../../../lib/pdp/fal-storage-url";
import { PRODUCT_PHOTO_MAX_BYTES, prepareProductPhoto } from "../../../../lib/pdp/product-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * **제품 원본을 한 번만 올린다**(설계 2026-10-08 §4).
 *
 * 섹션 요청마다 원본을 몸통에 실으면 서버가 큰 그림을 그림이 끝날 때까지 쥐고 있다.
 * 여기서 한 번 fal 저장소에 올리고 주소만 돌려준다 — 포스터·카드뉴스·리디자인이
 * 이미 쓰는 길(`lib/fal/upload.ts`, 1시간 뒤 지워짐)이다.
 *
 * 시간당 횟수는 레퍼런스 올리기와 **같은 칸**(`reference_analyze`)을 쓴다. 새 칸은
 * DB 마이그레이션이 필요하다(설계 §4.4).
 */
const FAL_URL_LIFETIME_MS = 60 * 60 * 1000;
const UPLOAD_FAILED = "제품 사진을 올리지 못했습니다. 다시 시도해 주세요.";

function fail(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  let bytes: Buffer;
  try {
    bytes = await readBoundedBody(req, PRODUCT_PHOTO_MAX_BYTES + 1024);
  } catch (error) {
    return error instanceof BodyLimitError
      ? fail(413, "이미지 용량이 너무 큽니다. 20MB 이하로 올려 주세요.")
      : fail(400, "이미지를 읽지 못했습니다.");
  }

  // 문지기를 지난 뒤에 예약한다 — 깨진 입력으로 시간당 칸을 태우지 않게(style-references 와 같은 판단).
  const prepared = await prepareProductPhoto(bytes);
  if (!prepared.ok) return fail(prepared.status, prepared.message);

  const reservation = await reserveAiUsage(req, "reference_analyze", 0, freeCreditPlan("pdp:product-photo"), auth.member);
  if (!reservation.ok) return reservation.response;

  try {
    const url = await createFalUploader().uploadReference(prepared.bytes, prepared.mimeType);
    if (!isFalStorageUrl(url)) throw new Error(`unexpected upload host: ${new URL(url).hostname}`);
    await settleAiUsage(reservation, true, 0, undefined, { model: "", billableImages: 0 });
    return Response.json({ ok: true, url, expiresAt: Date.now() + FAL_URL_LIFETIME_MS });
  } catch (error) {
    await settleAiUsage(reservation, false, 0, "upload_failed", { model: "", billableImages: 0 });
    console.error("[pdp-product-photo] 업로드 실패", errorLogText(error));
    return fail(502, UPLOAD_FAILED);
  }
}
```

`reserveAiUsage` 의 다섯째 인자(`auth.member`)는 `images/route.ts` 가 `parsed.member` 를 넘기는 것과 같다. 시그니처가 다르면 그 파일을 따라 맞춘다.

- [ ] **Step 4: 통과하는지 본다** — Step 2 명령 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/api/pdp/product-photo apps/web/app/api/pdp/__tests__/product-photo-route.test.ts
git commit -m "feat(pdp): 제품 원본을 fal 에 한 번 올리는 라우트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: 생성 요청이 주소를 받아 코어로 넘긴다

**Files:**
- Modify: `apps/web/lib/pdp/request.ts` (`single`·`batch` 스키마)
- Modify: `apps/web/app/api/pdp/images/route.ts`, `apps/web/app/api/pdp/images/batch/route.ts`
- Test: `apps/web/app/api/pdp/__tests__/pdp-image-routes.test.ts` (기존 파일에 더한다)

**Interfaces:**
- Consumes: `isFalStorageUrl` (Task 6), `PdpGenerateImageRequest.productImageUrl` (Task 5)
- Produces: 요청 몸통 `productImageUrl?: string` (Task 10 이 보낸다)

- [ ] **Step 1: 실패하는 시험을 쓴다** — `pdp-image-routes.test.ts` 끝에:

```ts
describe("제품 사진 주소", () => {
  const 주소 = "https://v3.fal.media/files/a/b.jpg";

  it("단건: 주소만 와도 만들고, 코어에는 주소가 간다", async () => {
    const response = await single(post({ productImageUrl: 주소, section: section("s1"), aspectRatio: "3:4" }));
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ productImageUrl: 주소 });
    expect((calls[0] as { originalImageBase64?: string }).originalImageBase64).toBeUndefined();
  });

  it("일괄: 섹션마다 같은 주소", async () => {
    await batch(post({ productImageUrl: 주소, sections: [section("s1"), section("s2")], aspectRatio: "3:4" }));
    expect(calls.map((call) => (call as { productImageUrl?: string }).productImageUrl)).toEqual([주소, 주소]);
  });

  it("fal 저장소가 아닌 주소는 400 — 예약도 안 한다", async () => {
    const response = await single(post({ productImageUrl: "https://example.com/a.jpg", section: section("s1"), aspectRatio: "3:4" }));
    expect(response.status).toBe(400);
    expect(reserved).toHaveLength(0);
  });

  it("주소도 그림도 없으면 400", async () => {
    expect((await single(post({ section: section("s1"), aspectRatio: "3:4" }))).status).toBe(400);
  });

  it("옛 화면이 그림만 보내도 지금처럼 된다", async () => {
    const response = await single(post({ originalImageBase64: "AAAA", section: section("s1"), aspectRatio: "3:4" }));
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ originalImageBase64: "AAAA" });
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/api/pdp/__tests__/pdp-image-routes.test.ts`
Expected: FAIL — 주소만 보낸 요청이 400(`originalImageBase64` 필수).

- [ ] **Step 3: 구현한다**

`request.ts`:

```ts
import { isFalStorageUrl } from "./fal-storage-url";

/*
  **제품 원본은 주소로 온다**(설계 2026-10-08 §4.5). 우리가 fal 에 올린 주소만 받는다.
  옛 화면·글 경로는 여전히 그림을 몸통에 싣는다 — 둘 중 하나는 있어야 한다.
*/
const productImageUrl = text.refine(isFalStorageUrl, "제품 사진 주소가 올바르지 않습니다.");
const hasProductImage = (body: { productImageUrl?: string; originalImageBase64?: string }) =>
  Boolean(body.productImageUrl || body.originalImageBase64);
```

`schemas` 의 두 줄:

```ts
  single: z.object({ ...common, originalImageBase64: text.trim().min(1).optional(), productImageUrl: productImageUrl.optional(), section })
    .passthrough()
    .refine(hasProductImage, "제품 사진이 없습니다."),
  batch: z.object({ ...common, originalImageBase64: text.trim().min(1).optional(), productImageUrl: productImageUrl.optional(), sections: z.array(section).min(1) })
    .passthrough()
    .refine(hasProductImage, "제품 사진이 없습니다.")
    .refine((body) => body.sections.length <= maxBatchSizeFor(body.page?.imageModel ?? DEFAULT_IMAGE_MODEL), "한 번에 생성할 수 있는 장수를 초과했습니다."),
```

`images/batch/route.ts` — `BatchRequest`:

```ts
  originalImageBase64?: string;
  /** 제품 원본을 올려 둔 fal 주소. 있으면 이것을 쓴다(설계 2026-10-08 §4). */
  productImageUrl?: string;
```

`requests` 의 반환 객체:

```ts
      return {
          // 주소가 오면 몸통의 그림은 넘기지 않는다 — 코어가 주소를 참조로 쓴다.
          ...(body.productImageUrl
            ? { productImageUrl: body.productImageUrl }
            : { originalImageBase64: body.originalImageBase64 }),
          section,
          aspectRatio: body.aspectRatio,
          desiredTone: body.desiredTone,
          options,
        };
```

`images/route.ts` — 요청 타입의 `originalImageBase64: string;` 을 `originalImageBase64?: string; productImageUrl?: string;` 로, `generateSectionImage({ originalImageBase64: body.originalImageBase64, …` 를:

```ts
      {
        ...(body.productImageUrl
          ? { productImageUrl: body.productImageUrl }
          : { originalImageBase64: body.originalImageBase64 }),
        section: body.section,
```

- [ ] **Step 4: 통과하는지 본다** — Step 2 명령 PASS, 이어서 `pnpm --filter @fixup/web exec vitest run app/api/pdp` PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/pdp/request.ts apps/web/app/api/pdp
git commit -m "feat(pdp): 섹션 생성이 제품 사진 주소를 받는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: 화면이 원본을 쥐고 임시저장에 남긴다

**Files:**
- Modify: `apps/web/app/create/pdp-utils.ts` (`prepareImageFile`)
- Modify: `apps/web/app/create/pdp-drafts.ts` (`PreparedImageDraft.original?`)
- Modify: `apps/web/app/create/document-state.ts` (`createPdpDocument`·`documentToDraft`)
- Test: `apps/web/app/create/__tests__/product-original-draft.test.ts` (새)

**Interfaces:**
- Produces: `PreparedImageDraft.original?: { base64: string; mimeType: string }`; `prepareImageFile(file)` 의 반환에 `original`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { createPdpDocument, documentToDraft } from "../document-state";
import type { PdpDraftInput } from "../pdp-drafts";

/** 원본은 1024 사본과 **따로** 남는다(설계 2026-10-08 §4.6). 다시 열어도 원본으로 만든다. */
const draft = (original?: { base64: string; mimeType: string }) =>
  ({
    preparedImage: { base64: "SMALL", mimeType: "image/jpeg", previewUrl: "data:image/jpeg;base64,SMALL", fileName: "p.jpg", ...(original ? { original } : {}) },
    modelImage: null, modelImageUsage: null, result: null, additionalInfo: "", desiredTone: "", aspectRatio: "3:4",
    appState: "upload", notice: "",
  }) as unknown as PdpDraftInput;

describe("제품 원본 임시저장", () => {
  it("원본이 있으면 저장했다 다시 열어도 원본이 그대로", () => {
    const reopened = documentToDraft(createPdpDocument(draft({ base64: "ORIGINAL", mimeType: "image/png" })));
    expect(reopened.preparedImage?.base64).toBe("SMALL");
    expect(reopened.preparedImage?.original).toEqual({ base64: "ORIGINAL", mimeType: "image/png" });
  });

  it("원본이 없는 옛 작업은 원본 없이 열린다", () => {
    const reopened = documentToDraft(createPdpDocument(draft()));
    expect(reopened.preparedImage?.original).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/create/__tests__/product-original-draft.test.ts`
Expected: FAIL — 첫 시험에서 `original` 이 undefined.

- [ ] **Step 3: 구현한다**

`pdp-drafts.ts`:

```ts
export interface PreparedImageDraft {
  base64: string;
  mimeType: string;
  previewUrl: string;
  fileName: string;
  /**
   * **사용자가 올린 원본**(설계 2026-10-08 §4.6). 그림 모델에는 이것을 올린 주소가 간다.
   * 위의 `base64` 는 미리보기·분석용 1024px 사본이다. 옛 초안에는 없다.
   */
  original?: { base64: string; mimeType: string };
}
```

`document-state.ts` — `PdpDocumentV3.references` 의 원소 타입에 `originalAssetId?: string` 을 더하고:

```ts
  if (input.preparedImage) {
    const { original } = input.preparedImage;
    references.push({
      role: "product",
      assetId: addAsset(input.preparedImage),
      // 원본은 따로 둔다. 1024 사본(미리보기·분석)과 원본(그림 모델)은 쓰임이 다르다.
      ...(original ? { originalAssetId: addAsset({ base64: original.base64, mimeType: original.mimeType }) } : {}),
      enabled: true,
      instruction: input.attachmentIntents?.anchor,
    });
  }
```

`documentToDraft` 의 `prepared` 를:

```ts
  const prepared = (role: "product" | "person"): PreparedImageDraft | null => {
    const ref = find(role); const asset = ref && doc.assets[ref.assetId];
    const originalAsset = ref?.originalAssetId ? doc.assets[ref.originalAssetId] : undefined;
    return asset ? { base64: asset.base64, mimeType: asset.mimeType, fileName: asset.fileName ?? "image",
      previewUrl: asset.previewUrl ?? `data:${asset.mimeType};base64,${asset.base64}`,
      ...(originalAsset ? { original: { base64: originalAsset.base64, mimeType: originalAsset.mimeType } } : {}) } : null;
  };
```

`pdp-utils.ts` — `prepareImageFile`:

```ts
/** 그림 모델이 그대로 받는 형식. 다른 형식(HEIC 등)은 브라우저가 열 수 있으면 같은 크기의 JPEG 로 바꾼다. */
const ORIGINAL_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ORIGINAL_MAX_BYTES = 20 * 1024 * 1024;

function toFullSizeJpegBase64(sourceImage: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceImage.naturalWidth;
  canvas.height = sourceImage.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 캔버스를 초기화하지 못했습니다.");
  context.drawImage(sourceImage, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.95).split(",")[1] ?? "";
}

export async function prepareImageFile(file: File) {
  if (file.size > ORIGINAL_MAX_BYTES) throw new Error("이미지 용량이 너무 큽니다. 20MB 이하로 올려 주세요.");
  const sourceDataUrl = await readFileAsDataUrl(file);
  const sourceImage = await loadImage(sourceDataUrl);
  const previewUrl = toAnchorJpegDataUrl(sourceImage);
  const base64 = previewUrl.split(",")[1] ?? "";

  if (!base64) {
    throw new Error("이미지 변환 결과가 비어 있습니다.");
  }

  // **원본은 줄이지 않는다**(설계 2026-10-08 D1). 형식만 모델이 받는 것으로 맞춘다.
  const original = ORIGINAL_TYPES.includes(file.type)
    ? { base64: sourceDataUrl.split(",")[1] ?? "", mimeType: file.type }
    : { base64: toFullSizeJpegBase64(sourceImage), mimeType: "image/jpeg" };

  return {
    base64,
    mimeType: "image/jpeg" as const,
    previewUrl,
    fileName: file.name,
    original,
  };
}
```

`prepareImageFile` 은 인물 사진(`handleModelImage`, `PdpMakerClient.tsx`)도 쓴다. 인물 사진의 원본은 이번 범위가 아니므로 거기서 뺀다 — 안 빼면 로컬 초안(IndexedDB)에 쓰지 않는 원본이 쌓인다:

```ts
      const { original: _notUsedForPerson, ...nextImage } = await prepareImageFile(file);
      setModelImage(nextImage);
```

- [ ] **Step 4: 통과하는지 본다** — Step 2 명령 PASS, 이어서 `pnpm --filter @fixup/web exec vitest run app/create` PASS.

- [ ] **Step 5: 서버 문서 검사가 새 칸을 받는지 본다** — `apps/web/lib/pdp/documents/__tests__` 에서 문서 저장 시험 하나를 골라, `references[0].originalAssetId` 가 있는 문서가 `parseDocument`(또는 그 파일의 검사 함수)를 통과하는지 시험을 더한다. 거절하면 `model.ts` 의 references 스키마에 `originalAssetId: z.string().min(1).optional()` 과 「그 asset 이 있는가」 확인(190줄 `originalAssetId` 검사와 같은 모양)을 더한다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/app/create apps/web/lib/pdp/documents
git commit -m "feat(pdp): 제품 원본을 1024 사본과 따로 쥐고 임시저장에 남긴다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: 편집기가 원본을 올리고 주소로 만든다

**Files:**
- Create: `apps/web/app/create/product-photo-upload.ts`
- Test: `apps/web/app/create/__tests__/product-photo-upload.test.ts`
- Modify: `apps/web/app/create/PdpEditor.tsx` (props 한 칸, 두 요청 자리)
- Modify: `apps/web/app/create/PdpMakerClient.tsx` (`<PdpEditor … productPhoto={preparedImage?.original} />`)

**Interfaces:**
- Consumes: `POST /api/pdp/product-photo` (Task 7), `PreparedImageDraft.original` (Task 9)
- Produces:
  - `type ProductPhotoSource = { base64: string; mimeType: string }`
  - `createProductPhotoUploader(deps?: { post?: PostProductPhoto; now?: () => number }): { urlFor(source: ProductPhotoSource): Promise<string> }`
  - `class ProductPhotoUploadError extends Error`
  - `productImageFields(input: { startMode?: CreateMode; productPhoto?: ProductPhotoSource; fallbackBase64: string; uploader }): Promise<{ productImageUrl: string } | { originalImageBase64: string }>`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { createProductPhotoUploader, productImageFields, ProductPhotoUploadError } from "../product-photo-upload";

const 사진 = { base64: "QUJD", mimeType: "image/jpeg" };

function 가짜서버(now: { t: number }) {
  const 올린것: string[] = [];
  return {
    올린것,
    post: async (bytes: Uint8Array, mimeType: string) => {
      올린것.push(`${mimeType}:${bytes.byteLength}`);
      return { ok: true as const, url: `https://v3.fal.media/files/${올린것.length}.jpg`, expiresAt: now.t + 60 * 60 * 1000 };
    },
  };
}

describe("제품 원본 올리기", () => {
  it("같은 사진은 한 번만 올린다", async () => {
    const now = { t: 0 };
    const server = 가짜서버(now);
    const uploader = createProductPhotoUploader({ post: server.post, now: () => now.t });
    expect(await uploader.urlFor(사진)).toBe("https://v3.fal.media/files/1.jpg");
    expect(await uploader.urlFor(사진)).toBe("https://v3.fal.media/files/1.jpg");
    expect(server.올린것).toEqual(["image/jpeg:3"]);
  });

  it("남은 시간이 10분 아래면 다시 올린다 — fal 은 한 시간 뒤 지운다", async () => {
    const now = { t: 0 };
    const server = 가짜서버(now);
    const uploader = createProductPhotoUploader({ post: server.post, now: () => now.t });
    await uploader.urlFor(사진);
    now.t = 51 * 60 * 1000;
    expect(await uploader.urlFor(사진)).toBe("https://v3.fal.media/files/2.jpg");
  });

  it("서버가 거절하면 그 문구로 멈춘다", async () => {
    const uploader = createProductPhotoUploader({ post: async () => ({ ok: false as const, message: "이미지 용량이 너무 큽니다." }) });
    await expect(uploader.urlFor(사진)).rejects.toThrow(ProductPhotoUploadError);
  });
});

describe("요청에 싣는 제품 사진 칸", () => {
  const uploader = { urlFor: async () => "https://v3.fal.media/files/x.jpg" };

  it("사진 경로는 원본 주소", async () => {
    expect(await productImageFields({ startMode: "image", productPhoto: 사진, fallbackBase64: "SMALL", uploader }))
      .toEqual({ productImageUrl: "https://v3.fal.media/files/x.jpg" });
  });

  it("원본이 없는 옛 작업은 1024 사본을 올려 주소로", async () => {
    const seen: string[] = [];
    const recording = { urlFor: async (source: { base64: string }) => { seen.push(source.base64); return "https://v3.fal.media/files/y.jpg"; } };
    expect(await productImageFields({ startMode: "image", fallbackBase64: "SMALL", uploader: recording }))
      .toEqual({ productImageUrl: "https://v3.fal.media/files/y.jpg" });
    expect(seen).toEqual(["SMALL"]);
  });

  it("글 경로(대표 이미지)는 지금처럼 그림을 싣는다", async () => {
    expect(await productImageFields({ startMode: "text", productPhoto: 사진, fallbackBase64: "KEYVISUAL", uploader }))
      .toEqual({ originalImageBase64: "KEYVISUAL" });
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/create/__tests__/product-photo-upload.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현한다** — `apps/web/app/create/product-photo-upload.ts`:

```ts
import { API_BASE_URL } from "./pdp-utils";
import { randomId } from "../../lib/browser-safe";
import type { CreateMode } from "./create-steps";

/**
 * **제품 원본은 한 번 올리고 주소로 쓴다**(설계 2026-10-08 §4).
 *
 * 섹션마다 원본을 몸통에 실으면 서버가 큰 그림을 30~90초씩 쥐고 있다. 사진 한 장을
 * 한 번 올리고, fal 이 지우기(1시간) 10분 전까지 같은 주소를 쓴다.
 */
export type ProductPhotoSource = { base64: string; mimeType: string };
type PostResult = { ok: true; url: string; expiresAt: number } | { ok: false; message: string };
export type PostProductPhoto = (bytes: Uint8Array, mimeType: string) => Promise<PostResult>;

export class ProductPhotoUploadError extends Error {}

const RENEW_BEFORE_MS = 10 * 60 * 1000;
const FALLBACK_MESSAGE = "제품 사진을 올리지 못했습니다. 다시 시도해 주세요.";

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const postProductPhoto: PostProductPhoto = async (bytes, mimeType) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pdp/product-photo`, {
      method: "POST",
      headers: { "content-type": mimeType, "x-idempotency-key": randomId() },
      body: bytes,
    });
    const body = (await response.json()) as Partial<PostResult> & { message?: string };
    return response.ok && body.ok && typeof body.url === "string" && typeof body.expiresAt === "number"
      ? { ok: true, url: body.url, expiresAt: body.expiresAt }
      : { ok: false, message: body.message || FALLBACK_MESSAGE };
  } catch {
    return { ok: false, message: FALLBACK_MESSAGE };
  }
};

async function keyOf(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createProductPhotoUploader(deps: { post?: PostProductPhoto; now?: () => number } = {}) {
  const post = deps.post ?? postProductPhoto;
  const now = deps.now ?? Date.now;
  let cache: ReadonlyMap<string, { url: string; expiresAt: number }> = new Map();

  return {
    async urlFor(source: ProductPhotoSource): Promise<string> {
      const bytes = bytesOf(source.base64);
      const key = `${source.mimeType}:${await keyOf(bytes)}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt - now() > RENEW_BEFORE_MS) return cached.url;
      const result = await post(bytes, source.mimeType);
      if (!result.ok) throw new ProductPhotoUploadError(result.message);
      cache = new Map([...cache, [key, { url: result.url, expiresAt: result.expiresAt }]]);
      return result.url;
    },
  };
}

/**
 * 생성 요청에 싣는 제품 사진 칸.
 *
 * - 사진 경로: 원본(없으면 옛 작업의 1024 사본)을 올린 **주소**
 * - 글 경로: 앵커가 우리가 만든 대표 이미지라 지금처럼 그림을 싣는다(설계 §4.2)
 */
export async function productImageFields(input: {
  startMode?: CreateMode;
  productPhoto?: ProductPhotoSource;
  fallbackBase64: string;
  uploader: { urlFor(source: ProductPhotoSource): Promise<string> };
}): Promise<{ productImageUrl: string } | { originalImageBase64: string }> {
  if (input.startMode === "text") return { originalImageBase64: input.fallbackBase64 };
  const source = input.productPhoto ?? { base64: input.fallbackBase64, mimeType: "image/jpeg" };
  return { productImageUrl: await input.uploader.urlFor(source) };
}
```

`PdpEditor.tsx`:

- props 에 `productPhoto?: ProductPhotoSource;` (주석: 「사용자가 올린 제품 원본. 없으면 1024 사본을 올린다」)
- 컴포넌트 안에 `const productUploaderRef = useRef(createProductPhotoUploader());`
- 두 요청 자리(`/pdp/images` 와 `/pdp/images/batch`) 바로 앞에:

```ts
      let productFields: Awaited<ReturnType<typeof productImageFields>>;
      try {
        productFields = await productImageFields({
          startMode,
          productPhoto,
          fallbackBase64: initialResult.originalImage,
          uploader: productUploaderRef.current,
        });
      } catch (error) {
        // 조용히 낮은 화질로 내려가지 않는다(설계 §4.6). 생성 전이라 크레딧은 안 나갔다.
        setErrorMessage(error instanceof ProductPhotoUploadError ? error.message : "제품 사진을 올리지 못했습니다. 다시 시도해 주세요.");
        return { ok: false, stopBatch: true };
      }
```

- 두 몸통의 `originalImageBase64: initialResult.originalImage,` 를 `...productFields,` 로 바꾼다.
- 단건 자리에서는 위 `return` 전에 이 섹션을 `generatingKeys`·`inFlightKeys` 에서 빼야 한다 — 위 블록을 `setGeneratingKeys(...)` **앞**에 둔다. 일괄 자리는 묶음 반복 **밖**(첫 묶음 전)에서 한 번만 부르고, 실패하면 반복에 들어가지 않는다 — 그 함수의 기존 「멈춤」 반환 모양을 그대로 쓴다.

`PdpMakerClient.tsx` 의 `<PdpEditor` 에 `productPhoto={preparedImage?.original}` 한 줄.

- [ ] **Step 4: 통과하는지 본다** — Step 2 명령 PASS, 이어서 `pnpm --filter @fixup/web exec vitest run app/create` PASS(편집기 렌더 시험들이 `/pdp/images` 몸통을 재고 있으면 `productImageUrl` 로 바뀐 것만 고친다. 그 시험들의 `fetch` 가짜가 `/pdp/product-photo` 를 모르면 `{ ok: true, url: "https://v3.fal.media/files/t.jpg", expiresAt: Date.now() + 3600000 }` 을 돌려주게 더한다).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/create
git commit -m "feat(pdp): 편집기가 제품 원본을 한 번 올리고 주소로 그림을 만든다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: 2단계 마무리 — 전체 검사·독립 리뷰·실제 화면·비교

- [ ] **Step 1: CI 전체를 로컬에서**

```bash
cd /c/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/pdp-product-fidelity
pnpm -r typecheck && pnpm -r test && pnpm check:cost-forecast
```

Expected: 에러 0, 실패 0.

- [ ] **Step 2: 독립 리뷰 둘** — `code-reviewer`(전체 diff) + `security-reviewer`(새 라우트·주소 검사·업로드 크기: 사용자 입력과 외부 API 를 다룬다). CRITICAL·HIGH 를 고치고 Step 1 다시.

- [ ] **Step 3: 실제 화면** — 로컬은 Supabase 가 비어 있다(CLAUDE.md). `LOCAL_STORE=1` 로 띄워 사진 경로 한 번: 4032px 휴대폰 사진(세로·회전 정보 6)을 올리고 → 분석 → 섹션 한 장 만들기. 개발자 도구 네트워크에서 `/api/pdp/product-photo` 가 **한 번**, `/api/pdp/images` 몸통에 `productImageUrl` 이 있고 `originalImageBase64` 가 없는지 본다. 결과 그림이 누워 있지 않은지 본다. dev 서버는 사용자가 쓰는 워크트리가 아닌 이 워크트리에서 띄운다.

- [ ] **Step 4: 고치기 전·후 비교(2단계분)** — 장수·값을 묻고 승인 뒤. 1단계 후 결과와 같은 조합으로, 라벨 글자가 더 정확해졌는지 본다.

- [ ] **Step 5: 사용자에게 2단계 배포 여부를 묻는다.** 배포 뒤 3단계 계획을 쓴다.
