# 「쉽게」 3단계 — 만든 카드뉴스 손보기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「쉽게」 채팅에서 만든 카드뉴스를 한 장 다시 만들기(앞 그림 보관 · 확인 후 값) · 한 장 글 고치기 · 인스타 게시글 · 전부 받기로 손본다. 말과 단추 둘 다.

**Architecture:** 2단계와 같다 — 「쉽게」 서버가 기존 카드뉴스 라우트(`PATCH/POST cards/[n]`, `POST caption`)를 함수로 부른다(`lib/easy/relay.ts`). 판단은 순수 모듈(`app/easy/cardnews-after.ts`)이 값으로 하고, 서버 일은 `lib/easy/cardnews-after-steps.ts`, 채팅 턴은 `lib/easy/cardnews-after-turn.ts`, 화면은 훅과 새 부품 둘.

**Tech Stack:** Next.js 15 App Router · TypeScript · vitest 4 · pnpm 9 · `@fixup/sns-core` · jszip(이미 있음)

**Spec:** `docs/superpowers/specs/2026-10-01-easy-cardnews-after-design.md` (앞 단계: `2026-09-30-easy-cardnews-design.md`)

## Global Constraints

- **기존 코드 0줄:** `git diff --stat $START -- packages apps/web/app/api/poster apps/web/app/poster apps/web/app/sns apps/web/app/api/sns apps/web/lib/sns apps/web/lib/sns-flow-store.ts apps/web/lib/poster apps/web/lib/reference-images.ts apps/web/lib/membership apps/web/lib/llm apps/web/app/api/reference-sets apps/web/lib/running-jobs.ts apps/web/app/_components apps/web/lib/local-store apps/web/lib/supabase supabase` → 빈 출력. `$START` = 이 계획 커밋
- **아무것도 지우지 않는다** — 한 장 다시 만들기 전 앞 그림을 라이브러리 참고 이미지로 보관, 보관 실패면 다시 만들지 않는다
- **값은 확인 뒤에만** — 말 「3번 다시 그려줘」는 확인 줄까지만
- 파일 800줄 이하(`easy-client.tsx` 는 지금 800 — 손대지 않는다)
- `app/` · `lib/` 의 글자 상수에 em-dash 금지(`app/__tests__/ui-text-dash.test.ts`)
- 커밋: `<type>(easy): 한국어 설명` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 합치기 · 배포 · 올리기 안 함
- 시험 명령: `pnpm --filter @fixup/web exec vitest run app/easy app/api/easy lib/easy app/__tests__/ui-text-dash.test.ts lib/__tests__/billable-key-wiring.test.ts` · `pnpm --filter @fixup/web typecheck`

## Review Focus

1. **다 만든 작업에서 글만 고친 뒤 「이대로 만들기」가 다시 나와 전 장 값이 나간다** → 화면은 「만든 작업」에 그 단추를 안 내고, 서버는 만든 작업의 `generate` 를 409 로 거절한다 (Task 1 `isMade`, Task 5 「만든 작업은 전체 만들기를 거절」)
2. **앞 그림 보관이 실패했는데 다시 만들어 앞 그림을 잃는다** → 보관 실패면 `POST cards/[n]` 를 안 부른다 (Task 4 「보관이 실패하면 다시 만들지 않는다」)
3. **말 「3번 다시」가 확인 없이 값을 낸다** → 채팅 턴은 `cardAsk` 만 돌려주고 아무 라우트도 안 부른다 (Task 6)
4. **원고에 없는 번호 · 만들기 전 원고에 「다시 그려줘」** → 「몇 번 장인가요?」 / 「먼저 만들어 주세요」, 아무것도 안 남긴다 (Task 2 · Task 6)
5. **만드는 중에 또 다시 만들기** → 화면 잠금 + 서버 409 를 그대로 전한다 (Task 5 · Task 7)

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `app/easy/cardnews-after.ts` (새) | 순수 판단 — 만든 작업, 장 찾기, 보관 이름, 글 고치기 부탁 · 읽기, 받기 목록, 게시글 글, 다시 만들기 값 |
| `app/easy/cardnews-view.ts` | 보기에 `made` · 장마다 `hasImage` · `caption` 더하기 |
| `app/easy/chat.ts` | 갈래 넷(`card_redo` · `card_text` · `caption` · `download`) · `card` · `note` |
| `lib/easy/chat-provider.ts` | 판단 틀에 `card` · `note`, 새 틀 `EASY_CARD_EDIT_SPEC` · `editCard` |
| `lib/easy/cardnews-after-steps.ts` (새) | 서버 일 — `editCard` · `archiveCard` · `redoCard` · `captionCard` |
| `lib/easy/cardnews-after-turn.ts` (새) | 채팅 턴의 네 갈래 |
| `app/api/easy/cardnews/route.ts` | `generate` 막기 · `edit` · `redo` · `caption` |
| `app/api/easy/generate/route.ts` | 네 갈래를 `cardAfterTurn` 으로 넘기기(몇 줄) |
| `app/easy/use-cardnews.ts` | 손보기 요청 · 확인 줄 · 글 칸 상태 · 받기 |
| `app/easy/_components/cardnews-card-row.tsx` (새) | 장 한 줄 — 단추 · 글 칸 · 확인 줄 |
| `app/easy/_components/cardnews-caption.tsx` (새) | 게시글 칸 · 복사 |
| `app/easy/_components/cardnews-card.tsx` | 위 둘을 쓰고, 만든 작업이면 「이대로 만들기」를 안 낸다 |
| `scripts/easy-measure/cases.mts` · `run.mts` | 새 갈래 실측 |

---

### Task 1: 순수 판단과 보기

**Files:** Create `app/easy/cardnews-after.ts` · Modify `app/easy/cardnews-view.ts` · Test `app/easy/__tests__/cardnews-after.test.ts`, `app/easy/__tests__/cardnews-view.test.ts`

**Interfaces — Produces:**
- `isMade(project: AfterProject): boolean`
- `cardAt(project, index: number): AfterCard | undefined`
- `archiveTitle(title: string, index: number): string`
- `cardEditPrompt(project, index, words): string` · `readCardEdit(raw): CopyPatch | undefined`
- `downloadList(view: EasyCardnewsView): Array<{ index: number; url: string }>`
- `captionText(caption: Caption): string`
- `NOT_MADE_YET` · `ASK_CARD_NUMBER`
- 보기: `EasyCardnewsView.made: boolean`, `EasyCardView.hasImage: boolean`, `EasyCardnewsView.caption?: Caption`

- [ ] **Step 1: 실패하는 시험** — `cardnews-after.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  ASK_CARD_NUMBER, NOT_MADE_YET, archiveTitle, captionText, cardAt, cardEditPrompt, downloadList, isMade, readCardEdit,
} from "../cardnews-after";

const 장 = (index: number, over: Record<string, unknown> = {}) =>
  ({ index, role: "body", kind: "generated", copy: { headline: `h${index}`, body: `b${index}` }, status: "pending", ...over });
const 작업 = (cards: unknown[], status = "ready") => ({ title: "거북목", status, language: "ko", data: { flow: { cards } } }) as never;

describe("만든 작업 (3단계 §3)", () => {
  /** Review Focus 1 — 글을 고치면 상태가 copy_ready 로 돌아와도 만든 작업이다. */
  it("그림이 한 장이라도 있으면 상태와 상관없이 만든 작업", () => {
    expect(isMade(작업([장(1, { status: "done" }), 장(2)], "copy_ready"))).toBe(true);
    expect(isMade(작업([장(1, { assetPath: "u/sns/p/1.png" })], "copy_ready"))).toBe(true);
    expect(isMade(작업([장(1, { status: "failed" })]))).toBe(true);
    expect(isMade(작업([장(1), 장(2)], "copy_ready"))).toBe(false);
  });

  it("장 번호로 찾는다, 없는 번호는 없다", () => {
    expect(cardAt(작업([장(1), 장(2)]), 2)?.index).toBe(2);
    expect(cardAt(작업([장(1)]), 9)).toBeUndefined();
    expect(cardAt(작업([장(1)]), 0)).toBeUndefined();
  });
});

describe("보관 이름", () => {
  it("작업 제목 · 번호 · 이전 그림", () => {
    expect(archiveTitle("거북목", 3)).toBe("거북목 · 3번 장 이전 그림");
    expect(archiveTitle("", 1)).toBe("카드뉴스 · 1번 장 이전 그림");
  });
});

describe("한 장 글 고치기 (3단계 §6-2)", () => {
  it("그 장 글과 말을 주고, 앞 글에 없는 사실을 넣지 말라고 한다", () => {
    const prompt = cardEditPrompt(작업([장(1), 장(3, { copy: { headline: "뒷면", body: "본문", accent: "강조" } })]), 3, "제목을 더 짧게");
    expect(prompt).toContain("뒷면");
    expect(prompt).toContain("강조");
    expect(prompt).toContain("제목을 더 짧게");
    expect(prompt).toContain("없는 사실");
  });

  it("받은 글은 다듬고, 빈 칸은 안 바꾼 것으로 본다", () => {
    expect(readCardEdit({ headline: " 새 제목 ", body: "", accent: "", footnote: "" })).toEqual({ headline: "새 제목" });
    expect(readCardEdit({ headline: "", body: "", accent: "", footnote: "" })).toBeUndefined();
    expect(readCardEdit(null)).toBeUndefined();
  });
});

describe("받기 · 게시글", () => {
  it("그림이 있는 장만 받는다", () => {
    const view = { cards: [{ index: 1, url: "a" }, { index: 2 }, { index: 3, url: "c" }] } as never;
    expect(downloadList(view)).toEqual([{ index: 1, url: "a" }, { index: 3, url: "c" }]);
  });

  it("게시글은 첫 문장 · 본문 · 해시태그 · 첫 댓글 차례로 이어 복사한다", () => {
    expect(captionText({ hook: "훅", body: "본문", hashtags: ["#a", "b"], firstComment: "댓글" }))
      .toBe("훅\n\n본문\n\n#a #b\n\n첫 댓글: 댓글");
  });

  it("안내 말", () => {
    expect(NOT_MADE_YET).toContain("이대로 만들기");
    expect(ASK_CARD_NUMBER).toContain("몇 번");
  });
});
```

`cardnews-view.test.ts` 끝에:

```ts
describe("만든 작업 보기 (3단계)", () => {
  it("만든 작업 · 장마다 그림 유무 · 게시글", () => {
    const 만든 = 작업({
      status: "copy_ready",
      data: {
        source: { kind: "question", question: "q" }, attachments: [],
        flow: {
          planningIssues: [], copyIssues: [],
          caption: { hook: "h", body: "b", hashtags: [], firstComment: "" },
          cards: [
            { index: 1, role: "cover", copy: { headline: "a" }, status: "done", assetUrl: "u1" },
            { index: 2, role: "body", copy: { headline: "b" }, status: "pending" },
          ],
        },
      },
    });
    const view = cardnewsView(만든, "image-v2");
    expect(view.made).toBe(true);
    expect(view.cards.map((card) => card.hasImage)).toEqual([true, false]);
    expect(view.caption?.hook).toBe("h");
    expect(cardnewsView(작업(), "image-v2").made).toBe(true);
  });
});
```

(마지막 줄: 기본 `작업()` 의 2번 장은 `status: "done"` · `assetUrl` 이 있어 만든 작업이다.)

- [ ] **Step 2:** `vitest run app/easy/__tests__/cardnews-after.test.ts app/easy/__tests__/cardnews-view.test.ts` → FAIL(모듈 없음 · `made` 없음)
- [ ] **Step 3: 구현** — `app/easy/cardnews-after.ts`

```ts
import { CARD_LANGUAGE_LABEL, CARD_LANGUAGES } from "./cardnews-options";
import type { EasyCardnewsView } from "./cardnews-view";

/**
 * **만든 카드뉴스 손보기의 판단**(3단계 설계). 화면과 서버가 같은 값을 쓴다.
 */

export interface AfterCard {
  index: number;
  role: string;
  kind?: string;
  status: string;
  assetPath?: string;
  assetUrl?: string;
  copy: { headline: string; body?: string; accent?: string; footnote?: string };
}

export interface AfterProject {
  title?: string;
  status: string;
  language: string;
  data: { flow?: { cards: AfterCard[] } };
}

export interface CopyPatch { headline?: string; body?: string; accent?: string; footnote?: string }
export interface Caption { hook: string; body: string; hashtags: string[]; firstComment: string }

export const NOT_MADE_YET = "아직 만든 카드가 없습니다. 원고 밑 「이대로 만들기」를 먼저 눌러 주세요.";
export const ASK_CARD_NUMBER = "몇 번 장인가요? 예: 「3번 다시 그려줘」";

const 그림있는상태 = new Set(["done", "review_required", "failed"]);

/**
 * **만든 작업**(설계 §3). 그림이 한 장이라도 있으면 만든 작업이다. 상태로 가르지 않는다 —
 * 한 장 글을 저장하면 카드뉴스 라우트가 상태를 `copy_ready` 로 되돌린다(`cards/[index]/route.ts:58`).
 */
export function isMade(project: AfterProject): boolean {
  return (project.data.flow?.cards ?? []).some((card) => 그림있는상태.has(card.status) || Boolean(card.assetPath));
}

export function cardAt(project: AfterProject, index: number): AfterCard | undefined {
  return (project.data.flow?.cards ?? []).find((card) => card.index === index);
}

export function archiveTitle(title: string, index: number): string {
  return `${title.trim() || "카드뉴스"} · ${index}번 장 이전 그림`;
}

export function cardEditPrompt(project: AfterProject, index: number, words: string): string {
  const card = cardAt(project, index);
  const 언어 = CARD_LANGUAGE_LABEL[project.language as (typeof CARD_LANGUAGES)[number]] ?? "한국어";
  return [
    `카드뉴스 ${index}번 장의 글을 사용자의 말대로 고칩니다.`,
    "",
    "지금 글:",
    `- headline: ${card?.copy.headline ?? ""}`,
    `- body: ${card?.copy.body ?? ""}`,
    `- accent: ${card?.copy.accent ?? ""}`,
    `- footnote: ${card?.copy.footnote ?? ""}`,
    "",
    `사용자의 말: ${words}`,
    "",
    "규칙:",
    "- 말이 가리키는 칸만 고칩니다. 안 고칠 칸은 빈 글로 둡니다.",
    "- 지금 글에 없는 사실 · 숫자 · 기관 이름을 새로 넣지 않습니다.",
    `- ${언어}로 씁니다.`,
  ].join("\n");
}

const 칸상한 = { headline: 80, body: 400, accent: 120, footnote: 160 } as const;

export function readCardEdit(raw: unknown): CopyPatch | undefined {
  const value = (raw ?? {}) as Record<string, unknown>;
  const patch = Object.fromEntries(
    (Object.keys(칸상한) as Array<keyof typeof 칸상한>).flatMap((key) => {
      const text = typeof value[key] === "string" ? (value[key] as string).trim() : "";
      return text ? [[key, text.slice(0, 칸상한[key])]] : [];
    }),
  ) as CopyPatch;
  return Object.keys(patch).length ? patch : undefined;
}

export function downloadList(view: Pick<EasyCardnewsView, "cards">): Array<{ index: number; url: string }> {
  return view.cards.flatMap((card) => (card.url ? [{ index: card.index, url: card.url }] : []));
}

export function captionText(caption: Caption): string {
  const 태그 = caption.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
  return [caption.hook, caption.body, 태그, caption.firstComment ? `첫 댓글: ${caption.firstComment}` : ""]
    .filter(Boolean).join("\n\n");
}
```

`cardnews-view.ts`: `CardnewsProjectLike.data.flow` 에 `caption?: Caption`, 카드에 `assetPath?: string` 을 더하고, `EasyCardView` 에 `hasImage: boolean`, `EasyCardnewsView` 에 `made: boolean` · `caption?: Caption`. `cardnewsView` 에서 `hasImage: Boolean(card.assetUrl || card.assetPath)`, `made: isMade(project as never)`, `...(flow?.caption ? { caption: flow.caption } : {})`. (`Caption` 은 `cardnews-after.ts` 에서 `import type`.)

- [ ] **Step 4:** 같은 명령 → PASS. 앞 시험의 `보기()` 고정값(cardnews-state.test.ts)은 `as never` 라 그대로 통과해야 한다
- [ ] **Step 5:** 커밋 `feat(easy): 만든 카드뉴스 손보기의 판단을 값으로 둔다`

---

### Task 2: 말 판단 — 갈래 넷 · 번호 · 실측

**Files:** Modify `app/easy/chat.ts`, `lib/easy/chat-provider.ts`, `scripts/easy-measure/cases.mts`, `scripts/easy-measure/run.mts` · Test `app/easy/__tests__/chat.test.ts`

**Interfaces — Produces:**
- `EasyDecision.wants` 에 `"card_redo" | "card_text" | "caption" | "download"`, `EasyDecision.card?: number`, `EasyDecision.note?: string`
- `easyChatPrompt(history, prompt, attachmentCount = 0, hasDraft = false, made = false)`
- `readEasyDecision(raw, { canRevise?, made? })`
- 제공자: `decide` 틀에 `card`(integer) · `note`(string), `editCard(prompt)`(새 틀 `EASY_CARD_EDIT_SPEC`)

- [ ] **Step 1: 실패하는 시험** — `chat.test.ts` 끝에

```ts
describe("만든 카드뉴스 손보기 (3단계 §5)", () => {
  const 결정 = (over: Record<string, unknown>) => ({ wants: "talk", reply: "", ratio: "", look: "", card: 0, note: "", ...over });

  it("장 번호와 말을 읽는다", () => {
    expect(readEasyDecision(결정({ wants: "card_redo", card: 3, note: "글자 크게" }), { canRevise: true, made: true }))
      .toMatchObject({ wants: "card_redo", card: 3, note: "글자 크게" });
    expect(readEasyDecision(결정({ wants: "card_text", card: 0 }), { canRevise: true }).card).toBeUndefined();
  });

  it("원고가 없으면 장 고치기를 말로 받는다", () => {
    expect(readEasyDecision(결정({ wants: "card_text", card: 2 })).wants).toBe("talk");
  });

  /** Review Focus 4 */
  it("만든 카드가 없으면 다시 그리기 · 게시글 · 받기는 먼저 만들라고 답한다", () => {
    for (const wants of ["card_redo", "caption", "download"]) {
      expect(readEasyDecision(결정({ wants, card: 1 }), { canRevise: true, made: false }))
        .toMatchObject({ wants: "talk", reply: NOT_MADE_YET });
    }
  });

  it("원고가 있을 때만 장 고치기를, 만든 뒤에만 다시 그리기 · 게시글 · 받기를 알려 준다", () => {
    expect(easyChatPrompt([], "3번 더 짧게", 0, true)).toContain("card_text");
    expect(easyChatPrompt([], "3번 더 짧게", 0, true)).not.toContain("card_redo");
    expect(easyChatPrompt([], "3번 다시", 0, true, true)).toContain("card_redo");
    expect(easyChatPrompt([], "안녕")).not.toContain("card_text");
  });
});
```

(`NOT_MADE_YET` 은 `../cardnews-after` 에서 들여온다.)

- [ ] **Step 2:** `vitest run app/easy/__tests__/chat.test.ts` → FAIL
- [ ] **Step 3: 구현**
  - `chat.ts`: `EasyDecision` 에 갈래 넷과 `card?` · `note?`. `아는갈래` 에 넷. `easyChatPrompt` 다섯째 인자 `made = false`. 목록의 `revise` 줄 다음에 `hasDraft` 일 때:
    ```
    "  card_text  이 대화 카드뉴스의 **한 장 글**을 고쳐 달라는 것입니다. 「3번 제목을 ○○로」 · 「2번 더 짧게」.",
    "             장 번호를 card 에, 고칠 내용을 note 에 적습니다. **번호 없이** 전체를 고치면 revise 입니다.",
    ```
    `made` 일 때 이어서:
    ```
    "  card_redo  만든 카드 중 **한 장을 다시 그려** 달라는 것입니다. 「3번 다시 그려줘」 · 「5번 글자 크게 다시」.",
    "             장 번호를 card 에, 바라는 점을 note 에 적습니다.",
    "  caption    인스타에 올릴 **게시글**을 써 달라는 것입니다. 「올릴 글 써줘」 · 「해시태그 붙여줘」.",
    "  download   만든 카드를 **내려받겠다**는 것입니다. 「다 받을게」 · 「저장할래」.",
    ```
    `reply` 빈 글 규칙 줄에 새 갈래를 더하고, 「장 번호가 없으면 card 는 0」 한 줄.
  - `readEasyDecision(raw, options: { canRevise?: boolean; made?: boolean } = {})` — 갈래를 이렇게 거른다:
    ```ts
    const 만든뒤갈래 = new Set(["card_redo", "caption", "download"]);
    let wants = said as EasyDecision["wants"];
    let reply = typeof value?.reply === "string" ? value.reply.trim() : "";
    if ((said === "revise" || said === "card_text") && !options.canRevise) wants = "talk"; // 고칠 원고가 없다
    else if (만든뒤갈래.has(said) && !options.canRevise) wants = "talk";                 // 카드뉴스가 아예 없다
    else if (만든뒤갈래.has(said) && !options.made) { wants = "talk"; reply = NOT_MADE_YET; } // 원고만 있다
    const card = Number.isInteger(value?.card) && (value!.card as number) > 0 ? value!.card as number : undefined;
    const note = typeof value?.note === "string" && value.note.trim() ? value.note.trim().slice(0, 500) : undefined;
    return { wants, reply, ...(card ? { card } : {}), ...(note ? { note } : {}), ...비율 · 결(지금 그대로) };
    ```
  - `chat-provider.ts`: `EASY_CHAT_SPEC.properties` 에 `card: { type: "integer" }`, `note: { type: "string" }`, `required` 에 둘 다. wants enum 에 넷. 새 틀:
    ```ts
    const EASY_CARD_EDIT_SPEC: StructuredSpec = {
      name: "easy_card_edit",
      description: "카드뉴스 한 장의 글을 사용자의 말대로 고친다. 안 고칠 칸은 빈 글.",
      schema: {
        type: "object",
        properties: { headline: { type: "string" }, body: { type: "string" }, accent: { type: "string" }, footnote: { type: "string" } },
        required: ["headline", "body", "accent", "footnote"],
      },
    };
    ```
    두 업체 갈래 모두 반환에 `editCard: 부른다(EASY_CARD_EDIT_SPEC)`.
- [ ] **Step 4:** 시험 → PASS. 1 · 2단계 `chat.test.ts` 전부 초록
- [ ] **Step 5: 실측** — `cases.mts` 의 `B1Want` 에 넷, `B1Case` 에 `made?: boolean`. 사례(원고 있음 + 만든 뒤):
  ```ts
  { prompt: "3번 다시 그려줘, 글자 크게", attachments: 0, hasDraft: true, made: true, expect: "card_redo" },
  { prompt: "5번 장 다시 만들어줘", attachments: 0, hasDraft: true, made: true, expect: "card_redo" },
  { prompt: "3번 제목을 '뒷면을 보세요'로 바꿔줘", attachments: 0, hasDraft: true, made: true, expect: "card_text" },
  { prompt: "2번 더 짧게", attachments: 0, hasDraft: true, expect: "card_text" },
  { prompt: "더 짧게 써줘", attachments: 0, hasDraft: true, made: true, expect: "revise" },
  { prompt: "인스타에 올릴 글 써줘", attachments: 0, hasDraft: true, made: true, expect: "caption" },
  { prompt: "다 받을게", attachments: 0, hasDraft: true, made: true, expect: "download" },
  { prompt: "3번 장은 왜 이렇게 나왔어?", attachments: 0, hasDraft: true, made: true, expect: "talk" },
  { prompt: "강아지 포스터 한 장 만들어줘", attachments: 0, hasDraft: true, made: true, expect: "image" },
  ```
  `run.mts`: `easyChatPrompt(..., Boolean(one.hasDraft), Boolean(one.made))`, `readEasyDecision(r.value, { canRevise: Boolean(one.hasDraft), made: Boolean(one.made) })`, 표에 `card` 열. 치명 규칙에 「`card_redo` 가 아닌데 `card_redo`」 · 「번호를 말했는데 `card` 가 다름」을 더한다. `OUT=2026-10-01-after.md RUNS=3` 로 돌린다. Expected: 치명 0. 어긋나면 문구를 고치고 다시(문구 수정은 `hasDraft`/`made` 블록 안에서만 — 2단계 교훈)
- [ ] **Step 6:** 커밋 `feat(easy): 만든 카드뉴스 손보기 말을 가른다` (실측 문서 포함)

---

### Task 3: 서버 일 — 한 장 글 고치기 · 게시글

**Files:** Create `lib/easy/cardnews-after-steps.ts` · Test `lib/easy/__tests__/cardnews-after-steps.test.ts`

**Interfaces — Produces:**
- `editCard(request: Request, project: AfterProject & { id: string }, index: number, change: { copy?: CopyPatch; words?: string }, writeEdit?: (prompt: string) => Promise<unknown>): Promise<{ project: CardnewsProjectLike; needsRedraw: boolean }>`
- `captionCard(request: Request, projectId: string): Promise<CardnewsProjectLike>`
- 둘 다 실패는 `EasyStepError`(relay 의 `read`)로 던진다

- [ ] **Step 1: 실패하는 시험** — 가짜: `cards/[index]/route` 의 `PATCH`(본문 기록, `원고` 돌려줌), `caption/route` 의 `POST`

```ts
describe("한 장 글 고치기 (3단계 §6-2)", () => {
  it("칸으로 온 글은 그대로 저장한다", async () => {
    const got = await editCard(요청(), 만든작업(), 2, { copy: { headline: "새 제목" } });
    expect(고친것).toEqual([{ index: "2", body: { headline: "새 제목" } }]);
    expect(got.needsRedraw).toBe(true);
  });

  it("말로 오면 고른 글 모델이 고치고, 빈 칸은 안 보낸다", async () => {
    await editCard(요청(), 만든작업(), 2, { words: "더 짧게" }, async () => ({ headline: "", body: "짧게", accent: "", footnote: "" }));
    expect(고친것[0]!.body).toEqual({ body: "짧게" });
  });

  it("그림이 없는 장(원고 단계)은 다시 그릴 필요가 없다", async () => {
    expect((await editCard(요청(), 원고작업(), 1, { copy: { body: "x" } })).needsRedraw).toBe(false);
  });

  it("고칠 것이 없으면 멈춘다", async () => {
    await expect(editCard(요청(), 만든작업(), 2, { words: "더 짧게" }, async () => ({ headline: "", body: "", accent: "", footnote: "" })))
      .rejects.toThrow("고칠 글");
    expect(고친것).toEqual([]);
  });
});

describe("게시글 (3단계 §6-4)", () => {
  it("카드뉴스 게시글 라우트를 부르고 작업을 돌려준다", async () => {
    expect((await captionCard(요청(), "c1")).id).toBe("c1");
    expect(부른게시글).toEqual(["c1"]);
  });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현**

```ts
import { PATCH as patchCardCopy } from "../../app/api/sns/projects/[id]/cards/[index]/route";
import { POST as writeCaption } from "../../app/api/sns/projects/[id]/caption/route";
import { cardAt, cardEditPrompt, readCardEdit, type AfterProject, type CopyPatch } from "../../app/easy/cardnews-after";
import type { CardnewsProjectLike } from "../../app/easy/cardnews-view";
import { EasyStepError, read, relay } from "./relay";

export async function editCard(request, project, index, change, writeEdit?) {
  const card = cardAt(project, index);
  if (!card) throw new EasyStepError("글 고치기", "그 번호의 장이 없습니다.", 400);
  const patch = change.copy ? readCardEdit(change.copy)
    : change.words && writeEdit ? readCardEdit(await writeEdit(cardEditPrompt(project, index, change.words)))
      : undefined;
  if (!patch) throw new EasyStepError("글 고치기", "고칠 글을 찾지 못했습니다. 어떻게 바꿀지 조금 더 적어 주세요.", 400);
  const saved = await read(
    await patchCardCopy(relay(request, `/api/sns/projects/${project.id}/cards/${index}`, patch, `card-edit-${index}`),
      { params: Promise.resolve({ id: project.id, index: String(index) }) }),
    "글 고치기",
  );
  return { project: saved.project as CardnewsProjectLike, needsRedraw: Boolean(card.assetPath || card.assetUrl) };
}

export async function captionCard(request: Request, projectId: string) {
  const saved = await read(
    await writeCaption(relay(request, `/api/sns/projects/${projectId}/caption`, {}, "caption"), { params: Promise.resolve({ id: projectId }) }),
    "게시글",
  );
  return saved.project as CardnewsProjectLike;
}
```

- [ ] **Step 4:** PASS
- [ ] **Step 5:** 커밋 `feat(easy): 한 장 글 고치기와 게시글을 카드뉴스 라우트로 한다`

---

### Task 4: 서버 일 — 앞 그림 보관 · 한 장 다시 만들기

**Files:** Modify `lib/easy/cardnews-after-steps.ts` · Test 같은 시험 파일

**Interfaces — Produces:**
- `archiveCard(userId: string, project: AfterProject & { id: string; title?: string }, index: number, deps?: ArchiveDeps): Promise<{ id: string; title: string } | null>` — 그림 없으면 `null`
- `redoCard(request: Request, userId: string, project, index: number, note?: string, deps?: ArchiveDeps): Promise<{ project: CardnewsProjectLike; archived: { id: string; title: string } | null }>`
- `ArchiveDeps = { readFile(path: string): Promise<{ bytes: Uint8Array; mimeType: string }>; save(input: { userId; id; title; purpose: "cardnews"; bytes; mimeType }): Promise<unknown>; newId(): string }` — 기본값은 아래 `기본보관`

- [ ] **Step 1: 실패하는 시험**

```ts
describe("한 장 다시 만들기 (3단계 §6-3)", () => {
  const 보관 = () => {
    const 넣은것: unknown[] = [];
    return {
      넣은것,
      deps: {
        readFile: async (path: string) => ({ bytes: new Uint8Array([1, 2]), mimeType: path.endsWith(".png") ? "image/png" : "image/jpeg" }),
        save: async (input: unknown) => { 넣은것.push(input); return {}; },
        newId: () => "00000000-0000-4000-8000-000000000099",
      },
    };
  };

  it("앞 그림을 참고 이미지로 보관한 뒤 그 장만 다시 만든다", async () => {
    const { 넣은것, deps } = 보관();
    const got = await redoCard(요청(), "me", 만든작업(), 2, "글자 크게", deps);
    expect(넣은것).toEqual([expect.objectContaining({
      userId: "me", purpose: "cardnews", title: "거북목 · 2번 장 이전 그림", mimeType: "image/png",
    })]);
    expect(다시만든것).toEqual([{ index: "2", body: { note: "글자 크게" } }]);
    expect(got.archived?.title).toBe("거북목 · 2번 장 이전 그림");
  });

  /** Review Focus 2 */
  it("보관이 실패하면 다시 만들지 않는다", async () => {
    const { deps } = 보관();
    await expect(redoCard(요청(), "me", 만든작업(), 2, undefined, { ...deps, save: async () => { throw new Error("디스크"); } }))
      .rejects.toThrow("보관하지 못해");
    expect(다시만든것).toEqual([]);
  });

  it("그림이 없던 장(실패한 장)은 보관 없이 다시 만든다", async () => {
    const { 넣은것, deps } = 보관();
    const got = await redoCard(요청(), "me", 만든작업(), 3, undefined, deps);
    expect(넣은것).toEqual([]);
    expect(got.archived).toBeNull();
    expect(다시만든것).toEqual([{ index: "3", body: {} }]);
  });

  it("없는 번호는 멈춘다", async () => {
    await expect(redoCard(요청(), "me", 만든작업(), 9, undefined, 보관().deps)).rejects.toThrow("없습니다");
  });
});
```

(`만든작업()`: 1번 `done`+`assetPath "me/sns/c1/1.png"`, 2번 `done`+`assetPath "me/sns/c1/2.png"`, 3번 `failed`(그림 없음), 제목 「거북목」. `다시만든것` 은 `cards/[index]/route` 의 `POST` 가짜가 기록.)

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현**

```ts
import { randomUUID } from "node:crypto";
import { POST as redoCardRoute } from "../../app/api/sns/projects/[id]/cards/[index]/route";
import { saveReferenceImage } from "../reference-images";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled, localStoreRoot, readLocalSnsResultFile } from "../local-store";
import { archiveTitle } from "../../app/easy/cardnews-after";

/** 카드뉴스 그림 창고 이름(`lib/sns/runtime.ts` 의 `BUCKET` 과 같다). */
const 그림창고 = "library";
const 형식 = (path: string) => (/\.jpe?g$/i.test(path) ? "image/jpeg" : /\.webp$/i.test(path) ? "image/webp" : "image/png");

const 기본보관: ArchiveDeps = {
  async readFile(path) {
    if (isLocalStoreEnabled()) return { bytes: new Uint8Array(await readLocalSnsResultFile(localStoreRoot(), path)), mimeType: 형식(path) };
    const { data, error } = await createSupabaseAdminClient().storage.from(그림창고).download(path);
    if (error || !data) throw new Error(error?.message ?? "그림을 읽지 못했습니다.");
    return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: 형식(path) };
  },
  save: (input) => saveReferenceImage(input),
  newId: () => randomUUID(),
};

export async function archiveCard(userId, project, index, deps = 기본보관) {
  const card = cardAt(project, index);
  if (!card?.assetPath) return null;
  const file = await deps.readFile(card.assetPath);
  const title = archiveTitle(project.title ?? "", index);
  const id = deps.newId();
  await deps.save({ userId, id, title, purpose: "cardnews", bytes: file.bytes, mimeType: file.mimeType });
  return { id, title };
}

export async function redoCard(request, userId, project, index, note?, deps = 기본보관) {
  if (!cardAt(project, index)) throw new EasyStepError("다시 만들기", "그 번호의 장이 없습니다.", 400);
  let archived: { id: string; title: string } | null;
  try {
    archived = await archiveCard(userId, project, index, deps);
  } catch (error) {
    // **보관이 실패하면 다시 만들지 않는다**(설계 §6-3). 앞 그림을 잃지 않는다. 값도 안 나간다.
    console.error(`[easy] 앞 그림 보관 실패 project=${project.id} card=${index}`, error);
    throw new EasyStepError("다시 만들기", "앞 그림을 보관하지 못해 다시 만들지 않았습니다. 잠시 뒤 다시 해 주세요.", 409);
  }
  const saved = await read(
    await redoCardRoute(relay(request, `/api/sns/projects/${project.id}/cards/${index}`, note ? { note: note.slice(0, 500) } : {}, `card-redo-${index}`),
      { params: Promise.resolve({ id: project.id, index: String(index) }) }),
    "다시 만들기",
  );
  return { project: saved.project as CardnewsProjectLike, archived };
}
```

(`readLocalSnsResultFile` · `isLocalStoreEnabled` · `localStoreRoot` 는 `lib/local-store/index.ts` 에서 export 된 것을 그대로 들여온다 — 실행 전 경로를 `grep` 로 확인.)

- [ ] **Step 4:** PASS. `billable-key-wiring` 시험이 새 도우미 파일을 지나 `/api/easy/cardnews` 를 계속 「대신 부르는 주소」로 찾는지 확인
- [ ] **Step 5:** 커밋 `feat(easy): 한 장 다시 만들기 전 앞 그림을 라이브러리에 보관한다`

---

### Task 5: 「쉽게」 카드뉴스 라우트 — 막기 · 고치기 · 다시 만들기 · 게시글

**Files:** Modify `app/api/easy/cardnews/route.ts` · Test `app/api/easy/__tests__/cardnews-action-route.test.ts`

**Interfaces — Produces:** `POST /api/easy/cardnews` 본문 `action`:
- `generate` — 만든 작업이면 409 `{ message: "이미 만든 카드뉴스입니다. 장마다 「다시 만들기」를 써 주세요." }`
- `edit` `{ index, copy?, words? }` → `{ ok, project, needsRedraw, message }`(대화에 「N번 장 글을 고쳤습니다.」)
- `redo` `{ index, note? }` → `{ ok, project, message }`(대화에 「N번 장을 다시 만들고 있습니다. 앞 그림은 라이브러리에 「이름」으로 보관했습니다.」)
- `caption` → `{ ok, project }`

- [ ] **Step 1: 실패하는 시험** — 가짜 `lib/easy/cardnews-after-steps`(기록), 기존 가짜에 더해

```ts
describe("만든 카드뉴스 손보기 (3단계 §6)", () => {
  /** Review Focus 1 */
  it("만든 작업은 전체 만들기를 거절한다(글을 고쳐 상태가 원고로 돌아와도)", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: { ...원고(2), status: "copy_ready", data: { ...원고(2).data, flow: { ...원고(2).data.flow, cards: [
      { index: 1, role: "cover", copy: { headline: "a" }, status: "done", assetPath: "me/sns/c1/1.png" },
    ] } } } };
    const { status } = await 보낸다({ action: "generate", projectId: "c1" });
    expect(status).toBe(409);
    expect(시작한것).toEqual([]);
  });

  it("글 고치기는 그 장을 고치고 대화에 남긴다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: 원고(2) };
    const { json } = await 보낸다({ action: "edit", projectId: "c1", index: 2, copy: { headline: "새" } });
    expect(고친것).toEqual([{ index: 2, change: { copy: { headline: "새" } } }]);
    expect(남긴줄.map((row) => row.body)).toEqual(["2번 장 글을 고쳤습니다."]);
    expect(json.needsRedraw).toBeDefined();
  });

  it("다시 만들기는 보관 결과를 대화에 남긴다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: 원고(2) };
    await 보낸다({ action: "redo", projectId: "c1", index: 1, note: "글자 크게" });
    expect(다시만든것).toEqual([{ index: 1, note: "글자 크게" }]);
    expect(남긴줄[0]!.body).toContain("1번 장을 다시 만들고 있습니다");
    expect(남긴줄[0]!.body).toContain("이전 그림");
  });

  it("번호가 이상하면 400", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: 원고(2) };
    expect((await 보낸다({ action: "redo", projectId: "c1", index: "x" })).status).toBe(400);
    expect(다시만든것).toEqual([]);
  });

  it("게시글을 쓴다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: 원고(2) };
    expect((await 보낸다({ action: "caption", projectId: "c1" })).json.project).toBeDefined();
  });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `action` 허용 값에 셋 더하기. `generate` 분기 맨 앞에 `if (isMade(project)) return fail("이미 만든 카드뉴스입니다. 장마다 「다시 만들기」를 써 주세요.", 409);`. `index` 는 `Number.isInteger(input.index) && input.index > 0` 아니면 400. 셋은 `cardnews-after-steps` 를 부르고(`edit` 의 말 고치기는 `createEasyChatProvider(...).editCard`), 대화에 `assistant` 줄을 남긴다. 오류는 2단계 방식(402/403/409/400 은 그 말, 500 번대는 쉬운 말 — `고장났다` 의 문구에 `edit` · `redo` · `caption` 을 더한다)
- [ ] **Step 4:** PASS, 2단계 시험 전부 초록
- [ ] **Step 5:** 커밋 `feat(easy): 만든 카드뉴스를 한 장씩 고치고 다시 만들고 게시글을 쓴다`

---

### Task 6: 채팅 턴 — 네 갈래

**Files:** Create `lib/easy/cardnews-after-turn.ts` · Modify `app/api/easy/generate/route.ts` · Test `app/api/easy/__tests__/cardnews-route.test.ts`

**Interfaces — Produces:** `cardAfterTurn(ctx)` 응답
- `card_redo` → `{ ok, cardAsk: { rowId, index, note? } }` — **아무 라우트도 안 부르고 아무것도 안 남긴다**
- `card_text` → `{ ok, cardEdited: { rowId, project, index, needsRedraw }, message }`(사용자 말 + 「N번 장 글을 고쳤습니다.」)
- `caption` → `{ ok, caption: { rowId, project }, message }`
- `download` → `{ ok, download: { rowId } }`
- 번호 없음 · 없는 번호 → `{ ok, talked: true, message: { id: "", role: "assistant", body: ASK_CARD_NUMBER } }`(안 남긴다)

- [ ] **Step 1: 실패하는 시험** — `cardnews-route.test.ts` 에 가짜 `lib/easy/cardnews-after-steps` 를 더하고

```ts
describe("만든 카드뉴스 손보기 말 (3단계 §5 · §6-5)", () => {
  const 만든원고 = () => ({ ...원고작업, status: "ready", data: { ...원고작업.data, flow: { ...원고작업.data.flow, cards: [
    { index: 1, role: "cover", kind: "generated", copy: { headline: "a" }, status: "done", assetPath: "me-1/sns/c1/1.png" },
    { index: 2, role: "body", kind: "generated", copy: { headline: "b" }, status: "done", assetPath: "me-1/sns/c1/2.png" },
  ] } } });

  /** Review Focus 3 */
  it("「3번 다시」는 확인 줄만 돌려주고 아무것도 안 부르고 안 남긴다", async () => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "old" }];
    카드작업들 = { old: { ...만든원고(), id: "old" } };
    판단 = { wants: "card_redo", reply: "", ratio: "", look: "", card: 2, note: "글자 크게" };
    const { json } = await 보낸다({ prompt: "2번 다시 그려줘, 글자 크게" });
    expect(json.cardAsk).toEqual({ rowId: "r1", index: 2, note: "글자 크게" });
    expect(부른라우트).toEqual([]);
    expect(손본것).toEqual([]);
    expect(남긴줄).toEqual([]);
  });

  /** Review Focus 4 */
  it("없는 번호는 몇 번인지 되묻고 아무것도 안 남긴다", async () => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "old" }];
    카드작업들 = { old: { ...만든원고(), id: "old" } };
    판단 = { wants: "card_text", reply: "", ratio: "", look: "", card: 9, note: "짧게" };
    const { json } = await 보낸다({ prompt: "9번 더 짧게" });
    expect(json.message.body).toBe(ASK_CARD_NUMBER);
    expect(남긴줄).toEqual([]);
  });

  it("「2번 더 짧게」는 그 장만 고치고 말과 결과를 남긴다", async () => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "old" }];
    카드작업들 = { old: { ...만든원고(), id: "old" } };
    판단 = { wants: "card_text", reply: "", ratio: "", look: "", card: 2, note: "더 짧게" };
    const { json } = await 보낸다({ prompt: "2번 더 짧게" });
    expect(손본것).toEqual([{ what: "edit", index: 2, change: { words: "더 짧게" } }]);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(json.cardEdited.index).toBe(2);
  });

  it("게시글 · 받기", async () => {
    지난줄들 = [{ id: "r1", role: "image", body: "", workId: "old" }];
    카드작업들 = { old: { ...만든원고(), id: "old" } };
    판단 = { wants: "caption", reply: "", ratio: "", look: "", card: 0, note: "" };
    expect((await 보낸다({ prompt: "올릴 글 써줘" })).json.caption.rowId).toBe("r1");
    판단 = { wants: "download", reply: "", ratio: "", look: "", card: 0, note: "" };
    expect((await 보낸다({ prompt: "다 받을게" })).json.download).toEqual({ rowId: "r1" });
  });
});
```

(가짜 판단(`decide`)이 `card` · `note` 를 돌려줘도 1 · 2단계 시험은 그대로 통과해야 한다.)

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현**
  - `generate/route.ts`: ⓑ1 호출에 `made = Boolean(고칠원고 && isMade(고칠원고))` 를 넘기고(`easyChatPrompt` 다섯째 · `readEasyDecision` 의 `made`), `either` 검사 다음 줄에
    ```ts
    if (wants === "card_redo" || wants === "card_text" || wants === "caption" || wants === "download") {
      return await cardAfterTurn({ request, userId: auth.member.userId, store, conversationId, prompt, textModel, wants, decision, provider, project: 고칠원고!, rows: 지난줄 });
    }
    ```
  - `cardAfterTurn`: 대상 줄 `rowId` = `rows` 를 뒤에서 본 `role === "image" && workId === project.id` 인 줄. 번호 검사(`card_redo` · `card_text`) → `cardAt` 없으면 되묻기. 나머지는 위 Produces 대로 `cardnews-after-steps` 를 부른다
- [ ] **Step 4:** PASS, 라우트 파일 800줄 이하
- [ ] **Step 5:** 커밋 `feat(easy): 채팅에서 만든 카드뉴스를 말로 손본다`

---

### Task 7: 화면 상태 — 훅

**Files:** Modify `app/easy/use-cardnews.ts`, `app/easy/cardnews-state.ts` · Test `app/easy/__tests__/cardnews-state.test.ts`, `shell-wiring.test.ts`

**Interfaces — Produces:**
- 상태 `CardTool = { rowId: string; index: number; mode: "edit" | "redo"; note?: string } | null`
- 순수: `openTool(current: CardTool, next: CardTool): CardTool`(같은 장 · 같은 모드면 닫는다), `redoCostLabel(view, index, policy)`
- 훅 반환에 `tool`, `setTool`, `editCard(rowId, index, change)`, `redoCard(rowId, index, note?)`, `writeCaption(rowId)`, `downloadAll(rowId)`; `rowProps` 에 같은 것들을 실어 준다; `take` 가 `cardAsk` · `cardEdited` · `caption` · `download` 를 받는다

- [ ] **Step 1: 실패하는 시험** — `cardnews-state.test.ts`

```ts
describe("장 도구 (3단계 §4)", () => {
  it("같은 장 같은 도구를 다시 누르면 닫고, 다른 것을 누르면 바꾼다", () => {
    const 고치기 = { rowId: "r", index: 2, mode: "edit" as const };
    expect(openTool(null, 고치기)).toEqual(고치기);
    expect(openTool(고치기, 고치기)).toBeNull();
    expect(openTool(고치기, { ...고치기, mode: "redo" })).toEqual({ ...고치기, mode: "redo" });
  });

  it("다시 만들기 값은 그 장 하나로 센다", () => {
    expect(redoCostLabel({ cards: [{ index: 1 }, { index: 2 }] } as never, 2, "image-v2")).toBe("약 1크레딧");
  });
});
```

`shell-wiring.test.ts`:

```ts
describe("만든 카드뉴스 손보기 잇기 (3단계)", () => {
  const 훅 = 코드("../use-cardnews.ts");
  it("손보기는 「쉽게」 카드뉴스 라우트로, 값이 드는 것은 식별자를 붙여 보낸다", () => {
    expect(훅).toMatch(/action: "redo"/);
    expect(훅).toMatch(/action: "edit"/);
    expect(훅).toMatch(/action: "caption"/);
  });
  it("받기는 jszip 과 카드뉴스 파일 이름 규칙을 쓴다", () => {
    expect(훅).toContain("snsCardFilename(");
    expect(훅).toContain("jszip");
  });
  it("말 「3번 다시」는 확인 줄을 연다", () => { expect(훅).toMatch(/cardAsk[\s\S]{0,200}mode: "redo"/); });
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현** — `cardnews-state.ts` 에 `openTool` 과 `redoCostLabel(view, index, policy)`. 값은 `cardCost({ policy, ratio: view.options.ratio, modelId: view.options.modelId, attachments: [], cards: [{ index }] }).label` 로 센다 — image-v2 면 「약 1크레딧」, cost-v1 이면 그 장 하나의 「약 N장」(카드뉴스 한 장 다시 만들기 라우트가 `onlyCardIndexes: [index]` 로 세는 것과 같은 단위). 훅은 `보낸다`(이미 있음, `billableFetch`)로 `edit` · `redo` · `caption` 을 보내고 응답 `project` 로 `replace`, `message` 를 `handlers.onMessage`. `redo` 뒤 `start(cardnewsJob(...))`(2단계 진행 표시가 이어 받는다). `downloadAll` 은 `downloadList(view)` → `fetch` → `jszip` → `snsCardFilename(title, index, ...)` → 내려받기(`a[download]`)
- [ ] **Step 4:** PASS · typecheck
- [ ] **Step 5:** 커밋 `feat(easy): 만든 카드뉴스 손보기 화면 상태`

---

### Task 8: 화면 부품 · 실제 화면

**Files:** Create `app/easy/_components/cardnews-card-row.tsx`, `cardnews-caption.tsx` · Modify `cardnews-card.tsx` · Test `shell-wiring.test.ts`

- [ ] **Step 1: 실패하는 시험** — `shell-wiring.test.ts`

```ts
describe("만든 카드뉴스 손보기 부품 (3단계 §4)", () => {
  const 카드 = 코드("../_components/cardnews-card.tsx");
  const 줄 = 코드("../_components/cardnews-card-row.tsx");
  it("만든 작업에는 「이대로 만들기」를 안 낸다(Review Focus 1)", () => {
    expect(카드).toMatch(/!view\.made[\s\S]{0,80}이대로 만들기/);
  });
  it("장마다 글 고치기 · 다시 만들기, 다시 만들기는 보관 · 값 안내와 확인 단추", () => {
    expect(줄).toContain("글 고치기");
    expect(줄).toContain("다시 만들기");
    expect(줄).toContain("앞 그림은 라이브러리에 보관합니다");
  });
  it("게시글 쓰기 · 전부 받기", () => {
    expect(카드).toContain("게시글 쓰기");
    expect(카드).toContain("전부 받기");
    expect(코드("../_components/cardnews-caption.tsx")).toContain("captionText(");
  });
});
```

- [ ] **Step 2:** FAIL
- [ ] **Step 3: 구현** — 설계 §4 의 그림대로. `cardnews-card-row.tsx`: 장 한 줄(번호 · 자리 · 제목 · 본문 · 강조 · 작은 글씨) + 단추 둘(만든 작업이면 [다시 만들기], 언제나 [글 고치기]) + `tool` 이 이 장이면 글 칸 넷(저장 · 그만두기) 또는 확인 줄(바라는 점 칸 · 「앞 그림은 라이브러리에 보관합니다 · {값}」 · [다시 만들기] [그만두기]). 글 저장 응답이 `needsRedraw` 면 같은 장 확인 줄을 연다. `cardnews-caption.tsx`: `captionText` 를 보여 주고 [복사](`navigator.clipboard.writeText`, 실패하면 「복사하지 못했습니다」). `cardnews-card.tsx`: 「이대로 만들기」 · 조건 줄은 `view.status === "copy_ready" && !view.made` 일 때만. 만든 작업이면 아래에 [게시글 쓰기] [전부 받기]. 파일마다 800줄 이하, 글자 상수에 em-dash 없음
- [ ] **Step 4:** PASS · typecheck · lint
- [ ] **Step 5: 실제 화면**(3100, 1 · 2단계 방식 — 사용자가 켜도 된다고 한 뒤). 남아 있는 다 만든 건강기능식품 대화(`533e156c-…`)로:
  1. 3번 [글 고치기] → 제목 고쳐 저장 → 「그림에도 반영할까요?」가 열리는지(**누르지 않는다**)
  2. 말 「2번 더 짧게」 → 그 장 글만 바뀌는지
  3. [게시글 쓰기] → 게시글 · 복사
  4. [전부 받기] → 압축 파일 8장
  5. 말 「3번 다시 그려줘」 → 확인 줄만 뜨는지(**누르지 않는다** — 값이 든다. fal 충전 뒤 사용자에게 묻고)
  6. 「이대로 만들기」가 안 보이는지(글을 고쳐 상태가 원고로 돌아왔어도)
- [ ] **Step 6:** 커밋 `feat(easy): 만든 카드뉴스 장마다 고치기 · 다시 만들기, 게시글 · 전부 받기`

---

### Task 9: 전체 검사 · 0줄 · 뮤테이션

- [ ] **Step 1:** `pnpm --filter @fixup/web typecheck` · `test` · `lint` → 0 · 0 · 0(이번 일과 무관한 실패는 이름과 까닭을 적는다)
- [ ] **Step 2:** Global Constraints 의 0줄 명령 → 빈 출력
- [ ] **Step 3: 뮤테이션**(고치고 → 시험 명령 빨강 확인 → 되돌림)

| # | 망가뜨릴 곳 | 잡아야 할 시험 |
|---|---|---|
| M1 | `isMade`: `assetPath` 검사 지우기 | 「그림이 한 장이라도 있으면」 |
| M2 | 라우트: 만든 작업 `generate` 거절 지우기 | 「만든 작업은 전체 만들기를 거절」 |
| M3 | `redoCard`: 보관 실패 `catch` 에서 계속 진행 | 「보관이 실패하면 다시 만들지 않는다」 |
| M4 | `cardAfterTurn`: `card_redo` 에서 `redoCard` 부르기 | 「확인 줄만 돌려주고」 |
| M5 | `readEasyDecision`: `made` 검사 지우기 | 「만든 카드가 없으면 … 먼저 만들라고」 |
| M6 | `readCardEdit`: 빈 칸도 보내기 | 「빈 칸은 안 바꾼 것」 · 「빈 칸은 안 보낸다」 |
| M7 | `archiveTitle`: 번호 빼기 | 「작업 제목 · 번호 · 이전 그림」 |
| M8 | `editCard`: `needsRedraw` 늘 거짓 | 「칸으로 온 글은 그대로 저장」 |
| M9 | 카드: `!view.made` 조건 지우기 | 「만든 작업에는 「이대로 만들기」를 안 낸다」 |
| M10 | `openTool`: 같은 것을 눌러도 안 닫기 | 「같은 장 같은 도구를 다시 누르면 닫고」 |

- [ ] **Step 4:** 결과를 `docs/easy-measure/2026-10-01-mutation.md` 에 표로, 커밋 `test(easy): 3단계 뮤테이션 검증`

---

### Task 10: 독립 리뷰 → 보고

- [ ] **Step 1:** `code-reviewer`(opus)에게 설계 · 이 계획 · `git diff $START..HEAD` · Review Focus · 장부 `Ruling:` 을 주고 본다. 특히: 값이 확인 없이 나가는 길 · 앞 그림을 잃는 길 · 남의 작업을 손보는 길 · 만든 작업이 전 장 값을 다시 내는 길 · 1 · 2단계 흐름이 깨지는 곳 · 0줄
- [ ] **Step 2:** 지적을 코드로 확인 → 맞는 것만 시험 먼저 고친다
- [ ] **Step 3:** Task 9 Step 1 · 2 다시
- [ ] **Step 4:** 사용자에게 쉬운 말로 보고 — 실측, 시험 수, 뮤테이션, 리뷰에서 고친 것, 0줄, 남은 한계, 「한 장 다시 만들기」 실제 확인은 fal 충전 뒤. **합치기 · 배포는 안 했다**
