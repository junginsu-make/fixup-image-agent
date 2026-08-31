# 글기반 상세페이지 충실도 손잡이 — 구현 계획

> **작업자 안내:** 이 계획은 작업 단위로 하나씩 실행한다. 각 작업은 테스트를 먼저 쓰고,
> 실패를 확인하고, 최소 구현으로 통과시키고, 커밋한다. 체크박스로 진행을 표시한다.

**목표:** 글로 시작하는 상세페이지 생성에 표현 강도·빈칸 처리 손잡이를 붙이고,
문장마다 근거를 기록해 확인되지 않은 값이 이미지로 구워지지 않게 한다.

**설계 문서:** `docs/superpowers/specs/2026-07-29-text-fidelity-controls-design.md`
**아키텍처:** 판정은 전부 `packages/pdp-core` 의 순수 함수로 두고, 화면과 서버가 같은 함수를
호출한다. 새 LLM 호출은 추가하지 않는다 — 근거는 구성안을 만드는 기존 호출에서 함께 받는다.

**기술 스택:** TypeScript(strict) · pnpm 워크스페이스 · vitest · Next.js 15 App Router

---

## 전역 제약

- **새 LLM 호출을 만들지 않는다.** 근거는 기존 구성안 생성 호출의 응답에 실려 온다
- **사진으로 시작하는 경로(`analyze`)를 건드리지 않는다.** 이번 범위는 `planFromText` 계열뿐
- **불변성:** 객체를 수정하지 않고 새 객체를 만든다(스프레드)
- **순수 함수에 `Date.now()` 를 쓰지 않는다.** 시각이 필요하면 인자로 받는다
- **파일 400줄을 넘기지 않는다.** 넘으면 책임으로 쪼갠다
- **테스트·주석·UI 문구는 한국어.** 기존 파일의 어투를 따른다
- **검증 명령:** `pnpm typecheck` · `pnpm test` · `pnpm lint` 세 개가 전부 0이어야 한다
- **커밋:** `<type>(scope): 한국어 한 줄` (예: `feat(pdp): 근거 딱지 타입을 더한다`)
- **`prompt_en` 은 근거 대상이 아니다.** `mergeArtDirection` 이 확인 이후에 다시 쓰기 때문
- 기존 함수 시그니처를 바꾸지 않는다. 새 인자는 전부 선택(optional)으로 더한다

---

## 파일 구조

**`packages/pdp-core/src/`**

| 파일 | 책임 |
|---|---|
| `types.ts` (수정) | 새 타입 선언 |
| `pdp.copy-target.ts` (신규) | 문장 하나를 가리키고 읽고 쓴다 |
| `pdp.claim-policy.ts` (신규) | 금지 분류 스캐너, 사실 표지(숫자·기간·가격) 판정 |
| `pdp.evidence.ts` (신규) | 근거 유효성·미확인 수집·구조 검증·강등 |
| `pdp.copy-intensity.ts` (신규) | 손잡이 두 개의 프롬프트 규칙 문장 |
| `pdp.text-plan.ts` (수정) | 프롬프트·스키마·정규화 결선 |
| `index.ts` (수정) | 위 공개 API 내보내기 |

**`apps/web/`**

| 파일 | 책임 |
|---|---|
| `lib/evidence-gate.ts` (신규) | 라우트가 쓰는 게이트 한 줄 |
| `app/api/pdp/plan-from-text/route.ts` (수정) | 손잡이 값 검증·전달 |
| `app/api/pdp/images/route.ts` · `batch/route.ts` (수정) | 게이트 |
| `app/create/TextBriefInput.tsx` (수정) | 손잡이 UI |
| `app/create/TextModeFlow.tsx` (수정) | 손잡이 상태·재생성·확인 단계 |
| `app/create/UnverifiedReview.tsx` (신규) | 확인 화면 |
| `app/create/ScenarioEditor.tsx` (수정) | 배지·재생성 버튼 |

---

## Task 1: 타입과 문장 지시자

**파일**
- 수정: `packages/pdp-core/src/types.ts`
- 생성: `packages/pdp-core/src/pdp.copy-target.ts`
- 테스트: `packages/pdp-core/src/pdp.copy-target.test.ts`

**인터페이스 — 이후 작업이 이 이름들을 쓴다**

```ts
// types.ts 에 추가
export type CopyIntensity = "plain" | "normal" | "strong" | "max";
export type GapPolicy = "omit" | "ask" | "sample";

export type CopyTarget =
  | { slot: "headline" | "subheadline" | "trust_or_objection_line" | "CTA" | "prompt_ko" }
  | { slot: "bullet"; index: number };

export type EvidenceKind = "quoted" | "rhetoric" | "sample" | "user" | "ask";

export interface CopyEvidence {
  target: CopyTarget;
  value: string;
  kind: EvidenceKind;
  quote?: string;
  note?: string;
  acknowledgedAt?: string;
}

// SectionBlueprint 에 추가 (기존 필드는 그대로)
//   evidenceVersion?: 1;
//   evidence?: CopyEvidence[];

// TextPlanRequest 에 추가
//   copyIntensity?: CopyIntensity;
//   gapPolicy?: GapPolicy;
```

```ts
// pdp.copy-target.ts 가 내보내는 것
export function targetKey(target: CopyTarget): string;              // "headline" | "bullet:2"
export function sameTarget(a: CopyTarget, b: CopyTarget): boolean;
export function readCopyTarget(section: SectionBlueprint, target: CopyTarget): string | undefined;
export function writeCopyTarget(section: SectionBlueprint, target: CopyTarget, value: string): SectionBlueprint;
export function spliceBullet(section: SectionBlueprint, index: number, insert?: string): SectionBlueprint;
```

- [ ] **1-1. 실패하는 테스트를 쓴다** — `pdp.copy-target.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { readCopyTarget, writeCopyTarget, spliceBullet, targetKey } from "./pdp.copy-target";
import type { SectionBlueprint } from "./types";

function makeSection(overrides: Partial<SectionBlueprint> = {}): SectionBlueprint {
  return {
    section_id: "S1", section_name: "히어로", goal: "",
    headline: "촉촉함이 오래 갑니다", headline_en: "",
    subheadline: "하루 종일", subheadline_en: "",
    bullets: ["무향 처방", "12시간 보습"], bullets_en: [],
    trust_or_objection_line: "", trust_or_objection_line_en: "",
    CTA: "", CTA_en: "", layout_notes: "", compliance_notes: "",
    image_id: "IMG_S1", purpose: "", prompt_ko: "제품 클로즈업", prompt_en: "product close-up",
    negative_prompt: "", style_guide: "", reference_usage: "",
    ...overrides,
  };
}

describe("문장 지시자", () => {
  it("모든 slot 을 읽고 쓴 값이 그대로 돌아온다", () => {
    const section = makeSection();
    for (const target of [
      { slot: "headline" } as const,
      { slot: "subheadline" } as const,
      { slot: "trust_or_objection_line" } as const,
      { slot: "CTA" } as const,
      { slot: "prompt_ko" } as const,
      { slot: "bullet", index: 1 } as const,
    ]) {
      const next = writeCopyTarget(section, target, "바뀐 값");
      expect(readCopyTarget(next, target)).toBe("바뀐 값");
    }
  });

  it("원본을 바꾸지 않는다", () => {
    const section = makeSection();
    writeCopyTarget(section, { slot: "headline" }, "다른 문구");
    expect(section.headline).toBe("촉촉함이 오래 갑니다");
  });

  it("없는 불릿을 읽으면 undefined", () => {
    expect(readCopyTarget(makeSection(), { slot: "bullet", index: 9 })).toBeUndefined();
  });

  it("불릿을 지우면 뒤 근거의 인덱스가 당겨진다", () => {
    const section = makeSection({
      evidenceVersion: 1,
      evidence: [
        { target: { slot: "bullet", index: 0 }, value: "무향 처방", kind: "quoted", quote: "무향" },
        { target: { slot: "bullet", index: 1 }, value: "12시간 보습", kind: "sample", note: "예시" },
      ],
    });
    const next = spliceBullet(section, 0);
    expect(next.bullets).toEqual(["12시간 보습"]);
    expect(next.evidence).toHaveLength(1);
    expect(next.evidence?.[0]).toMatchObject({ target: { slot: "bullet", index: 0 }, kind: "sample" });
  });

  it("targetKey 는 slot 과 인덱스를 구분한다", () => {
    expect(targetKey({ slot: "headline" })).toBe("headline");
    expect(targetKey({ slot: "bullet", index: 2 })).toBe("bullet:2");
  });
});
```

- [ ] **1-2. 실패 확인** — `cd packages/pdp-core && npx vitest run src/pdp.copy-target.test.ts`
  기대: 모듈을 찾지 못해 FAIL
- [ ] **1-3. 타입과 구현을 쓴다** — 위 인터페이스대로. `spliceBullet` 은 지운 인덱스보다
  큰 불릿 근거의 `index` 를 1 줄이고, 지운 인덱스를 가리키던 근거는 버린다
- [ ] **1-4. 통과 확인** — 같은 명령. 5개 통과
- [ ] **1-5. 커밋** — `feat(pdp): 문장 하나를 가리키는 CopyTarget 과 읽기·쓰기를 더한다`

---

## Task 2: 금지 분류 스캐너

**파일**
- 생성: `packages/pdp-core/src/pdp.claim-policy.ts`
- 테스트: `packages/pdp-core/src/pdp.claim-policy.test.ts`

**인터페이스**

```ts
export type BannedClaimCategory = "guarantee" | "medical" | "credential";
export interface BannedClaimHit { category: BannedClaimCategory; matched: string }

/** 금지 분류에 걸리는 표현을 전부 찾는다. 빈 배열이면 깨끗하다. */
export function scanBannedClaims(text: string): BannedClaimHit[];

/** 숫자·기간·비율·가격 같은 '검증 가능한 표지'가 있는가. rhetoric 보조 방어에 쓴다. */
export function containsFactualMarker(text: string): boolean;
```

- [ ] **2-1. 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { scanBannedClaims, containsFactualMarker } from "./pdp.claim-policy";

describe("금지 분류 스캐너", () => {
  it("수익 보장을 잡는다", () => {
    expect(scanBannedClaims("월 500만 원 보장합니다")[0].category).toBe("guarantee");
    expect(scanBannedClaims("3개월이면 퇴사 가능")[0].category).toBe("guarantee");
  });

  it("의학적 효능을 잡는다", () => {
    expect(scanBannedClaims("아토피 개선에 도움")[0].category).toBe("medical");
    expect(scanBannedClaims("체지방 감소 효과")[0].category).toBe("medical");
  });

  it("인증·수상·순위를 잡는다", () => {
    expect(scanBannedClaims("국내 1위 강의")[0].category).toBe("credential");
    expect(scanBannedClaims("식약처 인증 완료")[0].category).toBe("credential");
    expect(scanBannedClaims("특허 출원 기술")[0].category).toBe("credential");
  });

  it("표현 변형도 잡는다", () => {
    expect(scanBannedClaims("수익을 보장해 드립니다")).not.toHaveLength(0);
    expect(scanBannedClaims("업계 1등")).not.toHaveLength(0);
  });

  it("평범한 카피는 통과시킨다", () => {
    expect(scanBannedClaims("영상 만드는 시간을 줄여 줍니다")).toHaveLength(0);
    expect(scanBannedClaims("어떤 순서로 보여줘야 팔릴까요?")).toHaveLength(0);
  });
});

describe("사실 표지", () => {
  it("숫자·기간·비율·가격을 표지로 본다", () => {
    expect(containsFactualMarker("수강생 3,000명")).toBe(true);
    expect(containsFactualMarker("2주 만에 끝납니다")).toBe(true);
    expect(containsFactualMarker("만족도 98%")).toBe(true);
    expect(containsFactualMarker("29,000원")).toBe(true);
  });

  it("수사에는 표지가 없다", () => {
    expect(containsFactualMarker("아직 절반만 하신 겁니다")).toBe(false);
    expect(containsFactualMarker("왜 아무도 못 할까요?")).toBe(false);
  });
});
```

- [ ] **2-2. 실패 확인** — `npx vitest run src/pdp.claim-policy.test.ts`
- [ ] **2-3. 구현한다.** 분류별 정규식 목록을 상수로 두고 순서대로 검사한다.
  목록은 파일 맨 위에 모아 나중에 늘릴 수 있게 한다
- [ ] **2-4. 통과 확인**
- [ ] **2-5. 커밋** — `feat(pdp): 예시로 채우면 안 되는 세 분류를 스캐너로 잡는다`

---

## Task 3: 근거 판정과 강등

**파일**
- 생성: `packages/pdp-core/src/pdp.evidence.ts`
- 테스트: `packages/pdp-core/src/pdp.evidence.test.ts`

**인터페이스**

```ts
export type BindingState = "fresh" | "stale" | "dangling";
export function validateEvidenceBinding(section: SectionBlueprint, ev: CopyEvidence): BindingState;

export interface UnverifiedItem {
  sectionId: string;
  sectionName: string;
  target: CopyTarget;
  kind: "sample" | "ask";
  /** 현재 문구. ask 면 빈 문자열 */
  value: string;
  /** 무엇을 채워야 하는지 */
  note?: string;
}
/** 확인이 필요한 것 = 미확인 sample + ask + stale 이 된 근거 */
export function collectUnverified(blueprint: LandingPageBlueprint): UnverifiedItem[];

export type StructureFailureReason =
  | "missing" | "duplicate" | "unknown_target" | "bad_quote" | "banned" | "rhetoric_with_fact";
export interface StructureFailure { sectionId: string; target?: CopyTarget; reason: StructureFailureReason }
export function verifyEvidenceStructure(blueprint: LandingPageBlueprint, sourceText: string): StructureFailure[];

/** 재시도를 소진했을 때. 실패 종류별로 다르게 처리한다(설계 §3-5). */
export function demoteToAsk(blueprint: LandingPageBlueprint, failures: StructureFailure[]): LandingPageBlueprint;

/** 확인 화면 동작 */
export function applyUserEdit(blueprint: LandingPageBlueprint, sectionId: string, target: CopyTarget, value: string): LandingPageBlueprint;
export function acknowledgeAll(blueprint: LandingPageBlueprint, at: string): LandingPageBlueprint;
export function removeTarget(blueprint: LandingPageBlueprint, sectionId: string, target: CopyTarget): LandingPageBlueprint;
```

- [ ] **3-1. 실패하는 테스트를 쓴다.** 먼저 공용 픽스처를 만든다

```ts
import { describe, expect, it } from "vitest";
import {
  validateEvidenceBinding, collectUnverified, verifyEvidenceStructure,
  demoteToAsk, applyUserEdit, acknowledgeAll, removeTarget,
} from "./pdp.evidence";
import type { CopyEvidence, LandingPageBlueprint, SectionBlueprint } from "./types";

const SOURCE = "요가 강의를 팝니다. 8주 과정이고 초보자도 할 수 있어요.";

function section(evidence: CopyEvidence[], overrides: Partial<SectionBlueprint> = {}): SectionBlueprint {
  return {
    section_id: "S1", section_name: "히어로", goal: "",
    headline: "8주면 충분합니다", headline_en: "",
    subheadline: "수강생 3,000명이 선택했습니다", subheadline_en: "",
    bullets: ["초보자도 가능"], bullets_en: [],
    trust_or_objection_line: "", trust_or_objection_line_en: "",
    CTA: "", CTA_en: "", layout_notes: "", compliance_notes: "",
    image_id: "IMG_S1", purpose: "", prompt_ko: "요가 수업 장면", prompt_en: "yoga class",
    negative_prompt: "", style_guide: "", reference_usage: "",
    evidenceVersion: 1, evidence,
    ...overrides,
  };
}

function plan(...sections: SectionBlueprint[]): LandingPageBlueprint {
  return { executiveSummary: "", scorecard: [], blueprintList: [], sections };
}

const quotedHeadline: CopyEvidence = {
  target: { slot: "headline" }, value: "8주면 충분합니다", kind: "quoted", quote: "8주 과정",
};
const sampleSub: CopyEvidence = {
  target: { slot: "subheadline" }, value: "수강생 3,000명이 선택했습니다",
  kind: "sample", note: "실제 수강생 수",
};
```

```ts
describe("근거 유효성", () => {
  it("문구가 그대로면 fresh", () => {
    expect(validateEvidenceBinding(section([quotedHeadline]), quotedHeadline)).toBe("fresh");
  });

  it("문구를 고치면 stale", () => {
    const edited = section([quotedHeadline], { headline: "12주 과정입니다" });
    expect(validateEvidenceBinding(edited, quotedHeadline)).toBe("stale");
  });

  it("target 이 사라지면 dangling", () => {
    const ev: CopyEvidence = { target: { slot: "bullet", index: 3 }, value: "x", kind: "rhetoric" };
    expect(validateEvidenceBinding(section([ev]), ev)).toBe("dangling");
  });
});

describe("미확인 수집", () => {
  it("확인 안 한 sample 을 모은다", () => {
    const items = collectUnverified(plan(section([quotedHeadline, sampleSub])));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sectionId: "S1", target: { slot: "subheadline" }, kind: "sample", note: "실제 수강생 수",
    });
  });

  it("acknowledgedAt 이 찍힌 sample 은 빠진다", () => {
    const acked = { ...sampleSub, acknowledgedAt: "2026-07-29T00:00:00.000Z" };
    expect(collectUnverified(plan(section([acked])))).toHaveLength(0);
  });

  it("stale 이 된 근거는 확인을 잃고 다시 모인다", () => {
    const acked = { ...sampleSub, acknowledgedAt: "2026-07-29T00:00:00.000Z" };
    const edited = section([acked], { subheadline: "수강생 9,000명이 선택했습니다" });
    expect(collectUnverified(plan(edited))).toHaveLength(1);
  });

  it("evidenceVersion 이 없는 섹션은 통째로 건너뛴다", () => {
    const old = section([sampleSub], { evidenceVersion: undefined });
    expect(collectUnverified(plan(old))).toHaveLength(0);
  });

  // 같은 방식으로: ask 는 항상 모은다 / quoted·rhetoric·user 는 모으지 않는다
});

describe("구조 검증", () => {
  it("quote 가 원문에 없으면 bad_quote", () => {
    const fake = { ...quotedHeadline, quote: "원문에 없는 문장" };
    const failures = verifyEvidenceStructure(plan(section([fake, sampleSub])), SOURCE);
    expect(failures).toContainEqual({ sectionId: "S1", target: { slot: "headline" }, reason: "bad_quote" });
  });

  it("사실 표지가 있는데 근거가 없으면 missing", () => {
    // subheadline 에 "3,000명" 이 있는데 근거를 빼면 missing
    const failures = verifyEvidenceStructure(plan(section([quotedHeadline])), SOURCE);
    expect(failures.some((f) => f.reason === "missing")).toBe(true);
  });

  it("숫자가 든 rhetoric 은 rhetoric_with_fact", () => {
    const disguised: CopyEvidence = {
      target: { slot: "subheadline" }, value: "수강생 3,000명이 선택했습니다", kind: "rhetoric",
    };
    const failures = verifyEvidenceStructure(plan(section([quotedHeadline, disguised])), SOURCE);
    expect(failures.some((f) => f.reason === "rhetoric_with_fact")).toBe(true);
  });

  // 같은 방식으로: duplicate / unknown_target / banned(sample 문구가 금지 분류) /
  // user 는 quote 대조 대상이 아니다
});

describe("강등", () => {
  it("bad_quote 는 그 target 을 ask 로 내린다", () => {
    const fake = { ...quotedHeadline, quote: "원문에 없는 문장" };
    const before = plan(section([fake, sampleSub]));
    const after = demoteToAsk(before, verifyEvidenceStructure(before, SOURCE));
    expect(after.sections[0].headline).toBe("");
    const ev = after.sections[0].evidence?.find((e) => e.target.slot === "headline");
    expect(ev?.kind).toBe("ask");
    expect(ev?.note).toBeTruthy();
  });

  it("unknown_target 은 근거만 버리고 실제 필드를 건드리지 않는다", () => {
    const ghost: CopyEvidence = { target: { slot: "bullet", index: 7 }, value: "x", kind: "sample", note: "n" };
    const before = plan(section([quotedHeadline, sampleSub, ghost]));
    const after = demoteToAsk(before, verifyEvidenceStructure(before, SOURCE));
    expect(after.sections[0].bullets).toEqual(["초보자도 가능"]);
    expect(after.sections[0].evidence?.some((e) => e.target.slot === "bullet")).toBe(false);
  });
});

describe("확인 화면 동작", () => {
  it("고치면 user 가 되고 value 가 새 문구로 바뀐다", () => {
    const after = applyUserEdit(plan(section([sampleSub])), "S1", { slot: "subheadline" }, "수강생 42명");
    expect(after.sections[0].subheadline).toBe("수강생 42명");
    expect(after.sections[0].evidence?.[0]).toMatchObject({ kind: "user", value: "수강생 42명" });
    expect(collectUnverified(after)).toHaveLength(0);
  });

  it("확인하면 acknowledgedAt 이 찍히고 kind 는 sample 로 남는다", () => {
    const after = acknowledgeAll(plan(section([sampleSub])), "2026-07-29T01:00:00.000Z");
    expect(after.sections[0].evidence?.[0]).toMatchObject({
      kind: "sample", acknowledgedAt: "2026-07-29T01:00:00.000Z",
    });
    expect(collectUnverified(after)).toHaveLength(0);
  });

  it("빼면 스칼라는 빈 문자열이 되고 근거가 사라진다", () => {
    const after = removeTarget(plan(section([quotedHeadline, sampleSub])), "S1", { slot: "subheadline" });
    expect(after.sections[0].subheadline).toBe("");
    expect(after.sections[0].evidence?.some((e) => e.target.slot === "subheadline")).toBe(false);
  });

  // 같은 방식으로: 불릿을 빼면 배열에서 빠지고 뒤 근거의 인덱스가 당겨진다
});
```

- [ ] **3-2. 실패 확인** — `npx vitest run src/pdp.evidence.test.ts`
- [ ] **3-3. 구현한다.** `verifyEvidenceStructure` 는 섹션마다
  ① `evidenceVersion` 이 없으면 건너뛴다 ② 근거의 `target` 이 실재하는지
  ③ 같은 `targetKey` 가 둘 이상인지 ④ `quoted` 의 `quote` 가 `sourceText` 에 있는지
  ⑤ `sample` 문구가 `scanBannedClaims` 에 걸리는지 ⑥ `rhetoric` 문구에
  `containsFactualMarker` 가 참인지 ⑦ 사실 표지가 있는 문구에 근거가 없는지 검사한다
- [ ] **3-4. 통과 확인**
- [ ] **3-5. 커밋** — `feat(pdp): 근거 유효성·미확인 수집·구조 검증·강등을 더한다`

---

## Task 4: 손잡이를 프롬프트에 싣고 근거를 받는다

**파일**
- 생성: `packages/pdp-core/src/pdp.copy-intensity.ts`
- 수정: `packages/pdp-core/src/pdp.text-plan.ts` (프롬프트·스키마·정규화·`planFromText`)
- 수정: `packages/pdp-core/src/index.ts` (내보내기)
- 테스트: `packages/pdp-core/src/pdp.text-plan.evidence.test.ts`

**인터페이스**

```ts
export function intensityRules(value: CopyIntensity): string;
export function gapPolicyRules(value: GapPolicy): string;
```

**구현 지점**
1. `SECTION_SCHEMA.properties` 에 `evidence` 배열을 더한다
   (`target: { slot, index }`, `value`, `kind`, `quote`, `note`)
2. `BLUEPRINT_RULES` 뒤에 근거 규칙·강도 규칙·빈칸 규칙을 붙인다
   (`buildTextBlueprintPrompt` 가 두 손잡이를 인자로 받는다 — **기본값 있는 선택 인자**)

   근거 규칙에 반드시 넣을 문장 두 개(설계 §3-1):
   - "문장 하나(target)에 근거는 **하나만** 단다."
   - "한 문장에 여러 성격이 섞이면 **가장 위험한 것**을 고른다. sample > ask > quoted > rhetoric.
     예: 인용한 사실과 네가 채운 수치가 한 문장에 함께 있으면 그 문장은 sample 이다."
3. `normalizeSection` 이 `evidence` 를 정규화한다 — 설계 §3-3 절단을 여기서 한다
4. `planFromText` 가 손잡이를 프롬프트로 넘기고, 재생성 루프 조건에
   `verifyEvidenceStructure(...).length > 0` 을 더한다. 소진 시 `demoteToAsk`

- [ ] **4-1. 실패하는 테스트를 쓴다** — 기존 `TextPlanDeps` 주입 방식을 그대로 쓴다
  (`pdp.text-plan.test.ts` 의 `scriptedDeps` 패턴 참고)

```ts
describe("근거 정규화", () => {
  it("모델이 만든 user 를 sample 로 내린다", async () => {});
  it("모델이 만든 acknowledgedAt 을 지운다", async () => {});
  it("note 없는 ask 는 구조 실패로 잡힌다", async () => {});
  it("evidenceVersion 을 1 로 찍는다", async () => {});
});

describe("손잡이", () => {
  it("copyIntensity 가 프롬프트에 실린다", async () => {
    // prompts[1] 에 강도 규칙 문장이 포함되는지
  });
  it("gapPolicy 가 프롬프트에 실린다", async () => {});
  it("손잡이를 안 주면 normal·ask 로 동작한다", async () => {});
});

describe("구조 실패 재생성", () => {
  it("구조가 어긋나면 한 번 더 만든다", async () => {});
  it("재시도를 소진하면 그 자리를 ask 로 내리고 결과는 돌려준다", async () => {});
});
```

- [ ] **4-2. 실패 확인** — `npx vitest run src/pdp.text-plan.evidence.test.ts`
- [ ] **4-3. 구현한다.** `gapPolicy` 의 `sample` 은 **아직 프롬프트에서 켜지 않는다**
  (Task 8에서 켠다). 지금은 `omit`·`ask` 만 동작하고 `sample` 이 와도 `ask` 로 취급한다
- [ ] **4-4. 통과 확인 + 회귀** — `cd packages/pdp-core && npx vitest run`
  기존 테스트가 전부 그대로 통과해야 한다
- [ ] **4-5. 커밋** — `feat(pdp): 손잡이를 프롬프트에 싣고 근거를 함께 받는다`

---

## Task 5: 라우트가 손잡이를 넘긴다

**파일**
- 수정: `apps/web/app/api/pdp/plan-from-text/route.ts`

- [ ] **5-1. 값 검증을 붙인다.** 허용된 값이 아니면 기본값으로 떨어뜨린다.
  잘못된 값으로 400을 내지 않는다 — 구성안 생성이 손잡이 오타로 죽으면 손해가 더 크다

```ts
const INTENSITIES: CopyIntensity[] = ["plain", "normal", "strong", "max"];
const POLICIES: GapPolicy[] = ["omit", "ask", "sample"];
const copyIntensity = INTENSITIES.includes(body.copyIntensity as CopyIntensity)
  ? (body.copyIntensity as CopyIntensity) : "normal";
const gapPolicy = POLICIES.includes(body.gapPolicy as GapPolicy)
  ? (body.gapPolicy as GapPolicy) : "ask";
```

- [ ] **5-2. `planFromText` 에 넘긴다**
- [ ] **5-3. 확인** — `pnpm typecheck`
- [ ] **5-4. 커밋** — `feat(web): 글기반 생성 요청에 손잡이 두 개를 싣는다`

---

## Task 6: 서버 게이트

**파일**
- 생성: `apps/web/lib/evidence-gate.ts`
- 수정: `apps/web/app/api/pdp/images/route.ts` · `batch/route.ts`
- 테스트: `apps/web/app/api/pdp/images/__tests__/gate.test.ts` (신규 디렉터리)

**인터페이스**

```ts
/** 미확인이 남아 있으면 거절 응답을 돌려준다. 통과하면 null. */
export function rejectIfUnverified(sections: SectionBlueprint[]): Response | null;
```

판정 규칙
- `evidenceVersion` 이 없는 섹션 → 통과 (구버전)
- `evidenceVersion: 1` 인데 `evidence` 가 없거나 비었다 → **거절**
- `collectUnverified` 가 비어 있지 않다 → **거절**
- `mergeArtDirection` 이후를 가정해 `prompt_en` 에 `scanBannedClaims` 를 돌린다 → 걸리면 **거절**

- [ ] **6-1. 실패하는 테스트를 쓴다.** 라우트 테스트는 지금 없으므로 새로 만든다.
  `POST` 를 직접 부르고 `Request` 를 손으로 만든다

```ts
it("미확인 sample 이 있으면 400", async () => {});
it("evidenceVersion 은 1 인데 evidence 가 없으면 400", async () => {});
it("evidenceVersion 이 없는 구버전 섹션은 통과", async () => {});
it("prompt_en 에 금지 문구가 있으면 400", async () => {});
it("단건 라우트는 크레딧 예약 전에 거절한다", async () => {
  // reserveAiUsage 를 감시해 호출되지 않았음을 확인
});
```

- [ ] **6-2. 실패 확인** — `cd apps/web && npx vitest run` (없으면 vitest 설정을 먼저 더한다)
- [ ] **6-3. 구현한다.** `images/route.ts` 는 **본문을 먼저 읽고 게이트를 통과한 뒤**
  `reserveAiUsage` 를 부르도록 순서를 바꾼다. 본문 파싱 실패는 지금처럼 400
- [ ] **6-4. 통과 확인**
- [ ] **6-5. 커밋** — `feat(web): 확인되지 않은 문장이 이미지로 가지 못하게 막는다`

---

## Task 7: 화면 — 손잡이와 확인 단계

**파일**
- 수정: `apps/web/app/create/TextBriefInput.tsx` · `TextModeFlow.tsx` · `ScenarioEditor.tsx`
- 생성: `apps/web/app/create/UnverifiedReview.tsx`

- [ ] **7-1. `TextBriefInput` 에 손잡이 두 개를 그린다.** 라디오 또는 세그먼트.
  기본값은 `normal`·`ask`. 값과 `onChange` 는 props 로 받는다(상태는 부모가 갖는다)
- [ ] **7-2. `TextModeFlow` 가 상태를 갖고 `handlePlan` 에 실어 보낸다**
- [ ] **7-3. `TextStage` 에 `unverifiedReview` 를 더한다.**
  순서: `input → scenario → unverifiedReview → keyVisual`.
  `collectUnverified` 가 비면 이 단계를 **건너뛴다**
- [ ] **7-4. `UnverifiedReview.tsx` 를 만든다.** 항목마다 현재 문구·`note`·입력칸·「빼기」.
  하단에 「이대로 진행 (예시 N건을 확인 없이 사용합니다)」.
  동작은 `applyUserEdit` · `removeTarget` · `acknowledgeAll` 을 부른다.
  시각은 화면에서 `new Date().toISOString()` 으로 만들어 인자로 넘긴다
- [ ] **7-5. `ScenarioEditor` 에 배지와 재생성 버튼.** 섹션마다 `sample`·`ask`·`stale` 개수를
  작게 표시하고, 상단에 「설정 바꿔 다시 만들기」를 둔다(손잡이를 다시 고르고 `handlePlan` 재호출)
- [ ] **7-6. 확인 화면 문구는 설계 §5 를 그대로 쓴다.** 임의로 부드럽게 고치지 않는다

> 아래 숫자와 문장은 **예시**입니다. 사실이 아니며 저희가 검증하지 않았습니다.
> 실제 값으로 바꾸거나, 지우거나, 그대로 쓰겠다고 확인해 주세요.
> 확인 후에도 이 표시가 사실인지 확인할 책임은 게시하는 판매자에게 있습니다.

- [ ] **7-7. 초안 왕복 테스트를 더한다** — `apps/web/app/create/__tests__/drafts.test.ts`

```ts
it("초안을 저장했다 불러와도 근거가 남는다", () => {
  // pdp-drafts.ts 의 저장·복원 함수를 그대로 쓰고,
  // evidenceVersion·evidence 가 왕복 후에도 같은지 확인한다
});
```

- [ ] **7-8. 재생성이 근거를 버리는지 확인한다.** 「설정 바꿔 다시 만들기」는
  `blueprint`·`originalBlueprint`·확인 상태를 전부 새 응답으로 갈아끼운다.
  이전 구성안의 `evidence` 가 섞여 남으면 안 된다
- [ ] **7-9. 확인** — `pnpm typecheck && pnpm lint && pnpm test`
- [ ] **7-10. 커밋** — `feat(web): 손잡이 두 개와 예시 확인 단계를 화면에 붙인다`

---

## Task 8: `sample` 을 켠다

**앞의 Task 6이 끝나기 전에는 이 작업을 시작하지 않는다.** 게이트 없이 예시 수치를
노출하면 설계가 말하는 안전 경계가 없다.

**파일**
- 수정: `packages/pdp-core/src/pdp.copy-intensity.ts` (빈칸 규칙에서 `sample` 을 실제로 켠다)
- 수정: `packages/pdp-core/src/pdp.text-plan.ts` (금지 분류는 `sample` 대상에서 제외)
- 테스트: `pdp.text-plan.evidence.test.ts` 에 추가

- [ ] **8-1. 실패하는 테스트를 쓴다**

```ts
it("gapPolicy=sample 이면 채운 값에 sample 딱지가 붙는다", async () => {});
it("gapPolicy=omit 이면 sample 이 하나도 없다", async () => {});
it("금지 분류는 sample 로 채우지 않고 ask 로 남는다", async () => {});
```

- [ ] **8-2. 실패 확인 → 8-3. 구현 → 8-4. 통과 확인**
- [ ] **8-5. 커밋** — `feat(pdp): 빈칸을 예시로 채우는 선택지를 연다`

---

## Task 9: 마무리 — 전체 검증과 실측

- [x] **9-1. 전체 검증** — `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
  네 개 전부 0. 결과를 그대로 보고한다
- [ ] **9-2. 실측 1회(로컬).** 리포 루트에 임시 `.mts` 를 만들고
  `node --import tsx` 로 `planFromText` 를 실제 Gemini 로 부른다.
  같은 무형 상품 텍스트로 `plain`·`max` 를 각각 돌려 결과를 나란히 본다.
  확인할 것: ① 문장이 실제로 세졌는가 ② 사실 주장 집합이 크게 벌어지지 않았는가
  ③ `sample` 이 확인 화면에 잡히는가. **끝나면 임시 파일을 지운다**
- [ ] **9-3. 커밋** — `chore(pdp): 실측 결과를 계획 문서에 남긴다` (관찰한 것을 이 파일 하단에 적는다)

---

## 완료 기준

- 손잡이 두 개가 입력 화면에 있고, 시나리오 화면에서 다시 만들 수 있다
- 미확인 `sample`·`ask` 가 남아 있으면 이미지가 생성되지 않는다 — 화면과 서버 양쪽,
  그리고 **크레딧 예약 전에** 거절된다
- 문구를 고치면 확인이 자동으로 무효가 된다
- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` 전부 0
- 설계 §7-1 의 15개 항목이 테스트로 존재한다

---

## 2026-07-29 구현 후 검증 기록

- `pnpm typecheck`: 통과
- `pnpm lint`: 통과. 기존 `<img>` 경고 9건만 남음
- `pnpm test`: 통과. `pdp-core` 271개, `redesign-core` 38개, `web` 8개
- `pnpm build`: 통과. Next.js 15.5.21 프로덕션 빌드와 정적 페이지 24개 생성 완료

### Gemini 실측 시도

동일한 온라인 글쓰기 코칭 입력과 `gapPolicy: "sample"`로 `plain`·`max`를 차례로 호출하는
임시 `.mts`를 만들고 `node --env-file=.env.local --import tsx`로 실행했다. 로컬 환경에
`GOOGLE_API_KEY`와 `GEMINI_API_KEY`가 모두 없어 모델 호출 전에 중단됐다. 키 값이나 모델
응답은 관측하지 못했으므로 문장 강도, 사실 주장 집합, `sample` 수집 여부에 대한 실측 결론을
기록하지 않는다. 임시 파일은 삭제했다.

### Gemini 실측 (2026-07-29, 운영 호스트 키로 재시도 — 완료)

입력: 요가 강의 6줄(8주 과정 · 매트 하나 · 주 3회 영상 · 채팅방 질문 · 강사 10년).
설정: `outputMode: "full-image"`, `gapPolicy: "sample"`, 강도만 바꿔 2회 호출. 이미지는 만들지 않았다.

| | plain | max |
|---|---|---|
| 소요 | 207초 | 200초 |
| 섹션 | 6개 | 5개 |
| 딱지 | `rhetoric` 12 · `quoted` 6 | `rhetoric` 19 · `quoted` 6 · `ask` 1 |
| **사실 주장 자리** | **6** | **6** |

**① 문장이 실제로 세졌는가 — 그렇다.**

```
plain  H: 집에서 매트 하나로            S: 8주 과정입니다
max    H: 퇴근 후 요가원, 가는 길부터 지치나요?
       S: 남들 시선 신경 쓰느라 내 몸에 집중하지 못했던 시간들.
```

`max` 는 도발적 질문으로 열고 불릿으로 불편을 쪼갠다(`몸매가 드러나는 옷이 부담스러워서` 등).
`plain` 은 사실을 그대로 놓는다. 의도한 차이가 눈에 보인다.

**② 사실 주장이 늘었는가 — 아니다. 6개로 같았고, 둘 다 전부 `quoted` 였다.**
설계 §2-1이 의도한 성질("강도를 올려도 사실 주장이 새로 생기지 않는다")이 실측에서 성립했다.
단, 1회 관찰이고 모델은 확률적이므로 이것을 보장으로 읽으면 안 된다.

**③ `sample` 이 잡히는가 — 이번 실측으로는 확인하지 못했다.**
`gapPolicy: "sample"` 이었는데도 두 번 다 `sample` 딱지가 **0개**였다. 모델이 예시 수치를
지어내지 않고 원문 근거만으로 카피를 썼다. 원문이 6줄로 비교적 충실했던 것이 이유로 보인다.
`sample` 경로는 단위 테스트로만 검증된 상태다 — 더 빈약한 입력으로 다시 관찰해야 한다.

**부수 관찰**
- 호출당 200초. 재생성 루프를 도는 만큼 늘어난다. 사용자 대기 시간으로는 긴 편이다
- 모델이 준 `section_id` 가 `sec_01`·`sec_2` 처럼 제각각이다(`S1` 형식이 아님). 동작에는
  문제가 없지만 화면에 그대로 보이는 값이라 일관성은 없다

### sample 경로 실측 (2026-07-29 — 결함 발견 후 수정, 재확인 완료)

강도 실측에서 `sample` 이 한 번도 안 나온 것이 이상해 **빈약한 입력**으로 다시 봤다.

입력: `"요가 강의 팝니다"` 한 줄 · `gapPolicy: "sample"` · 216초

| | 결과 |
|---|---|
| 딱지 | `rhetoric` 6 · `ask` 9 · **`sample` 0** |
| 헤드라인·서브헤드라인 | **10칸 중 9칸이 비었다** |

**원인 — 우리 코드가 멀쩡한 카피를 지우고 있었다.** 모델 원응답을 가로채 강등 전
구성안을 보니 카피는 충실했다("퇴근 후 어깨가 돌처럼 굳어있나요?"). 구조 실패는
전부 `bad_quote` 5건이었다. 원문이 8글자뿐이라 인용할 것이 없는데 모델이 자기가 쓴
문장에 `quoted` 를 달았고, 강등이 그 문구를 통째로 비웠다. 꼬리표를 잘못 단 벌이
문장 삭제였던 셈이다. `sample` 딱지가 두 번의 실측에서 모두 0이었던 이유도 이것이다 —
예시로 채우는 길이 강등 단계에서 막혀 있었다.

**조치:** 강등이 `gapPolicy` 를 따르게 했다. 원문에 없는 문장은 곧 우리가 지어낸
값이므로, `sample` 정책에서는 지우지 않고 `sample` 로 **표시**한다. 금지 분류만
정책과 무관하게 계속 지운다.

**재실측(수정 후, 같은 입력):**

| | 수정 전 | 수정 후 |
|---|---|---|
| 빈칸 | 9개 | **0개** |
| `sample` 표시 | 0건 | **2건** |

두 건 다 원문에 없는 "20분"이었다("단 20분이면 굳어있던 몸이 가벼워집니다").
지어낸 숫자만 정확히 잡고 나머지 카피는 살아남았다.
