# 「쉽게」 1단계 — 사진 역할과 상세페이지 안내 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「쉽게」에 붙인 사진을 사용자 말대로 제품 유지·인물 유지·분위기 참고로 나눠 이미지 만들기에 넘기고, 모르면 묻고, 상세페이지 요청은 안내로 끝낸다.

**Architecture:** 판단을 둘로 나눈다 — ⓑ1(말·주문·상세페이지, 지금 판단을 넓힘)과 ⓑ2(사진 역할, 새 판단). 사진 읽기(ⓐ)는 그림 턴에만, 단추로 안 고른 사진만 한다. 규칙은 전부 `app/easy/` 의 순수 함수로 두고 값으로 잰다. 라우트는 그것을 부르고 기존 포스터 라우트 셋에 칸을 채워 넘길 뿐이다. 이미지 만들기·카드뉴스 코드는 0줄.

**Tech Stack:** Next.js 15 App Router, TypeScript, vitest 4, pnpm 9 워크스페이스(`@fixup/shared` · `@fixup/poster-core` · `@fixup/sns-core`), Anthropic/OpenAI 구조화 응답(`lib/llm/structured.ts`).

**Spec:** `docs/superpowers/specs/2026-09-30-easy-expansion-design.md` §2 (1단계만). §5 는 Codex 2차 리뷰 대조표.

## Global Constraints

- **작업 폴더:** `C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\easy-cardnews` (가지 `feat/easy-cardnews`). 여기서만 한다
- **master 에 합치지 않고, 배포하지 않고, push 하지 않는다** — 사용자가 말하기 전까지
- **기존 코드 0줄(§2-10):** `git diff --stat $START -- packages/poster-core packages/shared packages/sns-core apps/web/app/api/poster apps/web/app/poster apps/web/app/sns apps/web/app/api/sns apps/web/lib/poster apps/web/lib/reference-images.ts apps/web/lib/membership apps/web/lib/llm supabase` → 0줄
- **고치는 곳은 `apps/web/app/easy` · `apps/web/app/api/easy` · `apps/web/lib/easy` 뿐**(+ `apps/web/scripts/easy-measure`, `docs/`)
- **마이그레이션 없음**(§2-9 B, 2026-09-30 사용자 승인)
- **회원 크레딧:** 판단·사진 읽기·물음·상세페이지 안내는 차감 0
- **판단 모델에 사진 id 를 주지 않는다** — 번호(붙인 순서, 1부터)만 준다
- **물음 문구는 코드가 짓는다** — 판단 모델은 역할만 돌려준다
- **말은 떼어 오지 않는다** — `attachmentIntent` 는 이번 요청의 말 전체거나 빈 글
- **세 목록 포함 관계:** `restyledIds ⊆ personIds ⊆ preservedIds`
- **인물 셈은 장 단위** — `countPreservedPeople` 에 캐릭터 표시 없이 넘긴다
- **매 Task 시작 전** 설계 문서 §2 의 해당 절과 수정할 파일을 **다시 읽는다**(사용자 규칙 `design-recheck.md`)
- **Windows 에서 빌드하지 않는다**(`next build` 금지). 검사는 typecheck · test · lint 로 한다
- 커밋 메시지: `<type>(easy): <한국어 설명>` + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 파일 800줄 이하. `easy-client.tsx` 는 지금 706줄 — 화면 판단은 새 파일로 뺀다

## Review Focus

1. **물음이 떠 있는 동안 사진을 빼거나 더 붙이고 답한다** → 서버는 지금 붙은 사진으로 다시 판단하고, 목록 밖 id 로 고른 값은 버린다. 화면은 사진이 바뀌면 물음을 거둔다. (Task 8 시험 「남의 사진 id 로 고른 값은 버린다」, Task 10 Step 5)
2. **판단 모델이 번호를 빠뜨리거나, 두 번 주거나, 범위 밖·글자 번호를 준다** → 그 사진은 unclear, 분위기로 떨어지지 않는다. (Task 2 시험 「판단 응답 읽기」)
3. **사진 읽기가 전부 실패한다(업체 장애·서명 없는 주소)** → 설명 없이 ⓑ2 에 가고, 말이 쓰임을 안 말했으면 묻는다. (Task 7 시험 「읽기가 전부 실패해도 분위기로 안 보낸다」)
4. **ⓑ2 호출 자체가 실패한다** → 오류를 알리고, 대화에 아무것도 안 남기고, 어떤 라우트도 안 부른다. (Task 8 시험 「역할 판단이 실패하면…」)
5. **물음에 말로 답한다** → 처음 말과 답이 이어져 판단되고, 사용자가 직접 누른 단추만 함께 간다. (Task 10 시험 「말로 답하면…」)

---

## 파일 지도

| 파일 | 할 일 | Task |
|---|---|---|
| `apps/web/app/easy/detail-page.ts` (새) | 상세페이지 안내 문장·주소·판별 | 1 |
| `apps/web/app/easy/chat.ts` | ⓑ1 에 `detail_page` 더하기 | 1 |
| `apps/web/lib/easy/chat-provider.ts` | ⓑ1 틀에 `detail_page`, ⓑ2 틀·`decideRoles` | 1, 2 |
| `apps/web/app/easy/photo-roles.ts` (새) | 역할 타입 · ⓑ2 글 · 응답 읽기 · 설명 만들기 · 고른 값 읽기 · 합치기 · 인물 셈 | 2, 4 |
| `apps/web/lib/easy/read-photos.ts` (새) | 기획과 같은 기계로 사진 읽기 | 2 |
| `apps/web/scripts/easy-measure/*.mts` (새) | §2-11 실측 | 3 |
| `apps/web/app/easy/photo-check.ts` (새) | ⓪ id 정리·누락 · ⓒ 장수 상한 | 5 |
| `apps/web/app/easy/photo-fields.ts` (새) | 역할 → 포스터 칸, 말 보내기 조건 | 6 |
| `apps/web/app/easy/photo-turn.ts` (새) | ⓒ→ⓐ→ⓑ2→ⓓ 잇기(의존성 주입) | 7 |
| `apps/web/app/api/easy/generate/route.ts` | ⓪ · 계량기 · 상세페이지 · 사진 턴 · 칸 | 1, 8 |
| `apps/web/app/easy/options.ts` · `_components/load.ts` | 「만든 조건」에 사진 역할 | 9 |
| `apps/web/app/easy/photo-ask-state.ts` (새) | 물음 화면 상태 | 10 |
| `apps/web/app/easy/_components/photo-ask.tsx` (새) | 물음 화면 | 10 |
| `apps/web/app/easy/easy-client.tsx` · `_components/message.tsx` | 물음 잇기 · 상세페이지 단추 | 10 |

시험 파일은 각 폴더의 `__tests__/` 에 둔다(저장소 관례).

**시험 돌리는 법** — 워크트리 뿌리에서:

```bash
pnpm --filter @fixup/web exec vitest run <apps/web 기준 경로>
```

---

### Task 0: 준비 — 설치 · 기준선 · 문서 커밋

**Files:** 없음(설치), `docs/superpowers/specs/2026-09-30-easy-expansion-design.md`, `docs/superpowers/plans/2026-09-30-easy-photo-roles.md`

- [ ] **Step 1: 워크트리에 패키지를 설치한다** (지금 `node_modules` 가 없다)

```bash
cd "C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-cardnews"
pnpm install --frozen-lockfile
```
Expected: 끝에 `Done` — 오류 없음

- [ ] **Step 2: 기준선 — 지금 「쉽게」 시험이 초록인지**

```bash
pnpm --filter @fixup/web exec vitest run app/easy app/api/easy lib/easy
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0, 타입 오류 0. 통과 수를 적어 둔다. 빨간 것이 있으면 멈추고 사용자에게 알린다(이번 작업 탓이 아니다)

- [ ] **Step 3: 설계 수정과 계획서를 커밋하고 시작점을 적는다**

```bash
git add docs/superpowers/specs/2026-09-30-easy-expansion-design.md docs/superpowers/plans/2026-09-30-easy-photo-roles.md
git commit -m "docs(easy): 1단계 설계에 Codex 2차 리뷰 반영, 구현 계획

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse HEAD
```
나온 해시를 `START` 로 적는다. Task 11 의 0줄 확인이 이것을 쓴다.

---

### Task 1: ⓑ1 — 상세페이지를 가르고 안내로 끝낸다 (§2-3 ⓑ1, §2-7)

**Files:**
- Create: `apps/web/app/easy/detail-page.ts`
- Modify: `apps/web/app/easy/chat.ts` (EasyDecision · 글 · 읽기)
- Modify: `apps/web/lib/easy/chat-provider.ts:43` (`wants` enum)
- Modify: `apps/web/app/api/easy/generate/route.ts` (talk 갈래 뒤에 detail_page 갈래)
- Test: `apps/web/app/easy/__tests__/detail-page.test.ts` (새), `apps/web/app/easy/__tests__/chat.test.ts`, `apps/web/app/api/easy/__tests__/generate-wiring.test.ts`

**Interfaces:**
- Produces: `DETAIL_PAGE_GUIDE: string`, `DETAIL_PAGE_HREF: "/create"`, `isDetailPageGuide(message: { role: string; body: string }): boolean`, `EasyDecision.wants: "image" | "talk" | "detail_page"`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/detail-page.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DETAIL_PAGE_GUIDE, DETAIL_PAGE_HREF, isDetailPageGuide } from "../detail-page";

/**
 * **상세페이지는 「쉽게」에서 안 만든다 — 안내로 끝낸다**(설계 §2-7).
 *
 * 화면은 대화 표에 갈래를 더하지 않고, **이 문장과 똑같은 도우미 줄**에만
 * 단추를 단다. 그래서 판별이 느슨하면 아무 말에나 단추가 붙는다.
 */
describe("상세페이지 안내", () => {
  it("도우미가 남긴 그 문장에만 단추를 단다", () => {
    expect(isDetailPageGuide({ role: "assistant", body: DETAIL_PAGE_GUIDE })).toBe(true);
  });

  it("사용자가 같은 말을 쳐도 단추를 달지 않는다", () => {
    expect(isDetailPageGuide({ role: "user", body: DETAIL_PAGE_GUIDE })).toBe(false);
  });

  it("한 글자라도 다르면 달지 않는다 — 모델이 지은 비슷한 말", () => {
    expect(isDetailPageGuide({ role: "assistant", body: `${DETAIL_PAGE_GUIDE} ` })).toBe(false);
  });

  it("상세페이지 만들기 화면으로 보낸다", () => {
    expect(DETAIL_PAGE_HREF).toBe("/create");
  });
});
```

`apps/web/app/easy/__tests__/chat.test.ts` 맨 끝에 더한다:

```ts
describe("상세페이지를 가른다 (설계 §2-7)", () => {
  it("detail_page 를 읽는다", () => {
    expect(readEasyDecision({ wants: "detail_page", reply: "", ratio: "", look: "" }).wants)
      .toBe("detail_page");
  });

  /** 상세페이지에 대해 **묻는 말**까지 안내로 끝내면 대화가 안 된다. */
  it("만들어 달라는 것과 묻는 말을 가르라고 알린다", () => {
    const prompt = easyChatPrompt([], "상세페이지 만들어줘");

    expect(prompt).toContain("detail_page");
    expect(prompt).toContain("상세페이지 문구 좀 봐줘");
  });
});
```

`apps/web/app/api/easy/__tests__/generate-wiring.test.ts` 맨 끝에 더한다:

```ts
describe("상세페이지 안내 (설계 §2-7)", () => {
  it("프로젝트를 만들기 전에 안내만 남기고 끝낸다", () => {
    const 시작 = generate.indexOf('decision.wants === "detail_page"');
    const 갈래 = generate.slice(시작, generate.indexOf("await createProject("));

    expect(시작).toBeGreaterThan(0);
    expect(갈래).toContain("DETAIL_PAGE_GUIDE");
    expect(갈래).toContain("return Response.json");
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/detail-page.test.ts app/easy/__tests__/chat.test.ts app/api/easy/__tests__/generate-wiring.test.ts
```
Expected: FAIL — `detail-page` 를 못 찾음, `무슨 뜻인지 가리지 못했습니다: "detail_page"`, 갈래 없음

- [ ] **Step 3: 구현한다**

`apps/web/app/easy/detail-page.ts`:

```ts
/**
 * **상세페이지는 「쉽게」에서 만들지 않는다 — 안내로 끝낸다**
 * (설계 §2-7, 2026-09-30 사용자 결정).
 *
 * 안내 문구는 **코드가 정한 한 문장**이다. 모델이 짓게 두면 매번 다른 길을
 * 알려 준다. 화면은 이 문장과 **똑같은 도우미 줄**에만 단추를 단다 — 대화
 * 표에 갈래를 더하지 않아도 다시 열었을 때 단추가 그대로 보인다.
 */
export const DETAIL_PAGE_GUIDE =
  "상세페이지는 「상세페이지 만들기」에서 만듭니다. 섹션마다 문구와 이미지를 확인하면서 만들 수 있어요. 아래 단추로 바로 열 수 있습니다.";

/** 상세페이지 만들기 화면. */
export const DETAIL_PAGE_HREF = "/create";

export function isDetailPageGuide(message: { role: string; body: string }): boolean {
  return message.role === "assistant" && message.body === DETAIL_PAGE_GUIDE;
}
```

`apps/web/app/easy/chat.ts` — 세 곳을 바꾼다.

(1) `EasyDecision.wants` (34줄):

```ts
  /**
   * `image` 면 그림을 만들고, `talk` 면 `reply` 를 대화에 적는다.
   * `detail_page` 면 만들지 않고 안내 한 줄로 끝낸다(설계 §2-7).
   */
  wants: "image" | "talk" | "detail_page";
```

(2) `easyChatPrompt` 의 갈래 설명 — `"         무엇을 적어야 할지 묻는 것 · 잡담.",` 바로 뒤에 넣는다:

```ts
    "  detail_page  **상세페이지**(쇼핑몰 제품을 길게 소개하는 세로 페이지)를 지금",
    "               만들어 달라는 것입니다. 사진을 붙였어도 같습니다.",
    "               상세페이지에 대해 **묻는 말**(「상세페이지 문구 좀 봐줘」)은 talk 입니다.",
```

그리고 `"`image` 면 `reply` 는 빈 글로 두세요. 이미지가 곧 답입니다.",` 바로 뒤에:

```ts
    "`detail_page` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다.",
```

(3) `readEasyDecision` 의 검사(163줄):

```ts
  if (wants !== "image" && wants !== "talk" && wants !== "detail_page") {
```

`apps/web/lib/easy/chat-provider.ts:43`:

```ts
      wants: { type: "string", enum: ["image", "talk", "detail_page"] },
```

`apps/web/app/api/easy/generate/route.ts` — import 에 한 줄:

```ts
import { DETAIL_PAGE_GUIDE } from "../../../easy/detail-page";
```

`if (decision.wants === "talk") { … }` 블록 바로 뒤, `// ① 프로젝트` 앞에:

```ts
    if (decision.wants === "detail_page") {
      /*
       * **상세페이지는 여기서 안 만든다**(설계 §2-7, 2026-09-30 사용자 결정).
       *
       * 안내 한 줄을 남기고 끝낸다. 사진을 읽지도 값이 나가지도 않는다.
       * 화면은 이 문장이 달린 줄에 「상세페이지 만들기 열기」를 단다.
       */
      const saved = await store.appendMessage({ conversationId, role: "assistant", body: DETAIL_PAGE_GUIDE });
      return Response.json({ ok: true, talked: true, message: saved, textModel });
    }
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy app/api/easy
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0, 타입 오류 0

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/easy/detail-page.ts apps/web/app/easy/chat.ts apps/web/lib/easy/chat-provider.ts apps/web/app/api/easy/generate/route.ts apps/web/app/easy/__tests__/detail-page.test.ts apps/web/app/easy/__tests__/chat.test.ts apps/web/app/api/easy/__tests__/generate-wiring.test.ts
git commit -m "feat(easy): 상세페이지 요청은 만들지 않고 안내 한 줄로 끝낸다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ⓑ2 — 역할 판단 글 · 응답 읽기 · 사진 읽기 (§2-3 ⓐ·ⓑ2, §2-4)

**Files:**
- Create: `apps/web/app/easy/photo-roles.ts`
- Create: `apps/web/lib/easy/read-photos.ts`
- Modify: `apps/web/lib/easy/chat-provider.ts` (ⓑ2 틀 · `decideRoles`)
- Test: `apps/web/app/easy/__tests__/photo-roles.test.ts` (새), `apps/web/lib/easy/__tests__/read-photos.test.ts` (새)

**Interfaces:**
- Produces (`photo-roles.ts`):
  - `EASY_PHOTO_ROLES: readonly ["style", "preserve_product", "preserve_person", "preserve_person_restyled"]`
  - `type EasyPhotoRole`, `type JudgedPhotoRole = EasyPhotoRole | "unclear"`
  - `interface EasyPhoto { id: string; title?: string | null; url?: string | null }`
  - `interface PhotoJudgment { role: JudgedPhotoRole; said: boolean }`
  - `interface RoleJudgment { photos: PhotoJudgment[]; conflicting: boolean }`
  - `describePhoto(read: AttachmentRead): string`
  - `easyRolePrompt(input: { words: string; photos: ReadonlyArray<{ description?: string }> }): string`
  - `readRoleJudgment(raw: unknown, count: number): RoleJudgment`
- Produces (`read-photos.ts`): `readEasyPhotos(photos: readonly EasyPhoto[], reader?: GrammarReader): Promise<Record<string, string>>` — id → 설명. 못 읽은 사진은 없다
- Produces (`chat-provider.ts`): `createEasyChatProvider(...)` 가 `{ decide(prompt): Promise<unknown>; decideRoles(prompt): Promise<unknown> }` 를 돌려준다

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/photo-roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AttachmentRead } from "@fixup/poster-core";
import { describePhoto, easyRolePrompt, readRoleJudgment } from "../photo-roles";

/**
 * **붙인 사진을 어떻게 쓸지**(설계 §2-3 ⓑ2 · §2-4).
 *
 * 판단은 모델이 한다. 여기서 재는 것은 **무엇을 물었나**와 **돌아온 답을
 * 어떻게 읽나**다. 읽기가 느슨하면 모르는 사진이 「분위기 참고」로 떨어지고,
 * 지켜야 할 제품이 다시 그려진다 — 가장 비싼 실수다.
 */

const 읽음 = (over: Partial<AttachmentRead> = {}): AttachmentRead => ({
  people: [], staging: "", hasText: false, typeInteraction: null,
  dominantColor: "", accentColor: "", note: "", ...over,
});

describe("사진 설명", () => {
  it("사람 수와 한 사람씩을 적는다", () => {
    const 설명 = describePhoto(읽음({ people: ["왼쪽 — 안경", "오른쪽 — 모자"], staging: "공원에서 둘이 섬" }));

    expect(설명).toContain("사람 2명");
    expect(설명).toContain("왼쪽 — 안경");
    expect(설명).toContain("공원에서 둘이 섬");
  });

  it("사람이 없고 글자가 있으면 그렇게 적는다", () => {
    const 설명 = describePhoto(읽음({ staging: "카페 포스터", hasText: true, note: "제목이 음료 뒤로 깔림" }));

    expect(설명).toContain("사람 없음");
    expect(설명).toContain("글자 있음");
    expect(설명).toContain("제목이 음료 뒤로 깔림");
  });
});

describe("모델에게 보낼 글", () => {
  const 글 = easyRolePrompt({
    words: "1번 제품은 그대로",
    photos: [{ description: "흰 배경의 원두 봉투" }, {}],
  });

  it("사용자 말을 그대로 싣는다", () => {
    expect(글).toContain("1번 제품은 그대로");
  });

  it("붙인 순서대로 번호를 붙인다", () => {
    expect(글).toContain("1번: 흰 배경의 원두 봉투");
    expect(글).toMatch(/2번: \(설명 없음/);
  });

  it("역할 다섯을 다 알려 준다", () => {
    for (const role of ["style", "preserve_product", "preserve_person", "preserve_person_restyled", "unclear"]) {
      expect(글).toContain(role);
    }
  });

  /** 「바꿔 그리지 마」는 지키라는 말이다. 부정문을 쓰임으로 못 읽으면 되묻는다. */
  it("하지 말라는 말도 쓰임이라고 알린다", () => {
    expect(글).toContain("하지 말라는 말도");
  });

  /** 모르면 style 로 두는 순간 제품이 다시 그려진다. */
  it("모르면 style 로 두지 말라고 못 박는다", () => {
    expect(글).toContain("모르면 style 로 두지 마세요");
  });
});

describe("판단 응답 읽기", () => {
  it("번호대로 역할과 said 를 읽는다", () => {
    const 판단 = readRoleJudgment({
      photos: [
        { number: 2, role: "style", said: false },
        { number: 1, role: "preserve_product", said: true },
      ],
      conflicting: false,
    }, 2);

    expect(판단.photos).toEqual([
      { role: "preserve_product", said: true },
      { role: "style", said: false },
    ]);
    expect(판단.conflicting).toBe(false);
  });

  it("빠진 번호는 unclear 다", () => {
    expect(readRoleJudgment({ photos: [{ number: 1, role: "style", said: false }], conflicting: false }, 2).photos[1])
      .toEqual({ role: "unclear", said: false });
  });

  it("모르는 역할은 unclear 다 — 분위기로 떨어지지 않는다", () => {
    expect(readRoleJudgment({ photos: [{ number: 1, role: "place_as_is", said: true }] }, 1).photos[0])
      .toEqual({ role: "unclear", said: false });
  });

  it("범위 밖 · 글자 · 소수 번호는 버린다", () => {
    const 판단 = readRoleJudgment({
      photos: [
        { number: 0, role: "style", said: false },
        { number: 3, role: "style", said: false },
        { number: "1", role: "style", said: false },
        { number: 1.5, role: "style", said: false },
      ],
    }, 2);

    expect(판단.photos).toEqual([{ role: "unclear", said: false }, { role: "unclear", said: false }]);
  });

  /** 한 사진에 답이 둘이면 어느 쪽인지 모른다. */
  it("같은 번호가 두 번 오면 unclear 다", () => {
    const 판단 = readRoleJudgment({
      photos: [
        { number: 1, role: "style", said: false },
        { number: 1, role: "preserve_product", said: true },
      ],
    }, 1);

    expect(판단.photos[0]).toEqual({ role: "unclear", said: false });
  });

  it("unclear 는 said 가 늘 거짓이다", () => {
    expect(readRoleJudgment({ photos: [{ number: 1, role: "unclear", said: true }] }, 1).photos[0]!.said)
      .toBe(false);
  });

  it("said 는 참일 때만 참이다", () => {
    expect(readRoleJudgment({ photos: [{ number: 1, role: "style", said: "yes" }] }, 1).photos[0]!.said)
      .toBe(false);
  });

  it("conflicting 은 참일 때만 참이다", () => {
    expect(readRoleJudgment({ photos: [], conflicting: "true" }, 0).conflicting).toBe(false);
    expect(readRoleJudgment({ photos: [], conflicting: true }, 0).conflicting).toBe(true);
  });

  it("모양이 틀린 응답은 전부 unclear 다", () => {
    expect(readRoleJudgment("엉망", 2)).toEqual({
      photos: [{ role: "unclear", said: false }, { role: "unclear", said: false }],
      conflicting: false,
    });
  });
});
```

`apps/web/lib/easy/__tests__/read-photos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readEasyPhotos } from "../read-photos";

/**
 * **기획이 쓰는 그 기계로 읽는다**(설계 §2-3). 새로 만들면 두 벌이 되고 하나는
 * 곧 낡는다. 여기서 재는 것은 「읽을 수 있는 것만 읽고, 못 읽은 것은 비운다」다.
 */

const 읽은것 = {
  people: ["가운데 — 흰 셔츠"], staging: "회색 벽 앞", hasText: false,
  typeInteraction: null, dominantColor: "", accentColor: "", note: "",
};

function 가짜눈(실패할주소 = "") {
  const 본주소: string[] = [];
  return {
    본주소,
    read: async (input: { prompt: string; imageUrls: string[] }) => {
      본주소.push(...input.imageUrls);
      if (input.imageUrls[0] === 실패할주소) throw new Error("못 읽음");
      return 읽은것;
    },
  };
}

describe("사진 읽기", () => {
  it("사진마다 설명을 돌려준다", async () => {
    const 눈 = 가짜눈();
    const 설명 = await readEasyPhotos([{ id: "a", url: "https://x.test/a.png" }], 눈);

    expect(설명.a).toContain("사람 1명");
    expect(눈.본주소).toEqual(["https://x.test/a.png"]);
  });

  it("주소가 없는 사진은 읽지 않고 비운다", async () => {
    const 눈 = 가짜눈();
    const 설명 = await readEasyPhotos([{ id: "a", url: null }, { id: "b", url: "https://x.test/b.png" }], 눈);

    expect(Object.keys(설명)).toEqual(["b"]);
  });

  it("실패한 사진은 비우고 나머지는 읽는다", async () => {
    const 눈 = 가짜눈("https://x.test/a.png");
    const 설명 = await readEasyPhotos(
      [{ id: "a", url: "https://x.test/a.png" }, { id: "b", url: "https://x.test/b.png" }], 눈);

    expect(Object.keys(설명)).toEqual(["b"]);
  });

  /** 읽을 것이 없으면 눈을 만들지도 않는다 — 열쇠가 없는 곳에서도 안 터진다. */
  it("읽을 것이 없으면 아무것도 안 부른다", async () => {
    expect(await readEasyPhotos([])).toEqual({});
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-roles.test.ts lib/easy/__tests__/read-photos.test.ts
```
Expected: FAIL — `photo-roles`, `read-photos` 를 못 찾음

- [ ] **Step 3: 구현한다**

`apps/web/app/easy/photo-roles.ts`:

```ts
import type { AttachmentRead } from "@fixup/poster-core";

/**
 * **붙인 사진을 어떻게 쓸지**(설계 §2-3 ⓑ2 · §2-4, 2026-09-30 사용자 결정).
 *
 * 「붙인 사진은 무조건 분위기 참고가 아니다. 사용자가 말한 대로 따른다.
 * 정확한 말이 필요하면 AI 가 묻는다.」
 *
 * ── 왜 화면 밖에 있나 ────────────────────────────────────────
 *
 * 무엇을 묻고 돌아온 답을 어떻게 읽을지가 판단이다. 라우트나 `.tsx` 안에 두면
 * 값으로 못 잰다 — `chat.ts` · `ask.ts` 가 지켜 온 방식이다.
 *
 * ── 모르면 묻는다 ────────────────────────────────────────────
 *
 * 읽기가 느슨하면 모르는 사진이 「분위기 참고」로 떨어진다. 그러면 지켜야 할
 * 제품이 다시 그려지고 값은 나간다. **모르는 것은 전부 unclear 로 읽는다** —
 * 묻는 값은 0 이다.
 */

/** 「쉽게」가 쓰는 역할 넷. 이미지 만들기의 `AttachmentRole` 에서 「원본 그대로」를 뺀 것. */
export const EASY_PHOTO_ROLES = [
  "style",
  "preserve_product",
  "preserve_person",
  "preserve_person_restyled",
] as const;

export type EasyPhotoRole = (typeof EASY_PHOTO_ROLES)[number];

/** 판단이 돌려줄 수 있는 것 — 역할 넷에 「모름」. */
export type JudgedPhotoRole = EasyPhotoRole | "unclear";

/** 붙인 사진 한 장. ⓪에서 확인을 마친 것이다. */
export interface EasyPhoto {
  id: string;
  title?: string | null;
  url?: string | null;
}

export interface PhotoJudgment {
  role: JudgedPhotoRole;
  /** 말이 이 사진의 쓰임을 말했나. 역할이 unclear 면 늘 거짓이다. */
  said: boolean;
}

export interface RoleJudgment {
  /** 붙인 순서 그대로. 길이는 사진 수와 같다. */
  photos: PhotoJudgment[];
  /** 말 안에서 같은 사진의 쓰임이 엇갈렸나(「1번 그대로… 아 아니다, 느낌만」). */
  conflicting: boolean;
}

const 모름: PhotoJudgment = { role: "unclear", said: false };
const 아는판단 = new Set<string>([...EASY_PHOTO_ROLES, "unclear"]);

/**
 * 한 장을 읽은 것을 ⓑ2 에 줄 한 줄로 만든다.
 *
 * 역할을 가르는 데 필요한 것만 싣는다 — 사람이 있나(몇 명, 누가), 무엇이
 * 있나, 글자가 있나, 디자인은 어떤가.
 */
export function describePhoto(read: AttachmentRead): string {
  return [
    read.people.length ? `사람 ${read.people.length}명 — ${read.people.join(" / ")}` : "사람 없음",
    read.staging.trim() ? `무엇이 있나: ${read.staging.trim()}` : "",
    read.hasText ? "글자 있음(제목·타이포그래피 등)" : "글자 없음",
    read.note.trim() ? `디자인: ${read.note.trim()}` : "",
  ].filter(Boolean).join(" · ");
}

/**
 * ⓑ2 에 보낼 글.
 *
 * **id 를 주지 않는다.** 번호만 준다 — 번호를 id 로 바꾸는 것은 코드가 한다.
 * 모델이 id 를 되돌려주면 옮겨 적다 틀린다.
 */
export function easyRolePrompt(input: {
  words: string;
  photos: ReadonlyArray<{ description?: string }>;
}): string {
  const 사진줄 = input.photos.map((photo, index) =>
    `${index + 1}번: ${photo.description?.trim() || "(설명 없음 — 말로만 정하세요)"}`);

  return [
    "당신은 사용자가 붙인 사진을 **어떻게 쓸지** 정하는 도우미입니다.",
    "사용자는 이 사진들을 재료로 이미지 한 장을 만들려 합니다.",
    "",
    "사진마다 역할 하나를 고르세요.",
    "",
    "  style                     분위기만 참고 — 레이아웃·색·글씨 느낌만 가져오고 내용은 새로 만든다",
    "  preserve_product          제품 그대로 — 제품·로고·물건의 생김새를 그대로 지킨다",
    "  preserve_person           인물 그대로 — 사람의 얼굴·체형·옷차림을 그대로 지킨다",
    "  preserve_person_restyled  인물 그대로 · 그림체만 — 사람은 그대로 두고 그림 느낌만 다른 사진을 따라간다",
    "  unclear                   모르겠다 — 사용자에게 물어본다",
    "",
    "── 정하는 차례 ──",
    "",
    "1. **사용자 말이 먼저입니다.** 말이 그 사진을 가리키고 쓰임을 말했으면 그대로",
    "   따르고 said 를 true 로 둡니다. 「1번 제품은 그대로」·「이 느낌으로」·",
    "   「1번 사람들을 2번 그림체로」·「제품은 살리고」·「이 사람으로」처럼요.",
    "   「바꿔 그리지 마」처럼 **하지 말라는 말도** 쓰임입니다 — 지키라는 뜻입니다.",
    "2. 말이 사진을 가리키지만 쓰임이 모호하면(「이걸로」·「이거 참고해서」) 사진을",
    "   봅니다. 한 갈래로만 읽히면 그 갈래입니다 — 제품만 찍힌 사진은 preserve_product,",
    "   글자와 디자인이 있는 포스터·광고·카드뉴스는 style. 사람이 있는 사진은 두",
    "   갈래로 읽히므로(사람을 살릴지 느낌만 볼지) unclear. said 는 false 입니다.",
    "3. 사진 이야기가 없으면: 디자인 참고물(포스터·광고·카드뉴스)은 style, 제품·인물",
    "   사진은 unclear. said 는 false 입니다.",
    "4. 설명이 없는 사진은 말로만 정합니다. 말이 쓰임을 말하지 않았으면 unclear 입니다.",
    "",
    "**모르면 style 로 두지 마세요.** 지켜야 할 제품이 다시 그려집니다. 애매하면",
    "unclear 로 두세요 — 묻는 것은 값이 들지 않습니다. 대신 **말에 이미 있는 것은",
    "unclear 로 두지 마세요.** 안 들은 것이 됩니다.",
    "",
    "── 말 안에서 엇갈리나 ──",
    "",
    "같은 사진의 쓰임을 말 안에서 서로 다르게 말했으면(「1번은 그대로 해줘. 아",
    "아니다, 1번은 느낌만」) conflicting 을 true 로 두고, 역할은 **나중에 한 말**을",
    "따릅니다. 아니면 false 입니다.",
    "",
    "── 사진 (붙인 순서) ──",
    ...사진줄,
    "",
    "── 사용자 말 ──",
    input.words,
    "",
    "사진마다 번호 · 역할 · said 를 하나씩 돌려주세요.",
  ].join("\n");
}

/**
 * 돌아온 것을 읽는다. **모르는 것은 전부 unclear 다.**
 *
 * - 범위 밖 · 글자 · 소수 번호는 버린다
 * - 같은 번호가 두 번 오면 그 사진은 unclear — 어느 쪽인지 모른다
 * - 모르는 역할은 unclear
 * - said 는 역할이 있을 때만, 그리고 참일 때만 참
 */
export function readRoleJudgment(raw: unknown, count: number): RoleJudgment {
  const value = raw as { photos?: unknown; conflicting?: unknown } | null;
  const list = value?.photos;
  const entries: unknown[] = Array.isArray(list) ? list : [];

  const 번호별 = new Map<number, Array<{ role?: unknown; said?: unknown }>>();
  for (const entry of entries) {
    const one = entry as { number?: unknown; role?: unknown; said?: unknown } | null;
    const number = one?.number;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > count) continue;
    번호별.set(number, [...(번호별.get(number) ?? []), one!]);
  }

  const photos = Array.from({ length: count }, (_, index): PhotoJudgment => {
    const found = 번호별.get(index + 1);
    if (!found || found.length !== 1) return { ...모름 };
    const { role, said } = found[0]!;
    if (typeof role !== "string" || !아는판단.has(role)) return { ...모름 };
    const judged = role as JudgedPhotoRole;
    return { role: judged, said: judged !== "unclear" && said === true };
  });

  return { photos, conflicting: value?.conflicting === true };
}
```

`apps/web/lib/easy/read-photos.ts`:

```ts
import { readAttachments, type GrammarReader } from "@fixup/poster-core";
import { createPosterAttachmentReader } from "../poster/providers";
import { describePhoto, type EasyPhoto } from "../../app/easy/photo-roles";

/**
 * 붙인 사진을 **이미지 만들기 기획이 쓰는 그 기계로** 읽는다(설계 §2-3 ⓐ).
 *
 * 새로 만들면 두 벌이 되고 하나는 곧 낡는다. 한 장씩 읽는 것도, 실패한 장만
 * 비우는 것도 `readAttachments` 가 이미 한다.
 *
 * **눈은 읽을 것이 있을 때 만든다.** 먼저 만들면 열쇠가 없는 곳에서 읽을 것이
 * 없어도 터진다.
 *
 * 주소 서명이 비어 읽을 수 없는 사진은 설명 없이 ⓑ2 로 간다 — 말이 쓰임을
 * 안 말했으면 묻는다(설계 §2-3).
 */
export async function readEasyPhotos(
  photos: readonly EasyPhoto[],
  reader?: GrammarReader,
): Promise<Record<string, string>> {
  const readable = photos.filter((photo) => Boolean(photo.url));
  if (!readable.length) return {};

  const { reads } = await readAttachments(
    readable.map((photo) => ({ id: photo.id, title: photo.title ?? "사진", url: photo.url! })),
    reader ?? createPosterAttachmentReader(),
  );
  return Object.fromEntries(Object.entries(reads).map(([id, read]) => [id, describePhoto(read)]));
}
```

`apps/web/lib/easy/chat-provider.ts` — (1) import 에 `import { EASY_PHOTO_ROLES } from "../../app/easy/photo-roles";` 를 더한다. (2) `EASY_CHAT_SPEC` 바로 뒤에:

```ts
/**
 * **사진마다 쓰임을 정하는 틀**(설계 §2-3 ⓑ2).
 *
 * 번호만 받는다 — id 는 모델에게 주지 않는다. 틀에 없는 칸은 구조화 응답이
 * 버리므로 `said`·`conflicting` 도 반드시 여기 있어야 한다.
 */
const EASY_ROLE_SPEC: StructuredSpec = {
  name: "easy_photo_roles",
  description: "붙인 사진마다 쓰임(역할)을 정하고, 말이 그 쓰임을 말했는지 적는다.",
  schema: {
    type: "object",
    properties: {
      photos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "integer" },
            role: { type: "string", enum: [...EASY_PHOTO_ROLES, "unclear"] },
            said: { type: "boolean" },
          },
          required: ["number", "role", "said"],
        },
      },
      conflicting: { type: "boolean" },
    },
    required: ["photos", "conflicting"],
  },
};
```

(3) `createEasyChatProvider` 의 두 갈래가 같은 틀 둘을 돌려주게 바꾼다:

```ts
  if (vendor === "openai") {
    const key = environment.OPENAI_API_KEY?.trim();
    if (!key) throw new EasyChatConfigurationError("OPENAI_API_KEY");
    const openai = new OpenAI({ apiKey: key, maxRetries: 2, timeout: 60_000 });
    const 부른다 = (spec: StructuredSpec) => (prompt: string) =>
      new OpenAIStructuredProvider(openai, textModel!, spec).generate(prompt);
    return { decide: 부른다(EASY_CHAT_SPEC), decideRoles: 부른다(EASY_ROLE_SPEC) };
  }

  const key = environment.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new EasyChatConfigurationError("ANTHROPIC_API_KEY");
  const anthropic = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60_000 });
  const model = textModel ?? environment.ANTHROPIC_MODEL?.trim() ?? "claude-sonnet-5";
  const 부른다 = (spec: StructuredSpec) => (prompt: string) =>
    new AnthropicStructuredProvider(anthropic, model, spec).generate(prompt);
  return { decide: 부른다(EASY_CHAT_SPEC), decideRoles: 부른다(EASY_ROLE_SPEC) };
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy lib/easy app/api/easy
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0, 타입 오류 0

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/easy/photo-roles.ts apps/web/lib/easy/read-photos.ts apps/web/lib/easy/chat-provider.ts apps/web/app/easy/__tests__/photo-roles.test.ts apps/web/lib/easy/__tests__/read-photos.test.ts
git commit -m "feat(easy): 사진 역할을 묻는 글과 답 읽기, 기획과 같은 기계로 사진 읽기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: §2-11 실측 — 두 판단을 실제 모델로 잰다 (구현보다 먼저)

사용자 지시: **판단 실측 먼저 → 통과하면 TDD 로 구현.** 이 Task 가 통과하지 않으면 Task 4 로 넘어가지 않는다.

**Files:**
- Create: `apps/web/scripts/easy-measure/cases.mts`
- Create: `apps/web/scripts/easy-measure/run.mts`
- Create: `apps/web/scripts/easy-measure/read-check.mts`
- Create (결과): `docs/easy-measure/2026-09-30-roles.md`, `docs/easy-measure/2026-09-30-read-check.md`

**Interfaces:**
- Consumes: `easyChatPrompt` · `readEasyDecision`(Task 1), `easyRolePrompt` · `readRoleJudgment` · `JudgedPhotoRole`(Task 2), `readEasyPhotos`(Task 2), `createEasyChatProvider().decide/decideRoles`(Task 2), `withLlmMeter` · `readLlmMeter`(`lib/llm/meter.ts`), `createPosterFalClients`(`lib/poster/providers.ts`)

값: 글 모델 호출 약 60번(문장 20개 × 3번) — 대략 $0.3. 사진 확인은 5장 × 몇 번 읽기 — 대략 $0.2.

- [ ] **Step 1: 문장표를 쓴다** — `apps/web/scripts/easy-measure/cases.mts`

```ts
import type { JudgedPhotoRole } from "../../app/easy/photo-roles";

/**
 * §2-11 의 문장표. **설명은 읽기가 돌려줄 모양 그대로** 손으로 쓴다
 * (`describePhoto` 의 모양). 판단만 떼어 재기 위해서다 — 실제 읽기는
 * `read-check.mts` 가 따로 본다.
 */
export const 설명 = {
  제품: "사람 없음 · 무엇이 있나: 흰 배경 위에 갈색 크라프트 원두 봉투 하나가 정면으로 놓여 있음. 봉투에 로고 라벨이 붙어 있음 · 글자 있음(제목·타이포그래피 등)",
  포스터: "사람 없음 · 무엇이 있나: 카페 신메뉴 홍보 포스터. 위에 큰 제목, 가운데 음료 사진, 아래 날짜와 가격 안내 · 글자 있음(제목·타이포그래피 등) · 디자인: 굵은 제목이 음료 뒤로 겹쳐 깔림",
  인물: "사람 1명 — 가운데 — 짧은 검은 머리, 흰 셔츠, 정면을 보며 웃음 · 무엇이 있나: 회색 벽 앞에서 찍은 상반신 사진 · 글자 없음",
  인물2: "사람 1명 — 가운데 — 어깨까지 오는 갈색 머리, 베이지 코트, 걸어가며 옆을 봄 · 무엇이 있나: 도심 거리에서 찍은 전신 사진 · 글자 없음",
  단체: "사람 4명 — 왼쪽에서 첫 번째 — 안경, 파란 후드 / 두 번째 — 긴 생머리, 흰 티셔츠 / 세 번째 — 모자, 체크 셔츠 / 네 번째 — 짧은 머리, 검은 재킷 · 무엇이 있나: 공원 잔디밭에서 네 사람이 어깨동무를 하고 찍은 사진 · 글자 없음",
  일러스트: "사람 1명 — 가운데 — 큰 눈의 애니메이션풍 소녀, 분홍 단발 · 무엇이 있나: 셀 셰이딩으로 그린 애니메이션 일러스트, 배경은 파스텔 하늘 · 글자 없음 · 디자인: 굵은 외곽선과 평면 채색",
} as const;

export interface B1Case { prompt: string; attachments: number; expect: "image" | "talk" | "detail_page" }

export const B1_CASES: B1Case[] = [
  { prompt: "상세페이지 만들어줘", attachments: 0, expect: "detail_page" },
  { prompt: "이 제품 상세페이지 만들어줘", attachments: 1, expect: "detail_page" },
  { prompt: "상세페이지 문구 좀 봐줘", attachments: 0, expect: "talk" },
  { prompt: "안녕하세요", attachments: 1, expect: "talk" },
  { prompt: "이 제품으로 광고 만들어줘", attachments: 1, expect: "image" },
  // 지금 되던 것이 그대로 되는지 — 갈래를 늘리다 깨지면 안 된다.
  { prompt: "해 질 녘 바닷가 포스터 만들어줘", attachments: 0, expect: "image" },
  { prompt: "방금 그린 거 왜 그렇게 나왔어?", attachments: 0, expect: "talk" },
];

export interface B2Case {
  name: string;
  words: string;
  /** 붙인 순서. `undefined` 는 읽기가 없는 사진이다. */
  photos: Array<string | undefined>;
  expect: JudgedPhotoRole[];
  said: boolean[];
  conflicting?: boolean;
}

export const B2_CASES: B2Case[] = [
  { name: "제품", words: "이 제품으로 광고 만들어줘", photos: [설명.제품], expect: ["preserve_product"], said: [true] },
  { name: "포스터 참고", words: "이거 참고해서 카페 포스터", photos: [설명.포스터], expect: ["style"], said: [false] },
  { name: "이야기 없음", words: "카페 포스터 만들어줘", photos: [설명.제품, 설명.포스터], expect: ["unclear", "style"], said: [false, false] },
  { name: "단체→그림체", words: "1번 사람들을 2번 그림체로", photos: [설명.단체, 설명.일러스트], expect: ["preserve_person_restyled", "style"], said: [true, true] },
  { name: "제품 살리기", words: "제품은 살리고 배경만 바꿔", photos: [설명.제품], expect: ["preserve_product"], said: [true] },
  { name: "이 사람으로", words: "이 사람으로 프로필 만들어줘", photos: [설명.인물], expect: ["preserve_person"], said: [true] },
  { name: "이 느낌으로", words: "이 느낌으로", photos: [설명.인물], expect: ["style"], said: [true] },
  { name: "인물 모호", words: "이거 참고해서", photos: [설명.인물], expect: ["unclear"], said: [false] },
  { name: "두 사람", words: "두 사람 다 그대로 넣어줘", photos: [설명.인물, 설명.인물2], expect: ["preserve_person", "preserve_person"], said: [true, true] },
  { name: "부정문", words: "이 제품 절대 바꿔 그리지 마", photos: [설명.제품], expect: ["preserve_product"], said: [true] },
  { name: "지시 둘", words: "1번은 제품 그대로, 2번은 색감만", photos: [설명.제품, 설명.포스터], expect: ["preserve_product", "style"], said: [true, true] },
  { name: "정정", words: "1번 제품 그대로 해줘. 아 아니다, 1번은 느낌만", photos: [설명.제품], expect: ["style"], said: [true], conflicting: true },
  { name: "읽기 없음", words: "카페 포스터 만들어줘", photos: [undefined], expect: ["unclear"], said: [false] },
];
```

- [ ] **Step 2: 재는 도구를 쓴다** — `apps/web/scripts/easy-measure/run.mts`

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_TEXT_MODEL } from "@fixup/shared";
import { createEasyChatProvider } from "../../lib/easy/chat-provider";
import { readLlmMeter, withLlmMeter } from "../../lib/llm/meter";
import { easyChatPrompt, readEasyDecision } from "../../app/easy/chat";
import { easyRolePrompt, readRoleJudgment, type RoleJudgment } from "../../app/easy/photo-roles";
import { B1_CASES, B2_CASES, type B2Case } from "./cases.mts";

/**
 * §2-11 실측 — 두 판단(ⓑ1 · ⓑ2)을 실제 모델로 문장마다 여러 번 돌린다.
 *
 *   pnpm exec tsx --env-file=<.env.local> apps/web/scripts/easy-measure/run.mts
 *
 * 환경변수: RUNS(기본 3), TEXT_MODEL(기본 DEFAULT_TEXT_MODEL).
 * 치명이나 어긋남이 하나라도 있으면 끝 코드 1 이다.
 */

const RUNS = Number(process.env.RUNS ?? "3");
const 모델 = process.env.TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
const 지킬것 = new Set(["preserve_product", "preserve_person", "preserve_person_restyled"]);

async function 잰다<T>(call: () => Promise<T>) {
  return withLlmMeter(async () => {
    const 시작 = Date.now();
    const value = await call();
    return { value, ms: Date.now() - 시작, usd: readLlmMeter().usd };
  });
}

/** 한 번 돌린 결과의 문제들. 「치명:」으로 시작하는 것이 §2-11 의 통과 기준이다. */
function b2문제(one: B2Case, got: RoleJudgment): string[] {
  const 문제: string[] = [];
  one.expect.forEach((want, i) => {
    const have = got.photos[i]!;
    if ((지킬것.has(want) || want === "unclear") && have.role === "style") {
      문제.push(`치명: ${i + 1}번을 분위기로 보냄`);
    }
    if (one.said[i] && want !== "unclear" && have.role === "unclear") {
      문제.push(`치명: ${i + 1}번 말에 있는데 되물음`);
    }
    if (have.role !== want) 문제.push(`${i + 1}번 역할 ${have.role} ≠ ${want}`);
    if (have.said !== one.said[i]) 문제.push(`${i + 1}번 said ${have.said} ≠ ${one.said[i]}`);
  });
  if (one.conflicting && !got.conflicting) 문제.push("치명: 정정을 엇갈림으로 못 알아봄");
  if (!one.conflicting && got.conflicting) 문제.push("엇갈림이 아닌데 엇갈림");
  return 문제;
}

async function main() {
  const provider = createEasyChatProvider(process.env, 모델);
  const 줄: string[] = [
    `# 「쉽게」 판단 실측 — ${new Date().toISOString()}`,
    "",
    `글 모델 \`${모델}\` · 문장마다 ${RUNS}번 · 설계 §2-11`,
    "",
  ];
  let 치명 = 0;
  let 어긋남 = 0;
  let 합계 = 0;
  const 걸린시간: number[] = [];

  줄.push("## ⓑ1 말인가 주문인가", "", "| 문장 | 사진 | 기대 | 결과 | ms | $ |", "|---|---|---|---|---|---|");
  for (const one of B1_CASES) {
    for (let run = 0; run < RUNS; run += 1) {
      const r = await 잰다(() => provider.decide(easyChatPrompt([], one.prompt, one.attachments)));
      let got: string;
      try { got = readEasyDecision(r.value).wants; } catch { got = "오류"; }
      합계 += r.usd;
      if (got !== one.expect) 어긋남 += 1;
      줄.push(`| ${one.prompt} | ${one.attachments} | ${one.expect} | ${got === one.expect ? got : `**${got}**`} | ${r.ms} | ${r.usd.toFixed(4)} |`);
    }
  }

  줄.push("", "## ⓑ2 사진 역할", "", "| 이름 | 말 | 결과(역할/said) | 엇갈림 | 문제 | ms | $ |", "|---|---|---|---|---|---|---|");
  for (const one of B2_CASES) {
    for (let run = 0; run < RUNS; run += 1) {
      const prompt = easyRolePrompt({ words: one.words, photos: one.photos.map((description) => ({ description })) });
      const r = await 잰다(() => provider.decideRoles(prompt));
      const got = readRoleJudgment(r.value, one.photos.length);
      const 문제 = b2문제(one, got);
      합계 += r.usd;
      걸린시간.push(r.ms);
      치명 += 문제.filter((m) => m.startsWith("치명")).length;
      어긋남 += 문제.filter((m) => !m.startsWith("치명")).length;
      const 결과 = got.photos.map((p, i) => `${i + 1}:${p.role}/${p.said ? "말" : "-"}`).join(" ");
      줄.push(`| ${one.name} | ${one.words} | ${결과} | ${got.conflicting} | ${문제.join("; ") || "—"} | ${r.ms} | ${r.usd.toFixed(4)} |`);
    }
  }

  const 가운데 = [...걸린시간].sort((a, b) => a - b)[Math.floor(걸린시간.length / 2)] ?? 0;
  줄.push(
    "",
    "## 요약",
    "",
    `- 치명 ${치명}건 · 어긋남 ${어긋남}건`,
    `- ⓑ2 한 번 걸린 시간(가운데값) ${가운데}ms`,
    `- 모두 합친 값 $${합계.toFixed(4)}`,
    `- 통과: ${치명 === 0 && 어긋남 === 0 ? "예" : "아니오"}`,
  );

  const 폴더 = new URL("../../../../docs/easy-measure/", import.meta.url);
  mkdirSync(폴더, { recursive: true });
  writeFileSync(new URL("2026-09-30-roles.md", 폴더), `${줄.join("\n")}\n`);
  console.log(줄.slice(-6).join("\n"));
  process.exitCode = 치명 || 어긋남 ? 1 : 0;
}

void main();
```

- [ ] **Step 3: 돌린다**

```bash
cd "C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-cardnews"
pnpm exec tsx --env-file="C:/Users/PC/Desktop/coding/fixup-image-agent/apps/web/.env.local" apps/web/scripts/easy-measure/run.mts
```
Expected: `통과: 예`, 치명 0 · 어긋남 0. 결과가 `docs/easy-measure/2026-09-30-roles.md` 에 남는다.

- [ ] **Step 4: 어긋나면 글을 고치고 다시 잰다**

어긋난 줄을 읽고 `easyRolePrompt`(Task 2) 나 `easyChatPrompt`(Task 1)의 **글만** 고친다. 글에 대한 Task 1·2 시험이 여전히 초록인지 돌려 본 뒤 Step 3 을 다시 돌린다.
**세 번 고쳐도 치명이 남으면 멈추고** 결과표를 사용자에게 보여 준다 — 설계를 다시 봐야 할 신호다.

- [ ] **Step 5: 실제 사진으로 읽기를 확인한다** — `apps/web/scripts/easy-measure/read-check.mts`

사용자에게 사진 다섯 장을 받는다: **제품만 찍힌 사진 · 글자가 있는 디자인 포스터 · 한 사람 사진 · 단체 사진 · 일러스트.** 받은 폴더 경로를 인자로 준다.

```ts
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { DEFAULT_TEXT_MODEL } from "@fixup/shared";
import { createPosterFalClients } from "../../lib/poster/providers";
import { createEasyChatProvider } from "../../lib/easy/chat-provider";
import { readEasyPhotos } from "../../lib/easy/read-photos";
import { readLlmMeter, withLlmMeter } from "../../lib/llm/meter";
import { easyRolePrompt, readRoleJudgment } from "../../app/easy/photo-roles";

/**
 * 실제 사진을 **실제 읽기로** 읽어, 그 설명으로 역할이 갈리는지 본다.
 *
 *   pnpm exec tsx --env-file=<.env.local> apps/web/scripts/easy-measure/read-check.mts <사진폴더>
 *
 * 읽기는 주소가 있어야 한다 — fal 에 올려 주소를 받는다(이미지 만들기가 쓰는 그 업로더).
 */

const 형식: Record<string, string> = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

async function main() {
  const 폴더 = process.argv[2];
  if (!폴더) throw new Error("사진 폴더 경로를 주세요.");
  const 파일들 = readdirSync(폴더).filter((file) => 형식[extname(file).toLowerCase()]).sort();
  const fal = createPosterFalClients();
  const photos = [];
  for (const file of 파일들) {
    const url = await fal.uploader.uploadReference(readFileSync(join(폴더, file)), 형식[extname(file).toLowerCase()]!);
    photos.push({ id: file, title: file, url });
  }

  const 줄: string[] = [`# 실제 사진 읽기 확인 — ${new Date().toISOString()}`, ""];
  for (const 장수 of [...new Set([1, 3, photos.length])].filter((n) => n <= photos.length)) {
    const r = await withLlmMeter(async () => {
      const 시작 = Date.now();
      await readEasyPhotos(photos.slice(0, 장수));
      return { ms: Date.now() - 시작, usd: readLlmMeter().usd };
    });
    줄.push(`- ${장수}장 읽기: ${r.ms}ms · $${r.usd.toFixed(4)}`);
  }

  const 설명 = await readEasyPhotos(photos);
  줄.push("", "## 읽은 설명", "");
  photos.forEach((photo, i) => 줄.push(`${i + 1}. \`${photo.id}\` — ${설명[photo.id] ?? "(못 읽음)"}`));

  const provider = createEasyChatProvider(process.env, DEFAULT_TEXT_MODEL);
  for (const words of ["카페 포스터 만들어줘", "이걸로 만들어줘"]) {
    const raw = await provider.decideRoles(easyRolePrompt({ words, photos: photos.map((p) => ({ description: 설명[p.id] })) }));
    const got = readRoleJudgment(raw, photos.length);
    줄.push("", `## 「${words}」`, "", ...got.photos.map((p, i) => `- ${i + 1}. \`${photos[i]!.id}\` → ${p.role}${p.said ? " (말)" : ""}`));
  }

  const 결과 = new URL("../../../../docs/easy-measure/", import.meta.url);
  mkdirSync(결과, { recursive: true });
  writeFileSync(new URL("2026-09-30-read-check.md", 결과), `${줄.join("\n")}\n`);
  console.log(줄.join("\n"));
}

void main();
```

```bash
pnpm exec tsx --env-file="C:/Users/PC/Desktop/coding/fixup-image-agent/apps/web/.env.local" apps/web/scripts/easy-measure/read-check.mts "<사용자가 준 폴더>"
```
Expected(「카페 포스터 만들어줘」): 제품 → unclear, 포스터 → style, 한 사람 → unclear, 단체 → unclear, 일러스트 → style. **제품·인물·단체가 style 로 나오면 치명**이다 — 설명에 무엇이 빠졌는지 보고 `describePhoto`(Task 2)를 고친다. 한 장 읽기 시간과 값도 적는다(§2-9 「담아 두지 않는다」의 판단 근거).

- [ ] **Step 6: 결과를 사용자에게 보여 주고 커밋한다**

결과 두 파일의 요약(치명 · 어긋남 · 걸린 시간 · 값)을 쉬운 말로 보고한다. 통과했으면:

```bash
git add apps/web/scripts/easy-measure docs/easy-measure apps/web/app/easy/photo-roles.ts apps/web/app/easy/chat.ts
git commit -m "test(easy): 사진 역할 · 상세페이지 판단 실측

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 고른 값 읽기 · 합치기 · 인물 셈 (§2-4 차례표, §2-5)

**Files:**
- Modify: `apps/web/app/easy/photo-roles.ts` (끝에 더한다)
- Test: `apps/web/app/easy/__tests__/photo-roles.test.ts` (끝에 더한다)

**Interfaces:**
- Consumes: `EASY_PHOTO_ROLES`, `EasyPhotoRole`, `JudgedPhotoRole`, `RoleJudgment` (Task 2)
- Produces:
  - `interface PhotoRow { id: string; role: JudgedPhotoRole }`
  - `readChosenRoles(raw: unknown, ids: readonly string[]): Record<string, EasyPhotoRole>`
  - `mergeRoles(input: { ids: readonly string[]; chosen: Readonly<Record<string, EasyPhotoRole>>; judged: RoleJudgment }): PhotoRow[]`
  - `isPersonRole(role: JudgedPhotoRole): boolean`
  - `photoAskReason(rows: readonly PhotoRow[]): "unclear" | "people" | null`
  - `canPickPerson(picked: Readonly<Record<string, JudgedPhotoRole | undefined>>, id: string): boolean`

- [ ] **Step 1: 실패하는 시험을 더한다** — `photo-roles.test.ts` 의 import 를 넓히고 끝에 붙인다

```ts
import {
  canPickPerson, describePhoto, easyRolePrompt, mergeRoles, photoAskReason,
  readChosenRoles, readRoleJudgment, type RoleJudgment,
} from "../photo-roles";
```

```ts
const 판단 = (...roles: Array<[string, boolean]>): RoleJudgment => ({
  photos: roles.map(([role, said]) => ({ role: role as never, said })),
  conflicting: false,
});

describe("고른 값 읽기 — 서버가 다시 확인한다 (설계 §2-5)", () => {
  const ids = ["a", "b"];

  it("붙인 사진의 네 역할만 받는다", () => {
    expect(readChosenRoles([{ id: "a", role: "preserve_product" }, { id: "b", role: "style" }], ids))
      .toEqual({ a: "preserve_product", b: "style" });
  });

  it("목록 밖의 id 는 버린다 — 남의 사진 id 를 넣어도 안 먹힌다", () => {
    expect(readChosenRoles([{ id: "남의것", role: "preserve_product" }], ids)).toEqual({});
  });

  it("모르는 역할은 버린다", () => {
    expect(readChosenRoles([{ id: "a", role: "place_as_is" }, { id: "b", role: "unclear" }], ids)).toEqual({});
  });

  it("같은 id 가 두 번 오면 둘 다 버린다", () => {
    expect(readChosenRoles([{ id: "a", role: "style" }, { id: "a", role: "preserve_product" }], ids)).toEqual({});
  });

  it("목록이 아니면 아무것도 안 고른 것이다", () => {
    expect(readChosenRoles("a:style", ids)).toEqual({});
  });
});

describe("합치기 — 고른 것 > 말 > 판단 > 모름 (설계 §2-4)", () => {
  it("고른 것이 판단을 이긴다", () => {
    expect(mergeRoles({ ids: ["a"], chosen: { a: "style" }, judged: 판단(["preserve_product", true]) }))
      .toEqual([{ id: "a", role: "style" }]);
  });

  it("안 고른 사진은 판단대로 간다", () => {
    expect(mergeRoles({ ids: ["a", "b"], chosen: { a: "style" }, judged: 판단(["unclear", false], ["preserve_product", true]) }))
      .toEqual([{ id: "a", role: "style" }, { id: "b", role: "preserve_product" }]);
  });

  it("판단도 없으면 unclear 다", () => {
    expect(mergeRoles({ ids: ["a"], chosen: {}, judged: { photos: [], conflicting: false } }))
      .toEqual([{ id: "a", role: "unclear" }]);
  });

  it("붙인 순서를 지킨다", () => {
    expect(mergeRoles({ ids: ["b", "a"], chosen: {}, judged: 판단(["style", false], ["style", false]) }).map((row) => row.id))
      .toEqual(["b", "a"]);
  });
});

describe("물을까 (설계 §2-5)", () => {
  it("모르는 사진이 있으면 묻는다", () => {
    expect(photoAskReason([{ id: "a", role: "unclear" }, { id: "b", role: "style" }])).toBe("unclear");
  });

  it("인물 역할인 사진이 둘이면 묻는다", () => {
    expect(photoAskReason([{ id: "a", role: "preserve_person" }, { id: "b", role: "preserve_person" }])).toBe("people");
  });

  it("그림체만 바꾸는 인물도 인물로 센다", () => {
    expect(photoAskReason([{ id: "a", role: "preserve_person_restyled" }, { id: "b", role: "preserve_person" }])).toBe("people");
  });

  /** 장 단위로 센다 — 단체 사진 한 장은 1이다(설계 §2-5). */
  it("단체 사진 한 장은 묻지 않는다", () => {
    expect(photoAskReason([{ id: "단체", role: "preserve_person_restyled" }, { id: "b", role: "style" }])).toBeNull();
  });

  it("제품은 여럿이어도 된다", () => {
    expect(photoAskReason([{ id: "a", role: "preserve_product" }, { id: "b", role: "preserve_product" }])).toBeNull();
  });

  it("모름이 먼저다 — 둘 다면 unclear 로 묻는다", () => {
    expect(photoAskReason([
      { id: "a", role: "unclear" }, { id: "b", role: "preserve_person" }, { id: "c", role: "preserve_person" },
    ])).toBe("unclear");
  });
});

describe("인물은 한 줄에만 (설계 §2-5)", () => {
  it("다른 줄이 인물이면 못 고른다", () => {
    expect(canPickPerson({ a: "preserve_person", b: undefined }, "b")).toBe(false);
  });

  it("자기 줄이 인물이면 그대로 고를 수 있다", () => {
    expect(canPickPerson({ a: "preserve_person" }, "a")).toBe(true);
  });

  it("다른 줄이 제품이면 고를 수 있다", () => {
    expect(canPickPerson({ a: "preserve_product" }, "b")).toBe(true);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-roles.test.ts
```
Expected: FAIL — `readChosenRoles is not a function` 등

- [ ] **Step 3: 구현한다** — `photo-roles.ts` 맨 위 import 에 `import { countPreservedPeople } from "@fixup/shared";` 를 더하고, 파일 끝에 붙인다

```ts
/** 물음 화면의 한 줄이자 합친 결과. */
export interface PhotoRow {
  id: string;
  role: JudgedPhotoRole;
}

/**
 * 화면이 보낸 **고른 역할**을 읽는다(설계 §2-5).
 *
 * 서버에는 「이번에 붙인 사진」의 기록이 따로 없다. 그래서 ⓪에서 확인한 목록
 * (`ids`)과만 견준다 — 그 밖의 id, 모르는 역할, 두 번 온 id 는 버린다.
 * 버린 사진은 판단대로 가고, 판단도 없으면 묻는다.
 */
export function readChosenRoles(raw: unknown, ids: readonly string[]): Record<string, EasyPhotoRole> {
  if (!Array.isArray(raw)) return {};
  const allowed = new Set(ids);
  const known = new Set<string>(EASY_PHOTO_ROLES);
  const entries = raw.map((entry) => entry as { id?: unknown; role?: unknown } | null);
  const 몇번 = (id: string) => entries.filter((one) => one?.id === id).length;

  return Object.fromEntries(
    entries
      .filter((one): one is { id: string; role: string } =>
        one !== null && typeof one.id === "string" && typeof one.role === "string"
        && allowed.has(one.id) && known.has(one.role) && 몇번(one.id) === 1)
      .map((one) => [one.id, one.role as EasyPhotoRole]),
  );
}

/** 고른 것 > 말·판단(ⓑ2) > 모름. 붙인 순서를 지킨다. */
export function mergeRoles(input: {
  ids: readonly string[];
  chosen: Readonly<Record<string, EasyPhotoRole>>;
  judged: RoleJudgment;
}): PhotoRow[] {
  return input.ids.map((id, index) => ({
    id,
    role: input.chosen[id] ?? input.judged.photos[index]?.role ?? "unclear",
  }));
}

export function isPersonRole(role: JudgedPhotoRole): boolean {
  return role === "preserve_person" || role === "preserve_person_restyled";
}

/**
 * 물어야 하나, 무엇을.
 *
 * - 모르는 사진이 있으면 `unclear`
 * - 인물 역할인 **장**이 둘 이상이면 `people` — 얼굴이 섞인다. 단체 사진 한 장은
 *   1이다(설계 §2-5). 셈은 이미지 만들기와 같은 `countPreservedPeople` 에 캐릭터
 *   표시 없이 넘긴다
 */
export function photoAskReason(rows: readonly PhotoRow[]): "unclear" | "people" | null {
  if (rows.some((row) => row.role === "unclear")) return "unclear";
  const people = countPreservedPeople(rows.map((row) => ({ role: row.role as EasyPhotoRole })));
  return people > 1 ? "people" : null;
}

/** 인물 역할은 한 줄에서만 고를 수 있다. 다른 줄이 이미 인물이면 못 고른다. */
export function canPickPerson(
  picked: Readonly<Record<string, JudgedPhotoRole | undefined>>,
  id: string,
): boolean {
  return !Object.entries(picked).some(([other, role]) => other !== id && role !== undefined && isPersonRole(role));
}
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-roles.test.ts
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0, 타입 오류 0

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/easy/photo-roles.ts apps/web/app/easy/__tests__/photo-roles.test.ts
git commit -m "feat(easy): 고른 역할을 서버가 다시 읽고, 고른 것 > 말 > 판단으로 합치고, 인물은 장으로 센다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ⓪ 사진 확인과 ⓒ 장수 상한 (§2-3 ⓪, §2-6)

**Files:**
- Create: `apps/web/app/easy/photo-check.ts`
- Test: `apps/web/app/easy/__tests__/photo-check.test.ts`

**Interfaces:**
- Produces:
  - `uniqueIds(raw: unknown): string[]` — 글자만, 처음 자리 하나
  - `isPhotoId(id: string): boolean` — uuid 모양
  - `missingIds(requested: readonly string[], found: ReadonlyArray<{ id: string }>): string[]`
  - `photoLimit(input: { ratio: string; imageModel?: string; count: number }): { ok: true; modelId: string; max: number } | { ok: false; message: string }`
  - `UNUSABLE_PHOTO: string` — ⓪에서 멈출 때의 말

- [ ] **Step 1: 실패하는 시험을 쓴다** — `apps/web/app/easy/__tests__/photo-check.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, POSTER_RATIOS, chooseModelForRatio } from "@fixup/sns-core";
import { isPhotoId, missingIds, photoLimit, uniqueIds } from "../photo-check";

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("붙인 사진 id (설계 §2-3 ⓪)", () => {
  it("같은 id 는 처음 자리 하나만 남긴다", () => {
    expect(uniqueIds([사진(2), 사진(1), 사진(2)])).toEqual([사진(2), 사진(1)]);
  });

  it("글자가 아닌 것은 뺀다", () => {
    expect(uniqueIds([사진(1), 3, null, ""])).toEqual([사진(1)]);
    expect(uniqueIds("아님")).toEqual([]);
  });

  it("uuid 모양만 사진 id 다", () => {
    expect(isPhotoId(사진(1))).toBe(true);
    expect(isPhotoId("../etc/passwd")).toBe(false);
  });

  /** 조회는 볼 수 없는 id 를 오류 없이 뺀다. 빼고 가면 번호가 당겨진다. */
  it("요청했는데 안 나온 id 를 찾는다", () => {
    expect(missingIds([사진(1), 사진(2)], [{ id: 사진(1) }])).toEqual([사진(2)]);
    expect(missingIds([사진(1)], [{ id: 사진(1) }])).toEqual([]);
  });
});

describe("장수 상한 — 기획 전에 본다 (설계 §2-6)", () => {
  it("경제형은 7장까지다", () => {
    expect(photoLimit({ ratio: "1:1", imageModel: "nano-banana", count: 7 }).ok).toBe(true);
    const 넘침 = photoLimit({ ratio: "1:1", imageModel: "nano-banana", count: 8 });
    expect(넘침.ok).toBe(false);
    if (!넘침.ok) {
      expect(넘침.message).toContain("7장");
      expect(넘침.message).toContain("8장");
    }
  });

  /**
   * **생성 라우트와 같은 모델로 본다.** 비율 때문에 모델이 바뀌면 상한도
   * 바뀐다 — 고른 모델로 보면 틀린다(`generate/route.ts:138`).
   */
  it("비율 때문에 바뀐 모델의 상한을 쓴다", () => {
    const 바뀌는비율 = POSTER_RATIOS.map((one) => one.id)
      .find((ratio) => chooseModelForRatio(ratio, "nano-banana", IMAGE_MODELS).switched);
    expect(바뀌는비율, "경제형이 못 만드는 비율이 있어야 이 시험이 뜻을 갖는다").toBeDefined();
    const 바뀐모델 = chooseModelForRatio(바뀌는비율!, "nano-banana", IMAGE_MODELS).model;
    expect(바뀐모델.maxReferenceImages).toBeGreaterThan(7);

    const 결과 = photoLimit({ ratio: 바뀌는비율!, imageModel: "nano-banana", count: 8 });
    expect(결과).toEqual({ ok: true, modelId: 바뀐모델.id, max: 바뀐모델.maxReferenceImages });
  });

  it("모르는 모델이면 기본 모델로 본다", () => {
    const 기본 = IMAGE_MODELS.find((model) => model.isDefault)!;
    expect(photoLimit({ ratio: "1:1", imageModel: "없는모델", count: 1 }))
      .toEqual({ ok: true, modelId: 기본.id, max: 기본.maxReferenceImages });
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-check.test.ts
```
Expected: FAIL — `photo-check` 를 못 찾음

- [ ] **Step 3: 구현한다** — `apps/web/app/easy/photo-check.ts`

```ts
import { IMAGE_MODELS, chooseModelForRatio } from "@fixup/sns-core";

/**
 * **값이 나가기 전에 멈춘다**(설계 §2-3 ⓪ · §2-6 ⓒ).
 *
 * ⓪ 붙인 사진 id 는 화면이 보낸 값이다. 이미지 만들기의 조회는 볼 수 없는 id 를
 *    **오류 없이 뺀다**(`reference-images.ts:248`). 그대로 가면 사진이 빠진 채
 *    만들어지거나 번호가 당겨져 말 속의 「2번」이 다른 사진을 가리킨다.
 * ⓒ 이미지 만들기는 모델 상한을 **그림을 만들기 직전**에 본다. 「쉽게」는 그 전에
 *    기획을 돌려 값을 확정하므로, 여기서 먼저 봐야 기획값만 나가는 일이 없다.
 */

export const UNUSABLE_PHOTO = "붙인 사진 중 쓸 수 없는 것이 있습니다. 그 사진을 빼고 다시 보내 주세요.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 글자인 id 만, 처음 자리 하나만. 번호(①②)가 이 차례다. */
export function uniqueIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((one, index): one is string =>
    typeof one === "string" && one.length > 0 && raw.indexOf(one) === index);
}

/** 사진 id 는 uuid 다. 모양이 틀리면 조회가 오류를 던지므로 그 전에 거른다. */
export function isPhotoId(id: string): boolean {
  return UUID.test(id);
}

/** 요청했는데 안 나온 것. 하나라도 있으면 멈춘다 — 조용히 빼지 않는다. */
export function missingIds(requested: readonly string[], found: ReadonlyArray<{ id: string }>): string[] {
  const have = new Set(found.map((one) => one.id));
  return requested.filter((id) => !have.has(id));
}

export type PhotoLimit = { ok: true; modelId: string; max: number } | { ok: false; message: string };

/**
 * 이 장수를 실제로 쓸 모델이 받을 수 있나.
 *
 * **생성 라우트와 같은 모델 고르기를 쓴다**(`chooseModelForRatio`). 비율 때문에
 * 모델이 바뀌면 상한도 바뀐다.
 */
export function photoLimit(input: { ratio: string; imageModel?: string; count: number }): PhotoLimit {
  const { model } = chooseModelForRatio(input.ratio, input.imageModel ?? "", IMAGE_MODELS);
  if (input.count <= model.maxReferenceImages) {
    return { ok: true, modelId: model.id, max: model.maxReferenceImages };
  }
  return {
    ok: false,
    message: `「${model.label}」 모델은 사진을 ${model.maxReferenceImages}장까지 받습니다. `
      + `지금 ${input.count}장입니다 — 몇 장을 빼거나 다른 이미지 모델을 골라 주세요.`,
  };
}
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-check.test.ts
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0. 「바뀌는 비율」 전제가 실패하면(경제형이 모든 비율을 만들 수 있게 바뀐 경우) 멈추고 알린다 — 시험의 전제가 사라진 것이다

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/easy/photo-check.ts apps/web/app/easy/__tests__/photo-check.test.ts
git commit -m "feat(easy): 쓸 수 없는 사진과 모델 상한을 기획값이 나가기 전에 막는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 역할 → 이미지 만들기 칸, 말 보내기 조건 (§2-6)

**Files:**
- Create: `apps/web/app/easy/photo-fields.ts`
- Test: `apps/web/app/easy/__tests__/photo-fields.test.ts`

**Interfaces:**
- Consumes: `EasyPhotoRole`, `RoleJudgment`, `isPersonRole` (Task 2 · 4)
- Produces:
  - `interface EasyPosterFields { referenceIds: string[]; preservedIds: string[]; personIds: string[]; restyledIds: string[]; attachmentOrder: string[] }`
  - `posterFieldsFrom(rows: ReadonlyArray<{ id: string; role: EasyPhotoRole }>): EasyPosterFields`
  - `easyAttachmentIntent(input: { words: string; judged: RoleJudgment; final: readonly EasyPhotoRole[] }): string`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `apps/web/app/easy/__tests__/photo-fields.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { restoreAttachments } from "@fixup/shared";
import { EMPTY_SLOTS, PosterProjectInputSchema, buildPosterJob } from "@fixup/poster-core";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { easyAttachmentIntent, posterFieldsFrom } from "../photo-fields";
import type { EasyPhotoRole, RoleJudgment } from "../photo-roles";

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, C, D] = [사진(1), 사진(2), 사진(3), 사진(4)];
const 기본모델 = IMAGE_MODELS.find((model) => model.isDefault)!.id;

describe("역할 → 칸 (설계 §2-6)", () => {
  const fields = posterFieldsFrom([
    { id: A, role: "style" },
    { id: B, role: "preserve_product" },
    { id: C, role: "preserve_person" },
    { id: D, role: "preserve_person_restyled" },
  ]);

  it("역할마다 제 칸으로 간다", () => {
    expect(fields).toEqual({
      referenceIds: [A],
      preservedIds: [B, C, D],
      personIds: [C, D],
      restyledIds: [D],
      attachmentOrder: [A, B, C, D],
    });
  });

  /** 주소는 두 목록에서만 찾는다 — personIds 에만 있으면 첨부가 통째로 빠진다. */
  it("restyledIds ⊆ personIds ⊆ preservedIds", () => {
    expect(fields.restyledIds.every((id) => fields.personIds.includes(id))).toBe(true);
    expect(fields.personIds.every((id) => fields.preservedIds.includes(id))).toBe(true);
  });

  it("차례는 붙인 순서 그대로다 — 따라 만들기를 앞으로 당기지 않는다", () => {
    expect(posterFieldsFrom([{ id: B, role: "preserve_product" }, { id: A, role: "style" }]).attachmentOrder)
      .toEqual([B, A]);
  });

  /** 차례 검사(`schemas.ts:218`)를 통과해야 만들기가 400 으로 안 막힌다. */
  it("이미지 만들기의 입력 검사를 통과한다", () => {
    const parsed = PosterProjectInputSchema.safeParse({
      title: "쉽게", ratio: "1:1", modelId: 기본모델, variants: 1, instruction: "카페 포스터", ...fields,
    });
    expect(parsed.success).toBe(true);
  });
});

const 판단 = (photos: Array<[EasyPhotoRole | "unclear", boolean]>, conflicting = false): RoleJudgment => ({
  photos: photos.map(([role, said]) => ({ role, said })),
  conflicting,
});

describe("말을 보낼까 (설계 §2-6 보내는 조건 셋)", () => {
  const 말 = "1번 제품은 그대로 두고 카페 포스터";

  it("말이 쓰임을 말했고 최종 역할과 맞으면 말 전체를 보낸다", () => {
    expect(easyAttachmentIntent({ words: `  ${말} `, judged: 판단([["preserve_product", true]]), final: ["preserve_product"] }))
      .toBe(말);
  });

  it("사진 이야기가 없는 말은 안 보낸다", () => {
    expect(easyAttachmentIntent({ words: "카페 포스터 만들어줘", judged: 판단([["style", false]]), final: ["style"] }))
      .toBe("");
  });

  it("고른 것이 말을 뒤집으면 안 보낸다", () => {
    expect(easyAttachmentIntent({ words: 말, judged: 판단([["preserve_product", true]]), final: ["style"] }))
      .toBe("");
  });

  it("말이 안 가리킨 사진을 고른 것은 뒤집기가 아니다", () => {
    expect(easyAttachmentIntent({
      words: 말, judged: 판단([["preserve_product", true], ["unclear", false]]), final: ["preserve_product", "style"],
    })).toBe(말);
  });

  it("말 안에서 엇갈리면 안 보낸다", () => {
    expect(easyAttachmentIntent({ words: 말, judged: 판단([["style", true]], true), final: ["style"] }))
      .toBe("");
  });
});

/**
 * **최종 프롬프트로 잰다**(설계 §2-6). 칸만 맞고 프롬프트에서 말이 역할을
 * 이기면 사고는 그대로다 — 생성 라우트가 하는 것과 같은 조립을 그대로 부른다.
 */
describe("최종 프롬프트", () => {
  const urls = { [A]: "https://x.test/a.png" };

  function 프롬프트(role: EasyPhotoRole, attachmentIntent: string): string {
    const fields = posterFieldsFrom([{ id: A, role }]);
    return buildPosterJob({
      projectId: "p",
      modelId: 기본모델,
      ratioId: "1:1",
      variants: 1,
      slots: EMPTY_SLOTS,
      attachments: restoreAttachments(fields, urls),
      referenceUrls: fields.referenceIds.map((id) => urls[id]!),
      preservedUrls: fields.preservedIds.map((id) => urls[id]!),
      attachmentIntent,
    }).prompt;
  }

  it("단추가 말을 뒤집으면 말이 없고 그 사진은 따라 만들기다", () => {
    const words = "1번 제품은 그대로";
    const intent = easyAttachmentIntent({ words, judged: 판단([["preserve_product", true]]), final: ["style"] });
    const prompt = 프롬프트("style", intent);

    expect(prompt).not.toContain("첨부한 그림에 대해");
    expect(prompt).toContain("Image 1 is a POSTER REFERENCE");
  });

  it("말과 역할이 맞으면 말이 가고 그 사진은 지킨다", () => {
    const words = "1번 제품은 그대로";
    const intent = easyAttachmentIntent({ words, judged: 판단([["preserve_product", true]]), final: ["preserve_product"] });
    const prompt = 프롬프트("preserve_product", intent);

    expect(prompt).toContain("첨부한 그림에 대해: 1번 제품은 그대로");
    expect(prompt).toContain("Image 1 is a PRESERVED SUBJECT");
  });

  it("그림체만 바꾸는 인물은 그림체 바꾸기를 막지 않는 문구로 간다", () => {
    expect(프롬프트("preserve_person_restyled", "")).toContain("Image 1 is a PRESERVED PERSON, REDRAWN");
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-fields.test.ts
```
Expected: FAIL — `photo-fields` 를 못 찾음

- [ ] **Step 3: 구현한다** — `apps/web/app/easy/photo-fields.ts`

```ts
import { isPersonRole, type EasyPhotoRole, type RoleJudgment } from "./photo-roles";

/**
 * 정해진 역할을 **이미지 만들기가 이미 받는 칸**으로 옮긴다(설계 §2-6).
 *
 * 이미지 만들기는 역할 넷 · 역할마다의 문구 · 차례를 이미 안다. 「쉽게」는 칸만
 * 채우고 그 라우트를 그대로 부른다 — 이미지 만들기 코드는 0줄이다.
 */

export interface EasyPosterFields {
  referenceIds: string[];
  preservedIds: string[];
  personIds: string[];
  restyledIds: string[];
  attachmentOrder: string[];
}

/**
 * 역할 → 칸. **`restyledIds ⊆ personIds ⊆ preservedIds`** 를 지킨다.
 *
 * 까닭은 주소와 셈이다. 이미지 만들기는 올릴 그림을 `referenceIds`·`preservedIds`
 * 에서만 찾는다 — `personIds` 에만 있으면 첨부가 통째로 빠지고, 차례에 넣으면
 * 차례 검사가 거절한다. 장수 셈과 옛 경로도 두 목록만 센다.
 *
 * 차례는 **붙인 순서 그대로**다. 전에는 「따라 만들기 먼저」로 다시 짰다.
 */
export function posterFieldsFrom(rows: ReadonlyArray<{ id: string; role: EasyPhotoRole }>): EasyPosterFields {
  const idsWhere = (test: (role: EasyPhotoRole) => boolean) =>
    rows.filter((row) => test(row.role)).map((row) => row.id);

  return {
    referenceIds: idsWhere((role) => role === "style"),
    preservedIds: idsWhere((role) => role !== "style"),
    personIds: idsWhere(isPersonRole),
    restyledIds: idsWhere((role) => role === "preserve_person_restyled"),
    attachmentOrder: rows.map((row) => row.id),
  };
}

/**
 * 그림 모델에 **사용자 말을 보낼까**(설계 §2-6).
 *
 * 이 말이 있으면 이미지 만들기는 「사용자 말이 부딪히는 규칙을 이긴다」를 붙인다.
 * 말과 최종 역할이 어긋난 채 보내면 **말이 이긴다** — 물음에서 1번을 「분위기만」
 * 으로 바꿔도 처음 쓴 「1번 제품은 그대로」가 이긴다.
 *
 * 셋 다 맞아야 보낸다. 보낼 때는 **말 전체**를 보낸다 — 떼어 오면 「바꿔 그리지
 * 마」가 「바꿔」로 잘릴 수 있다(설계 §2-4).
 *
 * 1. 말이 사진의 쓰임을 말했다(`said` 가 하나 이상)
 * 2. 고른 것이 말을 뒤집지 않았다(`said` 인 사진의 최종 역할 = 말의 역할)
 * 3. 말 안에서 같은 사진의 쓰임이 엇갈리지 않았다
 */
export function easyAttachmentIntent(input: {
  words: string;
  judged: RoleJudgment;
  final: readonly EasyPhotoRole[];
}): string {
  if (input.judged.conflicting) return "";
  const 말한것 = input.judged.photos
    .map((photo, index) => ({ photo, index }))
    .filter(({ photo }) => photo.said);
  if (!말한것.length) return "";
  const 뒤집힘 = 말한것.some(({ photo, index }) => input.final[index] !== photo.role);
  return 뒤집힘 ? "" : input.words.trim();
}
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-fields.test.ts
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0. 「Image 1 is a …」 문구가 다르게 나오면 `packages/poster-core/src/prompt.ts:159,166,173` 의 실제 문구를 읽고 **시험의 기대만** 맞춘다(그 파일은 고치지 않는다)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/easy/photo-fields.ts apps/web/app/easy/__tests__/photo-fields.test.ts
git commit -m "feat(easy): 역할을 이미지 만들기 칸으로 옮기고, 말과 역할이 부딪히면 말을 안 보낸다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 그림 턴 잇기 — ⓒ → ⓐ → ⓑ2 → ⓓ (§2-3)

**Files:**
- Create: `apps/web/app/easy/photo-turn.ts`
- Test: `apps/web/app/easy/__tests__/photo-turn.test.ts`

**Interfaces:**
- Consumes: `photoLimit`(Task 5), `easyRolePrompt` · `readRoleJudgment` · `mergeRoles` · `photoAskReason` · `EasyPhoto` · `PhotoRow`(Task 2·4), `posterFieldsFrom` · `easyAttachmentIntent` · `EasyPosterFields`(Task 6)
- Produces:
  - `interface PhotoTurnInput { photos: readonly EasyPhoto[]; words: string; chosen: Readonly<Record<string, EasyPhotoRole>>; ratio: string; imageModel?: string }`
  - `interface PhotoTurnDeps { read(photos: readonly EasyPhoto[]): Promise<Record<string, string>>; judge(prompt: string): Promise<unknown> }`
  - `type PhotoTurn = { kind: "stop"; message: string } | { kind: "ask"; reason: "unclear" | "people"; rows: PhotoRow[] } | { kind: "go"; rows: Array<{ id: string; role: EasyPhotoRole }>; fields: EasyPosterFields; attachmentIntent: string }`
  - `runPhotoTurn(input: PhotoTurnInput, deps: PhotoTurnDeps): Promise<PhotoTurn>`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `apps/web/app/easy/__tests__/photo-turn.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { runPhotoTurn, type PhotoTurnDeps } from "../photo-turn";

const 사진들 = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, url: `https://x.test/${i + 1}.png` }));

function 가짜(판단: unknown, 설명: Record<string, string> = {}) {
  const 읽은것: string[][] = [];
  const 받은글: string[] = [];
  const deps: PhotoTurnDeps = {
    read: async (photos) => { 읽은것.push(photos.map((photo) => photo.id)); return 설명; },
    judge: async (prompt) => { 받은글.push(prompt); return 판단; },
  };
  return { deps, 읽은것, 받은글 };
}

const 기본 = { words: "카페 포스터", chosen: {}, ratio: "1:1", imageModel: "gpt-image-2.5-flare" };

describe("그림 턴 (설계 §2-3)", () => {
  it("장수가 넘치면 읽지도 묻지도 않고 멈춘다", async () => {
    const { deps, 읽은것, 받은글 } = 가짜({});
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(8), imageModel: "nano-banana" }, deps);

    expect(결과.kind).toBe("stop");
    expect(읽은것).toEqual([]);
    expect(받은글).toEqual([]);
  });

  it("단추로 고른 사진은 읽지 않는다", async () => {
    const { deps, 읽은것 } = 가짜({ photos: [{ number: 2, role: "style", said: false }], conflicting: false });
    await runPhotoTurn({ ...기본, photos: 사진들(2), chosen: { p1: "preserve_product" } }, deps);

    expect(읽은것).toEqual([["p2"]]);
  });

  it("모두 골랐으면 읽기를 통째로 건너뛰고 판단은 말만 본다", async () => {
    const { deps, 읽은것, 받은글 } = 가짜({ photos: [], conflicting: false });
    await runPhotoTurn({ ...기본, photos: 사진들(1), chosen: { p1: "style" } }, deps);

    expect(읽은것).toEqual([]);
    expect(받은글[0]).toMatch(/1번: \(설명 없음/);
  });

  it("판단 모델에는 id 가 아니라 번호와 설명을 준다", async () => {
    const { deps, 받은글 } = 가짜({ photos: [], conflicting: false }, { p1: "원두 봉투" });
    await runPhotoTurn({ ...기본, photos: 사진들(1) }, deps);

    expect(받은글[0]).toContain("1번: 원두 봉투");
    expect(받은글[0]).not.toContain("p1");
  });

  /** Review Focus 3 — 읽기가 전부 실패해도 분위기로 떨어지지 않는다. */
  it("읽기가 전부 실패하고 판단이 비면 묻는다", async () => {
    const { deps } = 가짜({});
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(2) }, deps);

    expect(결과).toEqual({ kind: "ask", reason: "unclear", rows: [{ id: "p1", role: "unclear" }, { id: "p2", role: "unclear" }] });
  });

  it("인물 역할이 둘이면 한 장만 되도록 묻는다", async () => {
    const { deps } = 가짜({
      photos: [{ number: 1, role: "preserve_person", said: true }, { number: 2, role: "preserve_person", said: true }],
      conflicting: false,
    });
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(2) }, deps);

    expect(결과.kind === "ask" && 결과.reason).toBe("people");
  });

  it("다 정해지면 칸과 말을 돌려준다", async () => {
    const { deps } = 가짜({
      photos: [{ number: 1, role: "preserve_product", said: true }, { number: 2, role: "style", said: false }],
      conflicting: false,
    });
    const 결과 = await runPhotoTurn({ ...기본, words: "1번 제품 그대로", photos: 사진들(2) }, deps);

    expect(결과).toEqual({
      kind: "go",
      rows: [{ id: "p1", role: "preserve_product" }, { id: "p2", role: "style" }],
      fields: { referenceIds: ["p2"], preservedIds: ["p1"], personIds: [], restyledIds: [], attachmentOrder: ["p1", "p2"] },
      attachmentIntent: "1번 제품 그대로",
    });
  });

  it("판단이 실패하면 그대로 던진다 — 라우트가 받는다", async () => {
    const deps: PhotoTurnDeps = { read: async () => ({}), judge: async () => { throw new Error("판단 실패"); } };
    await expect(runPhotoTurn({ ...기본, photos: 사진들(1) }, deps)).rejects.toThrow("판단 실패");
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-turn.test.ts
```
Expected: FAIL — `photo-turn` 을 못 찾음

- [ ] **Step 3: 구현한다** — `apps/web/app/easy/photo-turn.ts`

```ts
import { photoLimit } from "./photo-check";
import {
  easyRolePrompt, mergeRoles, photoAskReason, readRoleJudgment,
  type EasyPhoto, type EasyPhotoRole, type PhotoRow,
} from "./photo-roles";
import { easyAttachmentIntent, posterFieldsFrom, type EasyPosterFields } from "./photo-fields";

/**
 * **사진이 붙은 그림 턴**(설계 §2-3): ⓒ 장수 → ⓐ 읽기 → ⓑ2 역할 → ⓓ 합치기.
 *
 * 읽기와 판단은 밖에서 받는다. 그래야 모델을 안 부르고 차례를 값으로 잰다 —
 * 무엇을 먼저 하고 무엇을 건너뛰는지가 이 파일의 전부다.
 */

export interface PhotoTurnInput {
  /** ⓪에서 확인을 마친 사진. 붙인 순서다. */
  photos: readonly EasyPhoto[];
  /** 이번 요청의 말 전체(처음 말 + 말로 한 답). */
  words: string;
  /** 서버가 다시 확인한 고른 역할. */
  chosen: Readonly<Record<string, EasyPhotoRole>>;
  ratio: string;
  imageModel?: string;
}

export interface PhotoTurnDeps {
  /** id → 설명. 못 읽은 사진은 없다. */
  read(photos: readonly EasyPhoto[]): Promise<Record<string, string>>;
  /** ⓑ2 를 부른다. */
  judge(prompt: string): Promise<unknown>;
}

export type PhotoTurn =
  | { kind: "stop"; message: string }
  | { kind: "ask"; reason: "unclear" | "people"; rows: PhotoRow[] }
  | {
    kind: "go";
    rows: Array<{ id: string; role: EasyPhotoRole }>;
    fields: EasyPosterFields;
    attachmentIntent: string;
  };

export async function runPhotoTurn(input: PhotoTurnInput, deps: PhotoTurnDeps): Promise<PhotoTurn> {
  // ⓒ 읽기 전에 본다 — 못 만들 요청이면 읽기값도 안 낸다.
  const limit = photoLimit({ ratio: input.ratio, imageModel: input.imageModel, count: input.photos.length });
  if (!limit.ok) return { kind: "stop", message: limit.message };

  // ⓐ 단추로 고른 사진은 읽지 않는다. 역할을 정할 일이 없는데 읽으면 값과 기다림만 는다.
  const toRead = input.photos.filter((photo) => !input.chosen[photo.id]);
  const descriptions = toRead.length ? await deps.read(toRead) : {};

  // ⓑ2 다 골랐어도 돈다 — 말과 고른 것이 부딪히는지 알아야 한다(설계 §2-5).
  const judged = readRoleJudgment(
    await deps.judge(easyRolePrompt({
      words: input.words,
      photos: input.photos.map((photo) => ({ description: descriptions[photo.id] })),
    })),
    input.photos.length,
  );

  // ⓓ 고른 것 > 말·판단 > 모름.
  const rows = mergeRoles({ ids: input.photos.map((photo) => photo.id), chosen: input.chosen, judged });
  const reason = photoAskReason(rows);
  if (reason) return { kind: "ask", reason, rows };

  const decided = rows.map((row) => ({ id: row.id, role: row.role as EasyPhotoRole }));
  return {
    kind: "go",
    rows: decided,
    fields: posterFieldsFrom(decided),
    attachmentIntent: easyAttachmentIntent({ words: input.words, judged, final: decided.map((row) => row.role) }),
  };
}
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-turn.test.ts
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0, 타입 오류 0

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/easy/photo-turn.ts apps/web/app/easy/__tests__/photo-turn.test.ts
git commit -m "feat(easy): 사진이 붙은 그림 턴을 장수 → 읽기 → 역할 → 합치기 차례로 잇는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 라우트에 잇는다 — ⓪ · 계량기 · 사진 턴 · 칸 (§2-3, §2-6, §2-9 B)

**Files:**
- Modify: `apps/web/app/api/easy/generate/route.ts`
- Create: `apps/web/app/api/easy/__tests__/generate-route.test.ts`
- Modify: `apps/web/app/api/easy/__tests__/generate-wiring.test.ts`

**Interfaces:**
- Consumes: `uniqueIds` · `isPhotoId` · `missingIds` · `UNUSABLE_PHOTO`(Task 5), `readChosenRoles`(Task 4), `runPhotoTurn`(Task 7), `readEasyPhotos`(Task 2), `createEasyChatProvider().decideRoles`(Task 2), `DETAIL_PAGE_GUIDE`(Task 1), `easyRoleSummary`(Task 9 — **이 Task 에서는 아직 없다.** `roles` 응답 칸은 Task 9 에서 붙인다)
- Produces (응답 모양, 화면이 쓴다):
  - 물음: `{ ok: true, photoAsk: { reason: "unclear" | "people", rows: PhotoRow[] }, textModel }`
  - 멈춤: `{ ok: false, message, retryable: false }` · 400
  - 요청 본문: `referenceIds: string[]`(붙인 사진 전부, 붙인 순서 — 이름은 옛 화면과 맞추려 그대로 둔다), `photoRoles?: Array<{ id: string; role: EasyPhotoRole }>`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `apps/web/app/api/easy/__tests__/generate-route.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「쉽게」 문**(설계 §2-3 · §2-6 · §2-7).
 *
 * 판단은 순수 모듈들이 잰다(`photo-*.ts`). 여기서는 **문**을 잰다 — 무엇을 언제
 * 부르고, 무엇을 안 부르고, 무엇을 남기는가. 값이 나가는 라우트(기획·생성)를
 * 부르기 전에 멈춰야 하는 자리가 여럿이다.
 */

vi.mock("server-only", () => ({}));

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let 판단: unknown;
let 역할판단: unknown;
let 역할판단실패: Error | null;
let 볼수있는사진: string[];
const 남긴줄: Array<{ role: string; body?: string }> = [];
const 읽은사진: string[][] = [];
const 부른라우트: Array<{ step: string; body: Record<string, unknown> }> = [];
const 부른횟수 = { decide: 0, roles: 0 };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => [],
    appendMessage: async (row: { role: string; body?: string }) => {
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async () => { 부른횟수.decide += 1; return 판단; },
    decideRoles: async () => {
      부른횟수.roles += 1;
      if (역할판단실패) throw 역할판단실패;
      return 역할판단;
    },
  }),
}));
vi.mock("../../../../lib/easy/read-photos", () => ({
  readEasyPhotos: async (photos: Array<{ id: string }>) => {
    읽은사진.push(photos.map((photo) => photo.id));
    return Object.fromEntries(photos.map((photo) => [photo.id, "설명"]));
  },
}));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) =>
    ids.filter((id) => 볼수있는사진.includes(id)).map((id) => ({ id, title: id, url: `https://x.test/${id}.png` })),
}));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
}));
vi.mock("../../poster/projects/route", () => ({
  POST: async (req: Request) => {
    부른라우트.push({ step: "project", body: await req.json() });
    return Response.json({ ok: true, project: { id: "p1" } });
  },
}));
vi.mock("../../poster/projects/[id]/plan/route", () => ({
  POST: async (req: Request) => {
    부른라우트.push({ step: "plan", body: await req.json() });
    return Response.json({ ok: true });
  },
}));
vi.mock("../../poster/projects/[id]/generate/route", () => ({
  POST: async (req: Request) => {
    부른라우트.push({ step: "generate", body: await req.json() });
    return Response.json({ ok: true, submission: { requestRowId: "r", falRequestId: "f", endpoint: "e" } });
  },
}));

const { POST } = await import("../generate/route");
const { DETAIL_PAGE_GUIDE } = await import("../../../easy/detail-page");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", prompt: "카페 포스터 만들어줘", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

const 역할 = (...roles: Array<[string, boolean]>) => ({
  photos: roles.map(([role, said], index) => ({ number: index + 1, role, said })),
  conflicting: false,
});

beforeEach(() => {
  판단 = { wants: "image", reply: "", ratio: "", look: "" };
  역할판단 = { photos: [], conflicting: false };
  역할판단실패 = null;
  볼수있는사진 = [사진(1), 사진(2), 사진(3)];
  남긴줄.length = 0; 읽은사진.length = 0; 부른라우트.length = 0;
  부른횟수.decide = 0; 부른횟수.roles = 0;
});

describe("⓪ 사진 확인", () => {
  it("볼 수 없는 사진이 하나라도 있으면 아무것도 안 부르고 멈춘다", async () => {
    볼수있는사진 = [사진(1)];
    const { status, json } = await 보낸다({ referenceIds: [사진(1), 사진(2)] });

    expect(status).toBe(400);
    expect(json.retryable).toBe(false);
    expect(부른횟수.decide).toBe(0);
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("사진 id 모양이 아니면 조회 전에 멈춘다", async () => {
    const { status } = await 보낸다({ referenceIds: ["../etc"] });

    expect(status).toBe(400);
    expect(부른횟수.decide).toBe(0);
  });
});

describe("사진을 읽지 않는 턴", () => {
  it("말 턴에는 사진을 읽지 않는다", async () => {
    판단 = { wants: "talk", reply: "안녕하세요!", ratio: "", look: "" };
    await 보낸다({ prompt: "안녕하세요", referenceIds: [사진(1)] });

    expect(읽은사진).toEqual([]);
    expect(부른횟수.roles).toBe(0);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
  });

  it("상세페이지 요청은 안내만 남기고, 사진을 안 읽고, 아무 라우트도 안 부른다", async () => {
    판단 = { wants: "detail_page", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "이 제품 상세페이지 만들어줘", referenceIds: [사진(1)] });

    expect(json.talked).toBe(true);
    expect(남긴줄[1]).toEqual({ conversationId: "c1", role: "assistant", body: DETAIL_PAGE_GUIDE });
    expect(읽은사진).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("사진 없는 주문은 지금 그대로다", async () => {
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    await 보낸다({});

    expect(부른횟수.roles).toBe(0);
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
    expect(부른라우트[0]!.body).toMatchObject({
      referenceIds: [], preservedIds: [], personIds: [], restyledIds: [], attachmentOrder: [], attachmentIntent: "",
    });
  });
});

describe("물을 때는 아무것도 안 남긴다 (설계 §2-5)", () => {
  it("모르는 사진이 있으면 묻는다", async () => {
    역할판단 = 역할(["unclear", false]);
    const { json } = await 보낸다({ referenceIds: [사진(1)] });

    expect(json.photoAsk).toEqual({ reason: "unclear", rows: [{ id: 사진(1), role: "unclear" }] });
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("인물 사진이 둘이면 한 장만 되도록 묻는다", async () => {
    역할판단 = 역할(["preserve_person", true], ["preserve_person", true]);
    const { json } = await 보낸다({ referenceIds: [사진(1), 사진(2)] });

    expect(json.photoAsk.reason).toBe("people");
    expect(부른라우트).toEqual([]);
  });

  /** Review Focus 1 — 목록 밖 id 로 고른 값은 안 먹힌다. */
  it("남의 사진 id 로 고른 값은 버린다", async () => {
    역할판단 = 역할(["unclear", false]);
    const { json } = await 보낸다({ referenceIds: [사진(1)], photoRoles: [{ id: 사진(9), role: "preserve_product" }] });

    expect(json.photoAsk.reason).toBe("unclear");
  });
});

describe("값이 나가기 전에 멈춘다 (설계 §2-6 ⓒ)", () => {
  it("장수가 넘치면 읽기 · 판단 · 라우트를 하나도 안 부른다", async () => {
    볼수있는사진 = Array.from({ length: 8 }, (_, i) => 사진(i + 1));
    const { status, json } = await 보낸다({ imageModel: "nano-banana", referenceIds: 볼수있는사진 });

    expect(status).toBe(400);
    expect(json.retryable).toBe(false);
    expect(json.message).toContain("7장");
    expect(읽은사진).toEqual([]);
    expect(부른횟수.roles).toBe(0);
    expect(부른라우트).toEqual([]);
  });

  /** Review Focus 4 */
  it("역할 판단이 실패하면 아무것도 안 남기고 실패를 알린다", async () => {
    역할판단실패 = new Error("판단 실패");
    const { status } = await 보낸다({ referenceIds: [사진(1)] });

    expect(status).toBe(500);
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });
});

describe("역할대로 칸을 채운다 (설계 §2-6)", () => {
  it("붙인 순서로 칸을 채우고, 말이 역할과 맞으면 말을 보낸다", async () => {
    const 말 = "2번 제품 그대로, 3번 사람은 그림체만 바꿔";
    역할판단 = 역할(["style", false], ["preserve_product", true], ["preserve_person_restyled", true]);
    await 보낸다({ prompt: 말, referenceIds: [사진(1), 사진(2), 사진(3)] });

    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
    expect(부른라우트[0]!.body).toMatchObject({
      referenceIds: [사진(1)],
      preservedIds: [사진(2), 사진(3)],
      personIds: [사진(3)],
      restyledIds: [사진(3)],
      attachmentOrder: [사진(1), 사진(2), 사진(3)],
      attachmentIntent: 말,
    });
  });

  it("모두 단추로 골랐으면 사진을 안 읽는다", async () => {
    역할판단 = { photos: [], conflicting: false };
    await 보낸다({ referenceIds: [사진(1)], photoRoles: [{ id: 사진(1), role: "style" }] });

    expect(읽은사진).toEqual([]);
    expect(부른횟수.roles).toBe(1);
    expect(부른라우트[0]!.body).toMatchObject({ referenceIds: [사진(1)] });
  });

  it("단추가 말을 뒤집으면 말을 그림 모델에 안 보낸다", async () => {
    역할판단 = 역할(["preserve_product", true]);
    await 보낸다({ prompt: "1번 제품은 그대로", referenceIds: [사진(1)], photoRoles: [{ id: 사진(1), role: "style" }] });

    expect(부른라우트[0]!.body).toMatchObject({ referenceIds: [사진(1)], preservedIds: [], attachmentIntent: "" });
  });

  /** §2-1 — 붙인 수에 personIds 를 한 번 더 더하던 것. 이제 서로 다른 사진 수다. */
  it("같은 사진을 두 번 붙여도 한 장이다", async () => {
    역할판단 = 역할(["style", false]);
    await 보낸다({ referenceIds: [사진(1), 사진(1)] });

    expect(부른라우트[0]!.body).toMatchObject({ attachmentOrder: [사진(1)] });
  });
});
```

`generate-wiring.test.ts` 맨 끝에 더한다:

```ts
describe("사진 역할 (설계 §2-3)", () => {
  const readPhotos = readFileSync(new URL("../../../../lib/easy/read-photos.ts", import.meta.url), "utf8");

  /**
   * 위 「기획을 직접 돌리지 않는다」는 그대로 산다 — 라우트는 기획을 안 돌린다.
   * 역할을 정하려고 사진을 읽는 것은 `lib/easy/read-photos.ts` 가 하고,
   * **기획과 같은 기계**를 부른다. 사본을 만들지 않는다.
   */
  it("사진은 기획과 같은 기계로 읽는다", () => {
    expect(readPhotos).toContain("readAttachments");
    expect(readPhotos).toContain("createPosterAttachmentReader");
    expect(readPhotos).not.toContain("planPoster");
  });

  it("판단 · 읽기를 계량기 안에서 부른다 (설계 §2-9 B)", () => {
    expect(generate).toContain("withLlmMeter(");
  });

  it("사진을 물을 때도 대화에 아무것도 안 쌓는다", () => {
    const 묻는곳 = generate.indexOf("photoAsk:");
    expect(묻는곳).toBeGreaterThan(0);
    expect(generate.indexOf('role: "user"')).toBeGreaterThan(묻는곳);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/api/easy
```
Expected: FAIL — `photoAsk` 없음, 400 대신 200, `readEasyPhotos` 안 불림 등

- [ ] **Step 3: 라우트를 고친다** — `apps/web/app/api/easy/generate/route.ts`

(1) import 를 더한다(기존 줄은 그대로):

```ts
import { readEasyPhotos } from "../../../../lib/easy/read-photos";
import { readLlmMeter, withLlmMeter } from "../../../../lib/llm/meter";
import { posterReferencesByIds } from "../../../../lib/poster/references";
import { teamIdOf } from "../../../../lib/teams/store";
import { UNUSABLE_PHOTO, isPhotoId, missingIds, uniqueIds } from "../../../easy/photo-check";
import { readChosenRoles } from "../../../easy/photo-roles";
import { runPhotoTurn } from "../../../easy/photo-turn";
```

(2) `fail` 바로 뒤에 둘을 더한다:

```ts
/**
 * **값이 나가기 전에 멈춘다**(설계 §2-3 ⓪ · §2-6 ⓒ).
 *
 * 다시 눌러도 같은 곳에서 막히므로 `retryable: false` 다 — 화면이 「다시 보내면
 * 값이 또 듭니다」를 띄우지 않는다. 실제로 아무 값도 안 나갔다.
 */
function 멈춘다(message: string) {
  return Response.json({ ok: false, message, retryable: false }, { status: 400 });
}

/**
 * 판단 · 읽기에 실제로 쓴 값을 서버 기록에 한 줄 남긴다(설계 §2-9 B).
 *
 * 장부에 싣는 것은 새 작업 종류(마이그레이션)가 필요해 후속으로 미뤘다. 그때까지
 * 운영자가 journalctl 에서 볼 수 있게 한다. 이메일은 남기지 않는다.
 */
function 값을적는다(userId: string) {
  const 잰값 = readLlmMeter();
  if (!잰값.metered || 잰값.calls === 0) return;
  console.info(`[easy] 판단·읽기 user=${userId} calls=${잰값.calls} usd=${잰값.usd.toFixed(4)}`);
}
```

(3) `export async function POST(request: Request) {` 를 `async function turn(request: Request): Promise<Response> {` 로 바꾸고, 그 위에 새 `POST` 를 둔다:

```ts
/**
 * **계량기 안에서 돈다**(설계 §2-9 B). 판단 · 읽기의 토큰은 공용 어댑터가 이미
 * 적는데(`lib/llm/structured.ts`), 계량기 밖에서 부르면 그 값이 버려진다.
 * 안에서 부르는 기획 라우트는 제 계량기를 따로 연다 — 두 번 세지 않는다.
 */
export async function POST(request: Request) {
  return withLlmMeter(() => turn(request));
}
```

(4) `turn` 안 — 지금의 세 줄을 지운다:

```ts
  const referenceIds: string[] = Array.isArray(input.referenceIds) ? input.referenceIds : [];
  const preservedIds: string[] = Array.isArray(input.preservedIds) ? input.preservedIds : [];
  const personIds: string[] = Array.isArray(input.personIds) ? input.personIds : [];

  const 붙인수 = referenceIds.length + preservedIds.length + personIds.length;
```

그 자리에:

```ts
  /*
   * **붙인 사진 전부, 붙인 순서.** 이름은 `referenceIds` 지만 뜻은 「따라 만들기」가
   * 아니다 — 옛 화면이 그 이름으로 보내므로 이름만 그대로 둔다. 역할은 아래에서
   * 정한다(설계 §2-3). 같은 id 는 한 번만 센다(§2-1 — 두 번 세던 것).
   */
  const 붙인것 = uniqueIds(input.referenceIds);
  const 붙인수 = 붙인것.length;
  if (붙인것.some((id) => !isPhotoId(id))) return 멈춘다(UNUSABLE_PHOTO);
```

(5) `try {` 바로 안, `const 지난줄 = …` 앞에:

```ts
    /*
     * ⓪ **사진 확인**(설계 §2-3). 이미지 만들기와 같은 함수 · 같은 회원 기준으로
     * 읽고, **요청한 사진이 전부 나왔는지** 센다. 조회는 볼 수 없는 id 를 오류
     * 없이 빼므로, 세지 않으면 사진이 빠지거나 번호가 당겨진다.
     */
    const 사진들 = 붙인수
      ? await posterReferencesByIds({
        userId: auth.member.userId,
        role: auth.member.profile.role,
        teamId: await teamIdOf(auth.member.userId),
      }, 붙인것)
      : [];
    if (missingIds(붙인것, 사진들).length) return 멈춘다(UNUSABLE_PHOTO);
    const 고른역할 = readChosenRoles(input.photoRoles, 붙인것);
    const provider = createEasyChatProvider(process.env, textModel);
```

그리고 ⓑ1 호출의 `await createEasyChatProvider(process.env, textModel).decide(` 를 `await provider.decide(` 로 바꾼다.

(6) `if (decision.wants === "image" && 고르기.asks) { … }` 블록 바로 뒤, `// 사용자가 친 말을 남긴다.` 앞에:

```ts
    /*
     * ⓒ → ⓐ → ⓑ2 → ⓓ **사진이 붙은 그림 턴**(설계 §2-3).
     *
     * 말을 남기기 **전에** 한다. 묻거나 멈추면 아무것도 안 남긴다 — 비율 물음과
     * 같다. 말 턴 · 상세페이지 안내 턴은 여기 오지 않으므로 사진을 안 읽는다.
     */
    const 사진판단 = decision.wants === "image" && 붙인수
      ? await runPhotoTurn(
        {
          photos: 사진들,
          words: prompt,
          chosen: 고른역할,
          ratio: 고르기.ratio,
          imageModel: typeof input.imageModel === "string" ? input.imageModel : undefined,
        },
        { read: (photos) => readEasyPhotos(photos), judge: (text) => provider.decideRoles(text) },
      )
      : undefined;
    if (사진판단?.kind === "stop") return 멈춘다(사진판단.message);
    if (사진판단?.kind === "ask") {
      return Response.json({ ok: true, photoAsk: { reason: 사진판단.reason, rows: 사진판단.rows }, textModel });
    }
    const 칸 = 사진판단?.fields;
```

(7) `createProject` 본문의 여섯 칸을 바꾼다:

```ts
      referenceIds: 칸?.referenceIds ?? [],
      preservedIds: 칸?.preservedIds ?? [],
      personIds: 칸?.personIds ?? [],
      restyledIds: 칸?.restyledIds ?? [],
      // AI 가 다듬는다. 그것이 이 모드의 값어치다(설계 §9).
      promptMode: "assisted",
      // **붙인 순서 그대로**(설계 §2-6). 전에는 따라 만들기를 앞으로 당겼다.
      attachmentOrder: 칸?.attachmentOrder ?? [],
      // 말과 최종 역할이 맞을 때만 말 전체, 아니면 빈 글(설계 §2-6).
      attachmentIntent: 사진판단?.attachmentIntent ?? "",
```

(지우는 줄: `referenceIds,` · `preservedIds,` · `personIds,` · `attachmentOrder: [...referenceIds, ...preservedIds],`)

(8) `catch (error) { … }` 뒤에 `finally` 를 단다:

```ts
  } finally {
    값을적는다(auth.member.userId);
  }
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/api/easy app/easy lib/easy
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0, 타입 오류 0. 기존 wiring 시험(「세 단계에 서로 다른 이름」 등)도 그대로 초록이어야 한다

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/api/easy/generate/route.ts apps/web/app/api/easy/__tests__/generate-route.test.ts apps/web/app/api/easy/__tests__/generate-wiring.test.ts
git commit -m "feat(easy): 붙인 사진을 확인하고, 역할대로 이미지 만들기 칸을 채우고, 모르면 묻는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 「만든 조건」에 사진 역할 (§2-8)

**Files:**
- Modify: `apps/web/app/easy/options.ts`
- Modify: `apps/web/app/easy/_components/load.ts:102-110`
- Modify: `apps/web/app/api/easy/generate/route.ts` (응답에 `roles`)
- Test: `apps/web/app/easy/__tests__/options.test.ts`, `apps/web/app/api/easy/__tests__/generate-route.test.ts`

**Interfaces:**
- Consumes: `roleOf` · `StoredAttachmentData` · `AttachmentRole` (`@fixup/shared`, 부르기만)
- Produces: `easyRoleSummary(data: StoredAttachmentData): string`, `EasyImageOptions.roles?: string`, 그림 턴 응답의 `roles: string`

- [ ] **Step 1: 실패하는 시험을 더한다**

`options.test.ts` import 에 `easyRoleSummary` 를 더하고 끝에:

```ts
describe("사진 역할 (설계 §2-8)", () => {
  it("붙인 순서대로 번호와 역할을 적는다", () => {
    expect(easyRoleSummary({
      attachmentOrder: ["a", "b", "c", "d"],
      preservedIds: ["b", "c", "d"],
      personIds: ["c", "d"],
      restyledIds: ["d"],
    })).toBe("①분위기 참고 · ②제품 유지 · ③인물 유지 · ④인물 유지·그림체 바꾸기");
  });

  /** 옛 작업에는 차례가 없다. 지어내지 않는다. */
  it("차례가 없으면 빈 글이다", () => {
    expect(easyRoleSummary({ preservedIds: ["a"] })).toBe("");
  });

  it("스무 장을 넘으면 숫자로 적는다", () => {
    const order = Array.from({ length: 21 }, (_, i) => `p${i}`);
    expect(easyRoleSummary({ attachmentOrder: order }).endsWith("21.분위기 참고")).toBe(true);
  });

  it("결과 밑과 크게 보기 창에 같은 값을 낸다", () => {
    const options = { model: "m", roles: "①제품 유지" };
    expect(easyOptionLines(options)).toContain("①제품 유지");
    expect(easyOptionMeta(options)).toContainEqual(["사진 역할", "①제품 유지"]);
  });
});
```

`generate-route.test.ts` 의 「붙인 순서로 칸을 채우고…」 시험 끝에 한 줄:

```ts
    expect((await 보낸다({ prompt: 말, referenceIds: [사진(1), 사진(2), 사진(3)] })).json.roles)
      .toBe("①분위기 참고 · ②제품 유지 · ③인물 유지·그림체 바꾸기");
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/options.test.ts app/api/easy/__tests__/generate-route.test.ts
```
Expected: FAIL — `easyRoleSummary is not a function`, `roles` 가 undefined

- [ ] **Step 3: 구현한다**

`options.ts` — 맨 위에 import:

```ts
import { roleOf, type AttachmentRole, type StoredAttachmentData } from "@fixup/shared";
```

`EasyImageOptions` 에 칸 하나:

```ts
  /** 붙인 사진마다 어떻게 썼나 — `①제품 유지 · ②분위기 참고`(설계 §2-8). */
  roles?: string;
```

`easyOptionLines` 의 `references` 줄 뒤에 `if (options.roles) lines.push(options.roles);`, `easyOptionMeta` 의 `references` 줄 뒤에 `if (options.roles) rows.push(["사진 역할", options.roles]);`.

파일 끝에:

```ts
const 역할이름: Record<AttachmentRole, string> = {
  style: "분위기 참고",
  preserve_product: "제품 유지",
  preserve_person: "인물 유지",
  preserve_person_restyled: "인물 유지·그림체 바꾸기",
  place_as_is: "원본 그대로",
};

/** ①~⑳, 그 뒤는 숫자. */
function 번호(index: number): string {
  return index < 20 ? String.fromCodePoint(0x2460 + index) : `${index + 1}.`;
}

/**
 * **이 이미지를 만들 때 사진을 어떻게 썼나**(설계 §2-8).
 *
 * 만든 작업에 이미 저장된 칸(차례 · 세 목록)에서 읽는다 — 대화 표에 베끼면
 * 어긋난다. 역할을 가르는 규칙은 이미지 만들기의 `roleOf` 를 그대로 쓴다.
 * 차례가 없는 옛 작업은 빈 글이다.
 */
export function easyRoleSummary(data: StoredAttachmentData): string {
  return (data.attachmentOrder ?? [])
    .map((id, index) => `${번호(index)}${역할이름[roleOf(data, id)]}`)
    .join(" · ");
}
```

`_components/load.ts` — import 에 `easyRoleSummary` 를 더하고(`import { easyRoleSummary, type EasyImageOptions } from "../options";`), `options[row.id] = { … }` 의 `references:` 뒤에:

```ts
        roles: easyRoleSummary(project.data) || undefined,
```

`route.ts` — import 에 `import { easyRoleSummary } from "../../../easy/options";`, 마지막 `return Response.json({ ok: true, projectId, … })` 에 칸 하나:

```ts
      // 만든 조건에 곧바로 적는다. 다시 열 때는 `load.ts` 가 같은 함수로 읽는다.
      roles: 칸 ? easyRoleSummary(칸) : "",
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy app/api/easy
pnpm --filter @fixup/web typecheck
```
Expected: 실패 0, 타입 오류 0

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/easy/options.ts apps/web/app/easy/_components/load.ts apps/web/app/api/easy/generate/route.ts apps/web/app/easy/__tests__/options.test.ts apps/web/app/api/easy/__tests__/generate-route.test.ts
git commit -m "feat(easy): 만든 조건에 사진마다 어떻게 썼는지 적는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 화면 — 사진 물음과 상세페이지 단추 (§2-5, §2-7)

**Files:**
- Create: `apps/web/app/easy/photo-ask-state.ts`
- Create: `apps/web/app/easy/_components/photo-ask.tsx`
- Modify: `apps/web/app/easy/easy-client.tsx`
- Modify: `apps/web/app/easy/_components/message.tsx`
- Test: `apps/web/app/easy/__tests__/photo-ask-state.test.ts`

**Interfaces:**
- Consumes: `photoAskReason` · `canPickPerson` · `isPersonRole` · `EasyPhotoRole` · `JudgedPhotoRole` · `PhotoRow` (Task 2·4), `isDetailPageGuide` · `DETAIL_PAGE_HREF` (Task 1), 응답 `photoAsk` · `roles` (Task 8·9)
- Produces:
  - `interface PhotoAskState { words: string; reason: "unclear" | "people"; rows: PhotoRow[]; picked: Record<string, EasyPhotoRole>; touched: string[] }`
  - `startPhotoAsk(words: string, reason: PhotoAskState["reason"], rows: readonly PhotoRow[]): PhotoAskState`
  - `pickPhoto(state: PhotoAskState, id: string, role: EasyPhotoRole): PhotoAskState`
  - `photoAskReady(state: PhotoAskState): boolean`
  - `photoAnswer(state: PhotoAskState, answer?: string): { prompt: string; photoRoles: Array<{ id: string; role: EasyPhotoRole }> }`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `apps/web/app/easy/__tests__/photo-ask-state.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { photoAnswer, photoAskReady, pickPhoto, startPhotoAsk } from "../photo-ask-state";

/**
 * **물음 화면의 상태**(설계 §2-5). 화면 안에 두면 값으로 못 잰다.
 *
 * 가장 쉽게 깨지는 것: 판단이 「인물 그대로 · 그림체만」으로 정한 줄이 다시
 * 보낼 때 「인물 그대로」로 바뀌는 것 — 그 문구는 그림체 바꾸기를 금지한다.
 */

const 줄 = [
  { id: "a", role: "preserve_person_restyled" as const },
  { id: "b", role: "unclear" as const },
];

describe("물음 시작", () => {
  it("판단이 정한 줄은 고른 채로, 모르는 줄은 빈 채로 연다", () => {
    const state = startPhotoAsk("카페 포스터", "unclear", 줄);

    expect(state.picked).toEqual({ a: "preserve_person_restyled" });
    expect(state.touched).toEqual([]);
  });
});

describe("고르기", () => {
  it("다른 줄에 답해도 그림체만 줄은 그대로 남는다", () => {
    const state = pickPhoto(startPhotoAsk("카페 포스터", "unclear", 줄), "b", "style");

    expect(state.picked).toEqual({ a: "preserve_person_restyled", b: "style" });
  });

  it("그 줄에서 다른 단추를 누르면 바뀐다", () => {
    expect(pickPhoto(startPhotoAsk("x", "unclear", 줄), "a", "style").picked.a).toBe("style");
  });

  it("원래 상태를 바꾸지 않는다", () => {
    const before = startPhotoAsk("x", "unclear", 줄);
    pickPhoto(before, "b", "style");
    expect(before.picked).toEqual({ a: "preserve_person_restyled" });
  });
});

describe("다 골랐나", () => {
  it("모르는 줄이 남으면 아직이다", () => {
    expect(photoAskReady(startPhotoAsk("x", "unclear", 줄))).toBe(false);
  });

  it("인물이 두 줄이면 아직이다", () => {
    const state = startPhotoAsk("x", "people", [
      { id: "a", role: "preserve_person" }, { id: "b", role: "preserve_person" },
    ]);
    expect(photoAskReady(state)).toBe(false);
    expect(photoAskReady(pickPhoto(state, "b", "style"))).toBe(true);
  });
});

describe("답하기", () => {
  it("단추로 답하면 처음 말과 모든 줄의 고른 값을 보낸다 — 그림체만 줄도", () => {
    const state = pickPhoto(startPhotoAsk("카페 포스터", "unclear", 줄), "b", "style");

    expect(photoAnswer(state)).toEqual({
      prompt: "카페 포스터",
      photoRoles: [{ id: "a", role: "preserve_person_restyled" }, { id: "b", role: "style" }],
    });
  });

  /** Review Focus 5 */
  it("말로 답하면 처음 말과 답을 잇고, 직접 누른 줄만 보낸다", () => {
    const state = pickPhoto(startPhotoAsk("카페 포스터", "unclear", 줄), "b", "preserve_product");

    expect(photoAnswer(state, "  2번은 우리 원두 봉투야 ")).toEqual({
      prompt: "카페 포스터\n2번은 우리 원두 봉투야",
      photoRoles: [{ id: "b", role: "preserve_product" }],
    });
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-ask-state.test.ts
```
Expected: FAIL — `photo-ask-state` 를 못 찾음

- [ ] **Step 3: 상태 모듈을 쓴다** — `apps/web/app/easy/photo-ask-state.ts`

```ts
import { photoAskReason, type EasyPhotoRole, type PhotoRow } from "./photo-roles";

/**
 * **사진을 어떻게 쓸지 묻는 동안의 상태**(설계 §2-5).
 *
 * 화면에만 있고 대화 표에는 안 남는다 — 답 없이 떠나면 아무 일도 안 일어난 것이
 * 맞다(비율 물음과 같다).
 */
export interface PhotoAskState {
  /** 물음을 부른 말. 말로 답하면 그 앞에 붙인다. */
  words: string;
  reason: "unclear" | "people";
  /** 서버가 준 줄. `role` 은 판단이 정한 것 — 「그림체만」 표시를 이것으로 가른다. */
  rows: PhotoRow[];
  /** 지금 골라져 있는 것. 판단이 정한 줄은 처음부터 골라져 있다. */
  picked: Record<string, EasyPhotoRole>;
  /** 사용자가 직접 누른 줄. 말로 답할 때는 이것만 보낸다. */
  touched: string[];
}

export function startPhotoAsk(
  words: string,
  reason: PhotoAskState["reason"],
  rows: readonly PhotoRow[],
): PhotoAskState {
  return {
    words,
    reason,
    rows: [...rows],
    picked: Object.fromEntries(
      rows.filter((row) => row.role !== "unclear").map((row) => [row.id, row.role as EasyPhotoRole]),
    ),
    touched: [],
  };
}

/** 한 줄을 고른다. 다른 줄은 건드리지 않는다. */
export function pickPhoto(state: PhotoAskState, id: string, role: EasyPhotoRole): PhotoAskState {
  return {
    ...state,
    picked: { ...state.picked, [id]: role },
    touched: state.touched.includes(id) ? state.touched : [...state.touched, id],
  };
}

/** 모든 줄이 골라졌고 인물이 한 줄 이하인가. 서버와 같은 셈이다. */
export function photoAskReady(state: PhotoAskState): boolean {
  return photoAskReason(state.rows.map((row) => ({ id: row.id, role: state.picked[row.id] ?? "unclear" }))) === null;
}

/**
 * 보낼 것.
 *
 * - **단추로 답하면** 처음 말 그대로, 모든 줄의 고른 값을 보낸다 — 서버는 고른
 *   사진을 안 읽는다
 * - **말로 답하면** 처음 말과 답을 잇는다(묻는 동안 대화 표에 아무것도 안 남으므로,
 *   답만 보내면 처음 말이 사라진다). 고른 값은 사용자가 **직접 누른 줄만** 보낸다 —
 *   나머지는 이어진 말로 다시 판단한다
 */
export function photoAnswer(
  state: PhotoAskState,
  answer?: string,
): { prompt: string; photoRoles: Array<{ id: string; role: EasyPhotoRole }> } {
  const 말 = answer?.trim();
  const ids = 말 ? state.touched : state.rows.map((row) => row.id);
  return {
    prompt: 말 ? `${state.words}\n${말}` : state.words,
    photoRoles: ids.flatMap((id) => (state.picked[id] ? [{ id, role: state.picked[id]! }] : [])),
  };
}
```

- [ ] **Step 4: 상태 시험 통과를 본다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy/__tests__/photo-ask-state.test.ts
```
Expected: 실패 0

- [ ] **Step 5: 화면을 잇는다**

`apps/web/app/easy/_components/photo-ask.tsx` (새):

```tsx
"use client";

import * as React from "react";
import { Button, cn } from "@fixup/ui";
import { canPickPerson, isPersonRole, type EasyPhotoRole, type JudgedPhotoRole } from "../photo-roles";

/** 물음의 한 줄. 주소는 화면이 붙인 사진에서 채운다. */
export interface PhotoAskRow {
  id: string;
  /** 판단이 정한 것. 「그림체만」 단추를 이 줄에 낼지 이것이 정한다. */
  role: JudgedPhotoRole;
  url?: string;
  title?: string;
}

const 단추: ReadonlyArray<{ role: EasyPhotoRole; label: string }> = [
  { role: "style", label: "분위기만 참고" },
  { role: "preserve_product", label: "제품 그대로" },
  { role: "preserve_person", label: "인물 그대로" },
];

/**
 * **판단이 그 역할로 정한 줄에만** 낸다(설계 §2-5). 새 단추로 모두에게 내면
 * 읽고 고르는 데 오래 걸린다. 그렇다고 빼면 다시 보낼 때 「인물 그대로」로
 * 바뀌는데, 그 문구는 그림체 바꾸기를 금지한다.
 */
const 그림체만 = { role: "preserve_person_restyled" as const, label: "인물 그대로 · 그림체만" };

/**
 * **사진을 어떻게 쓸지 묻는 줄**(설계 §2-5).
 *
 * 물음은 코드가 짓는다 — 같은 상황에 같은 물음이 나와야 사용자가 배운다.
 * 분명한 사진은 이미 고른 채로 보이고, 틀렸으면 여기서 바꾼다.
 */
export function EasyPhotoAsk({
  reason,
  rows,
  picked,
  ready,
  onPick,
  onSubmit,
  disabled,
}: {
  reason: "unclear" | "people";
  rows: readonly PhotoAskRow[];
  picked: Readonly<Record<string, EasyPhotoRole | undefined>>;
  /** 모두 골랐고 인물이 한 줄 이하인가(`photoAskReady`). */
  ready: boolean;
  onPick: (id: string, role: EasyPhotoRole) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
      <p className="text-base leading-7">
        {reason === "people"
          ? "인물을 그대로 지킬 사진은 한 장만 됩니다. 두 사람의 얼굴이 섞이기 때문이에요. 한 장만 「인물 그대로」로 골라 주세요."
          : "사진을 어떻게 쓸지 알려 주세요."}
      </p>

      {rows.map((row, index) => {
        const 고를것 = row.role === "preserve_person_restyled" ? [...단추, 그림체만] : 단추;
        return (
          <div key={row.id} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex w-16 shrink-0 items-center gap-1.5 text-meta text-subtle-foreground">
              {String.fromCodePoint(0x2460 + Math.min(index, 19))}
              {row.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.url} alt={row.title ?? `사진 ${index + 1}`} className="size-9 rounded border border-border object-cover" />
              ) : null}
            </span>
            {고를것.map((item) => {
              const on = picked[row.id] === item.role;
              const 막힘 = isPersonRole(item.role) && !on && !canPickPerson(picked, row.id);
              return (
                <button
                  key={item.role}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled || 막힘}
                  onClick={() => onPick(row.id, item.role)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-meta transition-colors disabled:opacity-50",
                    on
                      ? "border-primary bg-primary-soft font-medium text-primary"
                      : "border-border bg-background hover:border-primary/50",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        );
      })}

      <p className="text-meta text-subtle-foreground">말로 답하셔도 됩니다 — 「1번은 우리 원두 봉투야」</p>
      <div className="flex justify-end">
        <Button size="sm" disabled={disabled || !ready} onClick={onSubmit}>이걸로 만들기</Button>
      </div>
    </div>
  );
}
```

`apps/web/app/easy/easy-client.tsx` — 여덟 곳:

(a) import 둘을 더한다(19줄 `EasyAskChoice` 아래):

```tsx
import { EasyPhotoAsk } from "./_components/photo-ask";
import { photoAnswer, photoAskReady, pickPhoto, startPhotoAsk, type PhotoAskState } from "./photo-ask-state";
import type { EasyPhotoRole } from "./photo-roles";
```

(b) `const [askLook, setAskLook] = React.useState("");` 바로 뒤:

```tsx
  /*
   * **사진을 어떻게 쓸지 묻는 중**(설계 §2-5). 비율 물음처럼 화면에만 있다.
   */
  const [photoAsking, setPhotoAsking] = React.useState<PhotoAskState | null>(null);
```

(c) 사진이 바뀌면 물음을 거둔다(Review Focus 1). `upload` 안의 `setAttachments((current) => [...current, attachmentFromUpload(body.image, one)]);` 뒤, `pickFromLibrary` 안의 `setAttachments(…)` 뒤, 그리고 × 단추의 `onClick` 을 각각 이렇게:

```tsx
        setPhotoAsking(null);
```

```tsx
                onClick={() => { setAttachments((c) => c.filter((x) => x.id !== one.id)); setPhotoAsking(null); }}
```

(d) `send` 의 인자와 첫 줄:

```tsx
  async function send(
    /** 물어본 뒤 다시 보낼 때 쓴다. 비우면 입력창의 말을 보낸다. */
     다시?: { prompt: string; ratio?: string; look?: string; photoRoles?: Array<{ id: string; role: EasyPhotoRole }> },
  ) {
    /*
     * **사진을 물은 뒤 말로 답하면** 처음 말과 답을 잇는다(설계 §2-5).
     */
    const 말답 = !다시 && photoAsking && draft.trim() ? photoAnswer(photoAsking, draft) : undefined;
    const prompt = 다시?.prompt ?? 말답?.prompt ?? draft.trim();
    const photoRoles = 다시?.photoRoles ?? 말답?.photoRoles;
    if (!prompt || (!다시 && !turn.canSend)) return;
```

(e) `setError(null);` 바로 뒤에 `setPhotoAsking(null);` 한 줄. 그리고 `else` 갈래의 내 말 그리기를:

```tsx
      setMessages((current) => [...current, { id: `user-${자리}`, role: "user", body: 말답 ? draft.trim() : prompt }]);
```

(f) 요청 본문 — `referenceIds: attachments.map((one) => one.id),` 바로 뒤:

```tsx
          // 물음에 답한 것. 서버가 다시 확인한다(설계 §2-5).
          ...(photoRoles?.length ? { photoRoles } : {}),
```

(g) 응답 — `if (body.ok && body.asked) { … }` 블록 바로 뒤:

```tsx
      if (body.ok && body.photoAsk) {
        /*
         * **사진을 어떻게 쓸지 묻고 끝낸다**(설계 §2-5). 값은 안 들었다.
         * 고르거나 말로 답하면 이 말과 함께 다시 보낸다.
         */
        setPhotoAsking(startPhotoAsk(prompt, body.photoAsk.reason, body.photoAsk.rows));
        return;
      }
```

그리고 `setOptions` 의 `references: attachments.length,` 뒤에:

```tsx
            ...(typeof body.roles === "string" && body.roles ? { roles: body.roles } : {}),
```

(h) 그리기 — `{asking ? ( <EasyAskChoice … /> ) : null}` 바로 뒤:

```tsx
          {photoAsking ? (
            <EasyPhotoAsk
              reason={photoAsking.reason}
              rows={photoAsking.rows.map((row) => {
                const 붙인것 = attachments.find((one) => one.id === row.id);
                return { ...row, url: 붙인것?.url, title: 붙인것?.title };
              })}
              picked={photoAsking.picked}
              ready={photoAskReady(photoAsking)}
              disabled={turn.busy}
              onPick={(id, role) => setPhotoAsking((current) => (current ? pickPhoto(current, id, role) : current))}
              onSubmit={() => {
                const 답 = photoAnswer(photoAsking);
                void send({ prompt: 답.prompt, photoRoles: 답.photoRoles });
              }}
            />
          ) : null}
```

그리고 생각 중 줄의 조건 `turn.busy && !asking && shown[…]` 을 `turn.busy && !asking && !photoAsking && shown[…]` 로.

`apps/web/app/easy/_components/message.tsx` — 5줄 `import { cn } from "@fixup/ui";` 를 `import { Button, cn } from "@fixup/ui";` 로 바꾸고, 그 아래에 둘을 더한다:

```tsx
import Link from "next/link";
import { DETAIL_PAGE_HREF, isDetailPageGuide } from "../detail-page";
```

`system`·`assistant` 갈래를:

```tsx
  if (message.role === "system" || message.role === "assistant") {
    const 말풍선 = "whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-base leading-7";
    return (
      <div className="flex items-start gap-2">
        <AssistantMark />
        {isDetailPageGuide(message) ? (
          /*
            **상세페이지 안내 줄에만 단추를 단다**(설계 §2-7). 대화 표에 갈래를
            더하지 않고 문장으로 가른다 — 다시 열어도 그대로 보인다.
          */
          <div className="grid max-w-[85%] gap-2">
            <p className={말풍선}>{message.body}</p>
            <Button asChild size="sm" variant="secondary" className="w-fit">
              <Link href={DETAIL_PAGE_HREF}>상세페이지 만들기 열기</Link>
            </Button>
          </div>
        ) : (
          <p className={cn("max-w-[85%]", 말풍선)}>{message.body}</p>
        )}
      </div>
    );
  }
```

- [ ] **Step 6: 검사한다**

```bash
pnpm --filter @fixup/web exec vitest run app/easy app/api/easy lib/easy
pnpm --filter @fixup/web typecheck
pnpm --filter @fixup/web lint
wc -l apps/web/app/easy/easy-client.tsx
```
Expected: 실패 0, 타입 오류 0, 린트 오류 0, `easy-client.tsx` 800줄 이하

- [ ] **Step 7: 실제 화면으로 확인한다** (값이 안 드는 두 가지)

워크트리에는 `.env.local` 이 없다 — 사용자 확인을 받고 본 저장소의 것을 복사한다(`LOCAL_STORE=1` · Supabase 빈 값 그대로). 사용자가 보는 개발 서버와 겹치지 않게 **3100** 에 띄운다(빌드는 하지 않는다).

```bash
cp "C:/Users/PC/Desktop/coding/fixup-image-agent/apps/web/.env.local" apps/web/.env.local
pnpm --filter @fixup/web exec next dev -p 3100
```

Playwright 로 **한 번에 도구 하나씩**(사용자 규칙):
1. `http://localhost:3100/easy` → 사진 한 장 올리기 → 「카페 포스터 만들어줘」 → **사진 물음 줄이 뜨는지** 스크린샷. 여기서 「이걸로 만들기」는 누르지 않는다(누르면 그림값이 든다)
2. 새 대화 → 「상세페이지 만들어줘」 → **안내 줄과 「상세페이지 만들기 열기」 단추** 스크린샷 → 단추가 `/create` 로 가는지

그림 한 장을 끝까지 만들어 보는 것은 값이 들므로 **사용자에게 물은 뒤에만** 한다. 끝나면 개발 서버를 끈다.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/easy/photo-ask-state.ts apps/web/app/easy/_components/photo-ask.tsx apps/web/app/easy/easy-client.tsx apps/web/app/easy/_components/message.tsx apps/web/app/easy/__tests__/photo-ask-state.test.ts
git commit -m "feat(easy): 사진을 어떻게 쓸지 묻는 줄과 상세페이지 만들기 단추

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`apps/web/.env.local` 은 커밋하지 않는다(무시 목록에 있는지 `git status` 로 확인).

---

### Task 11: 전체 검사와 0줄 확인 (§2-10)

- [ ] **Step 1: 전체를 돌린다**

```bash
pnpm --filter @fixup/web typecheck
pnpm --filter @fixup/web test
pnpm --filter @fixup/web lint
```
Expected: 타입 오류 0, 시험 실패 0(통과 수를 적는다), 린트 오류 0

- [ ] **Step 2: 기존 코드 0줄을 증거로 남긴다**

```bash
git diff --stat $START -- packages/poster-core packages/shared packages/sns-core \
  apps/web/app/api/poster apps/web/app/poster apps/web/app/sns apps/web/app/api/sns \
  apps/web/lib/poster apps/web/lib/reference-images.ts apps/web/lib/membership \
  apps/web/lib/llm supabase
```
Expected: 아무것도 안 나온다(0줄). 무엇이든 나오면 멈추고 그 변경을 되돌린다

- [ ] **Step 3: 고친 곳이 「쉽게」뿐인지**

```bash
git diff --stat $START
```
Expected: `apps/web/app/easy` · `apps/web/app/api/easy` · `apps/web/lib/easy` · `apps/web/scripts/easy-measure` · `docs/` 만

---

### Task 12: 뮤테이션 검증 — 규칙 하나씩 무력화해 시험이 잡는지

규칙마다 한 줄을 일부러 망가뜨리고, 관련 시험을 돌려 **빨간 것**을 확인한 뒤 `git checkout -- <파일>` 로 되돌린다. `git stash` 는 쓰지 않는다(다른 세션과 공유된다).

| # | 망가뜨릴 곳 | 망가뜨리는 법 | 잡아야 할 시험 |
|---|---|---|---|
| M1 | `photo-roles.ts` `mergeRoles` | `input.chosen[id] ?? …` → `input.judged.photos[index]?.role ?? input.chosen[id] ?? "unclear"` | photo-roles 「고른 것이 판단을 이긴다」, route 「단추가 말을 뒤집으면…」 |
| M2 | `photo-roles.ts` `readRoleJudgment` | `const 모름 = { role: "unclear", … }` → `role: "style"` | photo-roles 「빠진 번호는 unclear」 등, photo-turn 「읽기가 전부 실패하고…」 |
| M3 | `photo-check.ts` `missingIds` | `return [];` | route 「볼 수 없는 사진이 하나라도…」 |
| M4 | `photo-check.ts` `photoLimit` | `chooseModelForRatio(…)` 대신 `IMAGE_MODELS.find((m) => m.id === input.imageModel) ?? IMAGE_MODELS[0]!` | photo-check 「비율 때문에 바뀐 모델의 상한」 |
| M5 | `photo-fields.ts` `easyAttachmentIntent` | `if (input.judged.conflicting) return "";` 지우기 | photo-fields 「말 안에서 엇갈리면…」 |
| M6 | `photo-fields.ts` `easyAttachmentIntent` | `return 뒤집힘 ? "" : …` → `return input.words.trim();` | photo-fields 「고른 것이 말을 뒤집으면…」 · 최종 프롬프트, route 「단추가 말을…」 |
| M7 | `photo-fields.ts` `posterFieldsFrom` | `preservedIds: idsWhere((role) => role === "preserve_product")` | photo-fields 「⊆」 · 「입력 검사」, route 「붙인 순서로 칸을…」 |
| M8 | `photo-roles.ts` `photoAskReason` | `return people > 1 ? … : null` → `return null` | photo-roles 「인물 역할인 사진이 둘이면」, photo-turn, route 「인물 사진이 둘이면」 |
| M9 | `photo-turn.ts` | `const toRead = input.photos.filter(…)` → `const toRead = input.photos;` | photo-turn 「단추로 고른 사진은 읽지 않는다」, route 「모두 단추로…」 |
| M10 | `route.ts` | `if (decision.wants === "detail_page") { … }` 블록 지우기 | route 「상세페이지 요청은…」, wiring 「상세페이지 안내」 |
| M11 | `photo-roles.ts` `readChosenRoles` | `allowed.has(one.id) &&` 지우기 | photo-roles 「목록 밖의 id 는 버린다」, route 「남의 사진 id…」 |
| M12 | `photo-ask-state.ts` `pickPhoto` | `picked: { ...state.picked, [id]: role }` → `picked: { [id]: role }` | photo-ask-state 「다른 줄에 답해도 그림체만 줄은…」 |
| M13 | `route.ts` | `const 사진판단 = decision.wants === "image" && 붙인수` → `… && 붙인수 && false` (사진 턴 건너뛰기) | route 「모르는 사진이 있으면 묻는다」 등 |

- [ ] **Step 1: 표의 열세 줄을 하나씩** — 고치고 → 해당 시험 파일을 돌려 FAIL 확인 → `git checkout -- <파일>` → 같은 시험을 돌려 PASS 확인
- [ ] **Step 2: 결과를 적는다** — `docs/easy-measure/2026-09-30-mutation.md` 에 표(# · 무엇 · 빨간 시험 이름)로. **안 잡힌 것이 있으면** 그 규칙에 시험을 더하고(빨강→초록 확인) 다시 잰다
- [ ] **Step 3: 전체 시험을 한 번 더 돌려 초록 확인**, 그리고 커밋

```bash
pnpm --filter @fixup/web test
git add docs/easy-measure/2026-09-30-mutation.md
git commit -m "test(easy): 사진 역할 규칙 뮤테이션 검증 결과

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 독립 리뷰 → 보고

- [ ] **Step 1: 다른 에이전트가 따로 본다** — `code-reviewer` 에이전트에 설계 §2 · 이 계획 · `git diff $START..HEAD` 를 주고 봐 달라고 한다. 특히: 사진 권한(⓪) · 최종 프롬프트에서 말과 역할의 차례 · 값이 나가기 전의 멈춤 · 물을 때 아무것도 안 남기는지 · 0줄
- [ ] **Step 2: 지적을 코드로 확인한다** — 맞는 것만 고친다(시험 먼저). 틀린 지적은 근거를 적는다. CRITICAL · HIGH 는 고치고 넘어간다
- [ ] **Step 3: 마지막 검사** — Task 11 Step 1·2 를 다시 돌린다
- [ ] **Step 4: 사용자에게 쉬운 말로 보고한다** — 실측 결과(치명 · 어긋남 · 걸린 시간 · 값), 시험 수, 뮤테이션 결과, 리뷰에서 고친 것, 0줄 증거. **합치기 · 배포는 하지 않았다**고 적는다. 사용자가 남긴 확인거리: 운영 데이터(실제 라이브러리 사진)로는 배포 뒤에만 볼 수 있다(`CLAUDE.md` 「로컬 확인」)
