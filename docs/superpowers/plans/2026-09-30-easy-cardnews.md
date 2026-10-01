# 「쉽게」 2단계 — 채팅에서 카드뉴스 끝까지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「쉽게」 채팅에서 말만으로 카드뉴스 원고를 받고, 조건을 단추로 바꾸거나 말로 고친 뒤, 「이대로 만들기」로 카드를 만든다 — 기존 카드뉴스 라우트를 그대로 부른다.

**Architecture:** 판단은 1단계처럼 `app/easy/` 의 순수 함수로 두고 값으로 잰다(갈래 · 내용 고르기 · 첨부 만들기 · 조건 · 원고 보기). 서버는 `lib/easy/cardnews-*.ts` 가 카드뉴스 라우트 셋(만들기 · 원고 · 그림)을 함수로 부른다. 「이대로 만들기」와 「조건 바꾸기」는 새 라우트 `api/easy/cardnews` 가 받는다. 대화 표는 그대로 두고, 다시 열 때 `work_id` 를 포스터에서 먼저 · 없으면 카드뉴스에서 찾는다.

**Tech Stack:** Next.js 15 App Router, TypeScript, vitest 4, pnpm 9, `@fixup/sns-core` · `@fixup/shared`, 셸 `RunningJobsProvider`.

**Spec:** `docs/superpowers/specs/2026-09-30-easy-cardnews-design.md` (2단계). 1단계 규칙은 `2026-09-30-easy-expansion-design.md` §2.

## Global Constraints

- 작업 폴더 `.worktrees/easy-cardnews`, 가지 `feat/easy-cardnews`. **합치기 · push · 배포 금지**(사용자가 말하기 전까지)
- **기존 코드 0줄:** `git diff --stat $START -- packages apps/web/app/api/poster apps/web/app/poster apps/web/app/sns apps/web/app/api/sns apps/web/lib/sns apps/web/lib/sns-flow-store.ts apps/web/lib/poster apps/web/lib/reference-images.ts apps/web/lib/membership apps/web/lib/llm apps/web/app/api/reference-sets apps/web/lib/running-jobs.ts apps/web/app/_components supabase` → 0줄
- 고치는 곳은 `apps/web/app/easy` · `apps/web/app/api/easy` · `apps/web/lib/easy`(+ `apps/web/scripts/easy-measure`, `docs/`)
- **마이그레이션 없음**
- **아무것도 지우지 않는다** — 다시 쓴 원고도, 빈 원고도(2026-09-30 사용자 결정)
- 원고 단계에서 회원 크레딧 0. 크레딧은 「이대로 만들기」에서만(카드뉴스 `generate` 라우트가 잡는다)
- 판단 모델에 사진 id 를 주지 않는다(번호만). 물음 문구는 코드가 짓는다
- 새 문자열에 줄표(—) 금지(`app/__tests__/ui-text-dash.test.ts`)
- 매 Task 시작 전 설계 문서 해당 절과 수정할 파일을 다시 읽는다
- `next build` 금지. 검사는 typecheck · test · lint
- 커밋: `<type>(easy): <한국어>` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 파일 800줄 이하. `easy-client.tsx`(766줄)에는 연결만 넣고 판단 · 부품은 새 파일로

## Review Focus

1. **원고가 여러 번 다시 쓰인 대화에서 「이대로 만들기」가 앞 원고를 가리킨다** → 화면은 마지막 원고에만 단추를 낸다. 서버는 그 작업이 이 대화 것이고 원고 단계인지만 본다(앞 원고도 이 대화 것이라 만들 수 있다 — 누르는 곳이 없을 뿐). (Task 9 시험 「이 대화 줄이 없는 작업은 안 만든다」, Task 11 시험 「마지막 원고에만 단추」)
2. **카드뉴스를 만드는 중에 대화를 떠났다 돌아온다** → 셸이 이어 불렀고, 돌아오면 「쉽게」가 다시 이어 부른다. 한 작업을 둘이 겹쳐 부르지 않는다(셸 등록 주소 = 대화 주소). (Task 11 시험 「셸 등록 주소」)
3. **레퍼런스 세트를 골랐는데 세트 그림 일부가 내 라이브러리에 없다** → 있는 것만 붙이고 없는 것은 말한다. 하나도 없으면 레퍼런스 요청이 그대로다. (Task 11 시험 「세트 그림 중 없는 것」)
4. **원고가 0장(자막 없는 유튜브 등)** → 까닭을 말하고 원고 줄을 안 남긴다. 작업은 지우지 않는다. (Task 8 시험 「원고 0장」)
5. **이미지 한 장 흐름이 그대로인지** — 갈래를 늘리다 1단계가 깨지면 안 된다. (Task 8 시험 「이미지 한 장은 지금 그대로」, 1단계 시험 전부)

## 설계 §11 확인 결과 (2026-09-30, 코드로 봤다)

| # | 물음 | 답 | 근거 |
|---|---|---|---|
| 1 | 한 그림을 자리만 달리해 세 번 넣을 수 있나 | **된다.** 입력 검사에 id 겹침 검사가 없고, 올리기는 id 로 한 번만(`uploadUniqueReferences`), 카드마다 제 자리 것 하나만 쓴다. 값 셈은 원본 장 · 마지막 장을 뺀다 | `app/api/sns/projects/schema.ts:5-14`, `lib/sns/queued-flow.ts:251-259`, `app/sns/cost-estimate.ts:64-79` |
| 2 | 참고 그림 경로가 `${userId}/` 로 시작하나 | **그렇다** — `{user_id}/references/{id}.{ext}` | `lib/poster/asset-bytes.ts:51`, `docs/DEPLOY.md:24-25` |
| 3 | 원고 1~2분을 요청 안에서 기다려도 되나 | **된다.** Caddy 중계에 응답 시간 제한이 없고, 카드뉴스 원고 라우트가 `maxDuration = 300` 이다. 「쉽게」도 같은 값을 적는다 | `deploy/ec2/Caddyfile.template:27-31`, `app/api/sns/projects/[id]/plan/route.ts:12` |
| 4 | image-v2 에서 원본 장 · 마지막 장도 차감되나 | **된다.** 예약이 `creditImagePlan(cards.length)`, 정산이 `done` 인 장 전부. 카드뉴스 화면도 「완성 카드 N장 · N크레딧」 — 그래서 「쉽게」 값도 **원고 장수** | `generate/route.ts:72`, `lib/sns/settle.ts:96-99`, `app/sns/_components/spec-picker.tsx:34-38` |
| 5 | 셸 백그라운드에 어떻게 등록하나 | `useRunningJobs().start(job)` · `finish(id)`. id 는 `jobId("sns", projectId)` — 카드뉴스 화면과 같아서 겹쳐 등록해도 하나로 합쳐진다 | `app/_components/running-jobs.tsx:20-36`, `lib/running-jobs.ts:60-77` |

설계를 바꿀 답은 없었다.

---

## 파일 지도

| 파일 | 할 일 | Task |
|---|---|---|
| `app/easy/chat.ts` · `lib/easy/chat-provider.ts` | ⓑ1 에 cardnews · either · revise | 1 |
| `app/easy/photo-roles.ts` · `photo-turn.ts` | 카드뉴스 역할 둘(place_as_is · ending) | 2 |
| `scripts/easy-measure/*.mts` | 실측 | 3 |
| `app/easy/cardnews-source.ts` (새) | 내용 고르기 | 4 |
| `app/easy/cardnews-attachments.ts` (새) | 역할 → 카드뉴스 첨부 · 자리 나누기 | 5 |
| `app/easy/cardnews-options.ts` (새) | 조건 · 값 표시 | 6 |
| `app/easy/cardnews-view.ts` (새) | 작업 → 화면에 그릴 것 | 6 |
| `app/easy/cardnews-redraft.ts` (새) | 다시 쓰기 입력 | 7 |
| `lib/easy/relay.ts` (새, 라우트에서 옮김) | 대신 부르기 · 오류 | 7 |
| `lib/easy/cardnews-steps.ts` (새) | 카드뉴스 라우트 셋 부르기 · 원고 턴 · 다시 쓰기 | 8 |
| `app/api/easy/generate/route.ts` | 갈래 물음 · 카드뉴스 · 다시 쓰기 잇기 | 8 |
| `app/api/easy/cardnews/route.ts` (새) | 「이대로 만들기」 · 조건 바꾸기 | 9 |
| `app/easy/_components/load.ts` | 카드뉴스 작업 읽기 | 10 |
| `app/easy/cardnews-state.ts` (새) · `_components/*` · `easy-client.tsx` · `message.tsx` | 화면 | 11 |

**시험 돌리는 법** — 워크트리 뿌리에서 `pnpm --filter @fixup/web exec vitest run <apps/web 기준 경로>`

---

### Task 0: 준비

- [ ] **Step 1:** 기준선 — `pnpm --filter @fixup/web exec vitest run app/easy app/api/easy lib/easy` · `pnpm --filter @fixup/web typecheck`. Expected: 실패 0, 타입 오류 0
- [ ] **Step 2:** 계획서 커밋 후 `git rev-parse HEAD` 를 `START` 로 적는다

```bash
git add docs/superpowers/plans/2026-09-30-easy-cardnews.md
git commit -m "docs(easy): 2단계 구현 계획

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse HEAD
```

---

### Task 1: ⓑ1 — 카드뉴스 · 애매함 · 다시 쓰기를 가른다 (설계 §4, §7)

**Files:** Modify `app/easy/chat.ts`, `lib/easy/chat-provider.ts:43` · Test `app/easy/__tests__/chat.test.ts`

**Interfaces — Produces:**
- `EasyDecision.wants: "image" | "cardnews" | "either" | "revise" | "talk" | "detail_page"`
- `easyChatPrompt(history, prompt, attachmentCount = 0, hasDraft = false): string`
- `readEasyDecision(raw: unknown, options?: { canRevise?: boolean }): EasyDecision` — `revise` 인데 `canRevise` 가 아니면 `talk`

- [ ] **Step 1: 실패하는 시험** — `chat.test.ts` 끝에

```ts
describe("카드뉴스 갈래 (2단계 설계 §4)", () => {
  it("cardnews 와 either 를 읽는다", () => {
    expect(readEasyDecision({ wants: "cardnews", reply: "", ratio: "", look: "" }).wants).toBe("cardnews");
    expect(readEasyDecision({ wants: "either", reply: "", ratio: "", look: "" }).wants).toBe("either");
  });

  it("원고가 있을 때만 revise 를 받는다", () => {
    expect(readEasyDecision({ wants: "revise", reply: "", ratio: "", look: "" }, { canRevise: true }).wants).toBe("revise");
    expect(readEasyDecision({ wants: "revise", reply: "", ratio: "", look: "" }).wants).toBe("talk");
  });

  it("한 장인지 여러 장인지 모르면 짐작하지 말라고 알린다", () => {
    const prompt = easyChatPrompt([], "신메뉴 홍보물 만들어줘");
    expect(prompt).toContain("either");
    expect(prompt).toContain("신메뉴 홍보물");
    expect(prompt).toContain("cardnews");
  });

  it("원고가 있는 대화에서만 revise 를 알려 준다", () => {
    expect(easyChatPrompt([], "더 짧게", 0, true)).toContain("revise");
    expect(easyChatPrompt([], "더 짧게")).not.toContain("revise");
  });
});
```

- [ ] **Step 2:** 돌려서 FAIL 확인(`무슨 뜻인지 가리지 못했습니다: "cardnews"` 등)

- [ ] **Step 3: 구현** — `chat.ts`

(1) `wants` 타입과 주석:

```ts
  /**
   * `image` 면 한 장, `cardnews` 면 카드뉴스 원고, `either` 면 둘 중 무엇인지 묻고,
   * `revise` 면 이 대화의 마지막 원고를 말대로 다시 쓴다(2단계 설계 §4 · §7).
   * `talk` 면 `reply` 를 적고, `detail_page` 면 안내 한 줄로 끝낸다.
   */
  wants: "image" | "cardnews" | "either" | "revise" | "talk" | "detail_page";
```

(2) `easyChatPrompt` 에 넷째 인자 `hasDraft = false` 를 더하고, 갈래 목록의 `"  image  지금 **이미지를 만들어 달라는 것**입니다.",` 한 줄을 이것으로 바꾼다:

```ts
    "  image     지금 이미지 **한 장**을 만들어 달라는 것입니다. 포스터 · 배너 · 썸네일 ·",
    "            그림 · 사진 · 로고 · 프로필처럼 원래 한 장인 것이거나, 「한 장」 · 「하나」를",
    "            말했을 때입니다. 「카드뉴스 표지 한 장만」도 image 입니다.",
    "  cardnews  **카드뉴스**(여러 장으로 된 카드 · 슬라이드 · 캐러셀)를 만들어 달라는 것입니다.",
    "  either    만들어 달라는 것은 분명한데 **한 장인지 여러 장인지 알 수 없습니다.**",
    "            「신메뉴 홍보물 만들어줘」 · 「이걸로 만들어줘」 · 「인스타에 올릴 거 만들어줘」.",
    "            짐작하지 말고 either 로 두세요. 사용자에게 물어봅니다.",
    ...(hasDraft
      ? [
        "  revise    이 대화에서 **방금 쓴 카드뉴스 원고를 고쳐 달라는 것**입니다. 「더 짧게」 ·",
        "            「20대 말투로」 · 「존댓말로」. 새 주제를 말하면 revise 가 아니라 cardnews 입니다.",
      ]
      : []),
```

그리고 `"`image` 면 `reply` 는 빈 글로 두세요. 이미지가 곧 답입니다.",` 를 이것으로 바꾼다:

```ts
    "`image` · `cardnews` · `either` · `revise` 면 `reply` 는 빈 글로 두세요.",
```

(3) `readEasyDecision`:

```ts
export function readEasyDecision(raw: unknown, options: { canRevise?: boolean } = {}): EasyDecision {
  const value = raw as { wants?: unknown; reply?: unknown; ratio?: unknown; look?: unknown } | null;
  const said = value?.wants;

  if (typeof said !== "string" || !아는갈래.has(said)) {
    throw new Error(`무슨 뜻인지 가리지 못했습니다: ${JSON.stringify(said)}`);
  }
  // 고칠 원고가 없는데 고치라고 하면 말로 답한다 — 만들 것이 없다.
  const wants = (said === "revise" && !options.canRevise ? "talk" : said) as EasyDecision["wants"];
```

(나머지 `return { wants, reply, ... }` 는 그대로.) 파일 끝에:

```ts
const 아는갈래 = new Set(["image", "cardnews", "either", "revise", "talk", "detail_page"]);
```

`lib/easy/chat-provider.ts:43`:

```ts
      wants: { type: "string", enum: ["image", "cardnews", "either", "revise", "talk", "detail_page"] },
```

- [ ] **Step 4:** `pnpm --filter @fixup/web exec vitest run app/easy app/api/easy lib/easy` · typecheck. Expected: 실패 0. (라우트는 아직 cardnews · either 를 모른다 — `image` 가 아니면 그림 라우트로 안 가므로 Task 8 전까지 cardnews 는 「말로 답」 갈래로 떨어지지 않도록 **Task 8 에서 잇는다.** 이 사이에는 배포하지 않는다)
- [ ] **Step 5:** 커밋 `feat(easy): 말 판단이 카드뉴스 · 한 장인지 모름 · 원고 고치기를 가른다`

---

### Task 2: ⓑ2 — 카드뉴스 역할 둘 (설계 §5-1)

**Files:** Modify `app/easy/photo-roles.ts`, `app/easy/photo-turn.ts` · Test `app/easy/__tests__/photo-roles.test.ts`, `photo-turn.test.ts`

**Interfaces — Produces:**
- `CARD_ONLY_ROLES = ["place_as_is", "ending"] as const`, `type CardPhotoRole = EasyPhotoRole | "place_as_is" | "ending"`
- `JudgedPhotoRole = CardPhotoRole | "unclear"`(넓힌다)
- `easyRolePrompt({ words, photos, followUp?, cardnews? })`
- `readRoleJudgment(raw, count, options?: { cardnews?: boolean })`
- `readChosenRoles(raw, ids, options?: { cardnews?: boolean }): Record<string, CardPhotoRole>`
- `mergeRoles({ chosen, previous }: Record<string, CardPhotoRole>)`
- `PhotoTurnInput.mode?: "image" | "cardnews"`; `PhotoTurn` 의 go 는 `rows: Array<{ id; role: CardPhotoRole }>`, `fields?: EasyPosterFields`(이미지일 때만)

- [ ] **Step 1: 실패하는 시험** — `photo-roles.test.ts` 끝에

```ts
describe("카드뉴스 역할 (2단계 설계 §5-1)", () => {
  it("카드뉴스일 때만 원본 그대로 · 마지막 장을 알려 준다", () => {
    const 카드 = easyRolePrompt({ words: "이 표는 그대로", photos: [{ description: "표" }], cardnews: true });
    const 한장 = easyRolePrompt({ words: "이 표는 그대로", photos: [{ description: "표" }] });
    expect(카드).toContain("place_as_is");
    expect(카드).toContain("ending");
    expect(한장).not.toContain("place_as_is");
  });

  it("카드뉴스가 아니면 두 역할을 unclear 로 읽는다", () => {
    const raw = { photos: [{ number: 1, role: "place_as_is", said: true }], conflicting: false };
    expect(readRoleJudgment(raw, 1).photos[0]!.role).toBe("unclear");
    expect(readRoleJudgment(raw, 1, { cardnews: true }).photos[0]).toEqual({ role: "place_as_is", said: true });
  });

  it("고른 값도 카드뉴스일 때만 두 역할을 받는다", () => {
    const raw = [{ id: "a", role: "ending" }];
    expect(readChosenRoles(raw, ["a"])).toEqual({});
    expect(readChosenRoles(raw, ["a"], { cardnews: true })).toEqual({ a: "ending" });
  });
});
```

`photo-turn.test.ts` 의 `describe("그림 턴 …")` 안 끝에

```ts
  it("카드뉴스 턴은 두 역할을 판단에 알리고, 이미지 칸은 안 만든다", async () => {
    const { deps, 받은글 } = 가짜(
      { photos: [{ number: 1, role: "place_as_is", said: true }], conflicting: false },
      { p1: "표 캡처" },
    );
    const 결과 = await runPhotoTurn({ ...기본, words: "이 표는 그대로", photos: 사진들(1), mode: "cardnews" }, deps);

    expect(받은글[0]).toContain("place_as_is");
    expect(결과).toMatchObject({ kind: "go", rows: [{ id: "p1", role: "place_as_is" }] });
    expect(결과.kind === "go" && 결과.fields).toBeUndefined();
  });
```

- [ ] **Step 2:** 돌려서 FAIL 확인

- [ ] **Step 3: 구현** — `photo-roles.ts`

```ts
/** 카드뉴스에만 있는 역할 둘(2단계 설계 §5-1). 이미지 한 장에는 자리가 없다. */
export const CARD_ONLY_ROLES = ["place_as_is", "ending"] as const;
export type CardPhotoRole = EasyPhotoRole | (typeof CARD_ONLY_ROLES)[number];

/** 판단이 돌려줄 수 있는 것 — 역할에 「모름」. 카드뉴스 둘은 카드뉴스 턴에서만 온다. */
export type JudgedPhotoRole = CardPhotoRole | "unclear";
```

(`JudgedPhotoRole` 옛 정의를 지운다.) `아는판단` 을 지우고 함수로:

```ts
function 아는판단(cardnews: boolean): Set<string> {
  return new Set<string>([...EASY_PHOTO_ROLES, "unclear", ...(cardnews ? CARD_ONLY_ROLES : [])]);
}
```

`easyRolePrompt` 입력에 `cardnews?: boolean` 을 더하고, `"  unclear                   모르겠다: 사용자에게 물어본다",` 바로 뒤에:

```ts
    ...(input.cardnews
      ? [
        "  place_as_is               원본 그대로 한 장: 그 그림을 다시 그리지 않고 카드 한 장으로 그대로 넣는다",
        "  ending                    마지막 장: 그 그림을 카드뉴스의 마지막 장으로 그대로 쓴다",
        "",
        "지금 만드는 것은 **카드뉴스**입니다. 따라 만들 카드뉴스 · 포스터는 style 입니다.",
        "「이 표는 그대로 넣어줘」처럼 원본을 그대로 넣으라는 말이 있으면 place_as_is,",
        "「이걸 마지막 장으로」면 ending 입니다. **그런 말이 없으면 둘 다 쓰지 마세요.**",
      ]
      : []),
```

`readRoleJudgment(raw, count, options: { cardnews?: boolean } = {})` — 안에서 `아는판단.has(role)` 을 `아는판단(Boolean(options.cardnews)).has(role)` 로.
`readChosenRoles(raw, ids, options: { cardnews?: boolean } = {}): Record<string, CardPhotoRole>` — `known` 을 `new Set<string>([...EASY_PHOTO_ROLES, ...(options.cardnews ? CARD_ONLY_ROLES : [])])` 로, 끝 캐스트를 `CardPhotoRole` 로.
`mergeRoles` 의 `chosen` · `previous` 타입을 `Readonly<Record<string, CardPhotoRole>>` 로.
`photoAskReason` 의 셈을 인물 줄만 넘기게:

```ts
  const people = countPreservedPeople(
    rows.filter((row) => isPersonRole(row.role)).map((row) => ({ role: row.role as EasyPhotoRole })),
  );
```

`photo-turn.ts`:
- `PhotoTurnInput` 에 `/** 카드뉴스 턴이면 두 역할을 더 안다(2단계 §5-1). */ mode?: "image" | "cardnews";` · `chosen` · `previous` 타입을 `CardPhotoRole` 로
- `easyRolePrompt({ …, cardnews: input.mode === "cardnews" })`, `readRoleJudgment(…, input.photos.length, { cardnews: input.mode === "cardnews" })`
- go 반환:

```ts
  const decided = rows.map((row) => ({ id: row.id, role: row.role as CardPhotoRole }));
  return {
    kind: "go",
    rows: decided,
    // 이미지 한 장일 때만 포스터 칸을 만든다. 카드뉴스는 `cardnews-attachments.ts` 가 옮긴다.
    fields: input.mode === "cardnews"
      ? undefined
      : posterFieldsFrom(decided as Array<{ id: string; role: EasyPhotoRole }>),
    attachmentIntent: easyAttachmentIntent({ words: input.words, judged, final: decided.map((row) => row.role) }),
  };
```

`PhotoTurn` 타입의 go: `rows: Array<{ id: string; role: CardPhotoRole }>; fields?: EasyPosterFields;`
`photo-fields.ts` 의 `easyAttachmentIntent` 인자 `final: readonly CardPhotoRole[]`(타입만).
`photo-ask-state.ts` · `photo-ask.tsx` 의 `EasyPhotoRole` 은 그대로 둔다(화면은 Task 11 에서 넓힌다).
라우트의 `readChosenRoles(input.photoRoles, 붙인것)` 두 줄은 이미지 턴 그대로다(카드뉴스 턴은 Task 8).

- [ ] **Step 4:** `vitest run app/easy app/api/easy lib/easy` · typecheck. Expected: 0 · 0
- [ ] **Step 5:** 커밋 `feat(easy): 카드뉴스 턴의 사진 역할 둘 — 원본 그대로 한 장 · 마지막 장`

---

### Task 3: 실측 (설계 §12) — 통과해야 Task 4 로 간다

**Files:** Modify `scripts/easy-measure/cases.mts`, `run.mts` · 결과 `docs/easy-measure/2026-09-30-cardnews.md`

- [ ] **Step 1: 문장표** — `cases.mts`
  - `B1Case` 에 `hasDraft?: boolean` 을 더하고 `expect` 를 `B1Want | B1Want[]`(여럿이면 그중 하나면 맞음) 로 바꾼다. `type B1Want = "image" | "cardnews" | "either" | "revise" | "talk" | "detail_page"`
  - 기존 「이 제품으로 광고 만들어줘」(1장)는 `["image", "either"]`(광고는 한 장일 수도 여러 장일 수도)
  - 더한다:

```ts
  { prompt: "건강기능식품 고르는 법 카드뉴스 만들어줘", attachments: 0, expect: "cardnews" },
  { prompt: "인스타 캐러셀로 여행 팁 정리해줘", attachments: 0, expect: "cardnews" },
  { prompt: "카페 오픈 포스터 한 장 만들어줘", attachments: 0, expect: "image" },
  { prompt: "유튜브 썸네일 만들어줘", attachments: 0, expect: "image" },
  { prompt: "신메뉴 홍보물 만들어줘", attachments: 0, expect: "either" },
  { prompt: "이걸로 만들어줘", attachments: 1, expect: "either" },
  { prompt: "카드뉴스 표지 한 장만 만들어줘", attachments: 0, expect: "image" },
  { prompt: "카드뉴스는 어떻게 만들어요?", attachments: 0, expect: "talk" },
  { prompt: "더 짧게 써줘", attachments: 0, hasDraft: true, expect: "revise" },
  { prompt: "20대 말투로 바꿔줘", attachments: 0, hasDraft: true, expect: "revise" },
  { prompt: "이번엔 강아지 산책 카드뉴스 만들어줘", attachments: 0, hasDraft: true, expect: "cardnews" },
```

  - `설명` 에 둘:

```ts
  표: "사람 없음 · 무엇이 있나: 건강기능식품 성분을 비교한 표 캡처. 행과 열에 제품명과 함량이 적혀 있음 · 글자 있음(제목·타이포그래피 등)",
  카드뉴스: "사람 없음 · 무엇이 있나: 건강 정보 카드뉴스 속지. 위에 굵은 제목, 아래 번호 목록과 아이콘 · 글자 있음(제목·타이포그래피 등) · 디자인: 연두색 띠와 둥근 상자",
```

  - `B2Case` 에 `cardnews?: boolean`, 더한다:

```ts
  { name: "카드 표 그대로", words: "이 표는 그대로 넣어줘", photos: [설명.표], expect: ["place_as_is"], said: [true], cardnews: true },
  { name: "카드 마지막 장", words: "이 사진을 마지막 장으로 써줘", photos: [설명.제품], expect: ["ending"], said: [true], cardnews: true },
  { name: "카드 이 느낌", words: "이 느낌으로 카드뉴스 만들어줘", photos: [설명.카드뉴스, 설명.카드뉴스, 설명.카드뉴스], expect: ["style", "style", "style"], said: [true, true, true], cardnews: true },
  { name: "카드 이야기 없음", words: "건강기능식품 카드뉴스 만들어줘", photos: [설명.카드뉴스, 설명.제품], expect: ["style", "unclear"], said: [false, false], cardnews: true },
```

- [ ] **Step 2: 재는 도구** — `run.mts`
  - ⓑ1: `easyChatPrompt([], one.prompt, one.attachments, Boolean(one.hasDraft))`, `readEasyDecision(r.value, { canRevise: Boolean(one.hasDraft) })`. 맞음 = `[one.expect].flat().includes(got)`. **치명:** 기대에 `image` 가 없는데 `image` 가 나오거나, 기대에 `cardnews` 가 없는데 `cardnews` 가 나오는 것(한 장 ↔ 여러 장 뒤바뀜). 치명을 세어 요약에 적는다
  - ⓑ2: `easyRolePrompt({ …, cardnews: one.cardnews })`, `readRoleJudgment(r.value, n, { cardnews: one.cardnews })`. **치명 추가:** 기대가 `place_as_is` · `ending` 이 아닌데 그 역할이 나오는 것(말하지 않은 원본 넣기)
  - 결과 파일은 `docs/easy-measure/2026-09-30-cardnews.md`(1단계 파일을 덮지 않는다). 파일 이름을 `process.env.OUT ?? "2026-09-30-roles.md"` 로 받게 하고 이번에는 `OUT=2026-09-30-cardnews.md` 로 돌린다

- [ ] **Step 3: 돌린다**

```bash
OUT=2026-09-30-cardnews.md pnpm exec tsx --env-file="C:/Users/PC/Desktop/coding/fixup-image-agent/apps/web/.env.local" apps/web/scripts/easy-measure/run.mts
```
Expected: 치명 0. 어긋남은 1단계에서 알려진 로고 한 줄 외 0

- [ ] **Step 4:** 어긋나면 `easyChatPrompt` · `easyRolePrompt` 의 **글만** 고치고 다시 잰다. 세 번 고쳐도 치명이 남으면 멈추고 사용자에게 표를 보인다
- [ ] **Step 5:** 커밋 `test(easy): 카드뉴스 갈래 · 역할 실측`

---

### Task 4: 내용 고르기 (설계 §6)

**Files:** Create `app/easy/cardnews-source.ts` · Test `app/easy/__tests__/cardnews-source.test.ts`

**Interfaces — Produces:** `type CardSource`, `LONG_TEXT = 300`, `WEB_OFF`, `pickCardSource(words, { webEnabled }): { ok: true; source: CardSource; label: string } | { ok: false; message: string }`, `cardSourceLabel(kind: CardSource["kind"]): string`

- [ ] **Step 1: 실패하는 시험**

```ts
import { describe, expect, it } from "vitest";
import { LONG_TEXT, WEB_OFF, cardSourceLabel, pickCardSource } from "../cardnews-source";

const 켜짐 = { webEnabled: true };

describe("내용 고르기 (2단계 설계 §6)", () => {
  it("유튜브 주소면 자막", () => {
    expect(pickCardSource("이 영상으로 카드뉴스 https://youtu.be/abc123.", 켜짐))
      .toEqual({ ok: true, source: { kind: "youtube", url: "https://youtu.be/abc123" }, label: cardSourceLabel("youtube") });
    expect(pickCardSource("https://www.youtube.com/watch?v=x 정리해줘", 켜짐))
      .toMatchObject({ ok: true, source: { kind: "youtube" } });
  });

  it("다른 주소면 기사", () => {
    expect(pickCardSource("https://news.example.com/a 카드뉴스로", 켜짐))
      .toMatchObject({ ok: true, source: { kind: "web", url: "https://news.example.com/a" } });
  });

  it("기사 주소가 꺼져 있으면 붙여 넣으라고 멈춘다", () => {
    expect(pickCardSource("https://news.example.com/a", { webEnabled: false })).toEqual({ ok: false, message: WEB_OFF });
  });

  it("주소가 없고 길면 그 글로", () => {
    const 긴글 = "가".repeat(LONG_TEXT);
    expect(pickCardSource(긴글, 켜짐)).toMatchObject({ ok: true, source: { kind: "text", text: 긴글 } });
  });

  it("짧으면 인터넷 검색", () => {
    expect(pickCardSource("건강기능식품 고르는 법 카드뉴스", 켜짐))
      .toMatchObject({ ok: true, source: { kind: "question", question: "건강기능식품 고르는 법 카드뉴스" } });
  });

  it("무엇으로 썼는지 한 줄로 알린다", () => {
    expect(cardSourceLabel("question")).toContain("인터넷");
    expect(cardSourceLabel("text")).toContain("글");
  });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `app/easy/cardnews-source.ts`

```ts
/**
 * **카드뉴스 원고를 무엇으로 쓸까**(2단계 설계 §6). 코드가 가른다 — 값으로 잰다.
 *
 * 말에서 찾는다: 유튜브 주소 · 다른 주소 · 긴 글 · 짧은 주제. 카드뉴스 라우트의
 * 네 갈래(`app/api/sns/projects/schema.ts` 의 `SourceSchema`)와 같은 모양이다.
 */

export type CardSource =
  | { kind: "text"; text: string }
  | { kind: "youtube"; url: string }
  | { kind: "web"; url: string }
  | { kind: "question"; question: string };

/** 이만큼 길면 붙여 넣은 글로 본다. 첫 값이다 — 실측으로 고친다. */
export const LONG_TEXT = 300;

export const WEB_OFF = "기사 주소는 아직 읽지 못합니다. 기사 내용을 붙여 넣어 주세요.";

const 주소 = /https?:\/\/[^\s<>"'「」『』]+/i;
const 유튜브 = /^(www\.|m\.)?(youtube\.com|youtu\.be)$/i;
const 끝문장부호 = /[.,)\]」』>]+$/;

export function cardSourceLabel(kind: CardSource["kind"]): string {
  return {
    youtube: "유튜브 영상의 자막으로 썼어요",
    web: "기사 주소의 내용으로 썼어요",
    text: "붙여 주신 글로 썼어요",
    question: "인터넷에서 찾은 내용으로 썼어요",
  }[kind];
}

export function pickCardSource(
  words: string,
  options: { webEnabled: boolean },
): { ok: true; source: CardSource; label: string } | { ok: false; message: string } {
  const text = words.trim();
  const found = text.match(주소)?.[0]?.replace(끝문장부호, "");
  if (found) {
    let host = "";
    try {
      host = new URL(found).hostname;
    } catch {
      return { ok: false, message: "주소를 읽지 못했습니다. 주소를 다시 확인해 주세요." };
    }
    if (유튜브.test(host)) return { ok: true, source: { kind: "youtube", url: found }, label: cardSourceLabel("youtube") };
    if (!options.webEnabled) return { ok: false, message: WEB_OFF };
    return { ok: true, source: { kind: "web", url: found }, label: cardSourceLabel("web") };
  }
  if (text.length >= LONG_TEXT) return { ok: true, source: { kind: "text", text }, label: cardSourceLabel("text") };
  return { ok: true, source: { kind: "question", question: text }, label: cardSourceLabel("question") };
}
```

- [ ] **Step 4:** 시험 · typecheck 통과
- [ ] **Step 5:** 커밋 `feat(easy): 카드뉴스 원고를 무엇으로 쓸지 말에서 고른다`

---

### Task 5: 역할 → 카드뉴스 첨부 (설계 §5-2 · §5-3 · §5-4)

**Files:** Create `app/easy/cardnews-attachments.ts` · Test `app/easy/__tests__/cardnews-attachments.test.ts`

**Interfaces:**
- Consumes: `CardPhotoRole`(Task 2), `Attachment` · `StyleRole` · `validateAttachments`(`@fixup/sns-core`)
- Produces: `CardPhoto { id; storagePath; url?: string | null }`, `NO_REFERENCE`, `NOT_MINE`, `styleSlots(ids, explicit?)`, `slotsFromWords(words, ids)`, `readChosenSlots(raw, ids)`, `cardAttachmentsFrom({ userId, photos, rows, slots? }): { ok: true; attachments: Attachment[] } | { ok: false; reason: "no_reference" | "not_mine" | "no_url" }`

- [ ] **Step 1: 실패하는 시험**

```ts
import { describe, expect, it } from "vitest";
import { validateAttachments } from "@fixup/sns-core";
import { ProjectInputSchema } from "../../api/sns/projects/schema";
import { cardAttachmentsFrom, readChosenSlots, slotsFromWords, styleSlots } from "../cardnews-attachments";

const 나 = "u1";
const 사진 = (id: string, owner = 나) => ({ id, storagePath: `${owner}/references/${id}.png`, url: `https://x.test/${id}.png` });

describe("레퍼런스 자리 (2단계 설계 §5-2)", () => {
  it("한 장이면 세 자리 모두", () => {
    expect(styleSlots(["a"])).toEqual([{ id: "a", role: "cover" }, { id: "a", role: "body" }, { id: "a", role: "ending" }]);
  });

  it("두 장이면 첫 장 표지, 둘째 장 속지와 끝", () => {
    expect(styleSlots(["a", "b"])).toEqual([{ id: "a", role: "cover" }, { id: "b", role: "body" }, { id: "b", role: "ending" }]);
  });

  it("세 장 이상이면 첫 장 표지, 마지막 장 끝, 나머지 속지", () => {
    expect(styleSlots(["a", "b", "c", "d"])).toEqual([
      { id: "a", role: "cover" }, { id: "b", role: "body" }, { id: "c", role: "body" }, { id: "d", role: "ending" },
    ]);
  });

  it("정해 준 자리가 있으면 그대로, 없는 그림은 속지", () => {
    expect(styleSlots(["a", "b"], { b: "cover" })).toEqual([{ id: "a", role: "body" }, { id: "b", role: "cover" }]);
  });

  it("말로 정한 자리를 읽는다", () => {
    expect(slotsFromWords("2번이 표지고 3번은 마지막 장", ["a", "b", "c"])).toEqual({ b: "cover", c: "ending" });
    expect(slotsFromWords("표지는 알아서", ["a"])).toEqual({});
  });

  it("고른 자리는 목록 안 · 세 자리만 받는다", () => {
    expect(readChosenSlots([{ id: "a", role: "cover" }, { id: "z", role: "body" }, { id: "b", role: "top" }], ["a", "b"]))
      .toEqual({ a: "cover" });
  });
});

describe("역할 → 첨부", () => {
  it("분위기 한 장이 세 자리로 가고, 카드뉴스 검사와 입력 검사를 통과한다", () => {
    const result = cardAttachmentsFrom({ userId: 나, photos: [사진("a")], rows: [{ id: "a", role: "style" }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments.map((one) => one.role)).toEqual(["cover", "body", "ending"]);
    expect(validateAttachments(result.attachments, 16, 8)).toEqual([]);
    expect(ProjectInputSchema.safeParse({
      title: "t", source: { kind: "question", question: "q" }, attachments: result.attachments,
      ratio: "4:5", language: "ko",
    }).success).toBe(true);
  });

  it("역할마다 제 종류로 간다", () => {
    const result = cardAttachmentsFrom({
      userId: 나,
      photos: ["s", "p", "q", "r", "t", "e"].map((id) => 사진(id)),
      rows: [
        { id: "s", role: "style" }, { id: "p", role: "preserve_product" }, { id: "q", role: "preserve_person" },
        { id: "r", role: "preserve_person_restyled" }, { id: "t", role: "place_as_is" }, { id: "e", role: "ending" },
      ],
    });
    expect(result.ok && result.attachments.filter((one) => one.id !== "s")).toEqual([
      { id: "p", kind: "keep_identity", subject: "object", assetPath: "u1/references/p.png", url: "https://x.test/p.png" },
      { id: "q", kind: "keep_identity", subject: "person", assetPath: "u1/references/q.png", url: "https://x.test/q.png" },
      { id: "r", kind: "keep_identity", subject: "person", restyle: true, assetPath: "u1/references/r.png", url: "https://x.test/r.png" },
      { id: "t", kind: "place_as_is", assetPath: "u1/references/t.png", url: "https://x.test/t.png" },
      { id: "e", kind: "ending", assetPath: "u1/references/e.png", url: "https://x.test/e.png" },
    ]);
  });

  it("분위기 참고가 없으면 레퍼런스를 요청한다", () => {
    expect(cardAttachmentsFrom({ userId: 나, photos: [사진("p")], rows: [{ id: "p", role: "preserve_product" }] }))
      .toEqual({ ok: false, reason: "no_reference" });
  });

  it("남의 폴더 그림이면 멈춘다", () => {
    expect(cardAttachmentsFrom({ userId: 나, photos: [사진("a", "u2")], rows: [{ id: "a", role: "style" }] }))
      .toEqual({ ok: false, reason: "not_mine" });
  });

  it("주소가 없으면 멈춘다", () => {
    expect(cardAttachmentsFrom({ userId: 나, photos: [{ id: "a", storagePath: "u1/references/a.png", url: null }], rows: [{ id: "a", role: "style" }] }))
      .toEqual({ ok: false, reason: "no_url" });
  });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `app/easy/cardnews-attachments.ts`

```ts
import type { Attachment, StyleRole } from "@fixup/sns-core";
import type { CardPhotoRole } from "./photo-roles";

/**
 * 정해진 역할을 **카드뉴스가 받는 첨부**로 옮긴다(2단계 설계 §5).
 *
 * 카드는 **자기 자리 레퍼런스만** 본다(`sns-core/image-prompt.ts` 의
 * `selectReferencesForRole`). 자리를 비우면 그 카드는 다른 모양으로 나온다 — 그래서
 * 레퍼런스가 한 장이면 세 자리 모두에 넣는다. 같은 그림을 자리만 달리해 여러 번
 * 넣어도 올리기는 한 번이다(`queued-flow.ts` 의 `uploadUniqueReferences`).
 */

export interface CardPhoto {
  id: string;
  /** 저장 경로. 첫 칸이 소유자다(`docs/DEPLOY.md`). */
  storagePath: string;
  url?: string | null;
}

export const NO_REFERENCE = "따라 만들 카드뉴스를 붙여 주세요. 그 디자인을 따라 만듭니다.";
export const NOT_MINE = "카드뉴스는 내가 올린 그림만 쓸 수 있습니다. 그 그림을 빼고 다시 보내 주세요.";

const 자리들 = new Set<string>(["cover", "body", "ending"]);

/** 붙인 순서로 자리를 나눈다. 정해 준 자리가 하나라도 있으면 그것을 쓰고 나머지는 속지. */
export function styleSlots(
  ids: readonly string[],
  explicit: Readonly<Record<string, StyleRole>> = {},
): Array<{ id: string; role: StyleRole }> {
  if (ids.some((id) => explicit[id])) return ids.map((id) => ({ id, role: explicit[id] ?? "body" }));
  if (ids.length === 1) return (["cover", "body", "ending"] as const).map((role) => ({ id: ids[0]!, role }));
  if (ids.length === 2) {
    return [{ id: ids[0]!, role: "cover" }, { id: ids[1]!, role: "body" }, { id: ids[1]!, role: "ending" }];
  }
  return ids.map((id, index) => ({
    id,
    role: index === 0 ? "cover" : index === ids.length - 1 ? "ending" : "body",
  }));
}

/** 「2번이 표지」 · 「3번은 마지막 장」을 읽는다. 번호는 붙인 순서다. */
export function slotsFromWords(words: string, ids: readonly string[]): Record<string, StyleRole> {
  const found: Record<string, StyleRole> = {};
  for (const match of words.matchAll(/(\d+)\s*번\S*\s*(표지|속지|끝|엔딩|마지막)/g)) {
    const id = ids[Number(match[1]) - 1];
    if (!id) continue;
    found[id] = match[2] === "표지" ? "cover" : match[2] === "속지" ? "body" : "ending";
  }
  return found;
}

/** 화면이 보낸 자리(저장한 세트에서 옴). 목록 밖 id · 모르는 자리는 버린다. */
export function readChosenSlots(raw: unknown, ids: readonly string[]): Record<string, StyleRole> {
  if (!Array.isArray(raw)) return {};
  const allowed = new Set(ids);
  return Object.fromEntries(
    raw
      .map((entry) => entry as { id?: unknown; role?: unknown } | null)
      .filter((one): one is { id: string; role: StyleRole } =>
        one !== null && typeof one.id === "string" && typeof one.role === "string"
        && allowed.has(one.id) && 자리들.has(one.role))
      .map((one) => [one.id, one.role]),
  );
}

type 결과 = { ok: true; attachments: Attachment[] } | { ok: false; reason: "no_reference" | "not_mine" | "no_url" };

export function cardAttachmentsFrom(input: {
  userId: string;
  photos: readonly CardPhoto[];
  rows: ReadonlyArray<{ id: string; role: CardPhotoRole }>;
  slots?: Readonly<Record<string, StyleRole>>;
}): 결과 {
  const byId = new Map(input.photos.map((photo) => [photo.id, photo]));
  const 내것 = (path: string) => path.startsWith(`${input.userId}/`) && !path.includes("..") && !path.includes("\\");

  for (const row of input.rows) {
    const photo = byId.get(row.id);
    if (!photo || !내것(photo.storagePath)) return { ok: false, reason: "not_mine" };
    if (!photo.url) return { ok: false, reason: "no_url" };
  }
  const 분위기 = input.rows.filter((row) => row.role === "style").map((row) => row.id);
  if (!분위기.length) return { ok: false, reason: "no_reference" };

  const 바탕 = (id: string) => ({ assetPath: byId.get(id)!.storagePath, url: byId.get(id)!.url! });
  const 자리 = styleSlots(분위기, input.slots);
  const attachments = input.rows.flatMap((row): Attachment[] => {
    if (row.role === "style") {
      return 자리.filter((one) => one.id === row.id)
        .map((one) => ({ id: row.id, kind: "style_reference", role: one.role, ...바탕(row.id) }));
    }
    if (row.role === "preserve_product") return [{ id: row.id, kind: "keep_identity", subject: "object", ...바탕(row.id) }];
    if (row.role === "preserve_person") return [{ id: row.id, kind: "keep_identity", subject: "person", ...바탕(row.id) }];
    if (row.role === "preserve_person_restyled") {
      return [{ id: row.id, kind: "keep_identity", subject: "person", restyle: true, ...바탕(row.id) }];
    }
    if (row.role === "place_as_is") return [{ id: row.id, kind: "place_as_is", ...바탕(row.id) }];
    return [{ id: row.id, kind: "ending", ...바탕(row.id) }];
  });
  return { ok: true, attachments };
}
```

(첫 시험의 `toEqual` 은 키 순서를 안 본다. 틀리면 기대 객체를 구현 모양에 맞춘다 — 뜻은 같다.)

- [ ] **Step 4:** 시험 · typecheck. `import … from "../../api/sns/projects/schema"` 가 `server-only` 등을 끌어오면 그 시험 한 줄만 `vi.mock` 으로 막는다(부르기만 한다)
- [ ] **Step 5:** 커밋 `feat(easy): 사진 역할을 카드뉴스 첨부로 옮기고 레퍼런스를 표지 · 속지 · 끝에 나눈다`

---

### Task 6: 조건 · 값 · 원고 보기 (설계 §7)

**Files:** Create `app/easy/cardnews-options.ts`, `app/easy/cardnews-view.ts` · Test `app/easy/__tests__/cardnews-options.test.ts`, `cardnews-view.test.ts`

**Interfaces — Produces:**
- `CardOptions { ratio: "4:5"|"1:1"|"9:16"|"16:9"; count: "auto" | 4|5|6|7|8; language: "ko"|"en"|"ja"|"zh"; modelId: string; look: ImageLook }`
- `CARD_RATIOS`, `CARD_COUNTS`, `CARD_LANGUAGES`, `CARD_LANGUAGE_LABEL`, `DEFAULT_CARD_MODEL = "gpt-image-2.5-flare"`
- `readCardOptions(raw): Partial<CardOptions>`, `cardOptionsFrom({ said: { ratio?, look? }, chosen, imageModel? }): CardOptions`, `projectSpecFrom(o): { ratio; cardCountMode; cardCount?; language; modelId; look }`, `optionsOfProject(p): CardOptions`
- `cardCost({ policy, ratio, modelId, attachments, cards }): { units: number; label: string }`
- `EasyCardView`, `EasyCardnewsView`, `CardnewsProjectLike`, `cardnewsView(project, policy): EasyCardnewsView`

- [ ] **Step 1: 실패하는 시험** — `cardnews-options.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { creditUnits, llmCostUsd } from "@fixup/shared";
import { estimateCost } from "../../sns/cost-estimate";
import { cardCost, cardOptionsFrom, projectSpecFrom, readCardOptions } from "../cardnews-options";

describe("카드뉴스 조건 (2단계 설계 §7)", () => {
  it("말 · 고른 것 · 기본값 차례", () => {
    expect(cardOptionsFrom({ said: {}, chosen: {} })).toEqual({
      ratio: "4:5", count: "auto", language: "ko", modelId: "gpt-image-2.5-flare", look: "auto",
    });
    expect(cardOptionsFrom({ said: { ratio: "1:1", look: "anime" }, chosen: { ratio: "9:16" }, imageModel: "nano-banana-2" }))
      .toMatchObject({ ratio: "9:16", look: "anime", modelId: "nano-banana-2" });
  });

  it("카드뉴스가 못 만드는 비율 · 모르는 모델은 기본으로", () => {
    expect(cardOptionsFrom({ said: { ratio: "2:3" }, chosen: {}, imageModel: "없는모델" }))
      .toMatchObject({ ratio: "4:5", modelId: "gpt-image-2.5-flare" });
  });

  it("화면이 보낸 조건은 아는 값만", () => {
    expect(readCardOptions({ ratio: "1:1", count: 6, language: "fr", look: "3d", modelId: "x" }))
      .toEqual({ ratio: "1:1", count: 6, look: "3d" });
    expect(readCardOptions({ count: 12 })).toEqual({});
  });

  it("장수를 작업 입력 모양으로", () => {
    expect(projectSpecFrom({ ratio: "4:5", count: 6, language: "ko", modelId: "m", look: "auto" }))
      .toEqual({ ratio: "4:5", cardCountMode: "fixed", cardCount: 6, language: "ko", modelId: "m", look: "auto" });
    expect(projectSpecFrom({ ratio: "4:5", count: "auto", language: "ko", modelId: "m", look: "auto" }).cardCount).toBeUndefined();
  });

  /** 버튼의 값 = 카드뉴스 `generate` 가 잡는 값(`generate/route.ts:70-72`). */
  it("새 방식은 원고 장수만큼 크레딧", () => {
    expect(cardCost({ policy: "image-v2", ratio: "4:5", modelId: "gpt-image-2.5-flare", attachments: [], cards: [{ index: 1 }, { index: 2 }] }))
      .toEqual({ units: 2, label: "약 2크레딧" });
  });

  it("옛 방식은 카드뉴스 예약과 같은 셈", () => {
    const cards = [{ index: 1 }, { index: 2 }, { index: 3 }];
    const est = estimateCost({ ratio: "4:5", modelId: "gpt-image-2.5-flare", totalCards: 3, attachments: [], cards });
    const units = creditUnits(est.usd + llmCostUsd({ planCalls: 1 + est.generatedCount }));
    expect(cardCost({ policy: "cost-v1", ratio: "4:5", modelId: "gpt-image-2.5-flare", attachments: [], cards }))
      .toEqual({ units, label: `약 ${units}장` });
  });
});
```

`cardnews-view.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { cardnewsView } from "../cardnews-view";

const 작업 = (over: Record<string, unknown> = {}) => ({
  id: "p1", status: "copy_ready", ratio: "4:5", language: "ko", modelId: "gpt-image-2.5-flare",
  cardCountMode: "auto", toneNote: "",
  data: {
    source: { kind: "question", question: "q" }, attachments: [], look: "auto",
    flow: {
      planningIssues: [], copyIssues: [],
      cards: [
        { index: 1, role: "cover", kind: "generated", copy: { headline: "표지 글" }, status: "pending" },
        { index: 2, role: "body", kind: "generated", copy: { headline: "속지", body: "본문" }, status: "done", assetUrl: "https://x.test/2.png" },
      ],
    },
  },
  ...over,
});

describe("원고 보기", () => {
  it("원고 · 조건 · 값 · 무엇으로 썼나", () => {
    const view = cardnewsView(작업(), "image-v2");
    expect(view).toMatchObject({
      projectId: "p1", status: "copy_ready", sourceLabel: "인터넷에서 찾은 내용으로 썼어요",
      cost: { units: 2, label: "약 2크레딧" }, done: 1, total: 2,
      options: { ratio: "4:5", count: "auto", language: "ko", look: "auto" },
    });
    expect(view.cards[1]).toEqual({ index: 2, role: "body", headline: "속지", body: "본문", status: "done", url: "https://x.test/2.png" });
  });

  it("원고가 없으면 까닭을 모은다", () => {
    const view = cardnewsView(작업({ data: { source: { kind: "youtube", url: "u" }, attachments: [], flow: { planningIssues: ["자막이 없습니다"], copyIssues: [], cards: [] } } }), "image-v2");
    expect(view.cards).toEqual([]);
    expect(view.issues).toEqual(["자막이 없습니다"]);
  });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `app/easy/cardnews-options.ts`

```ts
import { IMAGE_LOOKS, creditUnits, llmCostUsd, type ImageLook } from "@fixup/shared";
import type { Attachment } from "@fixup/sns-core";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { estimateCost } from "../sns/cost-estimate";

/**
 * **카드뉴스 조건**(2단계 설계 §7). 원고 밑 조건 줄이 바꾸는 값이다.
 *
 * 말에 있던 것 → 고른 것 → 기본값 차례로 정한다. 허용 값은 카드뉴스 만들기
 * 입력(`app/api/sns/projects/schema.ts`)과 같다 — 여기서 넓히면 만들기가 400 으로 막힌다.
 */

export const CARD_RATIOS = ["4:5", "1:1", "9:16", "16:9"] as const;
export const CARD_COUNTS = [4, 5, 6, 7, 8] as const;
export const CARD_LANGUAGES = ["ko", "en", "ja", "zh"] as const;
export const CARD_LANGUAGE_LABEL: Record<(typeof CARD_LANGUAGES)[number], string> = {
  ko: "한국어", en: "영어", ja: "일본어", zh: "중국어",
};
export const DEFAULT_CARD_MODEL = "gpt-image-2.5-flare";

export interface CardOptions {
  ratio: (typeof CARD_RATIOS)[number];
  count: "auto" | (typeof CARD_COUNTS)[number];
  language: (typeof CARD_LANGUAGES)[number];
  modelId: string;
  look: ImageLook;
}

const 모델들 = new Set(IMAGE_MODELS.map((model) => model.id));
const 비율 = (value: unknown) => (CARD_RATIOS as readonly unknown[]).includes(value);
const 결 = (value: unknown) => (IMAGE_LOOKS as readonly unknown[]).includes(value);

/** 화면이 보낸 조건. 아는 값만 받는다. */
export function readCardOptions(raw: unknown): Partial<CardOptions> {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    ...(비율(value.ratio) ? { ratio: value.ratio as CardOptions["ratio"] } : {}),
    ...(value.count === "auto" || (CARD_COUNTS as readonly unknown[]).includes(value.count)
      ? { count: value.count as CardOptions["count"] } : {}),
    ...((CARD_LANGUAGES as readonly unknown[]).includes(value.language)
      ? { language: value.language as CardOptions["language"] } : {}),
    ...(typeof value.modelId === "string" && 모델들.has(value.modelId) ? { modelId: value.modelId } : {}),
    ...(결(value.look) ? { look: value.look as ImageLook } : {}),
  };
}

export function cardOptionsFrom(input: {
  said: { ratio?: string; look?: string };
  chosen: Partial<CardOptions>;
  imageModel?: string;
}): CardOptions {
  return {
    ratio: input.chosen.ratio ?? (비율(input.said.ratio) ? input.said.ratio as CardOptions["ratio"] : "4:5"),
    count: input.chosen.count ?? "auto",
    language: input.chosen.language ?? "ko",
    modelId: input.chosen.modelId
      ?? (input.imageModel && 모델들.has(input.imageModel) ? input.imageModel : DEFAULT_CARD_MODEL),
    look: input.chosen.look ?? (결(input.said.look) ? input.said.look as ImageLook : "auto"),
  };
}

export function projectSpecFrom(options: CardOptions) {
  return {
    ratio: options.ratio,
    cardCountMode: options.count === "auto" ? "auto" as const : "fixed" as const,
    ...(options.count === "auto" ? {} : { cardCount: options.count }),
    language: options.language,
    modelId: options.modelId,
    look: options.look,
  };
}

/** 저장된 작업에서 조건을 되읽는다. */
export function optionsOfProject(project: {
  ratio: string; language: string; modelId: string; cardCountMode: string; cardCount?: number | null;
  data: { look?: string };
}): CardOptions {
  return cardOptionsFrom({
    said: {},
    chosen: readCardOptions({
      ratio: project.ratio,
      language: project.language,
      modelId: project.modelId,
      look: project.data.look ?? "auto",
      count: project.cardCountMode === "fixed" ? project.cardCount : "auto",
    }),
  });
}

/**
 * **「이대로 만들기」에 적을 값.** 카드뉴스 `generate` 가 예약하는 값과 같아야 한다.
 *
 * - image-v2: 원고 카드 수(원본 그대로 · 마지막 장 포함 — `creditImagePlan(cards.length)`)
 * - cost-v1: `creditUnits(estimate.usd + llmCostUsd({ planCalls: 1 + generatedCount }))`
 */
export function cardCost(input: {
  policy: "cost-v1" | "image-v2";
  ratio: string;
  modelId: string;
  attachments: Attachment[];
  cards: ReadonlyArray<{ index: number; layout?: unknown }>;
}): { units: number; label: string } {
  if (input.policy === "image-v2") return { units: input.cards.length, label: `약 ${input.cards.length}크레딧` };
  const estimate = estimateCost({
    ratio: input.ratio,
    modelId: input.modelId,
    totalCards: input.cards.length,
    attachments: input.attachments,
    cards: input.cards as never,
  });
  const units = creditUnits(estimate.usd + llmCostUsd({ planCalls: 1 + estimate.generatedCount }));
  return { units, label: `약 ${units}장` };
}
```

`app/easy/cardnews-view.ts`

```ts
import type { Attachment } from "@fixup/sns-core";
import { cardCost, optionsOfProject, type CardOptions } from "./cardnews-options";
import { cardSourceLabel, type CardSource } from "./cardnews-source";

/**
 * **카드뉴스 작업 → 「쉽게」가 그릴 것**(2단계 설계 §7 · §8). 서버 모듈을 끌어오지
 * 않게 작업 모양을 여기서 좁게 적는다(`app/api/sns/flow-service.ts` 의 부분).
 */
export interface CardnewsProjectLike {
  id: string;
  status: string;
  ratio: string;
  language: string;
  modelId: string;
  cardCountMode: string;
  cardCount?: number | null;
  toneNote?: string | null;
  data: {
    source: CardSource;
    attachments: Attachment[];
    look?: string;
    flow?: {
      planningIssues?: string[];
      copyIssues?: string[];
      cards: Array<{
        index: number; role: string; kind?: string; layout?: unknown;
        copy: { headline: string; body?: string };
        status: string; assetUrl?: string; thumbUrl?: string;
      }>;
    };
  };
}

export interface EasyCardView {
  index: number;
  role: string;
  headline: string;
  body?: string;
  status: string;
  url?: string;
}

export interface EasyCardnewsView {
  projectId: string;
  status: string;
  cards: EasyCardView[];
  issues: string[];
  options: CardOptions;
  sourceLabel: string;
  cost: { units: number; label: string };
  /** 다 만든 장(검토가 필요한 장 포함 — 카드뉴스 정산과 같은 셈). */
  done: number;
  total: number;
}

export function cardnewsView(project: CardnewsProjectLike, policy: "cost-v1" | "image-v2"): EasyCardnewsView {
  const flow = project.data.flow;
  const cards = flow?.cards ?? [];
  return {
    projectId: project.id,
    status: project.status,
    cards: cards.map((card) => ({
      index: card.index,
      role: card.role,
      headline: card.copy.headline,
      ...(card.copy.body ? { body: card.copy.body } : {}),
      status: card.status,
      ...(card.assetUrl ? { url: card.assetUrl } : {}),
    })),
    issues: [...(flow?.planningIssues ?? []), ...(flow?.copyIssues ?? [])],
    options: optionsOfProject(project),
    sourceLabel: cardSourceLabel(project.data.source.kind),
    cost: cardCost({
      policy, ratio: project.ratio, modelId: project.modelId,
      attachments: project.data.attachments, cards,
    }),
    done: cards.filter((card) => card.status === "done" || card.status === "review_required").length,
    total: cards.length,
  };
}
```

- [ ] **Step 4:** 시험 · typecheck · `ui-text-dash` 시험 통과
- [ ] **Step 5:** 커밋 `feat(easy): 카드뉴스 조건 · 값 · 원고 보기`

---

### Task 7: 다시 쓰기 입력 · 대신 부르기 옮기기 (설계 §7)

**Files:** Create `app/easy/cardnews-redraft.ts`, `lib/easy/relay.ts` · Modify `app/api/easy/generate/route.ts`(relay · read · EasyStepError 를 옮긴 곳에서 부른다), `app/api/easy/__tests__/generate-wiring.test.ts` · Test `app/easy/__tests__/cardnews-redraft.test.ts`

**Interfaces — Produces:** `redraftInput(old, change: { words?: string; options?: Partial<CardOptions> })` → 카드뉴스 만들기 입력; `relay(request, url, body, step)`, `read(response, step)`, `EasyStepError`

- [ ] **Step 1: 실패하는 시험** — `cardnews-redraft.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { redraftInput } from "../cardnews-redraft";

const 옛것 = {
  title: "건강", ratio: "4:5", language: "ko", modelId: "gpt-image-2.5-flare",
  cardCountMode: "auto", cardCount: null, toneNote: "친근하게",
  data: {
    source: { kind: "question" as const, question: "q" },
    attachments: [{ id: "a", kind: "style_reference" as const, role: "body" as const, assetPath: "u1/a.png", url: "u" }],
    look: "auto", userInstruction: "밝게",
    attachmentIntents: { cover: "", body: "", ending: "" },
  },
};

describe("다시 쓰기 (2단계 설계 §7)", () => {
  it("말은 말투 칸에 더하고 나머지는 그대로", () => {
    expect(redraftInput(옛것, { words: "더 짧게" })).toEqual({
      title: "건강", source: 옛것.data.source, toneNote: "친근하게\n더 짧게",
      attachments: 옛것.data.attachments, attachmentIntents: 옛것.data.attachmentIntents,
      ratio: "4:5", cardCountMode: "auto", language: "ko", modelId: "gpt-image-2.5-flare", look: "auto",
      userInstruction: "밝게",
    });
  });

  it("조건을 바꾸면 그 조건으로", () => {
    expect(redraftInput(옛것, { options: { count: 6, ratio: "1:1" } }))
      .toMatchObject({ ratio: "1:1", cardCountMode: "fixed", cardCount: 6, toneNote: "친근하게" });
  });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `app/easy/cardnews-redraft.ts`

```ts
import { optionsOfProject, projectSpecFrom, type CardOptions } from "./cardnews-options";
import type { CardnewsProjectLike } from "./cardnews-view";

/**
 * **원고를 다시 쓸 입력**(2단계 설계 §7). 카드뉴스에는 작업 입력을 고치는 라우트가
 * 없어 새 작업을 만든다. **앞 작업은 지우지 않는다**(2026-09-30 사용자 결정).
 *
 * 말(「더 짧게, 20대 말투로」)은 말투 칸(`toneNote`)에 더한다 — 원고 쓰기가 그 칸을
 * 읽는다(`lib/sns/actual-flow.ts` 의 `writeCopy`).
 */
export function redraftInput(
  old: Pick<CardnewsProjectLike, "ratio" | "language" | "modelId" | "cardCountMode" | "cardCount" | "toneNote"> & {
    title: string;
    data: CardnewsProjectLike["data"] & { userInstruction?: string; attachmentIntents?: unknown };
  },
  change: { words?: string; options?: Partial<CardOptions> },
) {
  const options = { ...optionsOfProject(old), ...change.options };
  const toneNote = [old.toneNote ?? "", change.words ?? ""].map((one) => one.trim()).filter(Boolean).join("\n");
  return {
    title: old.title,
    source: old.data.source,
    ...(toneNote ? { toneNote } : {}),
    attachments: old.data.attachments,
    ...(old.data.attachmentIntents ? { attachmentIntents: old.data.attachmentIntents } : {}),
    ...projectSpecFrom(options),
    ...(old.data.userInstruction ? { userInstruction: old.data.userInstruction } : {}),
  };
}
```

`lib/easy/relay.ts` — `route.ts` 의 `relay` · `read` · `EasyStepError` 를 **주석까지 그대로 옮기고** `export` 를 붙인다(`stepIdempotencyKey` import 도 같이). `route.ts` 는 그 셋을 지우고 `import { EasyStepError, read, relay } from "../../../../lib/easy/relay";`.

`generate-wiring.test.ts` 「대신 부를 때의 요청 식별자」의 첫 시험을 옮긴 곳을 보게 바꾼다:

```ts
  it("헤더를 통째로 넘기지 않는다", () => {
    const relayFile = readFileSync(new URL("../../../../lib/easy/relay.ts", import.meta.url), "utf8");
    expect(generate).not.toContain("headers: request.headers");
    expect(relayFile).not.toContain("headers: request.headers");
    expect(relayFile).toContain("stepIdempotencyKey");
  });
```

(「세 단계에 서로 다른 이름을 준다」는 그대로 — 라우트에 `relay(…, "project"|"plan"|"generate")` 셋이 남는다.)

- [ ] **Step 4:** `vitest run app/easy app/api/easy lib/easy` · typecheck. Expected: 0 · 0(옮기기라 1단계 시험이 전부 그대로 초록)
- [ ] **Step 5:** 커밋 `refactor(easy): 대신 부르기를 lib 로 옮기고, 카드뉴스 원고 다시 쓰기 입력을 만든다`

---

### Task 8: 카드뉴스 원고 턴 · 갈래 물음 · 다시 쓰기 (설계 §3 · §4 · §5 · §7 · §9)

**Files:** Create `lib/easy/cardnews-steps.ts` · Modify `app/api/easy/generate/route.ts` · Test `app/api/easy/__tests__/cardnews-route.test.ts`

**Interfaces:**
- Consumes: Task 1~7 전부, `isWebSourceEnabled`(`lib/sns/feature.ts`), `snsFlowStoreForUser` · `refreshProjectAssetUrls`(부르기만)
- Produces(응답):
  - 갈래 물음 `{ ok: true, kindAsk: true, textModel }` — 요청 본문 `kind: "image" | "cardnews"` 로 답한다
  - 레퍼런스 요청 `{ ok: true, needReference: true, textModel }`
  - 원고 `{ ok: true, cardnews: { rowId, project }, message, photoRoles, textModel }`
  - 원고 0장 `{ ok: true, talked: true, message }`
- `draftCardnews(request, input) → { projectId, project }`, `startCardnews(request, projectId)`, `lastCardnewsProject(userId, rows)`

- [ ] **Step 1: 실패하는 시험** — `cardnews-route.test.ts`. 1단계 `generate-route.test.ts` 의 가짜들(인증 · 저장소 · 판단 · 읽기 · 조회 · 계량기 · 포스터 라우트)을 그대로 가져오고, 카드뉴스 라우트 둘과 카드뉴스 저장소를 더한다:

```ts
vi.mock("../../sns/projects/route", () => ({
  POST: async (req: Request) => {
    const body = await req.json();
    부른라우트.push({ step: "cardnews-project", body });
    return Response.json({ ok: true, project: { id: "c1" } });
  },
}));
vi.mock("../../sns/projects/[id]/plan/route", () => ({
  POST: async () => {
    부른라우트.push({ step: "cardnews-plan", body: {} });
    return Response.json({ ok: true, project: 원고작업 });
  },
}));
vi.mock("../../../../lib/sns/feature", () => ({ isWebSourceEnabled: () => false }));
vi.mock("../../../../lib/sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({ get: async (id: string) => 카드작업들[id] ?? null }),
}));
vi.mock("../../../../lib/sns/runtime", () => ({ refreshProjectAssetUrls: async (p: unknown) => p }));
```

`원고작업` 기본값은 카드 2장짜리 `copy_ready`(Task 6 시험의 `작업()` 모양), `카드작업들` 은 `Record<string, unknown>` — 다시 쓰기 시험에서 채운다. `posterReferencesByIds` 가짜는 `storagePath: "me-1/references/${id}.png"` 를 돌려준다.

시험들:

```ts
describe("갈래 (2단계 §4)", () => {
  it("한 장인지 여러 장인지 모르면 두 단추로 묻고 아무것도 안 남긴다", async () => {
    판단 = { wants: "either", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "신메뉴 홍보물 만들어줘" });
    expect(json.kindAsk).toBe(true);
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("고른 갈래가 판단을 이긴다", async () => {
    판단 = { wants: "either", reply: "", ratio: "1:1", look: "" };
    await 보낸다({ prompt: "신메뉴 홍보물 만들어줘", kind: "image" });
    expect(부른라우트.map((c) => c.step)).toEqual(["project", "plan", "generate"]);
  });

  /** Review Focus 5 */
  it("이미지 한 장은 지금 그대로", async () => {
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    await 보낸다({ prompt: "카페 포스터 한 장" });
    expect(부른라우트.map((c) => c.step)).toEqual(["project", "plan", "generate"]);
  });
});

describe("카드뉴스 원고 (2단계 §3 · §5)", () => {
  it("레퍼런스가 없으면 요청하고 아무것도 안 남긴다", async () => {
    판단 = { wants: "cardnews", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "건강 카드뉴스" });
    expect(json.needReference).toBe(true);
    expect(남긴줄).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("분위기 참고가 있으면 만들기 → 원고, 크레딧 라우트는 안 부른다", async () => {
    판단 = { wants: "cardnews", reply: "", ratio: "", look: "" };
    역할판단 = 역할(["style", false]);
    const { json } = await 보낸다({ prompt: "건강기능식품 고르는 법 카드뉴스", referenceIds: [사진(1)] });

    expect(부른라우트.map((c) => c.step)).toEqual(["cardnews-project", "cardnews-plan"]);
    expect(부른라우트[0]!.body).toMatchObject({
      source: { kind: "question" }, ratio: "4:5", cardCountMode: "auto", language: "ko",
      attachments: [
        { id: 사진(1), kind: "style_reference", role: "cover" },
        { id: 사진(1), kind: "style_reference", role: "body" },
        { id: 사진(1), kind: "style_reference", role: "ending" },
      ],
    });
    expect(json.cardnews.project.id).toBeDefined();
    expect(남긴줄.map((r) => r.role)).toEqual(["user", "image"]);
  });

  it("기사 주소가 꺼져 있으면 원고를 안 쓰고 멈춘다", async () => {
    판단 = { wants: "cardnews", reply: "", ratio: "", look: "" };
    역할판단 = 역할(["style", false]);
    const { status, json } = await 보낸다({ prompt: "https://news.example.com/a 카드뉴스", referenceIds: [사진(1)] });
    expect(status).toBe(400);
    expect(json.retryable).toBe(false);
    expect(부른라우트).toEqual([]);
  });

  /** Review Focus 4 */
  it("원고 0장이면 까닭을 말하고 원고 줄을 안 남긴다", async () => {
    판단 = { wants: "cardnews", reply: "", ratio: "", look: "" };
    역할판단 = 역할(["style", false]);
    원고작업 = { ...원고작업, data: { ...원고작업.data, flow: { planningIssues: ["자막이 없습니다"], copyIssues: [], cards: [] } } };
    const { json } = await 보낸다({ prompt: "https://youtu.be/x 카드뉴스", referenceIds: [사진(1)] });
    expect(json.talked).toBe(true);
    expect(남긴줄.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(남긴줄[1]!.body).toContain("자막이 없습니다");
  });
});

describe("다시 쓰기 (2단계 §7)", () => {
  it("원고가 있는 대화에서 고치는 말은 앞 원고 조건으로 새 작업을 만든다 — 앞 작업은 그대로", async () => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "old" }];
    카드작업들 = { old: { ...원고작업, id: "old", title: "건강", toneNote: "" } };
    판단 = { wants: "revise", reply: "", ratio: "", look: "" };
    await 보낸다({ prompt: "더 짧게" });

    expect(부른라우트.map((c) => c.step)).toEqual(["cardnews-project", "cardnews-plan"]);
    expect(부른라우트[0]!.body).toMatchObject({ toneNote: "더 짧게", title: "건강" });
  });
});
```

(`지난줄들` 은 저장소 가짜의 `listMessages` 가 돌려줄 줄. `beforeEach` 에서 `[]` · `원고작업` 기본 · `카드작업들 = {}` 로 되돌린다.)

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `lib/easy/cardnews-steps.ts`

```ts
import { POST as createCardnews } from "../../app/api/sns/projects/route";
import { POST as planCardnews } from "../../app/api/sns/projects/[id]/plan/route";
import { POST as generateCardnews } from "../../app/api/sns/projects/[id]/generate/route";
import { snsFlowStoreForUser } from "../sns-flow-store";
import { refreshProjectAssetUrls } from "../sns/runtime";
import { EasyStepError, read, relay } from "./relay";
import type { CardnewsProjectLike } from "../../app/easy/cardnews-view";

/**
 * **카드뉴스 라우트 셋을 함수로 부른다**(2단계 설계 §3). 1단계가 포스터 라우트
 * 셋을 부르는 것과 같다 — 새 생성 경로를 만들지 않는다.
 */

export async function draftCardnews(request: Request, input: unknown): Promise<{ projectId: string; project: CardnewsProjectLike }> {
  const created = await read(await createCardnews(relay(request, "/api/sns/projects", input, "cardnews-project")), "원고 준비");
  const projectId = created.project?.id as string | undefined;
  if (!projectId) throw new EasyStepError("원고 준비", "카드뉴스 작업을 만들지 못했습니다.", 500);
  const planned = await read(
    await planCardnews(
      relay(request, `/api/sns/projects/${projectId}/plan`, {}, "cardnews-plan"),
      { params: Promise.resolve({ id: projectId }) },
    ),
    "원고 쓰기",
  );
  return { projectId, project: planned.project as CardnewsProjectLike };
}

/** 「이대로 만들기」. 크레딧은 카드뉴스 `generate` 가 잡는다. */
export async function startCardnews(request: Request, projectId: string): Promise<void> {
  await read(
    await generateCardnews(
      relay(request, `/api/sns/projects/${projectId}/generate`, {}, "cardnews-generate"),
      { params: Promise.resolve({ id: projectId }) },
    ),
    "카드 만들기",
  );
}

/** 이 회원의 카드뉴스 작업 하나. 없으면 `null` — 포스터 작업이거나 남의 것이다. */
export async function cardnewsProject(userId: string, projectId: string): Promise<(CardnewsProjectLike & { title: string }) | null> {
  const project = await (await snsFlowStoreForUser(userId)).get(projectId);
  if (!project) return null;
  return (await refreshProjectAssetUrls(project)) as unknown as CardnewsProjectLike & { title: string };
}

/** 대화의 마지막 카드뉴스 작업(다시 쓰기 대상). 줄을 뒤에서부터 본다. */
export async function lastCardnewsProject(
  userId: string,
  rows: ReadonlyArray<{ role: string; workId?: string | null }>,
) {
  for (const row of [...rows].reverse()) {
    if (row.role !== "image" || !row.workId) continue;
    const project = await cardnewsProject(userId, row.workId);
    if (project) return project;
  }
  return null;
}
```

`route.ts` — `turn` 안 순서(1단계 흐름에 끼운다):

1. import 더하기: `cardAttachmentsFrom, NO_REFERENCE, NOT_MINE, readChosenSlots, slotsFromWords` · `pickCardSource` · `cardOptionsFrom, projectSpecFrom, readCardOptions` · `redraftInput` · `draftCardnews, lastCardnewsProject` · `isWebSourceEnabled`, 그리고 `export const maxDuration = 300;`(원고 1~2분 — 카드뉴스 원고 라우트와 같다)
2. `const 지난줄 = …` 을 ⓑ1 호출 **앞으로** 옮기고(이미 앞에 있다), `const 고칠원고 = await lastCardnewsProject(auth.member.userId, 지난줄);` 를 더한다
3. ⓑ1: `easyChatPrompt(…, 붙인수, Boolean(고칠원고))`, `readEasyDecision(raw, { canRevise: Boolean(고칠원고) })`
4. 고른 갈래:

```ts
    /*
     * **고른 갈래가 판단을 이긴다**(2단계 설계 §4). 「이미지 한 장 · 카드뉴스」 단추로
     * 답하고 다시 보낸 것이다. 말 · 상세페이지 · 고치기에는 안 끼어든다.
     */
    const 고른갈래 = input.kind === "image" || input.kind === "cardnews" ? input.kind as "image" | "cardnews" : undefined;
    const wants = 고른갈래 && ["image", "cardnews", "either"].includes(decision.wants) ? 고른갈래 : decision.wants;
    if (wants === "either") return Response.json({ ok: true, kindAsk: true, textModel });
```

   이후 `decision.wants` 를 쓰던 자리(비율 물음 · 사진 턴 · talk · detail_page)는 모두 `wants` 로 바꾼다.
5. 카드뉴스 · 고치기 갈래 — 비율 물음(`if (wants === "image" && 고르기.asks)`) 바로 뒤에:

```ts
    if (wants === "cardnews" || wants === "revise") {
      return await cardnewsTurn({
        request, userId: auth.member.userId, store, conversation, conversationId, prompt, textModel,
        wants, 사진들, 붙인것, input, decision, provider, 고칠원고,
      });
    }
```

   `cardnewsTurn` 은 같은 파일 아래(또는 파일이 700줄을 넘으면 `lib/easy/cardnews-turn.ts`)에:

```ts
async function cardnewsTurn(ctx: {
  request: Request; userId: string; store: ReturnType<typeof easyStoreForUser>;
  conversation: { title?: string | null }; conversationId: string; prompt: string; textModel: string;
  wants: "cardnews" | "revise"; 사진들: Array<{ id: string; title?: string | null; url?: string | null; storagePath: string }>;
  붙인것: string[]; input: Record<string, unknown>; decision: { ratio?: string; look?: string };
  provider: ReturnType<typeof createEasyChatProvider>;
  고칠원고: Awaited<ReturnType<typeof lastCardnewsProject>>;
}): Promise<Response> {
  let 입력: unknown;
  let photoRoles: Array<{ id: string; role: string }> = [];

  if (ctx.wants === "revise" && ctx.고칠원고) {
    // 고치기: 앞 원고의 조건 · 첨부 그대로, 말만 더한다(설계 §7). 앞 작업은 그대로 둔다.
    입력 = redraftInput(ctx.고칠원고, { words: ctx.prompt });
  } else {
    const options = cardOptionsFrom({
      said: { ratio: ctx.decision.ratio, look: ctx.decision.look },
      chosen: readCardOptions(ctx.input.cardOptions),
      imageModel: typeof ctx.input.imageModel === "string" ? ctx.input.imageModel : undefined,
    });
    if (!ctx.붙인것.length) return Response.json({ ok: true, needReference: true, textModel: ctx.textModel });

    const 판단 = await runPhotoTurn(
      {
        photos: ctx.사진들, words: ctx.prompt, mode: "cardnews",
        chosen: readChosenRoles(ctx.input.photoRoles, ctx.붙인것, { cardnews: true }),
        previous: readChosenRoles(ctx.input.previousRoles, ctx.붙인것, { cardnews: true }),
        ratio: options.ratio, imageModel: options.modelId,
      },
      { read: (photos) => readEasyPhotos(photos), judge: (text) => ctx.provider.decideRoles(text) },
    );
    if (판단.kind === "stop") return 멈춘다(판단.message);
    if (판단.kind === "ask") {
      return Response.json({ ok: true, photoAsk: { reason: 판단.reason, rows: 판단.rows, mode: "cardnews" }, textModel: ctx.textModel });
    }
    const 첨부 = cardAttachmentsFrom({
      userId: ctx.userId, photos: ctx.사진들, rows: 판단.rows,
      slots: { ...slotsFromWords(ctx.prompt, ctx.붙인것), ...readChosenSlots(ctx.input.photoSlots, ctx.붙인것) },
    });
    if (!첨부.ok && 첨부.reason === "no_reference") return Response.json({ ok: true, needReference: true, textModel: ctx.textModel });
    if (!첨부.ok) return 멈춘다(첨부.reason === "not_mine" ? NOT_MINE : UNUSABLE_PHOTO);

    const 내용 = pickCardSource(ctx.prompt, { webEnabled: isWebSourceEnabled() });
    if (!내용.ok) return 멈춘다(내용.message);

    photoRoles = 판단.rows;
    입력 = {
      title: easyTitle(ctx.prompt) || "카드뉴스",
      source: 내용.source,
      attachments: 첨부.attachments,
      ...projectSpecFrom(options),
      ...(판단.attachmentIntent ? { userInstruction: 판단.attachmentIntent.slice(0, 2000) } : {}),
    };
  }

  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.prompt });
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));

  const { projectId, project } = await draftCardnews(ctx.request, 입력);
  const cards = project.data.flow?.cards ?? [];
  if (!cards.length) {
    /*
     * **원고 0장은 조용히 끝내지 않는다**(설계 §9). 카드뉴스 원고 라우트는 이때도
     * `ok` 다. 까닭을 말하고, 작업은 지우지 않는다(2026-09-30 사용자 결정).
     */
    const 까닭 = [...(project.data.flow?.planningIssues ?? []), ...(project.data.flow?.copyIssues ?? [])].join(" ");
    const saved = await ctx.store.appendMessage({
      conversationId: ctx.conversationId, role: "assistant",
      body: `원고를 쓰지 못했습니다. ${까닭 || "내용을 가져오지 못했습니다."}`.trim(),
    });
    return Response.json({ ok: true, talked: true, message: saved, textModel: ctx.textModel });
  }
  const row = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "image", workId: projectId });
  return Response.json({ ok: true, cardnews: { rowId: row.id, project }, message: row, photoRoles, textModel: ctx.textModel });
}
```

   (`posterReferencesByIds` 가 돌려주는 `storagePath` 가 `사진들` 에 이미 있다 — `EasyPhoto` 에 `storagePath?: string` 을 더해 타입을 맞춘다.)

- [ ] **Step 4:** `vitest run app/easy app/api/easy lib/easy` · typecheck. Expected: 0 · 0. 1단계 `generate-route.test.ts` 가 전부 그대로 초록(가짜 판단은 `image` · `talk` · `detail_page` 뿐)
- [ ] **Step 5:** 커밋 `feat(easy): 채팅에서 카드뉴스 원고를 쓰고, 한 장인지 모르면 묻고, 말로 다시 쓴다`

---

### Task 9: 「이대로 만들기」 · 조건 바꾸기 라우트 (설계 §7 · §8)

**Files:** Create `app/api/easy/cardnews/route.ts` · Test `app/api/easy/__tests__/cardnews-action-route.test.ts`

**Interfaces — Produces:** `POST /api/easy/cardnews` 본문 `{ conversationId, projectId, action: "generate" | "redraft", options? }`
- generate → `{ ok: true, started: true }` · redraft → `{ ok: true, cardnews: { rowId, project }, message }`
- 공통 거절: 이 대화에 그 작업의 줄이 없으면 404, 카드뉴스 작업이 아니면 404

- [ ] **Step 1: 실패하는 시험** — 가짜: 인증, `easyStoreForUser`(`getConversation` · `listMessages` · `appendMessage`), `lib/easy/cardnews-steps`(`draftCardnews` · `startCardnews` · `cardnewsProject` 를 기록하는 가짜)

```ts
describe("「이대로 만들기」 (2단계 §8)", () => {
  it("이 대화의 원고면 만들기를 부른다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: 원고(2) };
    const { json } = await 보낸다({ action: "generate", projectId: "c1" });
    expect(json.started).toBe(true);
    expect(시작한것).toEqual(["c1"]);
  });

  /** Review Focus 1 */
  it("이 대화 줄이 없는 작업은 안 만든다", async () => {
    지난줄들 = [];
    카드작업들 = { c1: 원고(2) };
    const { status } = await 보낸다({ action: "generate", projectId: "c1" });
    expect(status).toBe(404);
    expect(시작한것).toEqual([]);
  });

  it("원고 단계가 아니거나 원고가 0장이면 안 만든다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: { ...원고(2), status: "ready" } };
    expect((await 보낸다({ action: "generate", projectId: "c1" })).status).toBe(400);
    카드작업들 = { c1: 원고(0) };
    expect((await 보낸다({ action: "generate", projectId: "c1" })).status).toBe(400);
    expect(시작한것).toEqual([]);
  });
});

describe("조건 바꾸기 (2단계 §7)", () => {
  it("새 조건으로 새 작업을 만들고 새 원고 줄을 남긴다 — 앞 작업은 그대로", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: { ...원고(2), title: "건강", toneNote: "" } };
    const { json } = await 보낸다({ action: "redraft", projectId: "c1", options: { ratio: "1:1", count: 5 } });
    expect(만든입력[0]).toMatchObject({ ratio: "1:1", cardCountMode: "fixed", cardCount: 5 });
    expect(json.cardnews.rowId).toBeDefined();
    expect(지운것).toEqual([]);
  });
});
```

(`원고(n)` 은 카드 n 장 `copy_ready` 작업. `지운것` 은 가짜 저장소에 삭제 함수가 불렸는지 — 어디서도 안 불려야 한다.)

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `app/api/easy/cardnews/route.ts`

```ts
import { authenticateApiMember } from "../../../../lib/membership/api";
import { easyStoreForUser } from "../../../../lib/easy/store";
import { cardnewsProject, draftCardnews, startCardnews } from "../../../../lib/easy/cardnews-steps";
import { EasyStepError } from "../../../../lib/easy/relay";
import { withLlmMeter } from "../../../../lib/llm/meter";
import { readCardOptions } from "../../../easy/cardnews-options";
import { redraftInput } from "../../../easy/cardnews-redraft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 조건을 바꾸면 원고를 다시 쓴다(1~2분).
export const maxDuration = 300;

/**
 * **「이대로 만들기」와 조건 바꾸기**(2단계 설계 §7 · §8).
 *
 * 둘 다 **이 대화가 만든 원고**에만 한다 — 대화 줄이 그 작업을 가리키는지 먼저 본다.
 * 크레딧은 카드뉴스 `generate` 가 잡는다. 아무것도 지우지 않는다(사용자 결정).
 */
export async function POST(request: Request) {
  return withLlmMeter(() => act(request));
}

function fail(message: string, status: number) {
  return Response.json({ ok: false, message, retryable: false }, { status });
}

async function act(request: Request): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const input = await request.json().catch(() => ({}));
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : "";
  const projectId = typeof input.projectId === "string" ? input.projectId : "";
  const action = input.action === "generate" || input.action === "redraft" ? input.action : "";
  if (!conversationId || !projectId || !action) return fail("무엇을 할지 알려 주세요.", 400);

  const store = easyStoreForUser(auth.member.userId);
  if (!(await store.getConversation(conversationId))) return fail("대화를 찾을 수 없습니다.", 404);
  const rows = await store.listMessages(conversationId);
  if (!rows.some((row) => row.role === "image" && row.workId === projectId)) return fail("이 대화의 원고가 아닙니다.", 404);
  const project = await cardnewsProject(auth.member.userId, projectId);
  if (!project) return fail("카드뉴스 원고를 찾을 수 없습니다.", 404);

  try {
    if (action === "generate") {
      if (project.status !== "copy_ready") return fail("원고 단계에서만 만들 수 있습니다.", 400);
      if (!(project.data.flow?.cards ?? []).length) return fail("원고가 없어 만들 수 없습니다.", 400);
      await startCardnews(request, projectId);
      return Response.json({ ok: true, started: true });
    }
    const { projectId: 새것, project: 새작업 } = await draftCardnews(
      request, redraftInput(project, { options: readCardOptions(input.options) }),
    );
    const row = await store.appendMessage({ conversationId, role: "image", workId: 새것 });
    return Response.json({ ok: true, cardnews: { rowId: row.id, project: 새작업 }, message: row });
  } catch (error) {
    if (error instanceof EasyStepError) {
      return Response.json({
        ok: false, step: error.step, message: error.message,
        retryable: error.status !== 402 && error.status !== 403,
      }, { status: error.status });
    }
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "하지 못했습니다." }, { status: 500 });
  }
}
```

- [ ] **Step 4:** 시험 · typecheck
- [ ] **Step 5:** 커밋 `feat(easy): 카드뉴스 「이대로 만들기」 · 조건 바꾸기`

---

### Task 10: 다시 열기 — 포스터 먼저, 없으면 카드뉴스 (설계 §8)

**Files:** Modify `app/easy/_components/load.ts`, `app/easy/[id]/page.tsx`(받은 값을 화면에 넘긴다) · Test `app/easy/__tests__/shell-wiring.test.ts`(글자 시험)

- [ ] **Step 1: 실패하는 시험** — `shell-wiring.test.ts` 끝에

```ts
describe("카드뉴스 다시 열기 (2단계 §8)", () => {
  const load = 코드("../_components/load.ts");
  it("포스터에서 못 찾은 작업을 카드뉴스에서 찾는다", () => {
    expect(load).toContain("cardnewsProject(");
    expect(load.indexOf("projects.get(")).toBeLessThan(load.indexOf("cardnewsProject("));
  });
  it("찾은 카드뉴스 작업을 화면에 넘긴다", () => {
    expect(load).toMatch(/return \{[^}]*cardnews/);
  });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `load.ts`: `projects` 맵을 만든 뒤, 포스터 작업이 없는 `workId` 마다 `cardnewsProject(membership.user.id, workId)` 를 부르고, 있으면 `cardnews[row.id] = project` 로 모은다. 반환에 `cardnews` 를 더한다(`Record<string, CardnewsProjectLike>`). `[id]/page.tsx` 는 `initialCardnews={loaded.cardnews}` 를 넘긴다
- [ ] **Step 4:** 시험 · typecheck
- [ ] **Step 5:** 커밋 `feat(easy): 대화를 다시 열면 카드뉴스 원고 · 진행 · 결과를 그린다`

---

### Task 11: 화면 (설계 §4 · §5-3 · §7 · §8)

**Files:** Create `app/easy/cardnews-state.ts`, `app/easy/_components/kind-ask.tsx`, `reference-ask.tsx`, `cardnews-card.tsx` · Modify `app/easy/easy-client.tsx`, `_components/message.tsx`, `_components/photo-ask.tsx`, `app/easy/photo-ask-state.ts` · Test `app/easy/__tests__/cardnews-state.test.ts`, `shell-wiring.test.ts`

**Interfaces — Produces (`cardnews-state.ts`):**
- `latestCardnewsRow(messages, cardnews): string | undefined` — 마지막 카드뉴스 원고 줄 id
- `cardResults(messages, views): Array<{ id; url; options? }>` — 결과 칸에 걸 카드
- `generatingProjects(views): string[]`
- `setItemsToAttach(set, libraryRows): { attach: Array<{id,url,title}>; slots: Array<{id; role}>; missing: number }`
- `cardnewsJob(projectId, conversationId, title): RunningJob` — `{ id: jobId("sns", projectId), tool: "sns", href: \`/easy/${conversationId}\`, poll: { url: \`/api/sns/projects/${projectId}/status\` } }`

- [ ] **Step 1: 실패하는 시험** — `cardnews-state.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { cardResults, cardnewsJob, generatingProjects, latestCardnewsRow, setItemsToAttach } from "../cardnews-state";

const 보기 = (status: string, cards: Array<{ index: number; url?: string; status?: string }>) => ({
  projectId: "p", status, cards: cards.map((c) => ({ role: "body", headline: "h", status: c.status ?? "done", ...c })),
  issues: [], options: { ratio: "4:5", count: "auto", language: "ko", modelId: "m", look: "auto" },
  sourceLabel: "", cost: { units: 1, label: "" }, done: 0, total: cards.length,
}) as never;

describe("카드뉴스 화면 상태", () => {
  /** Review Focus 1 */
  it("마지막 원고에만 단추", () => {
    const messages = [{ id: "r1", role: "image" }, { id: "u", role: "user" }, { id: "r2", role: "image" }] as never;
    expect(latestCardnewsRow(messages, { r1: 보기("copy_ready", []), r2: 보기("copy_ready", []) })).toBe("r2");
  });

  it("다 만든 카드를 결과 칸에", () => {
    expect(cardResults([{ id: "r1", role: "image" }] as never, { r1: 보기("ready", [{ index: 1, url: "a" }, { index: 2 }]) }))
      .toEqual([{ id: "r1:1", url: "a" }]);
  });

  it("만드는 중인 작업", () => {
    expect(generatingProjects({ r1: 보기("generating", []), r2: 보기("ready", []) })).toEqual(["p"]);
  });

  /** Review Focus 3 */
  it("세트 그림 중 없는 것은 세고, 있는 것만 붙인다", () => {
    const set = { items: [{ referenceImageId: "a", role: "cover" }, { referenceImageId: "z", role: "body" }] };
    expect(setItemsToAttach(set, [{ id: "a", url: "u", title: "A" }])).toEqual({
      attach: [{ id: "a", url: "u", title: "A" }], slots: [{ id: "a", role: "cover" }], missing: 1,
    });
  });

  /** Review Focus 2 */
  it("셸 등록 주소는 그 대화", () => {
    expect(cardnewsJob("p", "c1", "건강")).toMatchObject({ id: "sns:p", tool: "sns", href: "/easy/c1", poll: { url: "/api/sns/projects/p/status" } });
  });
});
```

`shell-wiring.test.ts` 끝에 연결 시험:

```ts
describe("카드뉴스 화면 잇기 (2단계)", () => {
  it("한 장 · 카드뉴스를 묻는 줄을 그린다", () => { expect(client).toContain("EasyKindAsk"); });
  it("레퍼런스를 요청하는 줄을 그린다", () => { expect(client).toContain("EasyReferenceAsk"); });
  it("원고 카드를 그린다", () => { expect(코드("../_components/message.tsx")).toContain("EasyCardnewsCard"); });
  it("「이대로 만들기」 · 조건 바꾸기를 새 라우트로 보낸다", () => { expect(client).toContain("/api/easy/cardnews"); });
  it("만드는 동안 셸에 그 대화 주소로 등록한다", () => { expect(client).toMatch(/start\(cardnewsJob\(/); });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현 — `cardnews-state.ts`**

```ts
import { jobId, type RunningJob } from "../../lib/running-jobs";
import type { EasyCardnewsView } from "./cardnews-view";
import type { EasyMessage } from "./turn";

/** 마지막 카드뉴스 원고 줄. 「이대로 만들기」 · 조건 줄은 이 줄에만 있다(설계 §7). */
export function latestCardnewsRow(
  messages: readonly EasyMessage[],
  views: Readonly<Record<string, EasyCardnewsView>>,
): string | undefined {
  return [...messages].reverse().find((message) => message.role === "image" && views[message.id])?.id;
}

/** 결과 칸에 걸 카드 — 그림이 온 것만. */
export function cardResults(
  messages: readonly EasyMessage[],
  views: Readonly<Record<string, EasyCardnewsView>>,
): Array<{ id: string; url: string }> {
  return messages.flatMap((message) => (views[message.id]?.cards ?? [])
    .filter((card) => card.url)
    .map((card) => ({ id: `${message.id}:${card.index}`, url: card.url! })));
}

export function generatingProjects(views: Readonly<Record<string, EasyCardnewsView>>): string[] {
  return Object.values(views).filter((view) => view.status === "generating").map((view) => view.projectId);
}

/** 저장한 세트 → 붙일 그림과 자리. 내 라이브러리에 없는 그림은 세어 알린다. */
export function setItemsToAttach(
  set: { items: ReadonlyArray<{ referenceImageId: string; role: string }> },
  library: ReadonlyArray<{ id: string; url?: string; title?: string | null }>,
) {
  const byId = new Map(library.map((row) => [row.id, row]));
  const found = set.items.filter((item) => byId.get(item.referenceImageId)?.url);
  const attach = [...new Map(found.map((item) => {
    const row = byId.get(item.referenceImageId)!;
    return [row.id, { id: row.id, url: row.url!, title: row.title ?? "레퍼런스" }];
  })).values()];
  return {
    attach,
    slots: found.map((item) => ({ id: item.referenceImageId, role: item.role })),
    missing: set.items.length - found.length,
  };
}

/**
 * **셸에 그 대화 주소로 등록한다**(설계 §8). 대화 화면에 있을 때는 셸이 안 부르고
 * (`href === pathname`), 떠나면 셸이 부른다 — 한 작업을 둘이 겹쳐 부르지 않는다.
 */
export function cardnewsJob(projectId: string, conversationId: string, title: string): RunningJob {
  return {
    id: jobId("sns", projectId),
    tool: "sns",
    title: title || "카드뉴스",
    href: `/easy/${conversationId}`,
    startedAt: Date.now(),
    poll: { url: `/api/sns/projects/${projectId}/status` },
  };
}
```

(`setItemsToAttach` 의 `title` 이 비면 「레퍼런스」 — 시험 기대의 `title: "A"` 는 라이브러리 값 그대로.)

- [ ] **Step 4: 부품 셋**

`_components/kind-ask.tsx`

```tsx
"use client";

import { Button } from "@fixup/ui";

/** **한 장인가 여러 장인가**(2단계 설계 §4). 물음은 코드가 짓는다. */
export function EasyKindAsk({ onPick, disabled }: { onPick: (kind: "image" | "cardnews") => void; disabled?: boolean }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
      <p className="text-base leading-7">이미지 한 장으로 만들까요, 여러 장짜리 카드뉴스로 만들까요?</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick("image")}>이미지 한 장</Button>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick("cardnews")}>카드뉴스 여러 장</Button>
      </div>
    </div>
  );
}
```

`_components/reference-ask.tsx` — 문구 `NO_REFERENCE`, 왼쪽 `EasyLibraryPicker`(1단계 부품, 고른 것을 붙인다), 오른쪽 「저장한 레퍼런스 세트」 단추 → `GET /api/reference-sets` 로 `purpose !== "poster"` 세트 목록을 펼치고, 누르면 `setItemsToAttach` 로 붙이고 `slots` 를 들고 있는다. `missing > 0` 이면 「세트 그림 N장은 라이브러리에 없어 뺐습니다」. 붙인 것이 하나라도 있으면 [이걸로 만들기] 가 켜지고 `onSubmit({ slots })`.

```tsx
"use client";

import * as React from "react";
import { Button } from "@fixup/ui";
import { NO_REFERENCE } from "../cardnews-attachments";
import { setItemsToAttach } from "../cardnews-state";
import { EasyLibraryPicker, type EasyLibrary } from "./library-attach";

interface ReferenceSet { id: string; name: string; purpose: string; items: Array<{ referenceImageId: string; role: string }> }

/** **따라 만들 카드뉴스를 요청한다**(2단계 설계 §5-3). 레퍼런스 없이는 원고를 안 쓴다. */
export function EasyReferenceAsk({
  library, attachedIds, onAttach, onSubmit, disabled,
}: {
  library: EasyLibrary;
  attachedIds: string[];
  onAttach: (picked: Array<{ id: string; url: string; title: string }>) => void;
  onSubmit: (slots: Array<{ id: string; role: string }>) => void;
  disabled?: boolean;
}) {
  const [sets, setSets] = React.useState<ReferenceSet[] | null>(null);
  const [slots, setSlots] = React.useState<Array<{ id: string; role: string }>>([]);
  const [note, setNote] = React.useState("");

  async function openSets() {
    try {
      const body = await (await fetch("/api/reference-sets", { cache: "no-store" })).json();
      setSets(body.ok && Array.isArray(body.sets) ? body.sets.filter((set: ReferenceSet) => set.purpose !== "poster") : []);
    } catch {
      setSets([]);
    }
  }

  function pickSet(set: ReferenceSet) {
    const picked = setItemsToAttach(set, library.rows);
    onAttach(picked.attach);
    setSlots(picked.slots);
    setNote(picked.missing ? `세트 그림 ${picked.missing}장은 라이브러리에 없어 뺐습니다.` : "");
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
      <p className="text-base leading-7">{NO_REFERENCE}</p>
      <div className="flex flex-wrap gap-2">
        <EasyLibraryPicker library={library} selectedIds={attachedIds} onPick={onAttach} label="라이브러리에서 고르기" />
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => void openSets()}>저장한 레퍼런스 세트</Button>
      </div>
      {sets ? (
        sets.length ? (
          <div className="flex flex-wrap gap-2">
            {sets.map((set) => (
              <Button key={set.id} size="sm" variant="outline" disabled={disabled} onClick={() => pickSet(set)}>{set.name}</Button>
            ))}
          </div>
        ) : <p className="text-meta text-subtle-foreground">저장한 카드뉴스 세트가 없습니다.</p>
      ) : null}
      {note ? <p className="text-meta text-subtle-foreground">{note}</p> : null}
      <div className="flex justify-end">
        <Button size="sm" disabled={disabled || !attachedIds.length} onClick={() => onSubmit(slots)}>이걸로 만들기</Button>
      </div>
    </div>
  );
}
```

`_components/cardnews-card.tsx`

```tsx
"use client";

import Link from "next/link";
import { Button, cn } from "@fixup/ui";
import { IMAGE_LOOKS, IMAGE_LOOK_LABEL } from "@fixup/shared";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { CARD_COUNTS, CARD_LANGUAGES, CARD_LANGUAGE_LABEL, CARD_RATIOS, type CardOptions } from "../cardnews-options";
import type { EasyCardnewsView } from "../cardnews-view";

const 자리이름: Record<string, string> = { cover: "표지", body: "속지", ending: "끝" };

/**
 * **카드뉴스 원고 · 진행 · 결과**(2단계 설계 §7 · §8).
 *
 * 마지막 원고에만 조건 줄과 「이대로 만들기」가 있다. 앞 원고는 접는다.
 */
export function EasyCardnewsCard({
  view, latest, busy, onGenerate, onRedraft,
}: {
  view: EasyCardnewsView;
  latest: boolean;
  busy?: boolean;
  onGenerate: () => void;
  onRedraft: (options: Partial<CardOptions>) => void;
}) {
  if (view.status === "copy_ready" && !latest) {
    return <p className="text-meta text-subtle-foreground">원고를 다시 썼습니다.</p>;
  }
  const 조건 = <K extends keyof CardOptions>(key: K, value: CardOptions[K]) => onRedraft({ [key]: value } as Partial<CardOptions>);

  return (
    <div className="grid max-w-[85%] gap-3 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
      <p className="text-base leading-7">
        {view.status === "copy_ready" ? `원고를 썼습니다 (${view.total}장) · ${view.sourceLabel}`
          : view.status === "generating" ? `카드를 만드는 중입니다 (${view.done}/${view.total}장)`
            : `카드뉴스 ${view.done}장을 만들었습니다`}
      </p>
      <ol className="grid gap-1.5 text-meta">
        {view.cards.map((card) => (
          <li key={card.index} className="grid gap-0.5">
            <span><strong>{card.index} {자리이름[card.role] ?? card.role}</strong> {card.headline}</span>
            {card.body ? <span className="text-subtle-foreground">{card.body}</span> : null}
          </li>
        ))}
      </ol>

      {view.status === "copy_ready" ? (
        <>
          <div className="flex flex-wrap gap-1.5 text-meta">
            <Choice label="비율" value={view.options.ratio} items={CARD_RATIOS.map((id) => [id, id])} onPick={(v) => 조건("ratio", v as CardOptions["ratio"])} disabled={busy} />
            <Choice label="장수" value={String(view.options.count)} items={[["auto", `자동 ${view.total}장`], ...CARD_COUNTS.map((n) => [String(n), `${n}장`] as [string, string])]} onPick={(v) => 조건("count", v === "auto" ? "auto" : Number(v) as CardOptions["count"])} disabled={busy} />
            <Choice label="언어" value={view.options.language} items={CARD_LANGUAGES.map((id) => [id, CARD_LANGUAGE_LABEL[id]])} onPick={(v) => 조건("language", v as CardOptions["language"])} disabled={busy} />
            <Choice label="모델" value={view.options.modelId} items={IMAGE_MODELS.map((m) => [m.id, m.label])} onPick={(v) => 조건("modelId", v)} disabled={busy} />
            <Choice label="그림체" value={view.options.look} items={IMAGE_LOOKS.map((id) => [id, IMAGE_LOOK_LABEL[id]])} onPick={(v) => 조건("look", v as CardOptions["look"])} disabled={busy} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-meta text-subtle-foreground">고치고 싶으면 말로 해 주세요. 예: 더 짧게, 20대 말투로</span>
            <Button size="sm" disabled={busy} onClick={onGenerate}>이대로 만들기 · {view.cost.label}</Button>
          </div>
        </>
      ) : null}

      {view.status !== "copy_ready" ? (
        <Button asChild size="sm" variant="secondary" className="w-fit">
          <Link href={`/sns/${view.projectId}`}>카드뉴스 화면에서 이어서 작업</Link>
        </Button>
      ) : null}
    </div>
  );
}

function Choice({ label, value, items, onPick, disabled }: {
  label: string; value: string; items: Array<[string, string]>; onPick: (value: string) => void; disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5", disabled && "opacity-50")}>
      <span className="text-subtle-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => { if (event.target.value !== value) onPick(event.target.value); }}
        className="bg-transparent"
      >
        {items.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}
```

- [ ] **Step 5: 물음 화면 넓히기** — `photo-ask-state.ts` 의 `EasyPhotoRole` 을 `CardPhotoRole` 로, `startPhotoAsk(words, reason, rows, mode = "image")` 가 `mode` 를 들고 있게. `photo-ask.tsx` 는 `mode === "cardnews"` 일 때 단추 둘을 더한다:

```tsx
const 카드단추: ReadonlyArray<{ role: CardPhotoRole; label: string }> = [
  { role: "place_as_is", label: "원본 그대로 한 장" },
  { role: "ending", label: "마지막 장" },
];
// 줄마다: const 고를것 = [...단추, ...(mode === "cardnews" ? 카드단추 : []), ...(row.role === "preserve_person_restyled" ? [그림체만] : [])];
```

- [ ] **Step 6: `message.tsx`** — `EasyMessageRow` 에 `cardnews?: EasyCardnewsView`, `cardnewsLatest?: boolean`, `onCardGenerate?`, `onCardRedraft?` 를 더하고, `image` 갈래 맨 앞에서 `cardnews` 가 있으면 `<AssistantMark /> + <EasyCardnewsCard …/>` 를 그린다

- [ ] **Step 7: `easy-client.tsx` 잇기** (판단은 위 파일들에 있다 — 여기는 연결만)
  1. props `initialCardnews?: Record<string, CardnewsProjectLike>`; 상태 `cardnews`(줄 id → 작업), `kindAsking: string | null`, `referenceAsking: string | null`, `const views = useMemo(() => map(cardnews, p => cardnewsView(p, creditPolicy)))`
  2. `send` 의 `다시` 에 `kind?: "image" | "cardnews"`, `photoSlots?` 를 더해 본문에 싣는다(있을 때만). `imageModel` 과 함께 `cardOptions` 는 안 보낸다(조건은 원고 뒤에 바꾼다)
  3. 응답:
     - `body.kindAsk` → `setKindAsking(prompt)`
     - `body.needReference` → `setReferenceAsking(prompt)`
     - `body.cardnews` → `setMessages(+ { id: body.cardnews.rowId, role: "image", body: "", workId: project.id })`, `setCardnews(c => ({ ...c, [rowId]: project }))`, `setLastRoles(rememberRoles(…, body.photoRoles))`, `router.refresh()` 하고 **그림을 기다리지 않고** 끝낸다(`collect` 를 안 부른다)
     - `body.photoAsk?.mode === "cardnews"` → `startPhotoAsk(prompt, reason, rows, "cardnews")`
  4. 「이대로 만들기」: `billableFetch("/api/easy/cardnews", { body: JSON.stringify({ conversationId, projectId, action: "generate" }) })` → 성공이면 `start(cardnewsJob(projectId, conversationId, 제목))` 하고 그 작업의 `status` 를 `"generating"` 으로 바꿔 둔다. **이 대화에 만드는 중인 카드뉴스가 있으면(`generatingProjects(views).length`) 단추를 잠근다**(설계 §8 「두 번째 카드뉴스를 시작하는 것은 막는다」) — `EasyCardnewsCard` 의 `busy` 로 넘긴다
  5. 조건 바꾸기: 같은 주소에 `action: "redraft", options` → 응답의 `cardnews` 를 3번처럼 더한다
  6. 진행: `useEffect` — `generatingProjects(views)` 가 있으면 10초 간격(`JOB_POLL_INTERVAL_MS`)으로 하나씩 `POST /api/sns/projects/{id}/status`(앞 요청이 끝난 뒤 다음), 응답의 `project` 로 그 줄의 작업을 바꾸고, `active === false` 면 `finish(jobId("sns", id))`. 화면을 떠나면 멈춘다 — 셸이 잇는다
  7. `results` 에 `cardResults(shown, views)` 를 더한다
  8. `EasyKindAsk` · `EasyReferenceAsk` 를 `asking` 줄 옆에 그린다. 사진이 바뀌면 두 물음도 거둔다
  9. 입력창: 만드는 중에도 연다(`sending` 만 잠근다)
- [ ] **Step 8:** 시험 · typecheck · lint · `wc -l easy-client.tsx` ≤ 800(넘으면 6 · 7번을 `app/easy/use-cardnews.ts` 훅으로 뺀다)
- [ ] **Step 9: 실제 화면** — 3100 에 개발 서버(1단계 방식, `.env.local` 을 복사하지 않고 환경변수로). Playwright 로 한 번에 하나씩: ① 사진 없이 「건강 카드뉴스」 → 레퍼런스 요청 줄 ② 레퍼런스 한 장 붙이고 보내기 → 원고 카드 · 조건 줄 · 「이대로 만들기 · 약 N…」 ③ 「신메뉴 홍보물 만들어줘」 → 두 단추. **「이대로 만들기」는 누르지 않는다**(값이 든다 — 사용자에게 물은 뒤에만)
- [ ] **Step 10:** 커밋 `feat(easy): 카드뉴스 원고 카드 · 갈래 물음 · 레퍼런스 요청 · 진행 표시`

---

### Task 12: 전체 검사 · 0줄 · 뮤테이션

- [ ] **Step 1:** `pnpm --filter @fixup/web typecheck` · `test` · `lint` 전부. Expected: 0 · 0 · 0
- [ ] **Step 2:** Global Constraints 의 0줄 명령 → 빈 출력
- [ ] **Step 3: 뮤테이션**(파일을 고치고 → `vitest run app/easy app/api/easy lib/easy` 빨강 확인 → 되돌림)

| # | 망가뜨릴 곳 | 잡아야 할 시험 |
|---|---|---|
| K1 | 라우트: `if (wants === "either") return …` 지우기 | 「두 단추로 묻고」 |
| K2 | 라우트: 고른 갈래 무시(`const wants = decision.wants`) | 「고른 갈래가 판단을 이긴다」 |
| K3 | `cardAttachmentsFrom`: `no_reference` 검사 지우기 | 「분위기 참고가 없으면」 · 라우트 「레퍼런스가 없으면」 |
| K4 | `styleSlots`: 한 장일 때 `body` 하나만 | 「한 장이면 세 자리 모두」 · 라우트 첨부 기대 |
| K5 | `cardAttachmentsFrom`: 내 폴더 검사 지우기 | 「남의 폴더 그림이면」 |
| K6 | `pickCardSource`: `webEnabled` 무시 | 「기사 주소가 꺼져 있으면」 |
| K7 | `cardCost`: image-v2 에서 원본 장 빼기(`generatedCount`) | 「새 방식은 원고 장수만큼」 |
| K8 | 원고 0장 갈래 지우기 | 「원고 0장이면」 |
| K9 | `api/easy/cardnews`: 대화 줄 검사 지우기 | 「이 대화 줄이 없는 작업은」 |
| K10 | `api/easy/cardnews`: `copy_ready` 검사 지우기 | 「원고 단계가 아니거나」 |
| K11 | `readRoleJudgment`: cardnews 아닐 때도 두 역할 받기 | 「카드뉴스가 아니면 두 역할을 unclear」 |
| K12 | `cardnewsJob`: `href` 를 `/sns/…` 로 | 「셸 등록 주소는 그 대화」 |
| K13 | `latestCardnewsRow`: 첫 줄을 돌려주기 | 「마지막 원고에만 단추」 |

- [ ] **Step 4:** 결과를 `docs/easy-measure/2026-09-30-mutation.md` 에 표로 더하고 커밋 `test(easy): 카드뉴스 규칙 뮤테이션 검증`

---

### Task 13: 독립 리뷰 → 보고

- [ ] **Step 1:** `code-reviewer`(opus)에게 설계 · 이 계획 · `git diff $START..HEAD` · Review Focus 를 주고 본다. 특히: 크레딧이 원고 단계에서 나가는 길 · 남의 작업을 만들게 하는 길 · 셸과 화면이 겹쳐 부르는 길 · 이미지 한 장 흐름이 깨지는 곳 · 0줄
- [ ] **Step 2:** 지적을 코드로 확인 → 맞는 것만 시험 먼저 고친다. 틀린 것은 근거
- [ ] **Step 3:** Task 12 Step 1 · 2 다시
- [ ] **Step 4:** 사용자에게 쉬운 말로 보고 — 실측, 시험 수, 뮤테이션, 리뷰에서 고친 것, 0줄, 남은 한계. **합치기 · 배포는 안 했다.** 실제 카드뉴스 한 벌을 만들어 보는 확인은 값이 들어 사용자에게 묻는다
