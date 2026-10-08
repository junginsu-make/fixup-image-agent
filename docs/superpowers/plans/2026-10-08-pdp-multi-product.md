# 상세페이지 여러 각도·여러 제품 — 구현 계획 (3단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 제품을 최대 3개, 제품마다 각도 사진을 최대 4장 올리고, 기획 AI 가 섹션마다 어느 제품을 그릴지 정하며(사용자가 구성안에서 바꿈), 그림 모델에는 그 섹션 제품의 사진만 이름표를 붙여 보낸다.

**Architecture:** 데이터의 중심은 화면의 `products: PdpProductDraft[]`(`p1`~`p3`, 사진마다 1024 사본 + 원본)이다. 지금 코드가 읽는 `preparedImage` 는 「제품 1 의 대표 사진」으로 **파생**해 남긴다 — 20여 곳을 한꺼번에 고치지 않는다. 분석 요청은 제품별 1024 사본을 차례대로 싣고 기획이 `productReadings`·섹션 `product_ids` 를 돌려준다. 생성 요청은 `page.products`(제품별 원본 fal 주소·이름·사실)를 싣고, 코어가 섹션의 `product_ids` 로 골라 참조·이름표·문장을 만든다. 제품이 하나면 모든 것이 지금(1·2단계) 동작과 같다.

**Tech Stack:** TypeScript, Next.js(`apps/web`), `@fixup/pdp-core`, zod, vitest(+ jsdom 렌더 시험).

**Spec:** `docs/superpowers/specs/2026-10-08-pdp-product-fidelity-design.md` §3·§5·§6.1·§6.2 (결정 D6 사용자가 묶기 · D7 기획 AI 가 섹션 배정 · D8 제품 3개·제품당 4장)

**앞 계획:** `docs/superpowers/plans/2026-10-08-pdp-product-fidelity.md`(1·2단계, 끝남 14c279ac). 원장 `.superpowers/sdd/2026-10-08-pdp-product-fidelity/progress.md` 의 Ruling R3·R4 가 여기서도 유효하다.

## Global Constraints

- 1·2단계 계획의 Global Constraints 전부(한국어 주석, 불변, 함수 50줄·파일 800줄, 화면 큰 파일엔 부르는 줄만, `console.log` 금지, 각도 자유 유지, 글 경로 그대로, 크레딧 그대로, 푸시·배포는 요청 때만).
- 상한: 제품 3개, 제품당 사진 1~4장, 제품 이름 30자(코드 포인트). 제품 id 는 `"p1" | "p2" | "p3"` — 화면이 매긴다. `p1` 은 지울 수 없다.
- **제품이 하나·사진이 하나면 요청 몸통과 프롬프트가 1·2단계와 같다**(제품 블록 문장이 `Image 1` 을 가리키는 모양 포함). 회귀 시험으로 잠근다.
- 섹션 배정 검증: 모르는 id 는 버리고, 비면 **모든 제품**. 제품 사진 없이 그리는 섹션은 없다.
- 섹션에 배정되지 않은 제품의 사진은 그림 모델에 **보내지 않는다.**
- 참조 순서: 섹션 제품 사진(제품 차례, 제품 안에서 사진 차례) → 인물·캐릭터 → 디자인 레퍼런스.
- 상한 초과 시: 제품마다 대표(첫) 사진은 남기고 뒤 사진부터, 제품끼리 번갈아 뺀다. 그래도 넘으면 지금처럼 거절. 뺀 장수를 섹션에 보인다.
- 섹션 제품을 바꾸면 그 섹션의 이미 만든 그림은 「낡음」(기존 `isImageStale` 자리). 단 `product_ids` 가 `["p1"]` 이거나 없으면 자국은 지금과 같다 — 옛 그림이 한꺼번에 낡음이 되면 안 된다.
- 분석 뒤 제품·사진이 바뀌었으면: 제품 하나·사진 하나면 1·2단계 R4 그대로(1024 사본으로 만든다). 그 밖에는 생성 전에 멈추고 「제품 사진이 구성안을 만든 뒤에 바뀌었습니다. 구성안을 다시 만들어 주세요.」

## Review Focus

1. **옛 초안·옛 서버 문서**(사진 한 장, `preparedImage`·`originalAssetId`) — 열면 「제품 1·사진 1장」으로 보이고 생성 몸통이 1·2단계와 같아야 한다. → Task 17·19 시험.
2. **로컬 초안(IndexedDB)이 원본을 버리던 것**(`pdp-drafts.ts` `normalizePreparedImage` 가 `original` 을 안 옮김, 1·2단계부터 있던 빈틈) — 다시 열어도 원본이 남아야 한다. → Task 17 시험.
3. **기획이 엉뚱한 id·빈 배정을 돌려줄 때** → Task 13 시험.
4. **제품 3개×4장 + 캐릭터 4각도 + 레퍼런스 조각**으로 Nano Banana Pro(14장) 상한을 넘길 때 → Task 14 시험.
5. **구성안에서 섹션 제품을 바꾼 뒤 그림이 낡음으로 보이는가, 그리고 제품 하나짜리 옛 그림은 낡음이 아닌가** → Task 15 시험.

---

### Task 12: 코어 — 제품 상한·id·배정·상한 맞추기 (순수 함수)

**Files:**
- Create: `packages/pdp-core/src/pdp.products.ts`, `packages/pdp-core/src/pdp.products.test.ts`
- Modify: `packages/pdp-core/src/types.ts` (`SectionBlueprint.product_ids?`, `LandingPageBlueprint.productReadings?`, `PageProduct` 타입), `packages/pdp-core/src/index.ts`

**Interfaces — Produces:**
```ts
export const PRODUCT_IDS = ["p1", "p2", "p3"] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];
export const PRODUCT_LIMITS = { products: 3, photos: 4, nameChars: 30 } as const;

/** 생성 요청이 싣는 제품 하나. 주소는 2단계의 fal 저장소 주소다. */
export interface PageProduct {
  id: ProductId;
  name?: string;
  imageUrls: string[];          // 1..4, 대표가 먼저
  facts?: ProductFacts;         // pdp.product-fidelity.ts
}

/** 이름이 비면 「제품 N」. */
export function productLabel(product: { id: ProductId; name?: string }): string;

/** 섹션 배정 다듬기: 아는 id 만, 겹침 없이, 제품 차례대로. 비면 모든 제품. */
export function normalizeProductIds(ids: unknown, known: readonly ProductId[]): ProductId[];

/** 섹션에 실을 제품만 고른다(차례는 페이지의 제품 차례). */
export function productsForSection<T extends { id: ProductId }>(products: readonly T[], ids: readonly string[] | undefined): T[];

/**
 * 참조 상한에 맞춘다. 제품마다 첫 사진은 남기고 뒤에서부터, 제품끼리 번갈아 뺀다.
 * `budget` 이 제품 수보다 작으면 대표만 남긴다(거절은 부르는 쪽 assertReferenceBudget 이 한다).
 */
export function fitProductPhotos<T extends { imageUrls: string[] }>(products: readonly T[], budget: number): { products: T[]; dropped: number };
```
`types.ts`: `SectionBlueprint` 에 `product_ids?: string[];`(주석: 기획이 정하고 사용자가 구성안에서 바꾼다. 없으면 모든 제품), `LandingPageBlueprint` 에 `productReadings?: Array<ProductReading & { productId: ProductId }>;`.

- [ ] **Step 1: 실패하는 시험**

```ts
import { describe, expect, it } from "vitest";
import { fitProductPhotos, normalizeProductIds, productLabel, productsForSection } from "./pdp.products";

const p = (id: "p1" | "p2" | "p3", n: number) => ({ id, imageUrls: Array.from({ length: n }, (_, i) => `${id}-${i}`) });

describe("섹션 배정 다듬기", () => {
  it("모르는 id·겹침을 버리고 제품 차례로", () => {
    expect(normalizeProductIds(["p2", "x", "p1", "p2"], ["p1", "p2"])).toEqual(["p1", "p2"]);
  });
  it("비거나 배열이 아니면 모든 제품", () => {
    expect(normalizeProductIds([], ["p1", "p2"])).toEqual(["p1", "p2"]);
    expect(normalizeProductIds("p1", ["p1", "p3"])).toEqual(["p1", "p3"]);
    expect(normalizeProductIds(["zz"], ["p1"])).toEqual(["p1"]);
  });
});

describe("섹션 제품 고르기", () => {
  it("배정된 제품만, 페이지 차례로", () => {
    expect(productsForSection([p("p1", 1), p("p2", 1), p("p3", 1)], ["p3", "p1"]).map((x) => x.id)).toEqual(["p1", "p3"]);
  });
  it("배정이 없거나 하나도 안 맞으면 모든 제품", () => {
    expect(productsForSection([p("p1", 1), p("p2", 1)], undefined).map((x) => x.id)).toEqual(["p1", "p2"]);
    expect(productsForSection([p("p1", 1), p("p2", 1)], ["p3"]).map((x) => x.id)).toEqual(["p1", "p2"]);
  });
});

describe("상한 맞추기", () => {
  it("넘지 않으면 그대로", () => {
    const products = [p("p1", 2), p("p2", 2)];
    expect(fitProductPhotos(products, 4)).toEqual({ products, dropped: 0 });
  });
  it("대표는 남기고 뒤에서부터 번갈아 뺀다", () => {
    const { products, dropped } = fitProductPhotos([p("p1", 4), p("p2", 4), p("p3", 4)], 8);
    expect(dropped).toBe(4);
    expect(products.map((x) => x.imageUrls.length)).toEqual([3, 3, 2]);
    expect(products.every((x) => x.imageUrls[0]?.endsWith("-0"))).toBe(true);
  });
  it("제품 수보다 작으면 대표만", () => {
    const { products } = fitProductPhotos([p("p1", 3), p("p2", 3)], 1);
    expect(products.map((x) => x.imageUrls)).toEqual([["p1-0"], ["p2-0"]]);
  });
  it("원본을 바꾸지 않는다", () => {
    const input = [p("p1", 4)];
    fitProductPhotos(input, 1);
    expect(input[0]!.imageUrls).toHaveLength(4);
  });
});

describe("이름", () => {
  it("비면 제품 N", () => {
    expect(productLabel({ id: "p2" })).toBe("제품 2");
    expect(productLabel({ id: "p1", name: " 레몬맛 " })).toBe("레몬맛");
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @fixup/pdp-core exec vitest run src/pdp.products.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: 구현** — 위 인터페이스대로. `fitProductPhotos` 는 「가장 사진이 많은 제품의 마지막 사진(동률이면 뒤 제품)」을 하나씩 빼는 반복으로 쓰면 「번갈아」가 된다(기대값 `[3,3,2]`: 12→8 에서 p3,p2,p1,p3 순으로 뺌). 대표(인덱스 0)는 빼지 않는다. 새 배열·새 객체만 만든다.

- [ ] **Step 4: 통과 확인 + `pnpm --filter @fixup/pdp-core test` + `pnpm -r typecheck`**

- [ ] **Step 5: 커밋** `feat(pdp): 제품 id·섹션 배정·참조 상한 맞추기` (+ Co-Authored-By 줄)

### Task 13: 코어 — 분석이 제품별 사진을 보고 섹션마다 제품을 정한다

**Files:**
- Modify: `packages/pdp-core/src/types.ts` (`PdpAnalyzeRequest.products?`)
- Modify: `packages/pdp-core/src/pdp.service.ts` (`analyzeProduct` 그림 싣기 ~370줄, 응답 스키마 ~394·~447, `buildAnalyzePrompt` extras, `normalizeBlueprint`/`normalizeSection`)
- Test: `packages/pdp-core/src/pdp.multi-product-analyze.test.ts` (새 — `pdp.analyze-reference.test.ts` 의 가짜 llm 방식을 따른다)

**Interfaces:**
- Consumes: Task 12 (`PRODUCT_IDS`, `normalizeProductIds`, `productLabel`, `PRODUCT_LIMITS`)
- Produces:
  - `PdpAnalyzeRequest.products?: Array<{ id: ProductId; name?: string; photos: Array<{ imageBase64: string; mimeType: string }> }>` — 있으면 `imageBase64` 대신 이것을 그림으로 싣는다. `imageBase64` 는 옛 호출·검증용으로 계속 받는다(제품 1 대표와 같다).
  - 응답 blueprint: `productReadings`(제품이 둘 이상이거나 사진이 둘 이상일 때), `productReading`(= 제품 1 판독, 지금 읽는 곳들을 위해), 섹션마다 `product_ids`(정규화 끝난 값).

동작:
1. 그림 싣기: `products` 가 있으면 제품 차례·사진 차례로 모든 사진 → 인물 → 레퍼런스 조각. 없으면 지금 그대로.
2. 프롬프트(`buildAnalyzePrompt` 의 `extras.products`): 제품이 둘 이상이거나 사진이 둘 이상일 때만 한국어 문단을 더한다.
   ```
   [첨부 제품 사진]
   - 그림 1~2: 제품 1 「레몬맛」 (id p1) — 같은 제품을 다른 각도에서 찍은 사진
   - 그림 3: 제품 2 「자몽맛」 (id p2)
   - productReadings 에 제품마다 하나씩, productId 를 붙여 판독한다.
   - 섹션마다 product_ids 에 그 섹션 그림에 나올 제품 id 를 적는다. 제품마다 소개하는 섹션과 함께 보여 주는 섹션(비교·구성·세트)을 페이지 흐름에 맞게 정한다.
   - 첨부한 제품 외의 물건을 「우리 제품」으로 지어내지 않는다.
   ```
   (사진이 여럿이지만 제품이 하나면 첫 줄만, 배정 지시는 빼고 「같은 제품의 다른 각도」만 말한다.)
3. 스키마: `productReadings: { type: ARRAY, items: { ...PRODUCT_READING_SCHEMA.properties + productId: STRING } }`, 섹션 `product_ids: { type: ARRAY, items: STRING }` — 제품이 둘 이상일 때만 섹션 스키마에 더한다(하나면 모델에게 묻지 않는다).
4. 정규화: `normalizeSection` 이 `product_ids` 를 버리지 않게 하되(목록 함수가 새 칸을 삼킨다 — 이미 두 번 겪음), 값 다듬기는 `analyzeProduct` 가 아는 id 목록으로 `normalizeProductIds` 를 적용한다. 제품 하나면 모든 섹션 `["p1"]`. `productReadings` 는 아는 id 만, `productReading` 이 비었으면 `p1` 판독으로 채운다. 글 경로(`pdp.text-plan.ts`)는 바꾸지 않는다.

- [ ] **Step 1: 실패하는 시험** — 가짜 `generateContent` 가 받은 `parts` 와 프롬프트를 붙잡고, 정해진 JSON 을 돌려준다.
  - 제품 2개(사진 2·1장): 그림 parts 3장이 제품 차례로, 프롬프트에 「그림 1~2: 제품 1 「레몬맛」」「그림 3: 제품 2」.
  - 응답 섹션 `product_ids: ["p2","zz"]`, `[]` → 결과 `["p2"]`, `["p1","p2"]`.
  - 제품 하나·사진 하나(`products` 없음) → parts·프롬프트가 지금과 같고(제품 문단 없음), 섹션은 `["p1"]`.
  - `productReadings` 에 `p1` 만 있고 `productReading` 이 없으면 → `productReading` 이 p1 판독.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** (위 동작 1~4)
- [ ] **Step 4: 통과 + `pnpm --filter @fixup/pdp-core test` + typecheck**
- [ ] **Step 5: 커밋** `feat(pdp): 분석이 제품별 사진을 보고 섹션마다 제품을 정한다`

### Task 14: 코어 — 섹션 제품만 이름표 붙여 보내고, 상한을 맞춘다

**Files:**
- Modify: `packages/pdp-core/src/types.ts` (`ReferenceImage` 에 `product?: { id: ProductId; label: string; view: number; views: number }`, `ImageGenOptions.products?: PageProduct[]`)
- Modify: `packages/pdp-core/src/pdp.service.ts` (`generateSectionImageInternal` 앵커 담기·제품 블록 인자, 결과에 `productPhotosDropped`)
- Modify: `packages/pdp-core/src/pdp.reference-policy.ts` (이름표·문장)
- Modify: `packages/pdp-core/src/pdp.product-fidelity.ts` (`productFidelityHead`·`Tail` 이 제품 묶음을 받게)
- Modify: `packages/pdp-core/src/pdp.controller.ts`·`index.ts` (`generateSectionImage` 반환에 `productPhotosDropped?: number`)
- Test: `pdp.product-fidelity.test.ts`, `pdp.product-fidelity-wiring.test.ts`, `pdp.reference-policy.test.ts`

**Interfaces:**
- Consumes: Task 12 (`PageProduct`, `fitProductPhotos`, `productLabel`), 1·2단계 함수들
- Produces:
  - `productFidelityHead({ groups: Array<{ label?: string; imageNumbers: number[]; facts?: ProductFacts }>, anchorRole, companion? })` — 그룹 하나·라벨 없음·번호 하나면 지금과 **글자 하나 다르지 않은** 문장(`Image 1 is the real product…`). 그룹 하나·번호 여럿이면 `Images 1–2 show the real product being sold — one product photographed from several angles.` 그룹 여럿이면 제품마다 `PRODUCT 1 "레몬맛" — Images 1–2` 줄 + `These are different products. Do not blend their features or merge them into one; draw each from its own photos. Do not add any product that is not attached.` `Keep unchanged`/`Free to change` 줄은 그대로 한 번.
  - `productFidelityTail({ groups, anchorRole })` — 하나면 지금 문장, 여럿이면 `…each product must be the exact product in its own images…`.
  - 생성 결과·컨트롤러 응답에 `productPhotosDropped?: number`(0 이면 안 싣는다).

동작:
1. `options.products` 가 있으면(웹이 섹션 제품만 골라 넣는다 — Task 15) 앵커를 `products` 에서 만든다: 제품마다 `imageUrls` 를 `ReferenceImage{ kind:"anchor", base64:"", url, product:{ id, label, view, views } }` 로. 없으면 지금(1·2단계)대로 한 장.
2. 상한: 앵커를 담기 **전에** 인물·캐릭터·레퍼런스 장수를 세어 `budget = maxReferenceImages(model) − 나머지` 를 정하고 `fitProductPhotos` 로 맞춘다. 뺀 장수를 결과에 싣는다. 넘침 거절은 지금 `assertReferenceBudget` 그대로.
3. `buildReferenceRoleDirective`: `reference.product` 가 있으면 이름표를 `[Image n — PRODUCT k "이름", view i of m]`(이름 없으면 `PRODUCT k`). 제품 규칙(`rulesFor("anchor")`)은 **첫 앵커에서 한 번만**. 그 제품의 사진이 여럿이면 그 제품 첫 사진 아래 한 번: `Images a–b are the same single product photographed from different angles — one object, not several. Base each view on the photo closest to the angle the scene needs.` 사용자가 제품 자리에 적은 말(`intent`)은 첫 앵커에만.
4. 제품 블록·꼬리: 앵커들을 제품별로 묶어 `groups` 를 만든다(사실은 `products[].facts`, 없으면 1·2단계 `options.productFacts` 를 제품 하나일 때만).

- [ ] **Step 1: 실패하는 시험**
  - `product-fidelity.test.ts`: 그룹 하나·번호 하나 → 1·2단계 기대 문자열과 **완전히 같다**(`toBe`). 번호 둘 → `Images 1–2` 와 `several angles`. 그룹 둘 → 두 제품 줄 + `different products` + `Do not add any product`.
  - `reference-policy.test.ts`: 제품 2개(2장·1장) → 이름표 3개 순서·문구, 제품 규칙 1번만, 같은 제품 문장 1번.
  - `wiring.test.ts`(fal 로 나가는 진짜 프롬프트·참조 붙잡기):
    - `products: [p1(2장), p2(1장)]` → 참조 url 순서 `p1-0,p1-1,p2-0` 다음 인물·레퍼런스.
    - Nano Banana Pro + 제품 3×4 + 캐릭터 4각도 → 참조 14장 이하, `productPhotosDropped` = 2, 각 제품 대표 남음.
    - `products` 없음(1·2단계 호출) → 프롬프트가 이 작업 전과 같다(이 작업 전 커밋에서 같은 입력으로 뽑은 문자열을 픽스처로 고정).
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** (동작 1~4). `generateSectionImageInternal` 이 50줄을 더 넘기지 않게 앵커 만들기는 `pdp.products.ts` 의 `anchorsFromProducts(products): ReferenceImage[]` 로 뺀다.
- [ ] **Step 4: 통과 + pdp-core 전체 + typecheck** — `character-carry-baseline` 이 깨지면 1·2단계처럼 제품 블록만 걷어 내는 쪽으로(인물 문장 비교는 그대로).
- [ ] **Step 5: 뮤테이션** — `productsForSection`/제품 필터를 끄면 「배정 안 된 제품 사진은 안 간다」 시험이 깨지는지(Task 15 에서 함께). 여기선 `fitProductPhotos` 호출을 지우면 14장 시험이 깨지는지.
- [ ] **Step 6: 커밋** `feat(pdp): 섹션 제품 사진만 이름표 붙여 보내고 상한을 맞춘다`

### Task 15: 코어 — 페이지 값에서 섹션 제품 고르기, 그림 낡음 자국

**Files:**
- Modify: `packages/pdp-core/src/pdp.image-options.ts` (`PageImageWire.products?`, `PageImageInputs.products?`, `buildSectionImageOptions` 가 `productsForSection(page.products, target.section.product_ids)`)
- Modify: `packages/pdp-core/src/pdp.image-freshness.ts` (`imageStampOf`)
- Test: `pdp.image-options.test.ts`, `pdp.image-freshness.test.ts`

동작:
- `buildSectionImageOptions` 반환에 `products`(섹션 것만). 페이지에 `products` 가 없으면 넣지 않는다.
- `imageStampOf`: `product_ids` 가 있고 `["p1"]` 이 아니면 자국 끝에 `|products:p1,p2` 를 붙인다. 없거나 `["p1"]` 이면 지금과 같다(주석에 이유: 옛 그림이 한꺼번에 낡음이 되지 않게).

- [ ] **Step 1: 실패하는 시험** — 섹션 `product_ids:["p2"]` 이면 옵션 `products` 가 p2 하나. 페이지 `products` 없으면 옵션에 칸이 없다. 자국: `["p1"]`·없음은 이 작업 전 값과 같다, `["p1","p2"]` → `["p1"]` 로 바꾸면 `isImageStale` true.
- [ ] **Step 2~4**: 실패 확인 → 구현 → pdp-core 전체·typecheck
- [ ] **Step 5: 커밋** `feat(pdp): 섹션 제품을 페이지 값에서 고르고, 바꾸면 그림을 낡음으로`

### Task 16: 서버 — 요청 형식·분석 라우트·생성 결과의 뺀 장수

**Files:**
- Modify: `apps/web/lib/pdp/request.ts` (`analyze.products`, `page.products`, `section.product_ids`)
- Modify: `apps/web/app/api/pdp/analyze/route.ts` (`products` 를 코어로 — 지금 `imageBase64` 를 넘기는 자리 옆), `apps/web/app/api/pdp/images/route.ts`·`batch/route.ts` (응답에 `productPhotosDropped`)
- Test: `apps/web/lib/pdp/__tests__/request-multi-product.test.ts`(새), `app/api/pdp/__tests__/pdp-image-routes.test.ts`, `app/api/pdp/__tests__/pdp-analyze-route.test.ts`

zod:
```ts
const productId = z.enum(PRODUCT_IDS);
const productName = text.refine((v) => Array.from(v).length <= PRODUCT_LIMITS.nameChars, "제품 이름이 너무 깁니다.");
// analyze
products: z.array(z.object({
  id: productId, name: productName.optional(),
  photos: z.array(z.object({ imageBase64: imagePayload, mimeType: imageMime })).min(1).max(PRODUCT_LIMITS.photos),
}).strict()).min(1).max(PRODUCT_LIMITS.products)
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, "제품 id 가 겹칩니다.")
  .optional(),
// page
products: z.array(z.object({
  id: productId, name: productName.optional(),
  imageUrls: z.array(productImageUrl).min(1).max(PRODUCT_LIMITS.photos),   // 2단계의 fal 주소 검사·정규화 그대로
  facts: productFactsSchema.optional(),                                     // 2단계 page.productFacts 와 같은 스키마를 이름 붙여 재사용
}).strict()).min(1).max(PRODUCT_LIMITS.products).optional(),
// section
product_ids: z.array(productId).max(PRODUCT_LIMITS.products).optional(),
```
`hasProductImage` 는 `page.products` 가 있어도 참이 되게 고친다(옛 `productImageUrl`·`originalImageBase64` 도 그대로).

- [ ] **Step 1: 실패하는 시험** — 제품 4개·사진 5장·이름 31자·id 겹침·fal 아닌 주소 거절, 정상 통과. 분석 라우트가 `products` 를 코어까지 넘김. 생성 라우트 응답에 코어가 준 `productPhotosDropped` 가 실림(0/없음이면 칸 없음). `page.products` 만 있고 주소·그림이 없어도 통과.
- [ ] **Step 2~4**: 실패 확인 → 구현 → `vitest run app/api/pdp lib/pdp` + typecheck + 웹 전체 1회
- [ ] **Step 5: 커밋** `feat(pdp): 여러 제품 요청 형식과 생성 결과의 뺀 장수`

### Task 17: 화면 데이터 — 제품 목록·초안·서버 문서·분석 요청

**Files:**
- Create: `apps/web/app/create/products.ts`, `apps/web/app/create/__tests__/products.test.ts`
- Modify: `apps/web/app/create/pdp-drafts.ts` (`PdpDraftInput.products?`, `normalizePreparedImage` 가 `original` 보존 — 1·2단계 빈틈, `normalizeProducts`)
- Modify: `apps/web/app/create/document-state.ts` (제품 참조 여러 개: `productId`·`productName`·`photoIndex` 를 참조에, 복원 때 묶기)
- Modify: `apps/web/app/create/analyze-request.ts` (`products` 싣기)
- Test: `__tests__/product-original-draft.test.ts` 확장, `analyze-request` 시험(있는 파일 찾아 확장, 없으면 새로)

**Interfaces — Produces (`products.ts`, 전부 순수·불변):**
```ts
export interface PdpProductDraft { id: ProductId; name: string; photos: PreparedImageDraft[] }
export function productsFromLegacy(prepared: PreparedImageDraft | null): PdpProductDraft[];   // null → []
export function primaryPhoto(products: readonly PdpProductDraft[]): PreparedImageDraft | null; // p1 첫 사진
export function addProduct(products): PdpProductDraft[];            // 빈 칸, 다음 빈 id, 3개면 그대로
export function removeProduct(products, id): PdpProductDraft[];      // p1 은 못 지움
export function renameProduct(products, id, name): PdpProductDraft[];// 30자(코드 포인트)로 자름
export function addPhotos(products, id, photos): { products: PdpProductDraft[]; skipped: number };  // 4장 상한
export function removePhoto(products, id, index): PdpProductDraft[];
export function makePrimary(products, id, index): PdpProductDraft[];
export function productsReady(products): boolean;                   // 1개 이상, 모든 칸에 사진 1장 이상
export function productsKey(products): string;                       // 분석 일치 확인용(id·이름·사진 1024 base64 길이+끝 32자)
```
- 초안: `PdpDraftInput.products` 를 저장·복원. 없으면 `productsFromLegacy(preparedImage)`. `preparedImage` 는 계속 `primaryPhoto(products)` 로 함께 저장한다(옛 코드·옛 서버가 읽는다).
- 서버 문서: 제품 사진마다 `references.push({ role:"product", assetId, originalAssetId?, productId, productName, photoIndex, enabled, instruction })`(instruction 은 p1 첫 사진에만). 복원은 `role==="product"` 를 `productId`(없으면 `p1`)로 묶고 `photoIndex`(없으면 차례)로 정렬. 서버 `model.ts` 참조 검사는 passthrough 라 새 칸이 통과하는지 시험으로 확인(1·2단계 Task 9 와 같은 자리).
- 분석 요청: 제품이 둘 이상이거나 사진이 둘 이상이면 `products: [{ id, name?, photos:[{ imageBase64: 1024 base64, mimeType }] }]` 를 싣는다. `imageBase64`·`mimeType` 은 계속 제품 1 대표.
- 분석 성공 때 화면이 `result.analyzedProductsKey = productsKey(products)` 를 붙인다(`GeneratedResult` 에 `analyzedProductsKey?: string` — 「화면이 붙이는 값, 서버는 모른다」 주석).

- [ ] **Step 1: 실패하는 시험** — 각 함수(상한·p1 못 지움·대표 바꾸기·불변), 옛 초안(`preparedImage` 만) → 제품 1·사진 1, **로컬 초안 다시 열기에서 `original` 이 남는다**, 서버 문서 왕복(제품 2개·사진 3장·원본 포함) → 같은 제품 목록, 분석 요청 몸통(제품 하나·사진 하나면 `products` 칸 없음).
- [ ] **Step 2~4**: 실패 확인 → 구현 → `vitest run app/create lib/pdp` + typecheck
- [ ] **Step 5: 커밋** `feat(pdp): 화면의 제품 목록 — 초안·서버 문서·분석 요청`

### Task 18: 화면 — 올리기 화면의 제품 칸

**Files:**
- Create: `apps/web/app/create/ProductSlots.tsx`, `apps/web/app/create/__tests__/product-slots.test.tsx`
- Modify: `apps/web/app/create/PdpMakerClient.tsx` (상태 `products`, 파생 `preparedImage`, 올리기 자리 교체, `canAnalyze`, 안내 문구)

동작:
- `PdpMakerClient`: `const [products, setProducts] = useState<PdpProductDraft[]>([])` 를 두고 `const preparedImage = primaryPhoto(products)` 로 파생한다. 지금 `setPreparedImage` 를 부르는 세 곳(고르기 `:436`, 처음부터 `:660`, 초안 열기 `:747`)을 `setProducts` 로 바꾼다. 나머지 `preparedImage` 읽는 자리는 그대로 둔다. 초안 저장에 `products` 를 싣는다.
- 올리기 자리(`:1682-1730`)의 한 장 칸을 `<ProductSlots products onChange onError />` 로 바꾼다. 카드 바깥의 끌어다 놓기·붙여넣기(`productDrop`)는 `multiple: true` 로, 받은 파일들을 「사진 자리가 남은 첫 제품」에 넣는다.
- `ProductSlots`(새 파일, 600줄 넘지 않게): 제품 카드마다
  - 이름 입력(자리표시 「제품 N」, 30자 상한 안내)
  - 사진 1~4장 썸네일, 각 사진에 「대표로」·「빼기」, 첫 장에 「대표」 표시
  - 사진 더하기(파일 고르기 `multiple`, 저장된 이미지에서 고르기 `SavedImagePicker`), 4장이면 막고 안내
  - 제품 2·3 에 「제품 빼기」
  - 맨 아래 「제품 추가」(3개면 감춤)와 짧은 안내: 「같은 제품의 다른 각도는 한 칸에, 다른 제품은 칸을 추가해 넣어 주세요.」
  - 파일은 `prepareProductImageFile`(2단계 원본 손질 포함)로 준비한다
  - 버튼·입력은 `PdpMakerClient` 가 이미 쓰는 프로젝트 공용 컴포넌트(`Button`, `Input`, `Badge` 등 — 같은 import 경로)를 쓴다. 아이콘은 Lucide.
- `canAnalyze = productsReady(products) && …(지금 나머지 조건)`. 빈 칸이 있으면 분석 버튼 옆에 「사진이 없는 제품 칸이 있습니다」.
- 첫 화면 문구 「상품 사진 한 장이면 됩니다」(`:1459-1462`)를 「상품 사진 한 장이면 됩니다. 다른 각도·다른 제품도 함께 올릴 수 있습니다.」로.

- [ ] **Step 1: 실패하는 시험(`product-slots.test.tsx`, jsdom)** — 제품 추가 → 칸 2개, 3개에서 추가 버튼 사라짐, 제품 1 에 「제품 빼기」 없음, 사진 5장 고르면 4장만 들어가고 안내, 「대표로」 누르면 순서 바뀜, 이름 31자 입력 → 30자. `onChange` 로 나간 값으로 확인(파일 준비는 가짜로 주입: `ProductSlots` 가 `prepare?: (file: File) => Promise<PreparedImageDraft>` 를 받게 해 시험에서 바꿔 끼운다).
- [ ] **Step 2~4**: 실패 확인 → 구현 → `vitest run app/create` + typecheck + lint
- [ ] **Step 5: 커밋** `feat(pdp): 올리기 화면에 제품 칸 — 여러 각도·여러 제품`

### Task 19: 화면 — 구성안의 제품 칩, 편집기의 제품별 주소·뺀 장수

**Files:**
- Modify: `apps/web/app/create/ScenarioEditor.tsx` (`SectionCard` 에 제품 칩 — 제품이 둘 이상일 때만, `onPatch({ product_ids })`, 하나는 남는다)
- Modify: `apps/web/app/create/PdpMakerClient.tsx` (`ScenarioEditor` 에 `products={productChips}` 한 줄, `PdpEditor` 에 `products`·`analyzedProductsKey`)
- Modify: `apps/web/app/create/product-photo-upload.ts` (`pageProductsFor(...)`)
- Modify: `apps/web/app/create/PdpEditor.tsx` (요청 몸통에 `page.products`, 뺀 장수 배지)
- Test: `__tests__/scenario-product-chips.test.tsx`(새), `__tests__/product-photo-upload.test.ts` 확장, `__tests__/product-photo-editor.test.tsx` 확장

`product-photo-upload.ts` 에 더한다:
```ts
/**
 * 생성 요청의 제품 칸(설계 §6.1). 분석한 제품 그대로일 때만 원본을 올린다.
 * - 글 경로: { originalImageBase64 } (지금 그대로)
 * - 제품 하나·사진 하나: 2단계와 같은 { productImageUrl } (R4 대체 포함)
 * - 그 밖: { productImageUrl: 제품 1 대표 주소, products: PageProduct[] } — 옛 서버도 대표로는 만든다
 * - 분석 뒤 제품이 바뀌었고 사진이 여럿이면 ProductPhotoUploadError(PRODUCTS_CHANGED_MESSAGE)
 */
export const PRODUCTS_CHANGED_MESSAGE = "제품 사진이 구성안을 만든 뒤에 바뀌었습니다. 구성안을 다시 만들어 주세요.";
export async function productRequestFields(input: {
  startMode?: CreateMode;
  products: readonly PdpProductDraft[];
  analyzedProductsKey?: string;
  readings?: LandingPageBlueprint["productReadings"];
  fallbackBase64: string;
  uploader: { urlFor(source: ProductPhotoSource): Promise<string> };
}): Promise<{ originalImageBase64: string } | { productImageUrl: string; products?: PageProduct[] }>;
```
- 사진마다 원본(없으면 1024 사본, `data:` 접두 떼기 — 2단계 함수 재사용)을 `uploader.urlFor` 로. 캐시가 있어 묶음마다 불러도 다시 안 올린다.
- 제품 사실은 `readings` 에서 `productId` 로 찾아 `productFactsFrom`.
- `PdpEditor`: 지금 `productImageFields`/`productImageFieldsOrThrow` 를 부르는 두 자리를 `productRequestFields`(묶음은 실패 시 throw 판)로 바꾸고, 결과의 `products` 는 몸통의 `page` 에 합친다(`page: { ...pageWire(), ...(products ? { products } : {}) }`). 섹션 적용 때 응답의 `productPhotosDropped` 를 섹션에 `productPhotosDropped` 로 저장하고, 배지 줄(`:3545-3575`)에 `사진 N장 줄임`(title: 「사진이 많아 제품마다 앞쪽 사진만 썼습니다」)을 보인다.
- `ScenarioEditor`: `products?: Array<{ id: ProductId; label: string }>` 를 받아 둘 이상일 때 섹션 카드에 칩. 섹션 `product_ids` 가 없으면 모두 켜진 것으로 보인다. 마지막 하나는 끌 수 없다(눌러도 그대로, `aria-disabled`). 글 경로(`TextModeFlow`)는 넘기지 않는다.

- [ ] **Step 1: 실패하는 시험**
  - `productRequestFields`: 글 경로 / 제품 하나·사진 하나(2단계 몸통과 같음) / 제품 2개(주소 3개·사실 붙음·`productImageUrl` 은 p1 대표) / 키 불일치 + 사진 여럿 → 오류 문구 / 키 불일치 + 제품 하나·사진 하나 → 1024 사본 주소(R4).
  - 칩: 제품 둘 → 섹션마다 칩 2개, 끄면 `onChange` 의 섹션 `product_ids` 가 하나, 마지막 하나는 안 꺼진다, 제품 하나면 칩 없음.
  - 편집기: 제품 2개 작업에서 묶음 몸통 `page.products` 에 두 제품, 응답 `productPhotosDropped: 2` → 배지 「사진 2장 줄임」.
- [ ] **Step 2~4**: 실패 확인 → 구현 → `vitest run app/create lib` + 웹 전체 1회 + typecheck + lint
- [ ] **Step 5: 커밋** `feat(pdp): 구성안 제품 칩·편집기의 제품별 주소와 뺀 장수`

### Task 20: 3단계 마무리

- [ ] **Step 1:** `pnpm -r typecheck && pnpm -r test && pnpm lint && pnpm check:cost-forecast` — 출력 끝줄 기록
- [ ] **Step 2:** 브랜치 전체(1·2·3단계) 최종 리뷰(가장 강한 모델) + 새 입력(제품 이름·여러 주소)에 대한 보안 리뷰
- [ ] **Step 3:** 값이 드는 것(0단계 실측·실화면·전후 비교)과 배포는 사용자에게 묻는다(원장 R1, 사용자 「다 같이 배포」).
