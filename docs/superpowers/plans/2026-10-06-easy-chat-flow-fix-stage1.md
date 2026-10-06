# 「쉽게」 대화 끊김 · 엉뚱한 답 · 과정 보기 — 1차(A·B·C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「쉽게」 대화가 엉뚱한 고정 문장을 되풀이하지 않고(A), 물음 · 만들기 · 실패 · 새로고침에서 끊기지 않으며(B), 라이브러리 「과정 보기」가 쉽게 대화로 가게(C) 고친다.

**Architecture:** 판단 모델의 선택지를 `chat.ts` 의 한 함수(`easyAvailableWants`)가 정하고 프롬프트와 판단 틀이 둘 다 그것을 쓴다. 한 턴의 판단(빈 답 재질문 포함)은 새 `lib/easy/judge.ts` 가, 「광고 소재」 낱말은 코드(`app/easy/ad-ask.ts`)가 먼저 본다. 대화 표는 바꾸지 않고 줄 글(body)에 표시를 붙여(`ad-guide:` · `;job=`) 안내 줄을 알아보고, 다시 열 때 결과를 이어 받는다. 화면 쪽 새 로직은 작은 파일 · 훅으로 빼서 `easy-client.tsx` 는 부르기만 한다.

**Tech Stack:** Next.js 15 App Router · React 18 · TypeScript · vitest 4(+ react-test-renderer, jsdom 없음) · Anthropic/OpenAI 구조화 응답(`lib/llm/structured.ts`) · pnpm 9 워크스페이스

**Spec:** `docs/superpowers/specs/2026-10-06-easy-chat-flow-fix-design.md` (이 계획은 §2 의 A1~A5 · B1~B5 · C 만 다룬다. D1~D3 은 2차)

## Global Constraints

- **처음 만들기 경로 0줄 변경:** `apps/web/app/api/poster/**`, `apps/web/app/api/sns/**`, `packages/**`, `apps/web/app/poster/**`, `apps/web/app/sns/**` 는 한 줄도 바꾸지 않는다. 마지막 Task 에서 `git diff --stat 7585059a -- <그 경로들>` 이 비어 있어야 한다
- **DB 스키마 변경 없음.** `easy_messages` 의 칸(`id,conversation_id,role,body,work_id,created_at`)만 쓴다. 표시는 `body` 에 붙인다(`row-image.ts` 의 `edit-request:` 와 같은 방식)
- **갈래 선택지는 한 함수:** `chat.ts` 의 `easyAvailableWants(choices)` 가 쓸 수 있는 `wants` 목록을 정하고, 프롬프트 안내(`easyChatPrompt`)와 판단 틀 enum(`easyChatSpec(wants)`, 부를 때마다 만든다)이 둘 다 그것에서 나온다
- **새 갈래는 `ad_specs` 하나.** 광고 물음은 갈래가 아니라 코드가 낱말로 정한다: 이번 말에 「광고 소재」·「광고소재」가 있고 규격 낱말(`규격별`, `사이즈별`, `리사이징`, `리사이즈`, `베리에이션`, `네이버`, `구글`, `카카오`)이 없으면 묻는다. 규격 낱말이 있으면 묻지 않고 바로 안내. 「광고 소재 **말고**/빼고/없이/아니」처럼 부정하면 코드는 묻지 않고, 그 턴의 선택지에서 `ad_specs` 를 뺀 채 판단 모델에 맡긴다
- **묻는 말(고정, 사용자 지정):** 「광고 이미지를 만들고 싶으세요, 아니면 네이버·구글·카카오 규격별로 이미지를 베리에이션하고 싶으세요?」 · 단추 「광고 이미지 만들기」 / 「규격별로 베리에이션」 · 안내 줄 단추 「광고소재 열기」(`/ad`)
- **물음 줄 · 안내 줄 모두 도우미 줄로 저장한다.** 물음 줄은 글이 위 문장과 똑같은 줄, 안내 줄은 글이 `ad-guide:` 로 시작하는 줄(보일 때 · 모델에 보낼 때 표시를 뗀다)
- **광고 물음 뒤 이미지 지시 = 물음 앞의 사용자 말 + 답.** 단추만 눌렀으면 물음 앞의 말 그대로. **잇는 것은 답일 때만** — 「광고 이미지 만들기」 단추를 눌렀거나 판단 모델이 이 말을 물음의 답이라고 표시했을 때(`note` = `answer`). 아니면 이번 말 그대로
- **물음 바로 뒤에는 다시 묻지 않는다.** 물음 뒤의 말은 단추 글이면 코드가 정하고, 규격 낱말이 있으면 `specs`, 아니면 판단 모델에 맡긴다(`ask` 를 다시 내지 않는다)
- **대화는 모드로 붙잡지 않는다.** 다음 말은 늘 처음부터 판단한다
- **단추로 고른 갈래(`input.kind` = image|cardnews 이고 `input.kindPicked === true`)는 판단 결과와 상관없이 이긴다**(A2). 말로 답한 턴에 이어 온 갈래(`kindPicked` 없음)는 예전처럼 판단이 image · cardnews · either 일 때만 이긴다. 골랐으면 A3 재질문 · 규격 안내 쓰기를 하지 않는다(판단 갈래가 버려지므로)
- **`talk` 인데 답이 비면 한 번 더 묻고, 그래도 비면 그때만 기본 문장**(A3)
- **화면 · 모델의 말은 「그림」이 아니라 「이미지」**(chat.ts 의 규칙 그대로)
- **크기:** 새 함수 < 50줄, 새 파일 < 400줄. `easy-client.tsx`(지금 806줄)는 새 로직을 새 파일로 빼고 순증가 없이 끝낸다(마지막 Task 에서 줄 수를 적는다). `works-tab.tsx`(796줄)는 800줄을 넘기지 않는다
- **불변:** 상태는 새 객체로 바꾼다(`{ ...current, [id]: value }`)
- **공급자 SDK 를 새 파일에서 import 하지 않는다**(`apps/web/lib/__tests__/ai-cost-call-sites.test.ts` 가 막는다). 새 글 모델 호출은 `chat-provider.ts` 의 틀(`StructuredSpec`) 하나로 더한다
- **`generate/route.ts` 안에 `role: "user"` 글자 · `relay(` 호출을 새로 쓰지 않는다**(`generate-wiring.test.ts` 가 순서와 단계 수 4 를 잰다). 새 저장 로직은 `lib/easy/*.ts` 에 둔다
- **커밋:** 제목 `fix(easy): <한국어>`(라이브러리는 `fix(library):`), 둘째 `-m` 로 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. heredoc 쓰지 않는다. **푸시하지 않는다**
- **시험 명령:** 저장소 뿌리(`C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow`)에서 `pnpm --filter @fixup/web exec vitest run <apps/web 기준 경로>`
- **브라우저 도구는 한 메시지에 하나씩**, 다른 도구와 섞지 않는다
- **키 · 비밀은 출력하지 않는다.** 실제 모델 확인 스크립트는 키를 파일 안에서 읽는다

## Review Focus

1. **지난 광고 물음 줄의 단추** — 물음 뒤에 다른 말이 이어졌거나 보내는 중이면 단추가 없어야 한다(눌러서 엉뚱한 지시로 값이 나가지 않게). → Task 8 의 시험
2. **빈 답 재질문은 `talk` 일 때만** — `detail_page` · `image` 처럼 원래 답이 빈 갈래에서 다시 물으면 턴마다 값이 두 번 나간다. → Task 2 의 시험
3. **`;job=` 표시와 다른 표시가 섞일 때** — 주소(endpoint)에 쉼표 · 쌍반점 · `;added=` 같은 글자가 있어도 고친 줄 표시 · 넣은 사진 · 받을 정보가 서로 안 섞여야 한다. → Task 5 의 시험
4. **대화를 지운 쉽게 작업 · 남의 작업 · 관리자 전체 보기** — 「과정 보기」가 열 수 없는 `/easy/…` 로 가지 않고 지금처럼 도구 화면으로 가야 한다. → Task 9 의 시험
5. **새로 친 말에 옛 비율이 몰래 붙는 것** — 앞 주문에서 고른 비율 · 그림체는 같은 말에 이어 답할 때만 실린다. → Task 7 의 시험
6. **끝난 요청을 다시 묻는 것** — 다시 열 때 이어 받는 줄은 요청 줄의 `costUsd` 가 빈 것뿐이어야 한다. 끝난 요청을 `status` 에 다시 물으면 그림이 두 벌 저장되고 정산이 또 돈다. → Task 6 의 「끝났는데 그림이 없는 줄은 이어 받지 않는다」 · `pending-requests.test.ts`

## 범위 밖 · 알려 둘 것 (최종 리뷰 2026-10-06)

- **범위 밖 — 광고 물음 뒤 「카드뉴스로」 답하면 처음 말을 잃는다.** 광고 물음 뒤 말로 「카드뉴스로 만들어줘요」라고 답하면 카드뉴스 원고 턴(`cardnewsTurn`)은 이번 말만 보고 물음 앞의 처음 말(「겨울 화장품 광고 소재 만들어줘」)을 잇지 않는다. 이미지 길만 처음 말을 잇는다(Task 4 의 `지시`). 1차에서는 고치지 않는다 — 물음과 답을 대화 맥락 위에서 판단하는 **2차 D1** 이 다룬다(설계 §3)
- **알고 둔 것 — 「광고 소재」 낱말이 든 질문도 먼저 묻는다.** 「광고 소재도 크레딧 들어?」처럼 묻기만 하는 말도 낱말이 있고 규격 낱말이 없으면 코드가 광고 물음을 띄운다. 사용자가 정한 규칙(「광고 소재」라는 말이 나오면 먼저 묻는다, 2026-10-06 결정 두 번) 그대로다. 물음 뒤에 말로 다시 물으면 판단 모델이 talk 로 답하고 대화는 이어진다 — 바꾸지 않는다
- **알고 둔 것 — B3 는 로컬 개발 서버에서 확인할 수 없다.** StrictMode 가 효과를 한 번 껐다 켜며 `alive` ref 를 `false` 로 남겨 이어 받기가 바로 멈춘다(설계 §3 의 「개발 서버 전용 문제」). Task 10 은 로컬 결과로 B3 를 말하지 않고, 배포 뒤 사용자 손 확인(만드는 중 새로고침)으로 본다
- **확인한 것 — 포스터 그림 한 장만 지우는 길은 없다.** 지우기는 작업째(`DELETE /api/poster/projects/[id]`)뿐이고, 그러면 `markDeletedWork` 가 그 줄을 안내 줄로 바꾼다. 다시 열기 이어 받기(Task 6)가 「끝났는데 그림 없는 줄」을 만나는 것은 0장 · 거절 쪽이다 — 그래도 `costUsd` 기준이 막는다

---

## 파일 지도

| 파일 | 할 일 | Task |
|---|---|---|
| `apps/web/app/easy/chat.ts` | `EasyWant` · `EasyChoices` · `easyAvailableWants` · `EasyPromptOptions`, 프롬프트 갈래 안내를 목록에서, `ad_specs` | 1 · 2 · 3 |
| `apps/web/app/easy/chat-facts.ts` (새) | 하는 일 · 안 하는 일(받은 갈래만 이름을 적는다), 사진 첫 만들기, 광고 갈래 · 물음 뒤 안내 줄(답이면 `note` = `answer`) | 1 · 3 |
| `apps/web/lib/easy/chat-provider.ts` | `easyChatSpec(wants)`, `decide(prompt, wants)`, `writeAdGuide` | 1 · 3 |
| `apps/web/lib/easy/judge.ts` (새) | 한 턴의 판단(A1 선택지 · A3 재질문 · A5 코드 갈래, 골랐으면 재질문 없음) | 2 · 4 |
| `apps/web/app/easy/ad-ask.ts` (새) | 광고 물음 문장 · 단추 글 · 낱말 찾기(물음 뒤 재질문 없음) · 지시 잇기(답일 때만) · 안내 줄 표시 · 단추 답 실패 건너뛰기 | 3 · 5 |
| `apps/web/app/easy/ad-guide.ts` (새) | 규격 안내를 쓸 사실(`AD_STEPS` · `AD_SPECS` 에서 읽음) · 프롬프트 · 읽기 · 대신 쓰는 안내 | 3 |
| `apps/web/lib/easy/ad-turn.ts` (새) | 물음 줄 · 안내 줄 남기기, 안내 쓰기(실패해도 대신 쓰는 안내) | 4 |
| `apps/web/app/api/easy/generate/route.ts` | 판단 · 고른 갈래(`kindPicked`) · 광고 갈래 · 지시 · 실패 줄 · 받을 정보 | 1 · 2 · 4 · 5 |
| `apps/web/lib/easy/failure-row.ts` (새) | 사용자 말 뒤 실패면 실패 안내 줄(B4), 알고 낸 실패가 아니면 일반 문장 | 5 |
| `apps/web/app/easy/row-image.ts` | `withRowJob` · `rowJobOf`, 고친 줄 읽기가 `;job=` 를 무시, 안 받은 줄 고르기 | 5 · 6 |
| `apps/web/lib/easy/image-edit-turn.ts` | `countEasyImages`, 고친 줄에 받을 정보 | 4 · 5 |
| `apps/web/lib/easy/pending-requests.ts` (새) | 아직 결과를 안 받은 요청(`costUsd` 빈 것) | 6 |
| `apps/web/app/easy/_components/load.ts` · `app/easy/[id]/page.tsx` | 안 받은 줄(`pending`)을 화면에 넘긴다 | 6 |
| `apps/web/app/easy/collect.ts` (새) | 결과 받기(화면에서 옮김) + 0장이면 실패(B5) | 6 |
| `apps/web/app/easy/use-resume-images.ts` (새) | 다시 열 때 안 받은 줄만 이어 받기(B3) | 6 |
| `apps/web/app/easy/_components/message.tsx` | 못 받은 줄 표시, 광고 물음 · 안내 줄 | 6 · 8 |
| `apps/web/app/easy/turn-carry.ts` (새) | 「이대로 만들기」 기본값(B1), 고른 값 묶음(B2) | 7 |
| `apps/web/app/easy/_components/ad-rows.tsx` (새) | 광고 물음 단추 · 「광고소재 열기」 | 8 |
| `apps/web/app/easy/easy-client.tsx` | 위 것들을 부르기만(`kindPicked` · `initialPending` · 실패 뒤 단추 글 안 되돌리기 포함) | 2 · 6 · 7 · 8 |
| `apps/web/lib/easy/store-core.ts` · `store.ts` · `app/api/easy/works/route.ts` | 작업 → 대화 | 9 |
| `apps/web/app/library/easy-href.ts` (새) · `works-tab.tsx` | 과정 보기 주소 | 9 |

---

### Task 1: 선택지를 지금 쓸 수 있는 갈래로만 (A1 · A1-2 · A4)

**Files:**
- Create: `apps/web/app/easy/chat-facts.ts`
- Modify: `apps/web/app/easy/chat.ts:1-3, 32-60, 88-232, 302-305`
- Modify: `apps/web/lib/easy/chat-provider.ts:1-10, 33-67, 162, 171`
- Modify: `apps/web/app/api/easy/generate/route.ts:7, 200-217`
- Test: `apps/web/app/easy/__tests__/chat-wants.test.ts` (새)
- Test (고침): `apps/web/app/easy/__tests__/chat-image-edit.test.ts:1, 69-74`, `apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts:12-17`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `chat.ts`: `export type EasyWant = EasyDecision["wants"]`, `export interface EasyChoices { hasDraft: boolean; made: boolean; madeImage: boolean }`, `export function easyAvailableWants(choices: EasyChoices): EasyWant[]`
  - `chat-facts.ts`: `export function easyCapabilityLines(wants: readonly EasyWant[]): string[]` (쓸 수 있는 갈래를 받아, 있는 갈래 이름만 적는다), `export function easyFirstPhotoLines(): string[]`
  - `chat-provider.ts`: `export function easyChatSpec(wants: readonly string[]): StructuredSpec`, 그리고 제공자의 `decide(prompt: string, wants: readonly EasyWant[]): Promise<unknown>` (두 번째 인자 **필수**)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/chat-wants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { easyAvailableWants, easyChatPrompt } from "../chat";
import { easyCapabilityLines } from "../chat-facts";
import { easyChatSpec } from "../../../lib/easy/chat-provider";

/**
 * **선택지를 지금 쓸 수 있는 갈래로만**(2026-10-06 설계 A1).
 *
 * 판단 틀의 선택지에 `image_edit` · `revise` 가 늘 열려 있어서, 만든 것이 없는 대화에서도
 * 모델이 그것을 골랐고 「고칠 이미지가 없습니다」로 끝났다(실측 6/6). 선택지를 줄이면
 * 같은 말이 6/6 새 이미지였다. 프롬프트와 틀이 **같은 함수**에서 나와야 다시 안 갈린다.
 */
const 모든갈래 = [
  "image", "cardnews", "either", "revise", "card_text", "card_redo", "caption", "download", "image_edit", "talk", "detail_page",
];
const 경우들 = [false, true].flatMap((hasDraft) => [false, true].flatMap((made) =>
  [false, true].map((madeImage) => ({ hasDraft, made, madeImage }))));
const 갈래줄이있나 = (prompt: string, want: string) => new RegExp(`^  ${want}\\s`, "m").test(prompt);
const 선택지 = (wants: readonly string[]) =>
  (easyChatSpec(wants).schema as { properties: { wants: { enum: string[] } } }).properties.wants.enum;

describe("지금 쓸 수 있는 갈래 (A1)", () => {
  it("만든 것이 없으면 고치기 갈래가 아예 없다", () => {
    expect(easyAvailableWants({ hasDraft: false, made: false, madeImage: false }))
      .toEqual(["image", "cardnews", "either", "talk", "detail_page"]);
  });

  it("원고가 있으면 원고 고치기, 만들었으면 손보기, 이미지가 있으면 이미지 고치기가 열린다", () => {
    expect(easyAvailableWants({ hasDraft: true, made: false, madeImage: false }))
      .toEqual(["image", "cardnews", "either", "revise", "card_text", "talk", "detail_page"]);
    expect(easyAvailableWants({ hasDraft: true, made: true, madeImage: true })).toEqual([
      "image", "cardnews", "either", "revise", "card_text", "card_redo", "caption", "download", "image_edit", "talk", "detail_page",
    ]);
    // 원고 없이 「만들었다」만 오는 일은 없지만, 와도 손보기는 열지 않는다.
    expect(easyAvailableWants({ hasDraft: false, made: true, madeImage: false })).not.toContain("card_redo");
  });

  it.each(경우들)("프롬프트의 갈래 안내가 목록과 꼭 같다 — %o", (choices) => {
    const prompt = easyChatPrompt([], "말", 0, choices.hasDraft, choices.made, choices.madeImage);
    const 쓸수있는 = easyAvailableWants(choices) as string[];
    for (const want of 모든갈래) expect(갈래줄이있나(prompt, want), want).toBe(쓸수있는.includes(want));
  });

  it.each(경우들)("판단 틀의 선택지가 목록과 꼭 같다 — %o", (choices) => {
    expect(선택지(easyAvailableWants(choices))).toEqual(easyAvailableWants(choices));
  });
});

describe("하는 일 · 안 하는 일 (A4)", () => {
  it("상세페이지와 광고 규격은 어디서 하는지 사실대로 적는다", () => {
    const prompt = easyChatPrompt([], "상세페이지도 돼?");
    expect(prompt).toContain("「상세페이지 만들기」에서 만듭니다");
    expect(prompt).toContain("「광고소재」 화면에서 합니다");
    expect(prompt).toContain("**된다고 하지 말고**");
  });

  /**
   * 최종 리뷰(2026-10-06): 「안 되는 것을 물으면 talk」만 있으면 「상세페이지 만들어줘」도
   * talk 로 읽힌다. **만들어 달라는 말**과 **되는지 묻기만 하는 말**을 가른다.
   */
  it("만들어 달라는 말은 그 갈래, 되는지 묻기만 하는 말은 talk 라고 가른다", () => {
    const 줄 = easyCapabilityLines(easyAvailableWants({ hasDraft: false, made: false, madeImage: false })).join("\n");
    expect(줄).toContain("상세페이지를 **만들어 달라는** 말은 detail_page 입니다.");
    expect(줄).toContain("**되는지 묻기만 하는** 말");
    expect(줄).toContain("talk 입니다");
  });

  it("쓸 수 없는 갈래 이름은 적지 않는다 — 아직 없는 ad_specs 도 마찬가지다 (A1)", () => {
    const 줄 = easyCapabilityLines(["image", "talk", "detail_page"]).join("\n");
    expect(줄).not.toContain("ad_specs");
    expect(줄).not.toContain("image_edit");
  });
});

describe("만든 것이 없는 대화의 사진 (A1-2)", () => {
  it("사진을 붙였고 만든 것이 없으면 「바꿔줘」도 새 이미지라고 알린다", () => {
    expect(easyChatPrompt([], "두번째 사진 사람을 화장품으로 바꿔줘", 2))
      .toContain("**붙인 사진으로 새 이미지를 만들라는 것**");
  });

  it("이미지나 원고가 있으면 그 말을 안 적는다 — 그때는 고치기가 맞다", () => {
    expect(easyChatPrompt([], "바꿔줘", 2, false, false, true)).not.toContain("새 이미지를 만들라는 것");
    expect(easyChatPrompt([], "바꿔줘", 2, true)).not.toContain("새 이미지를 만들라는 것");
  });
});
```

`apps/web/app/easy/__tests__/chat-image-edit.test.ts` 의 「판단 틀」 묶음(69~74줄)을 아래로 바꾸고, 그 묶음만 쓰던 첫 줄 `import { readFileSync } from "node:fs";` 를 지운다(이 파일에서 `readFileSync` 를 쓰는 곳은 71줄 하나뿐이다):

```ts
describe("판단 틀", () => {
  it("이미지가 있을 때만 틀에 image_edit 이 있다 — 틀에 없으면 아무리 시켜도 안 온다", async () => {
    const { easyChatSpec } = await import("../../../lib/easy/chat-provider");
    const { easyAvailableWants } = await import("../chat");
    const 선택지 = (madeImage: boolean) =>
      (easyChatSpec(easyAvailableWants({ hasDraft: false, made: false, madeImage })).schema as {
        properties: { wants: { enum: string[] } };
      }).properties.wants.enum;
    expect(선택지(true)).toContain("image_edit");
    expect(선택지(false)).not.toContain("image_edit");
  });
});
```

`apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts` 의 첫 `it`(12~17줄, 「말 판단 틀에 새 갈래 넷과 장 번호 · 바라는 점이 있고…」)을 아래로 바꾸고 맨 위 import 에 두 줄을 더한다:

```ts
import { easyChatSpec } from "../chat-provider";
import { easyAvailableWants } from "../../../app/easy/chat";
```

```ts
  it("말 판단 틀은 부를 때 받은 갈래만 선택지로 두고, 장 번호 · 바라는 점을 꼭 받는다", () => {
    const wants = easyAvailableWants({ hasDraft: true, made: true, madeImage: false });
    const schema = easyChatSpec(wants).schema as {
      properties: Record<string, { type: string; enum?: string[] }>;
      required: string[];
    };
    for (const 갈래 of ["card_redo", "card_text", "caption", "download"]) expect(schema.properties.wants!.enum).toContain(갈래);
    expect(schema.properties.card).toEqual({ type: "integer" });
    expect(schema.properties.note).toEqual({ type: "string" });
    expect(schema.required).toEqual(["wants", "reply", "ratio", "look", "card", "note"]);
  });
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/chat-wants.test.ts app/easy/__tests__/chat-image-edit.test.ts lib/easy/__tests__/chat-provider-wiring.test.ts`
Expected: FAIL — `easyAvailableWants is not a function` / `easyChatSpec is not a function`

- [ ] **Step 3: `chat-facts.ts` 를 만든다**

`apps/web/app/easy/chat-facts.ts`:

```ts
/**
 * 판단 모델에게 주는 **사실 줄**(2026-10-06 설계 A1-2 · A4).
 *
 * `chat.ts` 의 `easyChatPrompt` 가 이미 길어 새 덩어리는 여기 둔다.
 *
 * **이 글에는 쓸 수 없을지 모르는 갈래 이름(영문)을 적지 않는다.** 지금 쓸 수 없는 갈래
 * 이름이 프롬프트에 보이면 모델이 그것을 고른다 — A1 이 막으려는 바로 그 일이다(실측 6/6).
 * 갈래 이름을 적어야 하는 줄은 **받은 목록에 있을 때만** 싣는다.
 */
import type { EasyWant } from "./chat";

/**
 * 「쉽게」가 하는 일 · 안 하는 일(A4). 안 되는 것을 물으면 모델이 사실을 몰라 엉뚱하게
 * 답했다. 그 사실과 갈 곳을 말로 답하게 한다.
 *
 * **만들어 달라는 말과 묻기만 하는 말을 가른다**(최종 리뷰 2026-10-06). 「안 되는 것을
 * 물으면 talk」 한 줄만 두면 「상세페이지 만들어줘」도 talk 로 읽혀 안내 단추가 안 붙는다.
 * 만들어 달라면 그 갈래(안내 단추가 붙는다), 되는지 묻기만 하면 talk 로 답한다.
 */
export function easyCapabilityLines(wants: readonly EasyWant[]): string[] {
  return [
    "── 쉽게가 하는 일 · 안 하는 일 (사실입니다. 이것과 다르게 말하지 마세요) ──",
    "",
    "하는 일: 이미지 한 장 만들기 · 카드뉴스(여러 장) 만들기 · 이 대화에서 만든 이미지를 이어서 고치기 ·",
    "  만든 카드뉴스 손보기(한 장 다시 그리기 · 한 장 글 고치기 · 올릴 게시글 쓰기 · 내려받기).",
    "안 하는 일: 상세페이지는 여기서 만들지 않습니다. 「상세페이지 만들기」에서 만듭니다.",
    "  네이버 · 구글 · 카카오 같은 포털 광고 규격으로 여러 장 뽑기(리사이징 · 베리에이션)도 여기서 하지 않습니다.",
    "  「광고소재」 화면에서 합니다.",
    ...(wants.includes("detail_page") ? ["상세페이지를 **만들어 달라는** 말은 detail_page 입니다."] : []),
    "**되는지 묻기만 하는** 말(「여기서 상세페이지도 돼?」 · 「광고 사이즈별로도 돼?」)은 talk 입니다.",
    "  안 되는 것이면 **된다고 하지 말고** 그 사실과 갈 곳을 reply 로 답하세요.",
    "",
  ];
}

/**
 * A1-2: 아직 만든 것이 없는 대화에 사진이 붙어 있을 때. 「두번째 사진에 있는 사람을
 * 화장품으로 바꿔줘」를 모델은 고치기로 읽고 「고칠 것이 없습니다」로 끝났다(운영
 * 2026-10-06 `38b11604` · `e5a96f94`).
 */
export function easyFirstPhotoLines(): string[] {
  return [
    "**이 대화에서 아직 만든 것이 없습니다.** 「붙인 사진 속 ○○을 바꿔줘」 ·",
    "「두번째 사진에 있는 사람을 화장품으로 바꿔줘」는 고칠 것이 없다는 말이 아니라",
    "**붙인 사진으로 새 이미지를 만들라는 것**입니다. image 로 고르세요.",
    "",
  ];
}
```

- [ ] **Step 4: `chat.ts` 를 고친다**

(a) import — `import type { EasyMessage } from "./turn";` 아래에 한 줄 더한다:

```ts
import { easyCapabilityLines, easyFirstPhotoLines } from "./chat-facts";
```

(b) `/**\n * 고쳐 달라는데 고칠 것이 없을 때의 답.` 바로 **앞**에 넣는다:

```ts
/** 판단 모델이 고를 수 있는 갈래 하나. */
export type EasyWant = EasyDecision["wants"];

/** 지금 쓸 수 있는 갈래를 정하는 재료. 모두 이 대화에서 읽은 사실이다. */
export interface EasyChoices {
  /** 이 대화에 카드뉴스 원고가 있나. */
  hasDraft: boolean;
  /** 그 원고로 카드를 만들었나(그림이 있다). */
  made: boolean;
  /** 이 대화의 마지막 결과가 고칠 수 있는 이미지 한 장인가. */
  madeImage: boolean;
}

/**
 * **지금 쓸 수 있는 갈래**(2026-10-06 설계 A1).
 *
 * 프롬프트의 갈래 안내(`easyChatPrompt`)와 판단 틀의 선택지(`easyChatSpec`)가 **둘 다
 * 이 함수에서 나온다.** 전에는 프롬프트만 조건부였고 틀은 늘 열려 있어서, 고칠 것이 없는
 * 대화에서도 모델이 `image_edit` 을 골라 고정 문장으로 끝났다(실측 6/6).
 */
export function easyAvailableWants(choices: EasyChoices): EasyWant[] {
  return [
    "image", "cardnews", "either",
    ...(choices.hasDraft ? (["revise", "card_text"] as const) : []),
    ...(choices.hasDraft && choices.made ? (["card_redo", "caption", "download"] as const) : []),
    ...(choices.madeImage ? (["image_edit"] as const) : []),
    "talk", "detail_page",
  ];
}

```

(c) 함수 머리 — 아래를 찾아:

```ts
): string {
  const 지난말 = history
```

이렇게 바꾼다:

```ts
): string {
  // 프롬프트의 갈래 안내와 판단 틀의 선택지가 **같은 함수**에서 나온다(2026-10-06 설계 A1).
  const 갈래 = easyAvailableWants({ hasDraft, made, madeImage });
  const 지난말 = history
```

(d) 갈래 조건 다섯 곳을 목록으로 바꾼다(각각 Edit 한 번):

- `    ...(hasDraft\n      ? [\n        "  revise    이 대화의` → `    ...(갈래.includes("revise")\n      ? [\n        "  revise    이 대화의`
- `    ...(hasDraft && made\n` → `    ...(갈래.includes("card_redo")\n`
- `    ...(madeImage\n      ? [\n        "  image_edit  이 대화에서` → `    ...(갈래.includes("image_edit")\n      ? [\n        "  image_edit  이 대화에서`
- `    ...(hasDraft && madeImage\n` → `    ...(갈래.includes("revise") && 갈래.includes("image_edit")\n`
- `    ...(hasDraft\n      ? [\n        "**이 대화에는 카드뉴스 원고가 있습니다.**` → `    ...(갈래.includes("revise")\n      ? [\n        "**이 대화에는 카드뉴스 원고가 있습니다.**`

(e) 빈 답 줄 — 아래 한 줄을 찾아:

```ts
    `\`image\` · \`cardnews\` · \`either\`${hasDraft ? " · `revise` · `card_text`" : ""}${hasDraft && made ? " · `card_redo` · `caption` · `download`" : ""}${madeImage ? " · `image_edit`" : ""} 면 \`reply\` 는 빈 글로 두세요.`,
    ...(hasDraft ? ["`card` 는 말에 장 번호가 있을 때만 적고 없으면 0, `note` 는 없으면 빈 글로 두세요."] : []),
```

이렇게 바꾼다:

```ts
    `${빈답갈래(갈래)} 면 \`reply\` 는 빈 글로 두세요.`,
    ...(갈래.includes("card_text") ? ["`card` 는 말에 장 번호가 있을 때만 적고 없으면 0, `note` 는 없으면 빈 글로 두세요."] : []),
```

(f) 하는 일 · 안 하는 일 — 아래를 찾아:

```ts
    "`detail_page` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다.",
    "",
```

이렇게 바꾼다:

```ts
    "`detail_page` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다.",
    "",
    // 갈래 이름은 쓸 수 있는 것만 적는다(A1) — 같은 목록을 넘긴다.
    ...easyCapabilityLines(갈래),
```

(g) 사진 첫 만들기 — 아래를 찾아:

```ts
        "만들어 달라는 주문**입니다. 무엇을 가리키는지 되묻지 마세요.",
        "",
      ]
      : []),
```

이렇게 바꾼다:

```ts
        "만들어 달라는 주문**입니다. 무엇을 가리키는지 되묻지 마세요.",
        "",
        // A1-2: 만든 것이 없는 대화에서 「사진 속 ○○을 바꿔줘」는 새 이미지다.
        ...(갈래.includes("image_edit") || 갈래.includes("revise") ? [] : easyFirstPhotoLines()),
      ]
      : []),
```

(h) 파일 끝 `const 아는갈래 = new Set([` **앞**에 넣는다:

```ts
/** 말 · 안내로 끝나는 갈래. 이것들은 `reply` 를 비우라는 줄에 넣지 않고 따로 적는다. */
const 따로적는갈래 = new Set<string>(["talk", "detail_page", "ad_specs"]);

/** `reply` 를 비워야 하는 갈래를 프롬프트에 적을 꼴로. 쓸 수 있는 것만 적는다(A1). */
function 빈답갈래(갈래: readonly EasyWant[]): string {
  return 갈래.filter((one) => !따로적는갈래.has(one)).map((one) => `\`${one}\``).join(" · ");
}

```

- [ ] **Step 5: `chat-provider.ts` 를 고친다**

(a) import 맨 아래에 더한다:

```ts
import type { EasyWant } from "../../app/easy/chat";
```

(b) `const EASY_CHAT_SPEC: StructuredSpec = {` 부터 그 블록 끝 `};`(33~67줄)을 통째로 아래로 바꾼다:

```ts
/**
 * 말 판단 틀. **선택지는 부를 때마다 받는다**(2026-10-06 설계 A1).
 *
 * 전에는 enum 에 모든 갈래가 늘 열려 있어서, 프롬프트가 안내하지 않은 `image_edit` 을
 * 모델이 골랐다(실측 6/6). 선택지는 `chat.ts` 의 `easyAvailableWants` 가 정하고,
 * 프롬프트도 같은 목록으로 안내한다.
 */
export function easyChatSpec(wants: readonly string[]): StructuredSpec {
  return {
    name: "easy_turn",
    description: "사용자의 마지막 말이 그림 주문인지 가리고, 아니면 답을 쓴다.",
    schema: {
      type: "object",
      properties: {
        /*
         * **틀에 없으면 아무리 시켜도 안 온다.** 구조화 응답은 이 틀에 없는 칸을
         * 버린다 — 2026-09-17 에 `invented` 로 한 번, `hasText` 로 또 한 번
         * 당했다. 둘 다 프롬프트에만 적혀 있었다.
         */
        wants: { type: "string", enum: [...wants] },
        reply: { type: "string" },
        /*
         * **말 속에 있을 때만 채운다.** 빈 글이 「없다」는 뜻이다.
         *
         * `required` 에 넣는 까닭은 하나다 — 구조화 응답은 안 채운 칸을 그냥
         * 빼 버려서, 모델이 「없음」을 말할 길이 없으면 아무 값이나 채운다.
         */
        ratio: { type: "string", enum: ["", ...EASY_RATIOS.map((one) => one.id)] },
        /*
          **`auto` 는 안 준다.** 그것은 「안 골랐다」는 뜻의 기본값이라, 고를 거리로
          주면 모델이 그것을 골라 놓고 「말했다」가 된다 — 그러면 안 묻는다.
        */
        look: { type: "string", enum: ["", ...EASY_LOOKS.filter((one) => one.id !== "auto").map((one) => one.id)] },
        // 3단계: 말한 장 번호(없으면 0)와 그 장에 바라는 점 · 고칠 내용(없으면 빈 글).
        card: { type: "integer" },
        note: { type: "string" },
      },
      required: ["wants", "reply", "ratio", "look", "card", "note"],
    },
  };
}
```

(c) Edit 하나를 `replace_all: true` 로: `decide: 부른다(EASY_CHAT_SPEC),` → `decide: (prompt: string, wants: readonly EasyWant[]) => 부른다(easyChatSpec(wants))(prompt),`

- [ ] **Step 6: 라우트가 선택지를 넘기게 한다**

`apps/web/app/api/easy/generate/route.ts`:

- 7줄 `import { easyChatPrompt, readEasyDecision, type EasyDecision } from "../../../easy/chat";` → `import { easyAvailableWants, easyChatPrompt, readEasyDecision, type EasyDecision } from "../../../easy/chat";`
- 아래를 찾아:

```ts
            Boolean(고칠그림),
          ),
        ),
        { canRevise: Boolean(고칠원고), made: 만들었나, editableImage: Boolean(고칠그림) },
```

이렇게 바꾼다:

```ts
            Boolean(고칠그림),
          ),
          // 선택지는 프롬프트와 같은 함수가 정한다(2026-10-06 설계 A1).
          easyAvailableWants({ hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: Boolean(고칠그림) }),
        ),
        { canRevise: Boolean(고칠원고), made: 만들었나, editableImage: Boolean(고칠그림) },
```

- [ ] **Step 7: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__ lib/easy/__tests__ app/api/easy/__tests__`
Expected: PASS (실패 0)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/lib/easy/chat-provider.ts apps/web/app/api/easy/generate/route.ts apps/web/app/easy/__tests__/chat-wants.test.ts apps/web/app/easy/__tests__/chat-image-edit.test.ts apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts
git commit -m "fix(easy): 판단 선택지를 지금 쓸 수 있는 갈래로만 주고 하는 일 · 안 하는 일을 알린다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 한 턴의 판단 — 빈 답 재질문(A3) · 고른 갈래 우선(A2)

**Files:**
- Create: `apps/web/lib/easy/judge.ts`
- Modify: `apps/web/app/easy/chat.ts` (`EasyPromptOptions`, 일곱째 인자)
- Modify: `apps/web/app/api/easy/generate/route.ts:7, 198-229`
- Modify: `apps/web/app/easy/easy-client.tsx:354` (`kindPicked` 를 싣는다)
- Test: `apps/web/lib/easy/__tests__/judge.test.ts` (새), `apps/web/app/easy/__tests__/kind-picked-wiring.test.ts` (새)
- Test (더함): `apps/web/app/api/easy/__tests__/generate-route.test.ts`, `apps/web/app/api/easy/__tests__/generate-image-edit.test.ts`
- Test (고침): `apps/web/app/api/easy/__tests__/generate-wiring.test.ts` 「말과 주문을 가르는 자리」 두 `it`

**Interfaces:**
- Consumes: Task 1 의 `easyAvailableWants`, `EasyChoices`, `EasyWant`, 제공자 `decide(prompt, wants)`
- Produces:
  - `chat.ts`: `export interface EasyPromptOptions { retry?: boolean }`, `easyChatPrompt(history, prompt, attachmentCount?, hasDraft?, made?, madeImage?, options?: EasyPromptOptions)`
  - `judge.ts`: `export interface EasyJudgeInput { decide(prompt: string, wants: readonly EasyWant[]): Promise<unknown>; history: readonly EasyMessage[]; prompt: string; attachmentCount: number; choices: EasyChoices; kindPicked?: boolean }`, `export async function judgeEasyTurn(input: EasyJudgeInput): Promise<EasyDecision>` — `kindPicked` 면 talk 재질문(A3)을 안 한다
  - 요청 본문 새 칸 `kindPicked: true` — 화면이 「이미지 한 장 · 카드뉴스」 단추(와 그 뒤 레퍼런스 단추)로 갈래를 **고른 턴에만** 싣는다(`다시?.kind` 가 있을 때). 말로 답한 턴에 `continuingKind` 가 실어 온 갈래에는 안 싣는다
  - 라우트: `골랐나 = 고른갈래 && input.kindPicked === true` — 골랐으면 판단과 상관없이 그 갈래(A2), 아니면 예전처럼 판단이 image · cardnews · either 일 때만 이긴다(2단계 §4)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/easy/__tests__/judge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { judgeEasyTurn } from "../judge";

/**
 * **한 턴의 판단**(2026-10-06 설계 A1 · A3).
 *
 * `talk` 인데 답이 빈 채로 오면 「무엇을 만들어 드릴까요?」가 되풀이됐다. 한 번 더 묻고,
 * 그래도 비면 그때만 기본 문장이다(기본 문장은 라우트가 쓴다).
 */
const 결정 = (over: Record<string, unknown> = {}) =>
  ({ wants: "talk", reply: "", ratio: "", look: "", card: 0, note: "", ...over });
const 없음 = { hasDraft: false, made: false, madeImage: false };

function 판단기(...answers: unknown[]) {
  return vi.fn(async (_prompt: string, _wants: readonly string[]) => answers.shift());
}
const 묻는다 = (decide: ReturnType<typeof 판단기>, over: Partial<Parameters<typeof judgeEasyTurn>[0]> = {}) =>
  judgeEasyTurn({ decide, history: [], prompt: "안녕", attachmentCount: 0, choices: 없음, ...over });

describe("선택지 (A1)", () => {
  it("만든 것이 없으면 고치기 갈래를 선택지에 안 넣는다", async () => {
    const decide = 판단기(결정({ wants: "image" }));
    await 묻는다(decide);
    expect(decide.mock.calls[0]![1]).not.toContain("image_edit");
    expect(decide.mock.calls[0]![1]).not.toContain("revise");
  });

  it("이미지가 있으면 image_edit 을 넣고 그대로 받는다", async () => {
    const decide = 판단기(결정({ wants: "image_edit" }));
    expect((await 묻는다(decide, { choices: { ...없음, madeImage: true } })).wants).toBe("image_edit");
    expect(decide.mock.calls[0]![1]).toContain("image_edit");
  });
});

describe("빈 답이면 한 번 더 묻는다 (A3)", () => {
  it("talk 인데 답이 비면 다시 묻고, 그 답을 쓴다", async () => {
    const decide = 판단기(결정(), 결정({ reply: "네, 무엇을 만들까요? 예: 「카페 포스터 만들어줘」" }));
    const 읽은것 = await 묻는다(decide);
    expect(decide).toHaveBeenCalledTimes(2);
    expect(decide.mock.calls[1]![0]).toContain("reply 에 꼭 답을 쓰세요");
    expect(읽은것).toMatchObject({ wants: "talk", reply: "네, 무엇을 만들까요? 예: 「카페 포스터 만들어줘」" });
  });

  it("다시 물어도 비면 빈 답 그대로 돌려준다 — 기본 문장은 라우트가 쓴다", async () => {
    const decide = 판단기(결정(), 결정());
    expect(await 묻는다(decide)).toMatchObject({ wants: "talk", reply: "" });
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("다시 물었는데 다른 갈래가 오면 처음 답을 쓴다 — 값이 드는 갈래로 몰래 바뀌지 않는다", async () => {
    const decide = 판단기(결정(), 결정({ wants: "image" }));
    expect(await 묻는다(decide)).toMatchObject({ wants: "talk", reply: "" });
  });

  it("답이 있으면 한 번만 묻는다", async () => {
    const decide = 판단기(결정({ reply: "안녕하세요!" }));
    await 묻는다(decide);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  /** Review Focus 2 — 원래 답이 빈 갈래에서 다시 물으면 턴마다 값이 두 번 나간다. */
  it("말로 끝나지 않는 갈래(상세페이지 · 이미지)는 답이 비어도 다시 묻지 않는다", async () => {
    for (const wants of ["detail_page", "image"]) {
      const decide = 판단기(결정({ wants }));
      await 묻는다(decide);
      expect(decide).toHaveBeenCalledTimes(1);
    }
  });

  /**
   * 최종 리뷰(2026-10-06): 단추로 갈래를 골랐으면 라우트가 판단의 갈래를 버린다(A2).
   * 그때 다시 물으면 버릴 답에 값만 한 번 더 나간다.
   */
  it("갈래를 단추로 골랐으면 talk 답이 비어도 다시 묻지 않는다", async () => {
    const decide = 판단기(결정());
    expect(await 묻는다(decide, { kindPicked: true })).toMatchObject({ wants: "talk", reply: "" });
    expect(decide).toHaveBeenCalledTimes(1);
  });
});
```

`apps/web/app/api/easy/__tests__/generate-route.test.ts` 파일 끝에 더한다:

```ts
describe("한 턴의 판단 (2026-10-06 A2 · A3)", () => {
  it("「이미지 한 장」을 고르고 다시 보내면 모델이 말로 답해도 만든다 (A2)", async () => {
    판단 = { wants: "talk", reply: "무엇을 만들까요?", ratio: "", look: "" };
    const { json } = await 보낸다({ kind: "image", kindPicked: true, ratio: "1:1" });
    expect(json.talked).toBeUndefined();
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });

  /**
   * 최종 리뷰(2026-10-06): 사진 물음 중에 말로 친 질문은 화면이 갈래를 이어 싣지만
   * (`continuingKind`) 단추로 고른 것이 아니다. 그 말까지 이미지로 만들면 묻는 말에 값이 나간다.
   */
  it("고른 것이 아니라 이어 온 갈래면 말로 답한 판단을 따른다", async () => {
    판단 = { wants: "talk", reply: "1번 사진은 로고로 쓰겠습니다.", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "1번 사진은 뭐로 써요?", kind: "image" });
    expect(json.talked).toBe(true);
    expect(json.message.body).toBe("1번 사진은 로고로 쓰겠습니다.");
    expect(부른라우트).toEqual([]);
  });

  it("이어 온 갈래도 판단이 image · cardnews · either 면 예전처럼 이긴다 (2단계 §4)", async () => {
    판단 = { wants: "either", reply: "", ratio: "", look: "" };
    await 보낸다({ kind: "image", ratio: "1:1" });
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });

  it("talk 인데 답이 두 번 다 비면 그때만 기본 문장 (A3)", async () => {
    판단 = { wants: "talk", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "음" });
    expect(부른횟수.decide).toBe(2);
    expect(json.message.body).toBe("무엇을 만들어 드릴까요?");
  });

  it("단추로 고른 턴은 빈 talk 여도 다시 묻지 않는다 — 버릴 판단에 값이 두 번 안 나간다", async () => {
    판단 = { wants: "talk", reply: "", ratio: "", look: "" };
    await 보낸다({ kind: "image", kindPicked: true, ratio: "1:1" });
    expect(부른횟수.decide).toBe(1);
  });
});
```

`apps/web/app/api/easy/__tests__/generate-image-edit.test.ts`:
- `const 부른라우트 ...` 줄 아래에 `let 받은갈래: string[] = [];` 를 더한다
- chat-provider 모의를 아래로 바꾼다:

```ts
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async (_prompt: string, wants: readonly string[]) => { 받은갈래 = [...wants]; return 판단; },
    decideRoles: async () => ({ photos: [], conflicting: false }),
  }),
}));
```

- 파일 끝에 더한다:

```ts
describe("선택지와 고른 갈래 (2026-10-06 A1 · A2)", () => {
  it("이미지를 만든 대화면 선택지에 image_edit 이 있다", async () => {
    await 보낸다({ prompt: "배경만 파랗게" });
    expect(받은갈래).toContain("image_edit");
  });

  it("만든 것이 없는 대화면 선택지에 고치기 갈래가 없다", async () => {
    지난줄 = [{ id: "u1", role: "user", body: "안녕", workId: null }];
    await 보낸다({ prompt: 로고바꿔줘 });
    expect(받은갈래).not.toContain("image_edit");
    expect(받은갈래).not.toContain("revise");
  });

  it("「이미지 한 장」을 고른 답이면 마지막 이미지를 고치지 않고 새로 만든다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "광고 사진을 만들어주세요", kind: "image", kindPicked: true, ratio: "1:1" });
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });

  it("단추로 고른 것이 아니면(이어 온 갈래) 고치기 판단을 따른다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "배경만 파랗게", kind: "image" });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
  });
});
```

`apps/web/app/api/easy/__tests__/generate-wiring.test.ts` — 아래를 찾아:

```ts
  it("가르는 판단을 라우트 안에 두지 않는다", () => {
    // 판단은 `app/easy/chat.ts` 가 값으로 잰다. 여기 있으면 못 잰다.
    expect(generate).toContain('from "../../../easy/chat"');
    expect(generate).toContain("readEasyDecision");
  });

  it("프로젝트를 만들기 전에 가른다", () => {
    const 가르는곳 = generate.indexOf("readEasyDecision");
```

이렇게 바꾼다:

```ts
  it("가르는 판단을 라우트 안에 두지 않는다", () => {
    // 판단은 `app/easy/chat.ts` 가 값으로 재고, 한 턴의 묻기는 `lib/easy/judge.ts` 가 한다.
    expect(generate).toContain('from "../../../easy/chat"');
    expect(generate).toContain("judgeEasyTurn(");
  });

  it("프로젝트를 만들기 전에 가른다", () => {
    const 가르는곳 = generate.indexOf("judgeEasyTurn(");
```

`apps/web/app/easy/__tests__/kind-picked-wiring.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **갈래를 단추로 고른 턴에만 `kindPicked`**(2026-10-06 설계 A2, 최종 리뷰). 화면 안의
 * 한 줄이라 글자로 잰다. 서버는 이 칸이 있을 때만 판단과 상관없이 그 갈래로 간다.
 */
const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");

describe("kindPicked", () => {
  it("다시 보낸 말에 고른 갈래가 있을 때만 싣는다", () => {
    expect(화면).toContain("...(다시?.kind ? { kindPicked: true } : {}),");
  });

  it("이어 온 갈래(kind)로는 싣지 않는다 — 말로 한 답은 고른 것이 아니다", () => {
    expect(화면).not.toMatch(/\.\.\.\(kind \? \{[^}]*kindPicked/);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run lib/easy/__tests__/judge.test.ts app/api/easy/__tests__/generate-route.test.ts app/api/easy/__tests__/generate-image-edit.test.ts app/api/easy/__tests__/generate-wiring.test.ts app/easy/__tests__/kind-picked-wiring.test.ts`
Expected: FAIL — `Cannot find module '../judge'`, A2 시험은 `talked: true`, A3 시험은 `decide` 1번, wiring 은 `judgeEasyTurn(` 없음, `kindPicked` 글자 없음

- [ ] **Step 3: `chat.ts` 에 재질문 줄을 더한다**

(a) `/** 판단 모델이 고를 수 있는 갈래 하나. */` **앞**에 넣는다:

```ts
/** 이번 판단에만 쓰는 것. */
export interface EasyPromptOptions {
  /** A3: 앞서 talk 인데 reply 가 비었다. 이번에는 꼭 쓰라고 한다. */
  retry?: boolean;
}

```

(b) 아래를 찾아:

```ts
  madeImage = false,
): string {
```

이렇게 바꾼다:

```ts
  madeImage = false,
  /** 한 번 더 묻는 때처럼 이번 판단에만 쓰는 것(2026-10-06 설계 A3). */
  options: EasyPromptOptions = {},
): string {
```

(c) `    지난말.length ? "── 지난 대화 ──" : "── 첫 말입니다 ──",` **앞**에 넣는다:

```ts
    ...(options.retry
      ? ["**앞서 talk 를 고르고 reply 를 비웠습니다.** talk 이면 이번에는 reply 에 꼭 답을 쓰세요.", ""]
      : []),
```

- [ ] **Step 4: `judge.ts` 를 만든다**

`apps/web/lib/easy/judge.ts`:

```ts
import {
  easyAvailableWants, easyChatPrompt, readEasyDecision,
  type EasyChoices, type EasyDecision, type EasyWant,
} from "../../app/easy/chat";
import type { EasyMessage } from "../../app/easy/turn";

/**
 * **「쉽게」 한 턴의 판단**(2026-10-06 설계 A1 · A3).
 *
 * 라우트에 두면 값으로 못 잰다. 여기서는 글 모델을 부르는 함수를 받아 쓴다 — 예약 ·
 * 정산은 라우트가 이 함수를 감싸서 한다.
 *
 *   A1  선택지는 `easyAvailableWants` 가 정한 것만 넘긴다(프롬프트도 같은 목록)
 *   A3  talk 인데 답이 비면 한 번 더 묻는다. 그래도 비면 빈 답 그대로 — 라우트가 기본 문장을 쓴다
 */
export interface EasyJudgeInput {
  decide: (prompt: string, wants: readonly EasyWant[]) => Promise<unknown>;
  history: readonly EasyMessage[];
  prompt: string;
  /** 지금 붙어 있는 사진 장수. */
  attachmentCount: number;
  choices: EasyChoices;
  /**
   * 「이미지 한 장 · 카드뉴스」 단추로 갈래를 골랐다(설계 A2). 라우트가 판단의 갈래를
   * 버리므로 talk 재질문(A3)을 하지 않는다 — 버릴 답에 값만 한 번 더 나간다(최종 리뷰).
   * 비율 · 그림체를 말에서 읽으려고 판단은 한 번 한다.
   */
  kindPicked?: boolean;
}

export async function judgeEasyTurn(input: EasyJudgeInput): Promise<EasyDecision> {
  const { hasDraft, made, madeImage } = input.choices;
  const wants = easyAvailableWants(input.choices);
  const ask = async (retry: boolean) => readEasyDecision(
    await input.decide(
      easyChatPrompt(input.history, input.prompt, input.attachmentCount, hasDraft, made, madeImage, { retry }),
      wants,
    ),
    { canRevise: hasDraft, made, editableImage: madeImage },
  );

  const first = await ask(false);
  if (input.kindPicked || first.wants !== "talk" || first.reply) return first;
  /*
   * **다시 물은 답은 talk 이고 글이 있을 때만 쓴다.** 다른 갈래로 바뀌면 사용자가 말한
   * 적 없는 만들기로 값이 나갈 수 있다 — 그때는 처음 답(빈 talk)을 그대로 둔다.
   */
  const again = await ask(true);
  return again.wants === "talk" && again.reply ? again : first;
}
```

- [ ] **Step 5: 라우트가 `judgeEasyTurn` 을 쓰고, 고른 갈래가 늘 이기게 한다**

`apps/web/app/api/easy/generate/route.ts`:

(a) 7줄을 아래 두 줄로 바꾼다(`easyAvailableWants` · `easyChatPrompt` · `readEasyDecision` 는 이제 안 쓴다):

```ts
import type { EasyDecision } from "../../../easy/chat";
import { judgeEasyTurn } from "../../../../lib/easy/judge";
```

(b) 아래 블록(`let decision: EasyDecision;` 부터 `} catch (error) {` 앞까지)을 찾아(**고른 갈래를 판단 앞으로 올린다** — 판단이 그것을 알아야 재질문을 건너뛴다):

```ts
    let decision: EasyDecision;
    try {
      decision = readEasyDecision(
        await provider.decide(
          easyChatPrompt(
            지난줄.map((row) => ({ id: row.id, role: row.role, body: row.body })),
            prompt,
            /*
             * **붙인 것이 있는지 알려 준다.** 안 알려 주면 「이걸로 하나 그려줘」를
             * 되묻는다 — 「이걸로」가 무엇인지 모르니 물을 수밖에 없다
             * (2026-09-21 실측).
             */
            붙인수,
            Boolean(고칠원고),
            만들었나,
            Boolean(고칠그림),
          ),
          // 선택지는 프롬프트와 같은 함수가 정한다(2026-10-06 설계 A1).
          easyAvailableWants({ hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: Boolean(고칠그림) }),
        ),
        { canRevise: Boolean(고칠원고), made: 만들었나, editableImage: Boolean(고칠그림) },
      );
    } catch (error) {
```

이렇게 바꾼다:

```ts
    /*
     * **갈래를 단추로 골랐나**(2026-10-06 설계 A2, 최종 리뷰). 화면은 「이미지 한 장 ·
     * 카드뉴스」 단추로 고른 턴에만 `kindPicked` 를 싣는다. 물음 뒤 **말로** 답한 턴도
     * 갈래를 이어 싣지만(`continuingKind`) 그것은 고른 것이 아니다 — 그 말이 질문이면
     * 질문에 답해야 한다.
     */
    const 고른갈래 = input.kind === "image" || input.kind === "cardnews" ? input.kind as "image" | "cardnews" : undefined;
    const 골랐나 = Boolean(고른갈래) && input.kindPicked === true;

    let decision: EasyDecision;
    try {
      // 한 턴의 판단 — 선택지(A1) · 빈 답 재질문(A3)은 `lib/easy/judge.ts` 가 한다.
      decision = await judgeEasyTurn({
        decide: (text, wants) => provider.decide(text, wants),
        history: 지난줄.map((row) => ({ id: row.id, role: row.role, body: row.body })),
        prompt,
        /*
         * **붙인 것이 있는지 알려 준다.** 안 알려 주면 「이걸로 하나 그려줘」를
         * 되묻는다 — 「이걸로」가 무엇인지 모르니 물을 수밖에 없다
         * (2026-09-21 실측).
         */
        attachmentCount: 붙인수,
        choices: { hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: Boolean(고칠그림) },
        // 골랐으면 판단의 갈래는 버려진다 — 빈 talk 재질문을 안 한다(A3 · 최종 리뷰).
        kindPicked: 골랐나,
      });
    } catch (error) {
```

(c) 아래를 찾아:

```ts
    /*
     * **고른 갈래가 판단을 이긴다**(2단계 설계 §4). 「이미지 한 장 · 카드뉴스」 단추로
     * 답하고 다시 보낸 것이다. 말 · 상세페이지 · 고치기에는 안 끼어든다.
     */
    const 고른갈래 = input.kind === "image" || input.kind === "cardnews" ? input.kind as "image" | "cardnews" : undefined;
    const wants = 고른갈래 && ["image", "cardnews", "either"].includes(decision.wants) ? 고른갈래 : decision.wants;
```

이렇게 바꾼다(`고른갈래` 는 (b) 에서 위로 올렸다):

```ts
    /*
     * **단추로 고른 갈래는 늘 이긴다**(2026-10-06 설계 A2). 전에는 판단이 image ·
     * cardnews · either 일 때만 이겨서, 다시 판단한 모델이 고치기나 말을 고르면 단추를
     * 눌러도 고정 문장이 되풀이됐다. **고른 것이 아니라 이어 온 갈래**(말로 한 답)는
     * 예전 규칙 그대로다(2단계 §4) — 말 · 상세페이지 · 고치기에는 안 끼어든다.
     */
    const wants = 고른갈래 && (골랐나 || ["image", "cardnews", "either"].includes(decision.wants))
      ? 고른갈래
      : decision.wants;
```

(d) **화면이 고른 턴에만 `kindPicked` 를 싣는다** — `apps/web/app/easy/easy-client.tsx` 의 아래 줄을 찾아:

```tsx
          ...(kind ? { kind } : {}), ...(다시?.photoSlots?.length ? { photoSlots: 다시.photoSlots } : {}),
```

이렇게 바꾼다:

```tsx
          ...(kind ? { kind } : {}), ...(다시?.photoSlots?.length ? { photoSlots: 다시.photoSlots } : {}),
          // 갈래 단추로 고른 턴만(설계 A2). 말로 답한 턴에 이어 온 갈래(`continuingKind`)는 고른 것이 아니다.
          ...(다시?.kind ? { kindPicked: true } : {}),
```

`다시.kind` 는 갈래 물음 단추(`EasyKindAsk` → `onSend({ prompt, kind })`)와 카드뉴스 레퍼런스 물음 단추(`kind: "cardnews"`)만 채운다(`_components/cardnews-asks.tsx:26, 34`). 비율 물음 「이대로 만들기」 · 사진 물음 · 말로 한 답은 `kind` 없이 보내므로 `continuingKind` 가 실어도 `kindPicked` 가 없다 — 그때는 (c) 의 예전 규칙(판단이 image · cardnews · either 일 때만 이긴다)을 탄다.

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__ lib/easy/__tests__ app/api/easy/__tests__`
Expected: PASS (실패 0)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/easy/judge.ts apps/web/app/easy/chat.ts apps/web/app/api/easy/generate/route.ts apps/web/app/easy/easy-client.tsx apps/web/lib/easy/__tests__/judge.test.ts apps/web/app/api/easy/__tests__/generate-route.test.ts apps/web/app/api/easy/__tests__/generate-image-edit.test.ts apps/web/app/api/easy/__tests__/generate-wiring.test.ts apps/web/app/easy/__tests__/kind-picked-wiring.test.ts
git commit -m "fix(easy): 빈 답이면 한 번 더 묻고 단추로 고른 갈래가 늘 이기게 한다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 「광고 소재」 낱말 · 물음 · 안내 글 (A5 — 값으로 재는 부분)

**Files:**
- Create: `apps/web/app/easy/ad-ask.ts`, `apps/web/app/easy/ad-guide.ts`
- Modify: `apps/web/app/easy/chat.ts` (갈래 `ad_specs`, `adNegated`, 광고 줄, 안내 줄 표시 떼기)
- Modify: `apps/web/app/easy/chat-facts.ts` (광고 줄 둘, `easyCapabilityLines` 의 `ad_specs` 한 줄)
- Modify: `apps/web/lib/easy/chat-provider.ts` (`EASY_AD_GUIDE_SPEC`, `writeAdGuide`)
- Read (사실의 출처, 바꾸지 않는다): `apps/web/app/ad/steps.ts` (`AD_STEPS` 의 `label`), `apps/web/lib/ad/specs.ts` (`AD_SPECS` 의 `format: "png-alpha"`), `apps/web/lib/ad/cost.ts` · `apps/web/app/api/ad/export/route.ts:176-183` (조립 규격이 섞이면 배경 제거 한 번 = `creditUnits(0.003)` = 1크레딧, 아니면 0), `apps/web/lib/ad/export.ts:38-40, 95-110` (1.2배)
- Test: `apps/web/app/easy/__tests__/ad-ask.test.ts` (새), `apps/web/app/easy/__tests__/ad-guide.test.ts` (새)
- Test (고침 · 더함): `apps/web/app/easy/__tests__/chat-wants.test.ts`

**Interfaces:**
- Consumes: Task 1 · 2 의 `easyAvailableWants`, `EasyChoices`, `EasyPromptOptions`, `easyCapabilityLines(wants)`
- Produces:
  - `ad-ask.ts`: `AD_QUESTION`, `AD_CHOICE_IMAGE = "광고 이미지 만들기"`, `AD_CHOICE_SPECS = "규격별로 베리에이션"`, `AD_HREF = "/ad"`, `AD_ANSWER_NOTE = "answer"`, `type EasyAdStep = "ask" | "specs" | "image"`, `easyAdStep(prompt: string, rows: readonly Row[]): EasyAdStep | undefined` (물음 바로 뒤에는 `ask` 를 내지 않는다), `hasAdNegation(prompt: string): boolean`, `adQuestionOrigin(rows): string | undefined`, `adImageInstruction(rows, prompt, answered: boolean): string | undefined` (`answered` 가 거짓이면 늘 `undefined`), `isAdQuestion(message): boolean`, `adGuideBody(text: string): string`, `isAdGuide(message): boolean`, `visibleBody(message): string` — `Row = Pick<EasyMessage, "role" | "body">`
  - `ad-guide.ts`: `AD_FACTS: string[]`, `AD_GUIDE_FALLBACK: string`, `adGuidePrompt(input: { prompt: string; imageCount: number }): string`, `readAdGuide(raw: unknown): string` — 단계 이름은 `AD_STEPS` 의 `label`, 투명 규격 이름은 `AD_SPECS` 에서 읽는다(글자로 박지 않는다)
  - `chat-facts.ts`: `easyAdAnswerLines()` 가 「답이면 `note` 에 `answer`」 줄을 싣는다
  - `chat.ts`: 갈래 `"ad_specs"`, `EasyChoices.adNegated?: boolean`, `EasyPromptOptions.adNegated?: boolean`
  - 제공자: `writeAdGuide(prompt: string): Promise<unknown>` (돌려받는 꼴 `{ text: string }`)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/ad-ask.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AD_ANSWER_NOTE, AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_QUESTION, adGuideBody, adImageInstruction, adQuestionOrigin,
  easyAdStep, hasAdNegation, isAdGuide, isAdQuestion, visibleBody,
} from "../ad-ask";

/**
 * **「광고 소재」라는 말이 나오면 먼저 묻는다**(2026-10-06 설계 A5, 사용자 결정 두 번).
 * 낱말 찾기는 코드가 한다 — 규칙이 매번 지켜지게.
 */
const 줄 = (role: "user" | "assistant" | "image", body: string) => ({ role, body });
const 물은뒤 = [줄("user", "겨울 화장품 광고 소재 만들어줘"), 줄("assistant", AD_QUESTION)];

describe("「광고 소재」 낱말", () => {
  it("규격 낱말이 없으면 먼저 묻는다", () => {
    expect(easyAdStep("광고 소재 만들어줘", [])).toBe("ask");
    expect(easyAdStep("겨울 화장품 광고소재 하나 부탁해요", [])).toBe("ask");
  });

  it.each(["규격별", "사이즈별", "리사이징", "리사이즈", "베리에이션", "네이버", "구글", "카카오"])(
    "규격 낱말(%s)이 같이 있으면 묻지 않고 바로 안내한다",
    (word) => { expect(easyAdStep(`광고 소재 ${word}로 해줘`, [])).toBe("specs"); },
  );

  it("「광고 소재」라는 말이 없으면 코드는 끼어들지 않는다 — 판단 모델이 가른다", () => {
    expect(easyAdStep("광고 사진을 만들어주세요", [])).toBeUndefined();
    expect(easyAdStep("구글 배너 사이즈별로 다", [])).toBeUndefined();
  });

  it.each(["광고 소재 말고 그냥 이미지 만들어줘", "광고소재는 빼고 포스터로", "광고 소재 아니고 카드뉴스", "광고 소재 없이 그냥"])(
    "부정하면(%s) 묻지 않는다",
    (prompt) => {
      expect(hasAdNegation(prompt)).toBe(true);
      expect(easyAdStep(prompt, [])).toBeUndefined();
    },
  );
});

describe("물음 뒤의 답", () => {
  it("단추 글이면 코드가 정한다", () => {
    expect(easyAdStep(AD_CHOICE_IMAGE, 물은뒤)).toBe("image");
    expect(easyAdStep(AD_CHOICE_SPECS, 물은뒤)).toBe("specs");
  });

  it("말로 한 답에 규격 낱말이 있으면 코드가 규격 안내로 정한다", () => {
    expect(easyAdStep("사이즈별로요", 물은뒤)).toBe("specs");
    expect(easyAdStep("네이버랑 카카오요", 물은뒤)).toBe("specs");
  });

  it("규격 낱말이 없는 말은 판단 모델에 맡긴다", () => {
    expect(easyAdStep("광고 이미지로요", 물은뒤)).toBeUndefined();
  });

  /**
   * 최종 리뷰(2026-10-06): 물음 바로 뒤의 답에 「광고 소재」가 또 들어 있으면 같은 물음이
   * 또 떴다(「광고 소재로 쓸 이미지요」). 물음 뒤에는 다시 묻지 않는다.
   */
  it("물음 바로 뒤에는 「광고 소재」가 있어도 다시 묻지 않는다", () => {
    expect(easyAdStep("광고 소재로 쓸 이미지요", 물은뒤)).not.toBe("ask");
    expect(easyAdStep("광고 소재로 쓸 이미지요", 물은뒤)).toBeUndefined();
    expect(easyAdStep("광고 소재 만들어줘", 물은뒤)).toBeUndefined();
  });

  it("물음 뒤라도 「광고 소재 말고」면 규격 낱말이 있어도 판단 모델에 맡긴다", () => {
    expect(easyAdStep("광고 소재 말고 그냥 네이버 블로그용 이미지", 물은뒤)).toBeUndefined();
  });

  it("물음이 마지막 줄이 아니면 단추 글도 보통 말이다 — 모드로 붙잡지 않는다", () => {
    expect(easyAdStep(AD_CHOICE_IMAGE, [...물은뒤, 줄("user", "딴 얘기"), 줄("assistant", "네")])).toBeUndefined();
  });

  it("물음을 부른 말을 찾는다", () => {
    expect(adQuestionOrigin(물은뒤)).toBe("겨울 화장품 광고 소재 만들어줘");
    expect(adQuestionOrigin([줄("user", "안녕")])).toBeUndefined();
  });
});

describe("광고 이미지 지시 = 물음 앞의 말 + 답", () => {
  it("단추만 눌렀으면 처음 말 그대로", () => {
    expect(adImageInstruction(물은뒤, AD_CHOICE_IMAGE, true)).toBe("겨울 화장품 광고 소재 만들어줘");
  });

  it("말로 답했으면 처음 말에 답을 잇는다 — 「광고 이미지로요」 한마디로 그리지 않는다", () => {
    expect(adImageInstruction(물은뒤, "광고 이미지로요, 세로로", true))
      .toBe("겨울 화장품 광고 소재 만들어줘\n광고 이미지로요, 세로로");
  });

  /**
   * 최종 리뷰(2026-10-06): 물음에 답하지 않고 다른 것을 시켰는데 처음 말을 붙이면
   * 「겨울 화장품 광고 소재 + 고양이 포스터」가 그려진다. 답일 때만 잇는다.
   */
  it("답이 아니면(answered 가 거짓) 잇지 않는다 — 이번 말 그대로 쓴다", () => {
    expect(adImageInstruction(물은뒤, "그건 됐고 고양이 포스터 만들어줘", false)).toBeUndefined();
  });

  it("답이라는 표시는 note 의 answer 다", () => {
    expect(AD_ANSWER_NOTE).toBe("answer");
  });

  it("물음 뒤가 아니면 없다", () => {
    expect(adImageInstruction([줄("user", "안녕")], "포스터", true)).toBeUndefined();
  });

  it("물음 앞에 사용자 말이 없으면 없다 — 답만으로 그린다", () => {
    expect(adImageInstruction([줄("assistant", AD_QUESTION)], "광고 이미지로요", true)).toBeUndefined();
  });
});

describe("물음 줄 · 안내 줄 알아보기", () => {
  it("물음은 글이 똑같은 도우미 줄", () => {
    expect(isAdQuestion(줄("assistant", AD_QUESTION))).toBe(true);
    expect(isAdQuestion(줄("user", AD_QUESTION))).toBe(false);
    expect(isAdQuestion(줄("assistant", `${AD_QUESTION} `))).toBe(false);
  });

  it("안내 줄은 표시로 알아보고, 보일 때는 표시를 뗀다", () => {
    const 안내 = 줄("assistant", adGuideBody("「광고소재」에서 합니다."));
    expect(isAdGuide(안내)).toBe(true);
    expect(visibleBody(안내)).toBe("「광고소재」에서 합니다.");
    expect(isAdGuide(줄("user", adGuideBody("x")))).toBe(false);
    expect(visibleBody(줄("assistant", "그냥 답"))).toBe("그냥 답");
  });

  it("묻는 글은 사용자가 정한 그대로다", () => {
    expect(AD_QUESTION).toBe("광고 이미지를 만들고 싶으세요, 아니면 네이버·구글·카카오 규격별로 이미지를 베리에이션하고 싶으세요?");
  });
});
```

`apps/web/app/easy/__tests__/ad-guide.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AD_STEPS } from "../../ad/steps";
import { AD_SPECS } from "../../../lib/ad/specs";
import { AD_FACTS, AD_GUIDE_FALLBACK, adGuidePrompt, readAdGuide } from "../ad-guide";

/**
 * **규격별 안내는 LLM 이 우리 기능의 사실로 쓴다**(2026-10-06 설계 A5). 사실은 코드가 넣는다.
 *
 * 최종 리뷰(2026-10-06): 처음 판은 단계 이름을 지어 적었고(「01 이미지 고르기」 — 화면은
 * 「01 그림 고르기」), 「크레딧이 들지 않습니다」라고 못 박았다. 투명 배경 규격은 배경을 지우는
 * 값이 든다(`lib/ad/cost.ts` · `api/ad/export/route.ts:176-183`). 단계 이름은 화면의 것을
 * 읽고, 값은 코드대로 적는다.
 */
const 투명규격 = AD_SPECS.filter((spec) => spec.format === "png-alpha");

describe("규격 안내 글", () => {
  it("단계 이름은 「광고소재」 화면의 것을 그대로 쓴다", () => {
    const prompt = adGuidePrompt({ prompt: "사이즈별로요", imageCount: 0 });
    expect(AD_STEPS.map((step) => step.label)).toEqual(["01 그림 고르기", "02 어디에 올릴까요", "03 확인하고 내려받기"]);
    for (const step of AD_STEPS) {
      expect(prompt).toContain(`「${step.label}」`);
      expect(AD_GUIDE_FALLBACK).toContain(`「${step.label}」`);
    }
    expect(prompt).not.toContain("01 이미지 고르기");
  });

  it("값은 코드대로 — 대부분 0, 투명 배경 규격만 1크레딧", () => {
    const 사실 = AD_FACTS.join("\n");
    expect(사실).toContain("대부분의 규격은");
    expect(사실).toContain("크레딧이 들지 않습니다");
    expect(사실).toContain("1크레딧");
    expect(투명규격.length).toBeGreaterThan(0);
    for (const spec of 투명규격) expect(사실).toContain(spec.label);
  });

  it("우리 기능의 한계와 받는 꼴을 사실로 넣고, 사용자의 말을 싣는다", () => {
    const prompt = adGuidePrompt({ prompt: "사이즈별로요", imageCount: 0 });
    for (const 사실 of ["ZIP", "1.2배까지만", "네이버 · 구글 · 카카오"]) expect(prompt).toContain(사실);
    expect(prompt).toContain("사이즈별로요");
  });

  it("만든 이미지가 있으면 그것을 골라 가라고, 없으면 여기서 먼저 만들라고 시킨다", () => {
    expect(adGuidePrompt({ prompt: "x", imageCount: 2 })).toContain("만든 이미지가 2장 있습니다");
    expect(adGuidePrompt({ prompt: "x", imageCount: 0 })).toContain("여기서 광고 이미지를 먼저 만들어 가져가도 된다");
  });

  it("모델이 빈 글을 주면 코드가 쓴 안내로 대신한다", () => {
    expect(readAdGuide({ text: "  " })).toBe(AD_GUIDE_FALLBACK);
    expect(readAdGuide(null)).toBe(AD_GUIDE_FALLBACK);
    expect(readAdGuide({ text: " 안내 " })).toBe("안내");
  });

  it("대신하는 안내도 같은 사실을 말한다", () => {
    for (const 사실 of ["「광고소재」", "크레딧이 들지 않습니다", "1크레딧", "1.2배"]) {
      expect(AD_GUIDE_FALLBACK).toContain(사실);
    }
    for (const spec of 투명규격) expect(AD_GUIDE_FALLBACK).toContain(spec.label);
  });
});
```

`apps/web/app/easy/__tests__/chat-wants.test.ts` 를 고친다:
- import 를 `import { easyAvailableWants, easyChatPrompt, readEasyDecision } from "../chat";` 로 바꾸고, `import { AD_QUESTION, adGuideBody } from "../ad-ask";` 를 더한다(`easyCapabilityLines` import 는 Task 1 에서 이미 있다)
- `모든갈래` 끝에 `"ad_specs"` 를 더한다
- 「만든 것이 없으면 고치기 갈래가 아예 없다」의 기대값을 `["image", "cardnews", "either", "talk", "detail_page", "ad_specs"]` 로, 「원고가 있으면…」의 두 기대값 끝에도 각각 `"ad_specs"` 를 더한다
- 파일 끝에 더한다:

```ts
describe("광고 규격 갈래 (A5)", () => {
  const 없음 = { hasDraft: false, made: false, madeImage: false };

  it("늘 열려 있다 — 「광고 소재」 낱말이 없어도 여러 규격을 말하면 고를 수 있다", () => {
    expect(easyAvailableWants(없음)).toContain("ad_specs");
    expect(갈래줄이있나(easyChatPrompt([], "구글 배너 사이즈별로 다"), "ad_specs")).toBe(true);
  });

  it("「광고 소재 말고」면 선택지와 안내에서 뺀다", () => {
    expect(easyAvailableWants({ ...없음, adNegated: true })).not.toContain("ad_specs");
    const prompt = easyChatPrompt([], "광고 소재 말고 그냥 이미지", 0, false, false, false, { adNegated: true });
    expect(prompt).not.toContain("ad_specs");
  });

  it("바로 앞이 광고 물음이면 그 답으로 읽으라고 알린다", () => {
    const 물은뒤 = [
      { id: "u", role: "user" as const, body: "광고 소재 만들어줘" },
      { id: "q", role: "assistant" as const, body: AD_QUESTION },
    ];
    expect(easyChatPrompt(물은뒤, "사이즈별로요")).toContain("바로 앞에서");
    expect(easyChatPrompt([], "사이즈별로요")).not.toContain("바로 앞에서");
  });

  /** 최종 리뷰(2026-10-06): 답일 때만 처음 말을 잇는다. 답인지는 모델이 이미 있는 `note` 칸에 적는다. */
  it("물음의 답이면 note 에 answer 를 적으라고 알린다", () => {
    const 물은뒤 = [
      { id: "u", role: "user" as const, body: "광고 소재 만들어줘" },
      { id: "q", role: "assistant" as const, body: AD_QUESTION },
    ];
    expect(easyChatPrompt(물은뒤, "광고 이미지로요")).toContain("`note` 에 `answer`");
    expect(easyChatPrompt([], "광고 이미지로요")).not.toContain("`note` 에 `answer`");
  });

  it("만들어 달라는 말은 ad_specs 라고 하는 일 줄에도 적고, 「광고 소재 말고」면 뺀다 (A4)", () => {
    expect(easyCapabilityLines(easyAvailableWants(없음)).join("\n")).toContain("**만들어 달라는** 말은 ad_specs 입니다.");
    expect(easyCapabilityLines(easyAvailableWants({ ...없음, adNegated: true })).join("\n")).not.toContain("ad_specs");
  });

  it("안내 줄의 표시는 모델에게 안 보낸다", () => {
    const prompt = easyChatPrompt([{ id: "g", role: "assistant", body: adGuideBody("광고소재에서 합니다") }], "고마워");
    expect(prompt).toContain("도우미: 광고소재에서 합니다");
    expect(prompt).not.toContain("ad-guide:");
  });

  it("판단 결과로 ad_specs 를 받는다", () => {
    expect(readEasyDecision({ wants: "ad_specs", reply: "" }).wants).toBe("ad_specs");
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/ad-ask.test.ts app/easy/__tests__/ad-guide.test.ts app/easy/__tests__/chat-wants.test.ts`
Expected: FAIL — `Cannot find module '../ad-ask'` / `'../ad-guide'`

- [ ] **Step 3: `ad-ask.ts` 를 만든다**

`apps/web/app/easy/ad-ask.ts`:

```ts
import type { EasyMessage } from "./turn";

/**
 * **「광고 소재」라는 말이 나오면 먼저 묻는다**(2026-10-06 설계 A5, 사용자 결정 두 번).
 *
 * 「광고 소재」는 두 뜻이다 — 광고에 쓸 이미지 한 장을 만들어 달라는 것과, 만든 이미지를
 * 포털 규격별로 여러 장 뽑아 달라는 것. 뒤의 것은 「쉽게」가 아니라 「광고소재」(`/ad`)가
 * 한다. 그래서 낱말이 나오면 **코드가** 묻는다 — 모델에 맡기면 규칙이 매번 지켜지지 않는다.
 *
 * 규격 낱말이 같이 있으면 묻지 않는다(사용자: 「이런 정확한 키워드를 말할 경우에는 굳이
 * 안 물어도 됩니다」). 「광고 소재 말고 ○○」처럼 부정하면 코드는 끼어들지 않는다.
 *
 * **물음 줄 · 안내 줄은 대화에 남는다.** 물음 줄은 글이 `AD_QUESTION` 과 똑같은 도우미 줄,
 * 안내 줄은 글이 `ad-guide:` 로 시작하는 도우미 줄이다. 표에 칸을 더하지 않는다 —
 * `row-image.ts` 의 `edit-request:` 와 같은 방식이다.
 */

/** 묻는 말. 사용자가 정한 문장 그대로다. */
export const AD_QUESTION =
  "광고 이미지를 만들고 싶으세요, 아니면 네이버·구글·카카오 규격별로 이미지를 베리에이션하고 싶으세요?";
/** 물음 줄의 두 단추. 누르면 이 글이 사용자 말로 간다. */
export const AD_CHOICE_IMAGE = "광고 이미지 만들기";
export const AD_CHOICE_SPECS = "규격별로 베리에이션";
/** 「광고소재」 화면. */
export const AD_HREF = "/ad";
/**
 * 판단 모델이 「이번 말은 광고 물음의 답이다」라고 표시하는 값. 이미 꼭 받는 `note` 칸에
 * 적는다(이미지 길은 `note` 를 안 쓴다). 틀에 칸을 더하지 않는다 — 최종 리뷰 2026-10-06.
 */
export const AD_ANSWER_NOTE = "answer";

const 광고낱말 = /광고\s?소재/;
const 규격낱말 = ["규격별", "사이즈별", "리사이징", "리사이즈", "베리에이션", "네이버", "구글", "카카오"];
const 부정 = /광고\s?소재\s*(?:은|는|이|가|을|를|도)?\s*(?:말고|빼고|없이|아니)/;
const 안내머리 = "ad-guide:";

type Row = Pick<EasyMessage, "role" | "body">;

/** 코드가 정한 광고 갈래. `ask` 는 묻기, `specs` 는 규격 안내, `image` 는 광고 이미지 만들기. */
export type EasyAdStep = "ask" | "specs" | "image";

export function isAdQuestion(message: Row): boolean {
  return message.role === "assistant" && message.body === AD_QUESTION;
}

/** 「광고 소재 말고 ○○」처럼 그 낱말을 부정했나. */
export function hasAdNegation(prompt: string): boolean {
  return 부정.test(prompt);
}

/**
 * 마지막 줄이 광고 물음이면 **그 물음을 부른 사용자 말**. 물음 앞에 사용자 말이 없으면
 * 빈 글, 물음 뒤가 아니면 `undefined`.
 */
export function adQuestionOrigin(rows: readonly Row[]): string | undefined {
  const last = rows[rows.length - 1];
  if (!last || !isAdQuestion(last)) return undefined;
  const before = rows[rows.length - 2];
  return before?.role === "user" ? before.body : "";
}

/** 규격 낱말이 있나. */
function 규격을말했나(prompt: string): boolean {
  return 규격낱말.some((word) => prompt.includes(word));
}

/**
 * 이번 말에서 코드가 정하는 광고 갈래. 정할 것이 없으면 `undefined` — 판단 모델이 가른다.
 *
 * **물음 바로 뒤에는 다시 묻지 않는다**(최종 리뷰 2026-10-06). 단추 글이면 그 갈래, 규격
 * 낱말이 있으면(「사이즈별로요」) 규격 안내, 아니면 판단 모델이 앞의 물음을 보고 가른다
 * (`chat-facts.ts` 의 물음 뒤 안내). 답에 「광고 소재」가 또 들어 있어도(「광고 소재로 쓸
 * 이미지요」) 같은 물음을 또 띄우지 않는다 — 그러면 대화가 거기서 맴돈다.
 */
export function easyAdStep(prompt: string, rows: readonly Row[]): EasyAdStep | undefined {
  if (adQuestionOrigin(rows) !== undefined) {
    if (prompt === AD_CHOICE_IMAGE) return "image";
    if (prompt === AD_CHOICE_SPECS) return "specs";
    return !hasAdNegation(prompt) && 규격을말했나(prompt) ? "specs" : undefined;
  }
  if (!광고낱말.test(prompt) || hasAdNegation(prompt)) return undefined;
  return 규격을말했나(prompt) ? "specs" : "ask";
}

/**
 * 광고 물음에 답해 만드는 이미지의 지시 — **물음 앞의 말 + 답.** 단추만 눌렀으면 물음 앞의
 * 말 그대로다. 「광고 이미지로요」 한마디로 그리면 처음 말의 내용이 사라진다.
 *
 * **답일 때만 잇는다**(`answered`, 최종 리뷰 2026-10-06). 라우트가 정한다 — 「광고 이미지
 * 만들기」 단추를 눌렀거나 판단 모델이 `note` 에 `AD_ANSWER_NOTE` 를 적었을 때다. 물음에
 * 답하지 않고 「그건 됐고 고양이 포스터 만들어줘」라고 했는데 처음 말을 붙이면 엉뚱한 것을 그린다.
 * 답이 아니거나, 물음 뒤가 아니거나, 물음 앞의 말이 없으면 `undefined` — 이번 말 그대로 쓴다.
 */
export function adImageInstruction(rows: readonly Row[], prompt: string, answered: boolean): string | undefined {
  if (!answered) return undefined;
  const origin = adQuestionOrigin(rows);
  if (!origin) return undefined;
  return prompt === AD_CHOICE_IMAGE ? origin : `${origin}\n${prompt}`;
}

/** 안내 줄에 남길 글. 화면이 이 표시를 보고 「광고소재 열기」를 단다. */
export function adGuideBody(text: string): string {
  return `${안내머리}${text}`;
}

export function isAdGuide(message: Row): boolean {
  return message.role === "assistant" && message.body.startsWith(안내머리);
}

/** 보일 글(화면 · 모델 모두). 안내 줄이면 표시를 뗀다. */
export function visibleBody(message: Row): string {
  return isAdGuide(message) ? message.body.slice(안내머리.length) : message.body;
}
```

- [ ] **Step 4: `ad-guide.ts` 를 만든다**

`apps/web/app/easy/ad-guide.ts`:

```ts
import { AD_STEPS } from "../ad/steps";
import { AD_SPECS } from "../../lib/ad/specs";

/**
 * **규격별 이미지 안내**(2026-10-06 설계 A5).
 *
 * 글은 LLM 이 쓰되, **안내할 사실은 코드가 넣는다.** 모델에게 맡기면 없는 기능이나 숫자를
 * 지어낸다. 사실의 출처(최종 리뷰 2026-10-06 — 처음 판은 단계 이름을 지어 적고 「크레딧이
 * 들지 않습니다」라고 못 박았다):
 *
 *   단계 이름   `app/ad/steps.ts` 의 `AD_STEPS[].label` 을 **읽는다.** 글자로 박지 않는다 —
 *               화면 이름이 바뀌면 안내도 같이 바뀐다
 *   값          `lib/ad/cost.ts` · `api/ad/export/route.ts:176-183`. 자르기 · 줄이기만이면 0.
 *               투명 배경 규격(`AD_SPECS` 의 `format: "png-alpha"`, 「조립」)을 하나라도 고르면
 *               배경 제거를 한 번 불러 `creditUnits(0.003)` = 내려받기 한 번에 1크레딧
 *   한계        `lib/ad/export.ts` 의 1.2배
 *   받는 꼴     ZIP 한 묶음(`app/ad/ad-export-client.tsx` 의 `광고규격-N개.zip`)
 */
const 단계 = AD_STEPS.map((step) => `「${step.label}」`);
const 포털이름: Record<string, string> = { naver: "네이버", google: "구글", kakao: "카카오" };
/** 배경을 지워 조립하는 규격. 이것만 값이 든다. */
const 투명규격 = AD_SPECS
  .filter((spec) => spec.format === "png-alpha")
  .map((spec) => `${포털이름[spec.portal] ?? spec.portal} ${spec.label}`)
  .join(" · ");

export const AD_FACTS = [
  "「광고소재」 화면에서 합니다. 단계는 셋이고, 이름은 화면에 보이는 그대로입니다.",
  `  ${단계[0]} — 이미 만든 이미지 가운데 한 장을 고릅니다. 새로 그리지 않습니다.`,
  `  ${단계[1]} — 올릴 포털(네이버 · 구글 · 카카오)과 규격을 고릅니다.`,
  `  ${단계[2]} — 규격마다 뽑힌 이미지를 눈으로 확인하고 ZIP 한 묶음으로 내려받습니다.`,
  "대부분의 규격은 고른 이미지를 자르고 줄이기만 해서 크레딧이 들지 않습니다.",
  `투명 배경 규격(${투명규격})을 고르면 배경을 지우는 일이 한 번 들어가 내려받기 한 번에 1크레딧이 듭니다.`,
  "원본이 작으면 1.2배까지만 늘립니다. 그래서 원본보다 많이 큰 규격은 뽑지 못할 수 있습니다.",
];

/** 모델이 빈 글을 주거나 실패할 때 대신 남기는 안내. 같은 사실을 코드가 쓴다. */
export const AD_GUIDE_FALLBACK = [
  "네이버 · 구글 · 카카오 규격별 이미지는 「광고소재」에서 만듭니다.",
  `${단계.join(" → ")} 순서이고, 대부분의 규격은 고른 이미지를 자르고 줄이기만 해서 크레딧이 들지 않습니다.`,
  `투명 배경 규격(${투명규격})을 고르면 내려받기 한 번에 1크레딧이 듭니다.`,
  "원본이 작으면 1.2배까지만 늘려 뽑지 못하는 규격이 생길 수 있습니다. 아래 「광고소재 열기」 단추로 바로 열 수 있습니다.",
].join(" ");

/** 안내를 쓰게 할 글. */
export function adGuidePrompt(input: { prompt: string; imageCount: number }): string {
  return [
    "당신은 이미지를 만들어 주는 도우미입니다. 한국어로 답합니다.",
    "사용자가 이미지를 **네이버 · 구글 · 카카오 광고 규격별로** 뽑고 싶어 합니다.",
    "이 대화에서는 그 일을 하지 않고, 아래 기능으로 안내합니다.",
    "",
    "── 안내할 사실 (이것만 말하세요. 없는 기능 · 숫자를 지어내지 마세요) ──",
    ...AD_FACTS,
    input.imageCount > 0
      ? `이 대화에서 만든 이미지가 ${input.imageCount}장 있습니다. 그 이미지를 01 에서 골라 가면 된다고 알려 주세요.`
      : "이 대화에는 아직 만든 이미지가 없습니다. 여기서 광고 이미지를 먼저 만들어 가져가도 된다고 알려 주세요.",
    "",
    "세 문장에서 다섯 문장으로 쓰세요. 「그림」이라 하지 말고 「이미지」라고 쓰세요.",
    `단, 단계 이름은 화면 이름이라 「」 안의 글자를 그대로 쓰세요(${단계[0]} 처럼 화면 이름에 든 낱말도 바꾸지 않습니다).`,
    "값은 위 두 줄 그대로 말하세요 — 「늘 무료」라고 하지 마세요.",
    "끝에 「아래 「광고소재 열기」 단추로 바로 열 수 있습니다.」를 붙이세요.",
    "",
    "── 사용자의 마지막 말 ──",
    input.prompt,
  ].join("\n");
}

/** 돌아온 안내를 읽는다. 비었으면 코드가 쓴 안내로 대신한다 — 빈 줄을 남기지 않는다. */
export function readAdGuide(raw: unknown): string {
  const text = (raw as { text?: unknown } | null)?.text;
  return typeof text === "string" && text.trim() ? text.trim().slice(0, 1200) : AD_GUIDE_FALLBACK;
}
```

- [ ] **Step 5: `chat-facts.ts` 에 광고 줄을 더한다**

(a) `import type { EasyWant } from "./chat";` 아래에 `import { AD_ANSWER_NOTE, AD_QUESTION } from "./ad-ask";` 를 더한다

(b) `easyCapabilityLines` 의 상세페이지 줄 다음에 광고 줄을 넣는다(A4 · 최종 리뷰) — 아래를 찾아:

```ts
    ...(wants.includes("detail_page") ? ["상세페이지를 **만들어 달라는** 말은 detail_page 입니다."] : []),
```

이렇게 바꾼다:

```ts
    ...(wants.includes("detail_page") ? ["상세페이지를 **만들어 달라는** 말은 detail_page 입니다."] : []),
    // 「광고 소재 말고」면 목록에서 빠진다 — 그때는 이름도 안 적는다(A1).
    ...(wants.includes("ad_specs")
      ? ["광고 규격별로 여러 장(리사이징 · 베리에이션)을 **만들어 달라는** 말은 ad_specs 입니다."]
      : []),
```

(c) 파일 끝에 더한다:

```ts
/** 광고 규격 갈래 안내(A5). 갈래 목록에 `ad_specs` 가 있을 때만 싣는다. */
export function easyAdWantLines(): string[] {
  return [
    "  ad_specs  이미 만든 이미지를 **네이버 · 구글 · 카카오 같은 광고 규격별로 여러 장** 뽑아 달라는 것입니다.",
    "            「규격별로」 · 「사이즈별로」 · 「리사이징」 · 「베리에이션」 · 「구글 배너 사이즈별로 다」.",
    "            광고 이미지를 **새로 만들어** 달라는 말은 image 입니다.",
  ];
}

/**
 * 바로 앞 도우미 줄이 광고 물음일 때(A5). 단추 대신 말로 답해도(「사이즈별로요」) 앞의
 * 물음을 알고 가르게 한다. 답이 아니면 그 말대로 — 대화를 붙잡지 않는다.
 */
export function easyAdAnswerLines(): string[] {
  return [
    `**도우미가 바로 앞에서 「${AD_QUESTION}」라고 물었습니다.** 사용자의 마지막 말은 그 답일 수 있습니다.`,
    "광고 이미지를 바라면 image, 규격별 · 사이즈별 · 리사이징 · 베리에이션을 바라면 ad_specs 입니다.",
    // 답일 때만 서버가 물음 앞의 처음 말을 잇는다(최종 리뷰 2026-10-06). 이미지 길은 note 를 안 쓴다.
    `마지막 말이 그 물음의 답이면 \`note\` 에 \`${AD_ANSWER_NOTE}\` 라고 적으세요. 답이 아니면 \`note\` 는 빈 글로 두세요.`,
    "물음에 답하지 않고 다른 것을 말했으면(「그건 됐고 고양이 포스터 만들어줘」) 그 말대로 가르세요.",
    "",
  ];
}
```

- [ ] **Step 6: `chat.ts` 에 `ad_specs` 를 더한다**

(a) import 두 줄을 바꾼다 — `import { easyCapabilityLines, easyFirstPhotoLines } from "./chat-facts";` 를:

```ts
import { adQuestionOrigin, visibleBody } from "./ad-ask";
import { easyAdAnswerLines, easyAdWantLines, easyCapabilityLines, easyFirstPhotoLines } from "./chat-facts";
```

(b) 갈래 타입 — 아래를 찾아:

```ts
    // 이 대화에서 마지막으로 만든 이미지 한 장을 고친다(2026-10-06).
    | "image_edit";
```

이렇게 바꾼다:

```ts
    // 이 대화에서 마지막으로 만든 이미지 한 장을 고친다(2026-10-06).
    | "image_edit"
    // 포털 광고 규격별로 여러 장 — 여기서 안 만들고 「광고소재」로 안내한다(2026-10-06 설계 A5).
    | "ad_specs";
```

(c) `EasyPromptOptions` 에 칸을 더한다 — `  retry?: boolean;\n}` 를 찾아:

```ts
  retry?: boolean;
  /** A5: 「광고 소재 말고 ○○」라고 했다. 규격 안내를 선택지에서 뺀다. */
  adNegated?: boolean;
}
```

(d) `EasyChoices` 에 칸을 더한다 — `  madeImage: boolean;\n}` 를 찾아:

```ts
  madeImage: boolean;
  /** A5: 「광고 소재 말고 ○○」라고 했나. 그러면 규격 안내를 고를 수 없다. */
  adNegated?: boolean;
}
```

(e) `easyAvailableWants` 의 `    "talk", "detail_page",\n  ];` 를 찾아:

```ts
    "talk", "detail_page",
    ...(choices.adNegated ? [] : (["ad_specs"] as const)),
  ];
```

(f) 함수 머리의 `  const 갈래 = easyAvailableWants({ hasDraft, made, madeImage });` 를 `  const 갈래 = easyAvailableWants({ hasDraft, made, madeImage, adNegated: options.adNegated });` 로

(g) 지난 대화 줄 — `        : message.body.slice(0, 한줄최대);` 를 `        : visibleBody(message).slice(0, 한줄최대);` 로(안내 줄의 표시를 모델에 안 보낸다)

(h) 상세페이지 갈래 줄 다음 — 아래를 찾아:

```ts
    "               상세페이지에 대해 **묻는 말**(「상세페이지 문구 좀 봐줘」)은 talk 입니다.",
    "",
```

이렇게 바꾼다:

```ts
    "               상세페이지에 대해 **묻는 말**(「상세페이지 문구 좀 봐줘」)은 talk 입니다.",
    ...(갈래.includes("ad_specs") ? easyAdWantLines() : []),
    "",
```

(i) `    "\`detail_page\` 도 \`reply\` 는 빈 글로 두세요. 안내는 따로 드립니다.",` 다음 줄(`    "",`) **앞**에 한 줄을 넣는다 — 즉 아래를 찾아:

```ts
    "`detail_page` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다.",
    "",
    // 갈래 이름은 쓸 수 있는 것만 적는다(A1) — 같은 목록을 넘긴다.
    ...easyCapabilityLines(갈래),
```

이렇게 바꾼다:

```ts
    "`detail_page` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다.",
    ...(갈래.includes("ad_specs") ? ["`ad_specs` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다."] : []),
    "",
    // 갈래 이름은 쓸 수 있는 것만 적는다(A1) — 같은 목록을 넘긴다.
    ...easyCapabilityLines(갈래),
```

(j) `    지난말.length ? "── 지난 대화 ──" : "── 첫 말입니다 ──",` **앞**에 넣는다:

```ts
    ...(갈래.includes("ad_specs") && adQuestionOrigin(history) !== undefined ? easyAdAnswerLines() : []),
```

(k) `아는갈래` — `  "image_edit",\n]);` 를 `  "image_edit", "ad_specs",\n]);` 로

- [ ] **Step 7: 제공자에 안내 쓰기 틀을 더한다**

`apps/web/lib/easy/chat-provider.ts`:

(a) `const EASY_CARD_EDIT_SPEC: StructuredSpec = {` **앞**에 넣는다:

```ts
/**
 * **규격별 이미지 안내 글**(2026-10-06 설계 A5). 사실은 `app/easy/ad-guide.ts` 가 프롬프트에
 * 넣고, 모델은 그것으로 글만 쓴다. `text` 하나다.
 */
const EASY_AD_GUIDE_SPEC: StructuredSpec = {
  name: "easy_ad_guide",
  description: "규격별 광고 이미지를 「광고소재」에서 만드는 법을 주어진 사실만으로 안내한다.",
  schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
};

```

(b) Edit 하나를 `replace_all: true` 로: `editCard: 부른다(EASY_CARD_EDIT_SPEC) };` → `editCard: 부른다(EASY_CARD_EDIT_SPEC), writeAdGuide: 부른다(EASY_AD_GUIDE_SPEC) };`

- [ ] **Step 8: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__ lib/easy/__tests__ app/api/easy/__tests__`
Expected: PASS (실패 0)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 9: 커밋**

```bash
git add apps/web/app/easy/ad-ask.ts apps/web/app/easy/ad-guide.ts apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/lib/easy/chat-provider.ts apps/web/app/easy/__tests__/ad-ask.test.ts apps/web/app/easy/__tests__/ad-guide.test.ts apps/web/app/easy/__tests__/chat-wants.test.ts
git commit -m "fix(easy): 「광고 소재」 낱말 찾기 · 물음 · 규격 안내 글을 값으로 정한다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 광고 물음 · 안내를 대화에 잇는다 (A5 — 서버)

**Files:**
- Create: `apps/web/lib/easy/ad-turn.ts`
- Modify: `apps/web/lib/easy/judge.ts` (`adStep`, 부정)
- Modify: `apps/web/lib/easy/image-edit-turn.ts` (`countEasyImages`)
- Modify: `apps/web/app/api/easy/generate/route.ts` (광고 갈래 · 안내 · 지시)
- Test: `apps/web/app/api/easy/__tests__/generate-ad.test.ts` (새)
- Test (더함): `apps/web/lib/easy/__tests__/judge.test.ts`, `apps/web/lib/easy/__tests__/image-edit-turn.test.ts` (포스터 모의가 작업 여럿을 알게 고친다)

**Interfaces:**
- Consumes: Task 2 의 `골랐나`(`kindPicked`), Task 3 의 `easyAdStep`, `EasyAdStep`, `hasAdNegation`, `adImageInstruction(rows, prompt, answered)`, `AD_ANSWER_NOTE`, `AD_QUESTION`, `adGuideBody`, `adGuidePrompt`, `readAdGuide`, `AD_GUIDE_FALLBACK`, 제공자 `writeAdGuide`
- Produces:
  - `ad-turn.ts`: `adQuestionTurn(ctx: AdTurnContext): Promise<Response>`, `adGuideTurn(ctx: AdTurnContext & { guide: string }): Promise<Response>`, `writeAdGuide(write: (prompt: string) => Promise<unknown>, input: { prompt: string; imageCount: number }): Promise<string>` (**던지지 않는다** — 글 모델이 실패하면 `AD_GUIDE_FALLBACK`) — `AdTurnContext = { store; conversation: { title?: string | null }; conversationId: string; prompt: string; textModel: string }`
  - `image-edit-turn.ts`: `countEasyImages(userId: string, rows: readonly Row[]): Promise<number>` — 이 대화의 그림 줄이 가리키는 **서로 다른 작업 가운데 포스터 작업 수**(카드뉴스 · 지운 작업은 안 센다). 규격 안내 턴에서만 부른다
  - `judge.ts`: `EasyJudgeInput.adStep?: EasyAdStep`
  - 라우트: 지시 = `adImageInstruction(지난줄, prompt, 광고 === "image" || decision.note === AD_ANSWER_NOTE) ?? prompt`. 단추로 갈래를 골랐으면(`골랐나`) 규격 안내를 쓰지 않는다
  - 라우트 응답: 물음 · 안내 모두 `{ ok: true, talked: true, message, textModel }` (화면이 지금 받는 꼴 그대로)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/easy/__tests__/judge.test.ts` 끝에 더한다:

```ts
describe("코드가 정한 광고 갈래 (A5)", () => {
  it("단추로 고른 광고 이미지 · 규격 안내는 글 모델에 안 묻는다", async () => {
    const decide = 판단기();
    expect((await 묻는다(decide, { adStep: "image" })).wants).toBe("image");
    expect((await 묻는다(decide, { adStep: "specs" })).wants).toBe("ad_specs");
    expect(decide).not.toHaveBeenCalled();
  });

  it("「광고 소재 말고」면 규격 안내를 선택지에서 뺀다", async () => {
    const decide = 판단기(결정({ wants: "image" }));
    await 묻는다(decide, { prompt: "광고 소재 말고 그냥 이미지 만들어줘" });
    expect(decide.mock.calls[0]![1]).not.toContain("ad_specs");
  });
});
```

`apps/web/lib/easy/__tests__/image-edit-turn.test.ts`:
- `let images: Image[];` 아래에 `let 다른작업 = new Set<string>();` 를 더한다
- 포스터 모의의 `get` 을 아래로 바꾼다(지금 시험들은 `다른작업` 이 비어 있어 그대로다):

```ts
    projects: {
      get: async (id: string) => (project && project.id === id
        ? project
        : 다른작업.has(id) ? { id, ratio: "1:1", data: {} } : undefined),
    },
```

- `const { imageEditTurn, lastEasyImage } = await import("../image-edit-turn");` 를 `const { countEasyImages, imageEditTurn, lastEasyImage } = await import("../image-edit-turn");` 로
- `beforeEach` 안 `남긴줄.length = 0;` 다음에 `다른작업 = new Set();` 를 더한다
- 파일 끝에 더한다:

```ts
describe("이 대화에서 만든 이미지 수 (규격 안내, 최종 리뷰 2026-10-06)", () => {
  /**
   * 그림 줄을 그대로 세면 고친 줄 · 카드뉴스 줄 · 지운 작업까지 센다 — 「만든 이미지가 5장
   * 있습니다」라고 안내하고 「광고소재」에서는 2장만 보인다.
   */
  it("서로 다른 포스터 작업만 센다 — 고친 줄 · 카드뉴스 · 지운 작업은 안 센다", async () => {
    다른작업 = new Set(["p2"]);
    const rows = [
      줄.user("카페 포스터 만들어줘"),
      줄.image("p1"),
      줄.image("p1", editRowBody("r2")), // 같은 작업을 고친 줄
      줄.image("p2"),
      줄.image("card-9"), // 카드뉴스 작업 — 포스터 저장소에 없다
      줄.image("gone"), // 지운 작업
      줄.user("규격별로"),
    ];
    expect(await countEasyImages("me", rows)).toBe(2);
  });

  it("그림 줄이 없으면 0", async () => {
    expect(await countEasyImages("me", [줄.user("안녕")])).toBe(0);
  });
});
```

`apps/web/app/api/easy/__tests__/generate-ad.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「쉽게」 문 — 「광고 소재」 물음 · 규격 안내**(2026-10-06 설계 A5).
 *
 * 물음 · 안내는 도우미 줄로 남고, 다음 말은 늘 처음부터 판단한다(모드로 붙잡지 않는다).
 */
vi.mock("server-only", () => ({}));

let 판단: unknown;
let 지난줄: Array<{ id: string; role: string; body: string; workId: string | null }>;
const 남긴줄: Array<{ role: string; body?: string }> = [];
const 부른라우트: Array<{ step: string; body: Record<string, unknown> }> = [];
const 센것 = { reserve: 0, decide: 0, guide: 0 };
let 받은갈래: string[] = [];
let 받은안내글 = "";
let 안내실패 = false;
// 포스터 저장소에 있는 작업(이미지 수 세기 · 마지막 이미지 찾기가 본다).
let 포스터작업 = new Set<string>();

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  reserveAiUsage: async () => {
    센것.reserve += 1;
    return { ok: true as const, userId: "me-1", requestId: "decide", usage: undefined };
  },
  settleAiUsage: async () => ({ remaining: 0 }),
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => 지난줄,
    appendMessage: async (row: { role: string; body?: string }) => {
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async (_prompt: string, wants: readonly string[]) => {
      센것.decide += 1;
      받은갈래 = [...wants];
      return 판단;
    },
    decideRoles: async () => ({ photos: [], conflicting: false }),
    writeAdGuide: async (prompt: string) => {
      센것.guide += 1;
      받은안내글 = prompt;
      if (안내실패) throw new Error("upstream timeout");
      return { text: "「광고소재」에서 01 → 02 → 03 순서로 합니다." };
    },
  }),
}));
vi.mock("../../../../lib/easy/cardnews-steps", async (original) => ({
  ...(await original<object>()),
  lastCardnewsProject: async () => null,
}));
vi.mock("../../../../lib/easy/read-photos", () => ({ readEasyPhotos: async () => ({}) }));
vi.mock("../../../../lib/poster/references", () => ({ posterReferencesByIds: async () => [] }));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async (id: string) => (포스터작업.has(id) ? { id, ratio: "1:1", data: {} } : undefined) },
    images: { byProject: async () => [] },
  }),
}));
const 라우트 = (step: string) => ({
  POST: async (req: Request) => {
    부른라우트.push({ step, body: await req.json() });
    return step === "project"
      ? Response.json({ ok: true, project: { id: "p1" } })
      : Response.json({ ok: true, submission: { requestRowId: "r1", falRequestId: "f1", endpoint: "e" } });
  },
});
vi.mock("../../poster/projects/route", () => 라우트("project"));
vi.mock("../../poster/projects/[id]/plan/route", () => 라우트("plan"));
vi.mock("../../poster/projects/[id]/generate/route", () => 라우트("generate"));

const { POST } = await import("../generate/route");
const { AD_ANSWER_NOTE, AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_QUESTION, adGuideBody } = await import("../../../easy/ad-ask");
const { AD_GUIDE_FALLBACK } = await import("../../../easy/ad-guide");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

const 처음말 = "겨울 화장품 광고 소재 만들어줘";
const 물은뒤 = () => [
  { id: "u1", role: "user", body: 처음말, workId: null },
  { id: "q1", role: "assistant", body: AD_QUESTION, workId: null },
];
const 안내글 = "「광고소재」에서 01 → 02 → 03 순서로 합니다.";

beforeEach(() => {
  판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "" };
  지난줄 = [];
  남긴줄.length = 0; 부른라우트.length = 0;
  센것.reserve = 0; 센것.decide = 0; 센것.guide = 0;
  받은갈래 = [];
  받은안내글 = ""; 안내실패 = false; 포스터작업 = new Set();
});

describe("「광고 소재」 물음", () => {
  it("규격 낱말이 없으면 글 모델 없이 묻고, 말과 물음을 대화에 남긴다", async () => {
    const { json } = await 보낸다({ prompt: 처음말 });
    expect(json).toMatchObject({ ok: true, talked: true, message: { body: AD_QUESTION } });
    expect(남긴줄.map((row) => [row.role, row.body])).toEqual([["user", 처음말], ["assistant", AD_QUESTION]]);
    expect(센것).toEqual({ reserve: 0, decide: 0, guide: 0 });
    expect(부른라우트).toEqual([]);
  });

  it("규격 낱말이 있으면 묻지 않고 안내를 남긴다 — 판단 모델은 안 부르고, 예약 안에서 안내를 쓴다", async () => {
    const { json } = await 보낸다({ prompt: "광고 소재 네이버 카카오 규격별로" });
    expect(json.talked).toBe(true);
    expect(센것).toEqual({ reserve: 1, decide: 0, guide: 1 });
    expect(남긴줄[1]).toMatchObject({ role: "assistant", body: adGuideBody(안내글) });
    expect(부른라우트).toEqual([]);
  });
});

describe("물음 뒤의 답", () => {
  beforeEach(() => { 지난줄 = 물은뒤(); });

  it("「광고 이미지 만들기」 단추면 처음 말로 이미지를 만든다", async () => {
    await 보낸다({ prompt: AD_CHOICE_IMAGE, ratio: "1:1" });
    expect(센것.decide).toBe(0);
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
    expect(부른라우트[0]!.body.instruction).toBe(처음말);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: AD_CHOICE_IMAGE });
  });

  it("말로 「광고 이미지로요」라고 답하고 모델이 답이라고 표시하면 처음 말 + 답으로 만든다", async () => {
    판단 = { ...(판단 as object), note: AD_ANSWER_NOTE };
    await 보낸다({ prompt: "광고 이미지로요", ratio: "1:1" });
    expect(센것.decide).toBe(1);
    expect(부른라우트[0]!.body.instruction).toBe(`${처음말}\n광고 이미지로요`);
  });

  /**
   * 최종 리뷰(2026-10-06): 물음에 답하지 않고 다른 것을 시켰는데 처음 말을 붙이면
   * 「겨울 화장품 광고 소재 + 고양이 포스터」를 그린다.
   */
  it("물음 뒤라도 답이 아닌 이미지 주문이면 그 말 그대로 만든다", async () => {
    const 말 = "그건 됐고 고양이 포스터 만들어줘";
    await 보낸다({ prompt: 말, ratio: "1:1" });
    expect(센것.decide).toBe(1);
    expect(부른라우트[0]!.body.instruction).toBe(말);
  });

  it("「규격별로 베리에이션」 단추면 안내를 남긴다", async () => {
    await 보낸다({ prompt: AD_CHOICE_SPECS });
    expect(센것.guide).toBe(1);
    expect(부른라우트).toEqual([]);
  });

  it("말로 「사이즈별로요」라고 하면 코드가 규격 안내로 정한다 — 판단 모델을 안 부른다", async () => {
    await 보낸다({ prompt: "사이즈별로요" });
    expect(센것).toEqual({ reserve: 1, decide: 0, guide: 1 });
    expect(남긴줄[1]).toMatchObject({ role: "assistant", body: adGuideBody(안내글) });
  });

  it("규격 낱말 없이 말로 답해 모델이 ad_specs 를 고르면 안내를 남긴다", async () => {
    판단 = { ...(판단 as object), wants: "ad_specs" };
    await 보낸다({ prompt: "여러 크기로 뽑고 싶어요" });
    expect(센것.decide).toBe(1);
    expect(센것.guide).toBe(1);
  });

  it("물음 뒤 답에 「광고 소재」가 또 있어도 다시 묻지 않는다", async () => {
    await 보낸다({ prompt: "광고 소재로 쓸 이미지요", ratio: "1:1" });
    expect(남긴줄.map((row) => row.body)).not.toContain(AD_QUESTION);
    expect(센것.decide).toBe(1);
  });

  it("물음에 답하지 않고 다른 말을 하면 그 말을 따른다 — 붙잡지 않는다", async () => {
    판단 = { ...(판단 as object), wants: "talk", reply: "네, 안녕하세요" };
    const { json } = await 보낸다({ prompt: "그건 됐고 안녕" });
    expect(json.message.body).toBe("네, 안녕하세요");
  });
});

describe("규격 안내 글 (최종 리뷰 2026-10-06)", () => {
  it("이 대화에서 만든 이미지 수는 서로 다른 포스터 작업만 센다", async () => {
    포스터작업 = new Set(["p1", "p2"]);
    지난줄 = [
      { id: "i1", role: "image", body: "", workId: "p1" },
      { id: "i2", role: "image", body: "", workId: "p1" },
      { id: "i3", role: "image", body: "", workId: "p2" },
      { id: "i4", role: "image", body: "", workId: "card-1" },
      ...물은뒤(),
    ];
    await 보낸다({ prompt: AD_CHOICE_SPECS });
    expect(받은안내글).toContain("만든 이미지가 2장 있습니다");
  });

  it("안내 글 모델이 실패해도 대화는 멈추지 않는다 — 코드가 쓴 안내를 남긴다", async () => {
    안내실패 = true;
    const { status, json } = await 보낸다({ prompt: "광고 소재 네이버 카카오 규격별로" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, talked: true });
    expect(남긴줄.map((row) => [row.role, row.body])).toEqual([
      ["user", "광고 소재 네이버 카카오 규격별로"], ["assistant", adGuideBody(AD_GUIDE_FALLBACK)],
    ]);
  });

  it("갈래를 단추로 골랐으면 판단이 ad_specs 여도 안내를 안 쓰고 그 갈래로 만든다", async () => {
    판단 = { ...(판단 as object), wants: "ad_specs" };
    await 보낸다({ prompt: "겨울 화장품 배너", kind: "image", kindPicked: true, ratio: "1:1" });
    expect(센것.guide).toBe(0);
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });
});

describe("대화는 끊기지 않는다", () => {
  it("안내 뒤에 「이미지 더 만들 거야」면 그 말로 이미지를 만든다", async () => {
    지난줄 = [
      ...물은뒤(),
      { id: "u2", role: "user", body: AD_CHOICE_SPECS, workId: null },
      { id: "g1", role: "assistant", body: adGuideBody("안내"), workId: null },
    ];
    const 말 = "아니야, 이미지 더 만들 거야. 겨울 화장품 이미지 만들어줘";
    await 보낸다({ prompt: 말, ratio: "1:1" });
    expect(부른라우트[0]!.body.instruction).toBe(말);
  });

  it("「광고 소재 말고」면 묻지 않고, 규격 안내를 선택지에서 뺀 채 판단 모델에 묻는다", async () => {
    await 보낸다({ prompt: "광고 소재 말고 그냥 이미지 만들어줘", ratio: "1:1" });
    expect(센것.decide).toBe(1);
    expect(받은갈래).not.toContain("ad_specs");
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });

  it("「광고 소재」 없이 여러 규격을 말해 모델이 ad_specs 를 고르면 안내한다", async () => {
    판단 = { ...(판단 as object), wants: "ad_specs" };
    await 보낸다({ prompt: "구글 배너 사이즈별로 다" });
    expect(받은갈래).toContain("ad_specs");
    expect(센것.guide).toBe(1);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/api/easy/__tests__/generate-ad.test.ts lib/easy/__tests__/judge.test.ts lib/easy/__tests__/image-edit-turn.test.ts`
Expected: FAIL — 물음 시험은 `센것.decide` 1(지금은 판단 모델이 돈다), `adStep` 시험은 `decide` 가 불림, `countEasyImages is not a function`

- [ ] **Step 3: `judge.ts` 가 광고 갈래를 받게 한다**

(a) import 에 더한다:

```ts
import { hasAdNegation, type EasyAdStep } from "../../app/easy/ad-ask";
```

(b) `EasyJudgeInput` 의 `  choices: EasyChoices;\n}` 를 찾아:

```ts
  choices: EasyChoices;
  /** 코드가 낱말로 정한 광고 갈래(설계 A5). `image` · `specs` 면 글 모델에 묻지 않는다. */
  adStep?: EasyAdStep;
}
```

(c) 함수 본문 첫 세 줄을 찾아:

```ts
export async function judgeEasyTurn(input: EasyJudgeInput): Promise<EasyDecision> {
  const { hasDraft, made, madeImage } = input.choices;
  const wants = easyAvailableWants(input.choices);
  const ask = async (retry: boolean) => readEasyDecision(
    await input.decide(
      easyChatPrompt(input.history, input.prompt, input.attachmentCount, hasDraft, made, madeImage, { retry }),
```

이렇게 바꾼다:

```ts
export async function judgeEasyTurn(input: EasyJudgeInput): Promise<EasyDecision> {
  if (input.adStep === "image") return { wants: "image", reply: "" };
  if (input.adStep === "specs") return { wants: "ad_specs", reply: "" };
  // 「광고 소재 말고 ○○」면 규격 안내를 선택지에서 뺀다 — 부정은 그 뒤 요청을 따른다(A5).
  const choices = { ...input.choices, adNegated: hasAdNegation(input.prompt) };
  const { hasDraft, made, madeImage, adNegated } = choices;
  const wants = easyAvailableWants(choices);
  const ask = async (retry: boolean) => readEasyDecision(
    await input.decide(
      easyChatPrompt(input.history, input.prompt, input.attachmentCount, hasDraft, made, madeImage, { retry, adNegated }),
```

- [ ] **Step 4: `ad-turn.ts` 를 만든다**

`apps/web/lib/easy/ad-turn.ts`:

```ts
import { AD_QUESTION, adGuideBody } from "../../app/easy/ad-ask";
import { AD_GUIDE_FALLBACK, adGuidePrompt, readAdGuide } from "../../app/easy/ad-guide";
import { easyTitle } from "../../app/easy/title";
import type { easyStoreForUser } from "./store";

/**
 * **광고 물음 · 규격 안내 턴**(2026-10-06 설계 A5).
 *
 * 둘 다 사용자 말 + 도우미 줄을 남기고 끝낸다. **남겨야** 단추 대신 말로 답해도, 새로고침
 * 뒤에 답해도 앞 물음을 알고 판단한다. 화면은 지금 「말로 답한 턴」을 받는 꼴
 * (`talked` · `message`)을 그대로 받는다.
 */
export interface AdTurnContext {
  store: ReturnType<typeof easyStoreForUser>;
  conversation: { title?: string | null };
  conversationId: string;
  prompt: string;
  textModel: string;
}

async function 말과답을남긴다(ctx: AdTurnContext, body: string): Promise<Response> {
  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.prompt });
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));
  const saved = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "assistant", body });
  return Response.json({ ok: true, talked: true, message: saved, textModel: ctx.textModel });
}

/** 「광고 이미지? 규격별?」을 묻는다. 글 모델을 안 부른다 — 값도 예약도 없다. */
export function adQuestionTurn(ctx: AdTurnContext): Promise<Response> {
  return 말과답을남긴다(ctx, AD_QUESTION);
}

/** 규격 안내를 남긴다. 화면은 이 줄에 「광고소재 열기」를 단다. */
export function adGuideTurn(ctx: AdTurnContext & { guide: string }): Promise<Response> {
  return 말과답을남긴다(ctx, adGuideBody(ctx.guide));
}

/**
 * 안내 글을 쓴다. 사실은 `ad-guide.ts` 가 넣고, 비면 코드가 쓴 안내로 대신한다.
 *
 * **던지지 않는다**(최종 리뷰 2026-10-06). 글 모델이 실패해도(시간 초과 · 업체 오류) 같은
 * 사실을 코드가 쓴 안내(`AD_GUIDE_FALLBACK`)로 남긴다 — 안내 글 하나 때문에 대화가 오류로
 * 멈추면 사용자는 「광고소재」로 가는 길도 못 받는다.
 */
export async function writeAdGuide(
  write: (prompt: string) => Promise<unknown>,
  input: { prompt: string; imageCount: number },
): Promise<string> {
  try {
    return readAdGuide(await write(adGuidePrompt(input)));
  } catch {
    return AD_GUIDE_FALLBACK;
  }
}
```

`apps/web/lib/easy/image-edit-turn.ts` — `/** 고칠 그림이 아직 없을 때. 만드는 중이거나 만들지 못한 그림이다. */` **앞**에 넣는다(`lastEasyImage` 와 같은 길로 찾는다):

```ts
/**
 * 이 대화에서 만든 **이미지 수**(규격 안내용, 최종 리뷰 2026-10-06).
 *
 * 그림 줄을 그대로 세면 고친 줄(같은 작업) · 카드뉴스 줄 · 지운 작업까지 센다 — 안내가
 * 「만든 이미지가 5장」이라 하고 「광고소재」에서는 2장만 보인다. 그림 줄이 가리키는 **서로
 * 다른 작업** 가운데 **포스터 작업**만 센다. 카드뉴스 작업 · 지운 작업은 포스터 저장소에 없다.
 *
 * 작업마다 한 번씩 읽으므로 **규격 안내 턴에서만** 부른다.
 */
export async function countEasyImages(userId: string, rows: readonly Row[]): Promise<number> {
  const ids = [...new Set(rows.flatMap((one) => (one.role === "image" && one.workId ? [one.workId] : [])))];
  if (!ids.length) return 0;
  const projects = posterStoresForUser(userId).projects;
  const found = await Promise.all(ids.map((id) => projects.get(id).catch(() => undefined)));
  return found.filter(Boolean).length;
}

```

- [ ] **Step 5: 라우트에 잇는다**

`apps/web/app/api/easy/generate/route.ts`:

(a) `import { imageEditTurn, lastEasyImage } from "../../../../lib/easy/image-edit-turn";` 를 `import { countEasyImages, imageEditTurn, lastEasyImage } from "../../../../lib/easy/image-edit-turn";` 로 바꾸고, 그 아래에 더한다:

```ts
import { AD_ANSWER_NOTE, adImageInstruction, easyAdStep } from "../../../easy/ad-ask";
import { adGuideTurn, adQuestionTurn, writeAdGuide } from "../../../../lib/easy/ad-turn";
```

(b) `    const 고칠그림 = await lastEasyImage(auth.member.userId, 지난줄);` 바로 **아래**에 넣는다:

```ts

    /*
     * **「광고 소재」는 코드가 먼저 본다**(2026-10-06 설계 A5). 물을 때는 글 모델을 안
     * 부르고 물음 줄만 남긴다 — 값도 예약도 없다. 단추 글 · 규격 낱말이면 아래 판단이
     * 글 모델 없이 갈래를 정한다.
     */
    const 광고 = easyAdStep(prompt, 지난줄);
    if (광고 === "ask") return await adQuestionTurn({ store, conversation, conversationId, prompt, textModel });
```

(c) `    let decision: EasyDecision;` 를 아래 두 줄로 바꾼다:

```ts
    let decision: EasyDecision;
    let 광고안내 = "";
```

(d) 아래를 찾아:

```ts
        choices: { hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: Boolean(고칠그림) },
        // 골랐으면 판단의 갈래는 버려진다 — 빈 talk 재질문을 안 한다(A3 · 최종 리뷰).
        kindPicked: 골랐나,
      });
    } catch (error) {
```

이렇게 바꾼다:

```ts
        choices: { hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: Boolean(고칠그림) },
        // 골랐으면 판단의 갈래는 버려진다 — 빈 talk 재질문을 안 한다(A3 · 최종 리뷰).
        kindPicked: 골랐나,
        adStep: 광고,
      });
      /*
       * **규격 안내는 글 모델이 우리 기능의 사실로 쓴다**(A5). 판정과 같은 예약 안에서
       * 부른다 — 크레딧이 없거나 운영자가 멈췄으면 여기도 막힌다.
       *
       * **갈래를 단추로 골랐으면 쓰지 않는다**(최종 리뷰) — 아래에서 고른 갈래가 이겨 이 글은
       * 버려진다. 이미지 수는 서로 다른 포스터 작업만 센다(`countEasyImages` — 고친 줄 ·
       * 카드뉴스 · 지운 작업을 세면 「광고소재」에서 고를 수 있는 수와 어긋난다). 글 모델이
       * 실패해도 `writeAdGuide` 가 코드가 쓴 안내로 대신한다 — 대화가 멈추지 않는다.
       */
      if (decision.wants === "ad_specs" && !골랐나) {
        광고안내 = await writeAdGuide((text) => provider.writeAdGuide(text), {
          prompt,
          imageCount: await countEasyImages(auth.member.userId, 지난줄),
        });
      }
    } catch (error) {
```

(e) `    if (wants === "either") return Response.json({ ok: true, kindAsk: true, textModel });` 바로 **아래**에 넣는다:

```ts
    // 규격별 이미지는 여기서 안 만든다. 「광고소재」 안내를 남기고 끝낸다(A5).
    if (wants === "ad_specs") {
      return await adGuideTurn({ store, conversation, conversationId, prompt, textModel, guide: 광고안내 });
    }
```

(f) `    const 사진판단 = wants === "image" && 붙인수` 바로 **위**에 넣는다:

```ts
    /*
     * **광고 물음에 답해 만드는 이미지는 물음 앞의 말로 그린다**(A5). 단추만 눌렀으면 그
     * 말 그대로, 말로 답했으면 그 말 + 답. 물음 뒤가 아니면 이번 말 그대로다.
     *
     * **답일 때만 잇는다**(최종 리뷰 2026-10-06) — 「광고 이미지 만들기」 단추를 눌렀거나,
     * 판단 모델이 이 말을 물음의 답이라고 `note` 에 표시했을 때. 물음 뒤에 「그건 됐고 고양이
     * 포스터 만들어줘」라고 했는데 처음 말을 붙이면 엉뚱한 것을 그린다.
     */
    const 답했나 = 광고 === "image" || decision.note === AD_ANSWER_NOTE;
    const 지시 = adImageInstruction(지난줄, prompt, 답했나) ?? prompt;

```

(g) 지시를 쓴다(각각 Edit 한 번, 셋 다 라우트 안에서 한 번씩만 나온다):
- `          words: prompt,` → `          words: 지시,`
- `      title: easyTitle(prompt) || "Easy",` → `      title: easyTitle(지시) || "Easy",`
- `      instruction: prompt,` → `      instruction: 지시,`

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__ lib/easy/__tests__ app/api/easy/__tests__`
Expected: PASS (실패 0) — `generate-wiring.test.ts` 의 「사용자 말을 먼저 남긴다」 · 「물어볼 때는 대화에 아무것도 안 쌓는다」 · 「네 단계에 서로 다른 이름」도 그대로 초록이어야 한다(라우트에 `role: "user"` · `relay(` 를 새로 안 썼다)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/easy/ad-turn.ts apps/web/lib/easy/judge.ts apps/web/lib/easy/image-edit-turn.ts apps/web/app/api/easy/generate/route.ts apps/web/app/api/easy/__tests__/generate-ad.test.ts apps/web/lib/easy/__tests__/judge.test.ts apps/web/lib/easy/__tests__/image-edit-turn.test.ts
git commit -m "fix(easy): 「광고 소재」면 먼저 묻고 규격별은 광고소재 안내를 대화에 남긴다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 실패도 대화에 남기고, 그림 줄에 받을 정보를 적는다 (B4 · B3 서버)

**Files:**
- Create: `apps/web/lib/easy/failure-row.ts`
- Modify: `apps/web/app/easy/row-image.ts:24-51` (`;job=`)
- Modify: `apps/web/app/api/easy/generate/route.ts:124, 381, 396-397`
- Modify: `apps/web/lib/easy/image-edit-turn.ts:2, 122`
- Modify: `apps/web/app/easy/ad-ask.ts` (`adQuestionOrigin` 이 「단추 답 + 실패 줄」을 건너뛴다)
- Test: `apps/web/lib/easy/__tests__/failure-row.test.ts` (새)
- Test (더함): `apps/web/app/easy/__tests__/row-image.test.ts`, `apps/web/app/easy/__tests__/ad-ask.test.ts`, `apps/web/app/api/easy/__tests__/generate-route.test.ts`, `apps/web/app/api/easy/__tests__/generate-image-edit.test.ts`
- Test (고침): `apps/web/lib/easy/__tests__/image-edit-turn.test.ts:115-119, 166-169`

**Interfaces:**
- Consumes: Task 3 의 `adQuestionOrigin`, `AD_CHOICE_IMAGE`, `AD_CHOICE_SPECS` (라우트 구조는 Task 2 · 4 뒤의 것)
- Produces:
  - `failure-row.ts`: `failureRowBody(message: string): string` (= `"요청을 처리하지 못했습니다. " + message`), `FAILED_TURN_GENERIC = "잠시 뒤 다시 시도해 주세요."` (우리가 알고 낸 실패가 아닐 때 남길 말 — 줄 글은 「요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.」), `isFailureRowBody(body: string): boolean`, `trackUserTurn<S extends { appendMessage: EasyStore["appendMessage"] }>(store: S): { store: S; leaveFailure(conversationId: string, message: string): Promise<void> }` — `failure-row.ts` 는 **화면도 읽는다**(`ad-ask.ts` 가 `isFailureRowBody` 를 쓴다). 그래서 `relay.ts`(→ `node:crypto`)를 import 하지 않는다. `EasyStepError` 가림은 라우트가 한다
  - 라우트 catch: `leaveFailure(conversationId, error instanceof EasyStepError ? error.message : FAILED_TURN_GENERIC)` — 내부 오류 글(DB 표 이름 등)을 대화에 남기지 않는다
  - `row-image.ts`: `interface EasyRowJob { requestRowId: string; falRequestId: string; endpoint: string }`, `withRowJob(body: string, job: Partial<EasyRowJob> | undefined): string`, `rowJobOf(body: string | null | undefined): EasyRowJob | undefined`
  - 그림 줄 글: 처음 만든 줄 = `withRowJob("", submission)`, 고친 줄 = `withRowJob(editRowBody(id, added), submission)`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/easy/__tests__/failure-row.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EasyStore } from "../store";
import { FAILED_TURN_GENERIC, failureRowBody, isFailureRowBody, trackUserTurn } from "../failure-row";

/**
 * **실패도 대화에 남긴다**(2026-10-06 설계 B4). 실패한 턴은 새로고침하면 내 말만 남고
 * 답이 없었다 — 화면에만 오류를 보였기 때문이다.
 */
type Input = Parameters<EasyStore["appendMessage"]>[0];

function 저장소(실패 = false) {
  const 남긴줄: Input[] = [];
  return {
    남긴줄,
    store: {
      appendMessage: async (input: Input) => {
        if (실패 && input.role === "assistant") throw new Error("저장 실패");
        남긴줄.push(input);
        return {
          id: `m${남긴줄.length}`, conversationId: input.conversationId, role: input.role,
          body: input.body ?? "", workId: null, createdAt: "",
        };
      },
    },
  };
}

describe("실패 안내 줄 (B4)", () => {
  it("사용자 말을 남긴 뒤 실패하면 실패 안내를 도우미 줄로 남긴다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await 지킴.leaveFailure("c1", "기획이 막혔습니다.");
    expect(남긴줄.map((row) => [row.role, row.body])).toEqual([
      ["user", "포스터"], ["assistant", failureRowBody("기획이 막혔습니다.")],
    ]);
  });

  it("말을 남기기 전에 실패했으면 아무것도 안 남긴다 — 묻거나 멈춘 턴과 같다", async () => {
    const { 남긴줄, store } = 저장소();
    await trackUserTurn(store).leaveFailure("c1", "x");
    expect(남긴줄).toEqual([]);
  });

  it("답 줄을 이미 남겼으면 또 남기지 않는다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await 지킴.store.appendMessage({ conversationId: "c1", role: "image", workId: "p1" });
    await 지킴.leaveFailure("c1", "x");
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "image"]);
  });

  it("두 번 불러도 한 번만 남긴다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await 지킴.leaveFailure("c1", "x");
    await 지킴.leaveFailure("c1", "x");
    expect(남긴줄).toHaveLength(2);
  });

  it("실패 안내를 못 남겨도 던지지 않는다 — 원래 오류를 덮지 않는다", async () => {
    const { store } = 저장소(true);
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await expect(지킴.leaveFailure("c1", "x")).resolves.toBeUndefined();
  });

  it("안내 글은 사용자가 본 말을 그대로 담는다", () => {
    expect(failureRowBody("크레딧이 없습니다.")).toBe("요청을 처리하지 못했습니다. 크레딧이 없습니다.");
  });

  /** 최종 리뷰(2026-10-06): 우리가 알고 낸 실패가 아니면 내부 글 대신 이 말을 남긴다. */
  it("일반 실패 문장", () => {
    expect(failureRowBody(FAILED_TURN_GENERIC)).toBe("요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  });

  it("실패 안내 줄을 글로 알아본다", () => {
    expect(isFailureRowBody(failureRowBody("x"))).toBe(true);
    expect(isFailureRowBody("요청을 처리했습니다.")).toBe(false);
  });
});
```

`apps/web/app/easy/__tests__/row-image.test.ts` — import 에 `rowJobOf, withRowJob` 를 더하고(`editAddedOf, editRequestOf, editRowBody, editTargetImage, editedRequestIds, pickCollectedImage, pickRowImage, rowJobOf, withRowJob,`), 파일 끝에 더한다:

```ts
describe("받을 정보 (B3)", () => {
  const 일감 = { requestRowId: "r1", falRequestId: "f-1", endpoint: "fal-ai/gpt-image-2/edit" };

  it("처음 만든 줄 · 고친 줄 모두 끝에 붙이고 다시 읽는다", () => {
    expect(rowJobOf(withRowJob("", 일감))).toEqual(일감);
    expect(rowJobOf(withRowJob(editRowBody("r2", ["logo"]), 일감))).toEqual(일감);
  });

  it("붙여도 고친 줄 표시는 그대로 읽힌다", () => {
    const body = withRowJob(editRowBody("r2", ["logo-1", "logo-2"]), 일감);
    expect(editRequestOf(body)).toBe("r2");
    expect(editAddedOf(body)).toEqual(["logo-1", "logo-2"]);
    expect(editRequestOf(withRowJob(editRowBody("r3"), 일감))).toBe("r3");
  });

  it("처음 만든 줄에 붙여도 고친 줄로 안 읽힌다 — 예전 고르기 규칙 그대로", () => {
    expect(editRequestOf(withRowJob("", 일감))).toBeUndefined();
    const images = [그림("a", "r1"), 그림("b", "r1", true)];
    expect(pickRowImage({ body: withRowJob("", 일감) }, images, new Set())?.id).toBe("b");
  });

  /** Review Focus 3 */
  it("주소에 쉼표 · 쌍반점 · 표시 글자가 있어도 서로 안 섞인다", () => {
    const 이상한 = { ...일감, endpoint: "fal-ai/x,y;added=z;job=w" };
    const body = withRowJob(editRowBody("r2"), 이상한);
    expect(rowJobOf(body)).toEqual(이상한);
    expect(editAddedOf(body)).toEqual([]);
    expect(editRequestOf(body)).toBe("r2");
  });

  it("셋 중 하나라도 없으면 붙이지 않는다 — 옛 응답", () => {
    expect(withRowJob("", { requestRowId: "r1" })).toBe("");
    expect(withRowJob("", undefined)).toBe("");
  });

  it("표시가 없거나 깨졌으면 없다", () => {
    expect(rowJobOf("")).toBeUndefined();
    expect(rowJobOf(editRowBody("r2"))).toBeUndefined();
    expect(rowJobOf(";job=a,b")).toBeUndefined();
    expect(rowJobOf(";job=%E0%A4%A,b,c")).toBeUndefined();
  });
});
```

`apps/web/app/api/easy/__tests__/generate-route.test.ts`:
- `let 역할판단실패: Error | null;` 아래에 `let 기획실패 = false;` · `let 기획던짐 = false;` 를 더한다
- 기획 라우트 모의를 아래로 바꾼다:

```ts
vi.mock("../../poster/projects/[id]/plan/route", () => ({
  POST: async (req: Request) => {
    부른라우트.push({ step: "plan", body: await req.json() });
    // 우리가 알고 낸 실패가 아닌 것 — 저장소 · DB 오류가 그대로 올라온 경우(최종 리뷰).
    if (기획던짐) throw new Error('relation "poster_projects" does not exist');
    return 기획실패
      ? Response.json({ ok: false, message: "기획이 막혔습니다." }, { status: 502 })
      : Response.json({ ok: true });
  },
}));
```

- `beforeEach` 안 `역할판단실패 = null;` 다음에 `기획실패 = false; 기획던짐 = false;` 를 더한다
- `const { DETAIL_PAGE_GUIDE } = ...` 아래에 더한다:

```ts
const { FAILED_TURN_GENERIC, failureRowBody } = await import("../../../../lib/easy/failure-row");
const { withRowJob } = await import("../../../easy/row-image");
```

- 파일 끝에 더한다:

```ts
describe("실패 줄 · 받을 정보 (2026-10-06 B4 · B3)", () => {
  it("말을 남긴 뒤 기획이 실패하면 실패 안내를 도우미 줄로 남긴다", async () => {
    기획실패 = true;
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    const { status } = await 보낸다({});
    expect(status).toBe(502);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(남긴줄[1]!.body).toBe(failureRowBody("기획이 막혔습니다."));
  });

  /**
   * 최종 리뷰(2026-10-06): 우리가 알고 낸 실패(`EasyStepError`)가 아니면 오류 글에 표 이름 ·
   * 칼럼 이름이 섞여 온다. 대화는 남고 다시 열면 보이므로 그 글을 남기지 않는다.
   */
  it("알고 낸 실패가 아니면 내부 글 대신 일반 문장을 남긴다", async () => {
    기획던짐 = true;
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    await 보낸다({});
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(남긴줄[1]!.body).toBe(failureRowBody(FAILED_TURN_GENERIC));
    expect(남긴줄[1]!.body).not.toContain("poster_projects");
  });

  it("그림 줄에 결과를 받을 정보를 남긴다 — 다시 열면 이어 받는다", async () => {
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    await 보낸다({});
    expect(남긴줄.at(-1)).toMatchObject({
      role: "image", body: withRowJob("", { requestRowId: "r", falRequestId: "f", endpoint: "e" }),
    });
  });
});
```

`apps/web/app/api/easy/__tests__/generate-image-edit.test.ts`:
- `let 받은갈래: string[] = [];` 아래에 `let 고치기실패 = false;` 를 더한다
- `const 라우트 = (step: string) => ({` 의 `POST` 첫 줄 다음(`부른라우트.push(...)` 다음)에 넣는다:

```ts
    if (step === "edit" && 고치기실패) return Response.json({ ok: false, message: "고치기가 막혔습니다." }, { status: 502 });
```

- `beforeEach` 안 `남긴줄.length = 0; 부른라우트.length = 0;` 다음에 `고치기실패 = false;` 를 더한다
- `const { NOTHING_TO_EDIT } = ...` 아래에 `const { failureRowBody } = await import("../../../../lib/easy/failure-row");` 를 더한다
- 파일 끝에 더한다:

```ts
describe("고치기가 실패하면 (2026-10-06 B4)", () => {
  it("말 뒤에 실패 안내를 남긴다", async () => {
    고치기실패 = true;
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "배경만 파랗게" });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(남긴줄[1]!.body).toBe(failureRowBody("고치기가 막혔습니다."));
  });
});
```

`apps/web/lib/easy/__tests__/image-edit-turn.test.ts` — import 에 `withRowJob` 를 더하고(`editRowBody` 를 들여오는 줄에), 두 기대값을 바꾼다:
- `      { conversationId: "c1", role: "image", workId: "p1", body: editRowBody("r2") },` → `      { conversationId: "c1", role: "image", workId: "p1", body: withRowJob(editRowBody("r2"), { requestRowId: "r2", falRequestId: "f2", endpoint: "e" }) },`
- `    expect(남긴줄.at(-1)).toMatchObject({ role: "image", body: editRowBody("r2", ["logo-1"]) });` → `    expect(남긴줄.at(-1)).toMatchObject({ role: "image", body: withRowJob(editRowBody("r2", ["logo-1"]), { requestRowId: "r2", falRequestId: "f2", endpoint: "e" }) });`

`apps/web/app/easy/__tests__/ad-ask.test.ts` — 맨 위 import 아래에 `import { FAILED_TURN_GENERIC, failureRowBody } from "../../../lib/easy/failure-row";` 를 더하고, 파일 끝에 더한다:

```ts
/**
 * **단추로 답했다가 실패한 뒤**(최종 리뷰 2026-10-06). 실패도 대화에 남으므로(B4) 물음 뒤에
 * 「단추 글 줄 + 실패 안내 줄」이 붙는다. 그대로면 물음이 마지막 줄이 아니라서, 다시 답해도
 * 앞 물음의 답으로 안 읽히고 처음 말도 사라진다.
 */
describe("단추로 답했다가 실패한 뒤", () => {
  const 실패뒤 = [...물은뒤, 줄("user", AD_CHOICE_IMAGE), 줄("assistant", failureRowBody(FAILED_TURN_GENERIC))];

  it("그 둘을 건너뛰고 물음을 부른 말을 찾는다", () => {
    expect(adQuestionOrigin(실패뒤)).toBe("겨울 화장품 광고 소재 만들어줘");
  });

  it("다시 답해도 앞 물음의 답으로 읽는다", () => {
    expect(easyAdStep(AD_CHOICE_IMAGE, 실패뒤)).toBe("image");
    expect(adImageInstruction(실패뒤, "광고 이미지로요", true)).toBe("겨울 화장품 광고 소재 만들어줘\n광고 이미지로요");
  });

  it("말로 한 답이 실패했으면 건너뛰지 않는다 — 단추 답만 그렇다", () => {
    expect(adQuestionOrigin([...물은뒤, 줄("user", "광고 이미지로요"), 줄("assistant", failureRowBody("x"))])).toBeUndefined();
  });

  it("실패 줄이 아닌 답 뒤면 건너뛰지 않는다", () => {
    expect(adQuestionOrigin([...물은뒤, 줄("user", AD_CHOICE_SPECS), 줄("assistant", adGuideBody("안내"))])).toBeUndefined();
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run lib/easy/__tests__/failure-row.test.ts app/easy/__tests__/row-image.test.ts app/easy/__tests__/ad-ask.test.ts app/api/easy/__tests__/generate-route.test.ts app/api/easy/__tests__/generate-image-edit.test.ts lib/easy/__tests__/image-edit-turn.test.ts`
Expected: FAIL — `Cannot find module '../failure-row'`, `withRowJob is not a function`, 실패 시험의 줄이 `["user"]`, 「단추로 답했다가 실패한 뒤」의 물음 찾기가 `undefined`

- [ ] **Step 3: `failure-row.ts` 를 만든다**

`apps/web/lib/easy/failure-row.ts`:

```ts
import type { EasyStore } from "./store";

/**
 * **실패도 대화에 남긴다**(2026-10-06 설계 B4).
 *
 * 사용자 말을 남긴 뒤 기획 · 생성 · 고치기 · 원고가 실패하면 화면에만 오류를 보였다.
 * 새로고침하면 내 말만 남고 답이 없어 「대화가 끊겼다」로 보였다.
 *
 * 저장소를 감싸 **마지막으로 남긴 줄이 사용자 말인지**만 지켜본다. 라우트의 `catch` 한
 * 곳에서 부르면 이미지 · 카드뉴스 원고 · 이미지 고치기 길이 모두 같은 규칙을 탄다.
 */
const 머리 = "요청을 처리하지 못했습니다. ";

/**
 * 우리가 알고 낸 실패(`EasyStepError`)가 **아닐 때** 남길 말(최종 리뷰 2026-10-06). 그런
 * 오류의 글에는 표 이름 · 칼럼 이름이 섞여 온다 — 대화는 남고 다시 열면 보인다. 가림은
 * 라우트가 한다: 이 파일은 화면도 읽어서(`ad-ask.ts`) `relay.ts`(→ `node:crypto`)를 못 들인다.
 */
export const FAILED_TURN_GENERIC = "잠시 뒤 다시 시도해 주세요.";

export function failureRowBody(message: string): string {
  return `${머리}${message}`;
}

/** 실패 안내 줄인가(글로 알아본다 — 표에 칸을 더하지 않는다). */
export function isFailureRowBody(body: string): boolean {
  return body.startsWith(머리);
}

type Append = EasyStore["appendMessage"];

export function trackUserTurn<S extends { appendMessage: Append }>(store: S): {
  store: S;
  leaveFailure(conversationId: string, message: string): Promise<void>;
} {
  let 답없는말 = false;
  const appendMessage: Append = async (input) => {
    const row = await store.appendMessage(input);
    답없는말 = input.role === "user";
    return row;
  };
  return {
    store: { ...store, appendMessage },
    async leaveFailure(conversationId, message) {
      if (!답없는말) return;
      답없는말 = false;
      try {
        await store.appendMessage({ conversationId, role: "assistant", body: failureRowBody(message) });
      } catch {
        // 삼킨다. 실패 안내 하나 때문에 원래 오류를 덮지 않는다.
      }
    },
  };
}
```

- [ ] **Step 4: `row-image.ts` 에 받을 정보를 더한다**

(a) `const 넣은사진머리 = ";added=";` 아래에 더한다:

```ts
/**
 * **받을 정보**(2026-10-06 설계 B3). 그림 줄 글 **끝**에 붙인다 — 고친 줄 표시 뒤다.
 * 다시 열 때 그림이 아직 없으면 이것으로 `status` 에 물어 이어 받는다. 칸마다
 * `encodeURIComponent` 로 감싸 쉼표 · 쌍반점이 섞이지 않는다.
 */
const 일감머리 = ";job=";

/** `status` 라우트가 그대로 받는 셋. */
export interface EasyRowJob {
  requestRowId: string;
  falRequestId: string;
  endpoint: string;
}

/** 받을 정보 앞부분(고친 줄 표시 · 빈 글). */
function 앞부분(body: string): string {
  const at = body.indexOf(일감머리);
  return at < 0 ? body : body.slice(0, at);
}

/** 줄 글 끝에 받을 정보를 붙인다. 셋 중 하나라도 없으면 붙이지 않는다(옛 응답). */
export function withRowJob(body: string, job: Partial<EasyRowJob> | undefined): string {
  const parts = [job?.requestRowId, job?.falRequestId, job?.endpoint];
  if (!parts.every((part): part is string => typeof part === "string" && part.length > 0)) return body;
  return `${body}${일감머리}${parts.map(encodeURIComponent).join(",")}`;
}

/** 줄 글의 받을 정보. 없거나 깨졌으면 비어 있다. */
export function rowJobOf(body: string | null | undefined): EasyRowJob | undefined {
  const at = body?.indexOf(일감머리) ?? -1;
  if (at < 0) return undefined;
  try {
    const parts = body!.slice(at + 일감머리.length).split(",").map((part) => decodeURIComponent(part));
    if (parts.length !== 3 || parts.some((part) => !part)) return undefined;
    const [requestRowId, falRequestId, endpoint] = parts as [string, string, string];
    return { requestRowId, falRequestId, endpoint };
  } catch {
    return undefined;
  }
}
```

(b) `editRequestOf` · `editAddedOf` 를 찾아(지금 39~51줄) 아래로 바꾼다 — 받을 정보 앞부분만 읽는다:

```ts
/** 고친 줄이면 그 요청 번호. 처음 만든 줄이면 비어 있다. */
export function editRequestOf(body: string | null | undefined): string | undefined {
  const core = 앞부분(body ?? "");
  if (!core.startsWith(고친줄머리)) return undefined;
  const id = core.slice(고친줄머리.length).split(넣은사진머리)[0]!.trim();
  return id || undefined;
}

/** 고친 줄이 넣은 사진. */
export function editAddedOf(body: string | null | undefined): string[] {
  if (!editRequestOf(body)) return [];
  const [, added = ""] = 앞부분(body!).split(넣은사진머리);
  return added.split(",").map((id) => id.trim()).filter(Boolean);
}
```

- [ ] **Step 5: 라우트 · 고치기 턴에 잇는다**

`apps/web/app/api/easy/generate/route.ts`:

(a) import 끝에 더한다:

```ts
import { FAILED_TURN_GENERIC, trackUserTurn } from "../../../../lib/easy/failure-row";
import { withRowJob } from "../../../easy/row-image";
```

(b) `  const store = easyStoreForUser(auth.member.userId);` 를 바꾼다:

```ts
  // 사용자 말 뒤에 답 없이 실패하면 실패 안내를 남길 수 있게 지켜본다(2026-10-06 설계 B4).
  const 지킴 = trackUserTurn(easyStoreForUser(auth.member.userId));
  const store = 지킴.store;
```

(c) `    await store.appendMessage({ conversationId, role: "image", workId: projectId });` 를 바꾼다:

```ts
    // 받을 정보를 함께 적는다 — 화면을 떠났다 다시 열어도 이어 받는다(2026-10-06 설계 B3).
    await store.appendMessage({ conversationId, role: "image", workId: projectId, body: withRowJob("", submitted.submission) });
```

(d) 아래를 찾아:

```ts
  } catch (error) {
    if (error instanceof EasyStepError) {
```

이렇게 바꾼다:

```ts
  } catch (error) {
    /*
     * 사용자 말을 남긴 뒤 실패했으면 그 안내도 대화에 남긴다(B4). 우리가 알고 낸 실패면
     * 화면이 보이는 말 그대로, 아니면 일반 문장 — 내부 오류 글(표 이름 등)은 대화에 남기지
     * 않는다(최종 리뷰 2026-10-06).
     */
    await 지킴.leaveFailure(conversationId, error instanceof EasyStepError ? error.message : FAILED_TURN_GENERIC);
    if (error instanceof EasyStepError) {
```

`apps/web/lib/easy/image-edit-turn.ts`:
- 2줄 `import { editAddedOf, editRowBody, editTargetImage } from "../../app/easy/row-image";` → `import { editAddedOf, editRowBody, editTargetImage, withRowJob } from "../../app/easy/row-image";`
- `    body: editRowBody(submitted.submission.requestRowId, added),` → `    body: withRowJob(editRowBody(submitted.submission.requestRowId, added), submitted.submission),`

`apps/web/app/easy/ad-ask.ts` — 단추로 답했다가 실패한 턴을 건너뛴다(최종 리뷰 2026-10-06):

(a) `import type { EasyMessage } from "./turn";` 아래에 `import { isFailureRowBody } from "../../lib/easy/failure-row";` 를 더한다(`failure-row.ts` 는 `import type` 밖에 없어 화면에 들여도 된다)

(b) `adQuestionOrigin` 을 찾아(Task 3 Step 3):

```ts
/**
 * 마지막 줄이 광고 물음이면 **그 물음을 부른 사용자 말**. 물음 앞에 사용자 말이 없으면
 * 빈 글, 물음 뒤가 아니면 `undefined`.
 */
export function adQuestionOrigin(rows: readonly Row[]): string | undefined {
  const last = rows[rows.length - 1];
  if (!last || !isAdQuestion(last)) return undefined;
  const before = rows[rows.length - 2];
  return before?.role === "user" ? before.body : "";
}
```

이렇게 바꾼다:

```ts
/**
 * 광고 물음이 있어야 할 자리. 보통은 마지막 줄이다.
 *
 * **단추로 답했다가 실패한 턴**(사용자 단추 글 줄 + 실패 안내 줄, 설계 B4)이 뒤에 붙었으면 그
 * 둘을 건너뛴다 — 다시 답해도 앞 물음의 답으로 읽고 처음 말도 잇는다. 말로 한 답이 실패한
 * 것은 건너뛰지 않는다(그 말이 답이었는지 코드는 모른다).
 */
function 물음자리(rows: readonly Row[]): number {
  const n = rows.length;
  const 답 = rows[n - 2];
  const 실패 = rows[n - 1];
  const 단추답실패 = n >= 3 && 실패?.role === "assistant" && isFailureRowBody(실패.body)
    && 답?.role === "user" && (답.body === AD_CHOICE_IMAGE || 답.body === AD_CHOICE_SPECS);
  return 단추답실패 ? n - 3 : n - 1;
}

/**
 * 광고 물음 바로 뒤면 **그 물음을 부른 사용자 말**. 물음 앞에 사용자 말이 없으면
 * 빈 글, 물음 뒤가 아니면 `undefined`.
 */
export function adQuestionOrigin(rows: readonly Row[]): string | undefined {
  const at = 물음자리(rows);
  const question = rows[at];
  if (!question || !isAdQuestion(question)) return undefined;
  const before = rows[at - 1];
  return before?.role === "user" ? before.body : "";
}
```

화면의 물음 단추는 지금처럼 **마지막 줄이 물음일 때만** 붙는다(Task 8) — 실패 뒤에는 단추 대신 말로(또는 같은 단추 글로) 답하면 이어진다.

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__ lib/easy/__tests__ app/api/easy/__tests__`
Expected: PASS (실패 0)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/easy/failure-row.ts apps/web/app/easy/row-image.ts apps/web/app/easy/ad-ask.ts apps/web/app/api/easy/generate/route.ts apps/web/lib/easy/image-edit-turn.ts apps/web/lib/easy/__tests__/failure-row.test.ts apps/web/app/easy/__tests__/row-image.test.ts apps/web/app/easy/__tests__/ad-ask.test.ts apps/web/app/api/easy/__tests__/generate-route.test.ts apps/web/app/api/easy/__tests__/generate-image-edit.test.ts apps/web/lib/easy/__tests__/image-edit-turn.test.ts
git commit -m "fix(easy): 실패도 대화에 남기고 그림 줄에 결과를 받을 정보를 적는다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 다시 열면 이어 받고, 0장이면 실패로 알린다 (B3 · B5 화면)

**Files:**
- Create: `apps/web/app/easy/collect.ts`, `apps/web/app/easy/use-resume-images.ts`, `apps/web/lib/easy/pending-requests.ts`
- Modify: `apps/web/app/easy/row-image.ts` (`rowJobRequestIds` · `pendingJobRowIds`)
- Modify: `apps/web/app/easy/_components/load.ts` (`pending` 을 함께 준다), `apps/web/app/easy/[id]/page.tsx:27-35` (`initialPending`)
- Modify: `apps/web/app/easy/_components/message.tsx:150-162, 239-241`
- Modify: `apps/web/app/easy/easy-client.tsx:17, 53-70, 85-94, 148, 408, 447-478, 506-515, 787`
- Test: `apps/web/app/easy/__tests__/collect.test.ts` (새), `apps/web/app/easy/__tests__/use-resume-images.test.tsx` (새), `apps/web/app/easy/__tests__/message-row.test.tsx` (새), `apps/web/lib/easy/__tests__/pending-requests.test.ts` (새)
- Test (고침 · 더함): `apps/web/app/easy/__tests__/row-image.test.ts` 「화면이 결과를 받을 때」, 「아직 안 받은 줄」

**먼저 확인한 것(최종 리뷰 2026-10-06) — 끝난 요청을 다시 물으면 안 된다.** `status` 라우트의 `collectPoster`(`lib/poster/flow.ts:142-193`)는 이미 받았는지 안 보고 fal 결과를 **또 저장하고**(`images.add`) 정산도 다시 부른다. 그래서 「그림 주소가 없다」만으로 이어 받으면, 끝났는데 주소가 없는 줄(0장으로 끝남 · 거절 · 그림이 지워짐)에서 그림이 두 벌 쌓이거나 정산이 또 돈다. **아직 안 끝난 요청의 줄만** 이어 받는다.
- **끝났다의 기준 = 요청 줄의 `costUsd`.** 만들 때는 `null` 이고(`supabase-store-core.ts` 의 `requestInsertRow` 에 칸이 없다, 로컬은 `costUsd: null`), 결과를 받을 때 `complete` 가 처음 채운다(0 이어도 숫자). 작업의 `status === "generating"` 은 쓰지 않는다 — 고치기 라우트(`api/poster/projects/[id]/edit/route.ts`)는 그것을 안 바꾸고, 한 작업에 요청이 여럿이며, 결과는 받았는데 정산만 남아도 `generating` 일 수 있다
- 요청 줄을 하나씩 읽는 길이 저장소 인터페이스(`packages/poster-core` 의 `PosterRequestStore`)에 없다. `packages/**` 는 0줄이므로 **새 읽기 함수를 `lib/easy/pending-requests.ts` 에 둔다**: 운영은 회원 세션으로 `poster_generation_requests` 의 `id,cost_usd` 만 읽고(RLS `members read own poster requests`, `supabase/migrations/202608310004_poster.sql:83`), 로컬은 파일 저장소의 `posterRequests` 를 같은 주인 조건으로 읽는다. 못 읽으면 빈 목록 — 이어 받지 않는다(또 저장 · 또 정산보다 「만들고 있습니다」가 덜 나쁘다)
- **그림 한 장만 지우는 길은 없다.** 포스터 그림을 지우는 라우트는 작업째 지우는 `DELETE /api/poster/projects/[id]` 뿐이고(`PosterImageStore` 에 지우기가 없다, `api/library` 의 `DELETE` 는 라이브러리 항목이다), 작업을 지우면 `markDeletedWork` 가 그 줄을 안내 줄로 바꿔 이어 받기 대상에서 빠진다. 그래서 「끝났는데 주소가 없는 줄」은 0장 · 거절 쪽이다 — 그래도 위 기준이 막는다

**Interfaces:**
- Consumes: Task 5 의 `EasyRowJob`, `rowJobOf`, `withRowJob`
- Produces:
  - `collect.ts`: `interface EasySubmission { requestRowId: string; falRequestId: string; endpoint: string; estimatedUsd?: number }`, `NO_IMAGE_MADE: string`, `collectEasyImage(projectId: string, submission: EasySubmission, isAlive: () => boolean, wait?: (ms: number) => Promise<void>): Promise<{ id: string; url: string } | undefined>` — 화면을 떠나면 `undefined`, 0장이면 `NO_IMAGE_MADE` 로 던진다
  - `pending-requests.ts`(server-only): `unfinishedOf(rows: ReadonlyArray<{ id: string; costUsd: number | null | undefined }>): Set<string>`, `unfinishedPosterRequests(userId: string, requestIds: readonly string[]): Promise<Set<string>>`
  - `row-image.ts`: `rowJobRequestIds(rows): string[]`, `pendingJobRowIds(rows, unfinished: ReadonlySet<string>): string[]` — `rows: ReadonlyArray<{ id: string; role: string; body?: string | null }>`
  - `load.ts`: `loadEasyConversation` 이 `pending: string[]`(아직 결과를 안 받은 그림 줄 id)을 함께 준다 → `EasyClient` 새 prop `initialPending?: string[]`
  - `use-resume-images.ts`: `interface EasyResumeTarget { rowId: string; projectId: string; job: EasyRowJob }`, `resumeTargets(messages, urls, cardnewsIds, pendingIds: ReadonlySet<string>): EasyResumeTarget[]`, `useEasyResume(input: { messages: readonly EasyMessage[]; urls: Readonly<Record<string, string>>; cardnewsIds: ReadonlySet<string>; pendingIds: ReadonlySet<string>; isAlive: () => boolean; onImage: (rowId: string, image: { id: string; url: string }) => void }): Readonly<Record<string, string>>` (줄 id → 못 받은 까닭)
  - `EasyMessageRow` 새 prop: `failed?: string`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/collect.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../../lib/billable-fetch", () => ({ billableFetch: f.fetch }));
vi.mock("../../../lib/membership/account-events", () => ({ observeAccountResponse: () => {} }));

import { NO_IMAGE_MADE, collectEasyImage } from "../collect";

/**
 * **결과 받기**(화면에서 옮김, 2026-10-06 설계 B3 · B5). 만든 직후와 다시 열 때가 같은
 * 함수를 쓴다. 0장으로 끝나면 「만들고 있습니다」가 영원히 돌았다 — 이제 실패로 알린다.
 */
const 답 = (body: unknown) => ({ json: async () => body });
const 일감 = { requestRowId: "r1", falRequestId: "f1", endpoint: "e" };
const 안기다림 = async () => {};

beforeEach(() => { f.fetch.mockReset(); });

describe("결과 받기", () => {
  it("이번 요청의 그림을 받는다", async () => {
    f.fetch.mockResolvedValueOnce(답({ ok: true, done: true, images: [{ id: "i1", url: "https://x/1.png", generationRequestId: "r1" }] }));
    expect(await collectEasyImage("p1", 일감, () => true, 안기다림)).toEqual({ id: "i1", url: "https://x/1.png" });
    expect(f.fetch.mock.calls[0]![0]).toBe("/api/poster/projects/p1/status");
  });

  it("끝날 때까지 다시 묻는다", async () => {
    f.fetch
      .mockResolvedValueOnce(답({ ok: true, done: false }))
      .mockResolvedValueOnce(답({ ok: true, done: true, images: [{ id: "i1", url: "u", generationRequestId: "r1" }] }));
    await collectEasyImage("p1", 일감, () => true, 안기다림);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it("끝났는데 이번 요청의 그림이 0장이면 실패로 알린다 (B5)", async () => {
    f.fetch.mockResolvedValueOnce(답({ ok: true, done: true, images: [{ id: "old", url: "u", generationRequestId: "r0" }] }));
    await expect(collectEasyImage("p1", 일감, () => true, 안기다림)).rejects.toThrow(NO_IMAGE_MADE);
  });

  it("상태 확인이 실패하면 그 말로 알린다", async () => {
    f.fetch.mockResolvedValueOnce(답({ ok: false, message: "내용 검사에 걸렸습니다." }));
    await expect(collectEasyImage("p1", 일감, () => true, 안기다림)).rejects.toThrow("내용 검사에 걸렸습니다.");
  });

  it("화면을 떠났으면 묻지 않고 그만둔다", async () => {
    expect(await collectEasyImage("p1", 일감, () => false, 안기다림)).toBeUndefined();
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
```

`apps/web/app/easy/__tests__/use-resume-images.test.tsx`:

```tsx
import React from "react";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const c = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock("../collect", () => ({ collectEasyImage: c.collect, NO_IMAGE_MADE: "이미지가 나오지 않았습니다." }));

import { resumeTargets, useEasyResume } from "../use-resume-images";
import { withRowJob } from "../row-image";
import type { EasyMessage } from "../turn";

/**
 * **다시 열면 이어 받는다**(2026-10-06 설계 B3). 그림을 받아 저장하는 일은 화면이 상태를
 * 물을 때만 일어나서, 만드는 중에 떠나면 「이미지를 만들고 있습니다」가 영원히 돌았다.
 */
const 일감 = { requestRowId: "r1", falRequestId: "f1", endpoint: "fal-ai/x" };
const 줄들: EasyMessage[] = [
  { id: "u1", role: "user", body: "포스터" },
  { id: "a", role: "image", body: withRowJob("", 일감), workId: "p1" },
  { id: "b", role: "image", body: withRowJob("", { ...일감, requestRowId: "r2" }), workId: "p2" },
  { id: "c", role: "image", body: withRowJob("", 일감), workId: "p3" },
  { id: "d", role: "image", body: "", workId: "p4" },
  { id: "e", role: "image", body: withRowJob("", 일감), workId: "p5" },
  // 끝났는데 주소가 없는 줄(0장 · 거절) — 서버가 「아직 안 받은 줄」에 안 넣는다.
  { id: "f", role: "image", body: withRowJob("", { ...일감, requestRowId: "r6" }), workId: "p6" },
];
const 그림있음 = { c: "https://x/c.png" };
const 카드뉴스 = new Set(["e"]);
// 서버(`load.ts`)가 준 「아직 결과를 안 받은 줄」. f 는 끝난 요청이라 없다.
const 안받은줄 = new Set(["a", "b", "c", "e"]);

let view: ReactTestRenderer;
let failed: Readonly<Record<string, string>> = {};
const onImage = vi.fn();
function Probe() {
  failed = useEasyResume({ messages: 줄들, urls: 그림있음, cardnewsIds: 카드뉴스, pendingIds: 안받은줄, isAlive: () => true, onImage });
  return null;
}
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); }); };

beforeEach(() => {
  c.collect.mockReset();
  onImage.mockReset();
  c.collect.mockImplementation(async (projectId: string) => {
    if (projectId === "p1") return { id: "img", url: "https://x/a.png" };
    throw new Error("내용 검사에 걸렸습니다.");
  });
});
afterEach(() => { act(() => view?.unmount()); });

describe("이어 받을 줄", () => {
  it("그림이 없고 받을 정보가 있는 이미지 줄만 — 그림 있는 줄 · 옛 줄 · 카드뉴스 줄은 아니다", () => {
    expect(resumeTargets(줄들, 그림있음, 카드뉴스, 안받은줄)).toEqual([
      { rowId: "a", projectId: "p1", job: 일감 },
      { rowId: "b", projectId: "p2", job: { ...일감, requestRowId: "r2" } },
    ]);
  });

  /**
   * 최종 리뷰(2026-10-06): 끝난 요청을 다시 물으면 `status` 가 결과를 또 저장하고 또 정산한다.
   * 주소가 없어도 끝난 줄은 이어 받지 않는다.
   */
  it("끝났는데 그림이 없는 줄은 이어 받지 않는다", () => {
    expect(resumeTargets(줄들, 그림있음, 카드뉴스, 안받은줄).map((one) => one.rowId)).not.toContain("f");
  });

  it("아직 안 끝난 줄은 이어 받는다", () => {
    expect(resumeTargets(줄들, 그림있음, 카드뉴스, new Set(["f"])).map((one) => one.rowId)).toEqual(["f"]);
  });

  it("서버가 안 받은 줄을 못 알려 주면(빈 목록) 아무것도 안 묻는다", () => {
    expect(resumeTargets(줄들, 그림있음, 카드뉴스, new Set())).toEqual([]);
  });
});

describe("다시 열 때", () => {
  it("받으면 그 줄에 걸고, 못 받으면 까닭을 그 줄에 남긴다", async () => {
    await act(async () => { view = create(<Probe />); });
    await flush();
    expect(c.collect).toHaveBeenCalledTimes(2);
    expect(c.collect.mock.calls[0]!.slice(0, 2)).toEqual(["p1", 일감]);
    expect(onImage).toHaveBeenCalledWith("a", { id: "img", url: "https://x/a.png" });
    expect(failed).toEqual({ b: "내용 검사에 걸렸습니다." });
  });

  it("다시 그려도 또 묻지 않는다", async () => {
    await act(async () => { view = create(<Probe />); });
    await flush();
    await act(async () => { view.update(<Probe />); });
    await flush();
    expect(c.collect).toHaveBeenCalledTimes(2);
  });
});

describe("화면이 같은 받기 함수를 쓴다", () => {
  const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");
  it("만든 직후 · 다시 열 때 모두 collectEasyImage 다", () => {
    expect(화면).toContain("useEasyResume(");
    expect(화면).toContain("collectEasyImage(body.projectId, body.submission, () => alive.current)");
    expect(화면).not.toContain("async function collect(");
  });
  it("서버가 준 「아직 안 받은 줄」만 넘긴다", () => {
    expect(화면).toContain("pendingIds: new Set(initialPending ?? [])");
  });
  it("못 받은 줄을 줄과 결과 칸에 알린다", () => {
    expect(화면).toContain("failed={failed[message.id]}");
    expect(화면).toContain("!failed[one.id]");
  });
});
```

`apps/web/app/easy/__tests__/message-row.test.tsx`:

```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => <a {...props}>{children}</a> }));
vi.mock("../_components/cardnews-card", () => ({ EasyCardnewsCard: () => null }));
vi.mock("../../_components/elapsed-time", () => ({ ElapsedTime: () => null }));

import { EasyMessageRow } from "../_components/message";

let view: ReactTestRenderer;
const 글 = (): string => JSON.stringify(view.toJSON());
afterEach(() => { act(() => view?.unmount()); });

describe("그림 줄 (B3 · B5)", () => {
  it("못 받은 줄은 「만들고 있습니다」 대신 까닭을 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "i1", role: "image", body: "", workId: "p1" }} failed="내용 검사에 걸렸습니다." />); });
    expect(글()).toContain("내용 검사에 걸렸습니다.");
    expect(글()).not.toContain("이미지를 만들고 있습니다");
  });

  it("실패가 아니면 지금처럼 만드는 중이다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "i1", role: "image", body: "", workId: "p1" }} />); });
    expect(글()).toContain("이미지를 만들고 있습니다");
  });
});
```

`apps/web/app/easy/__tests__/row-image.test.ts` 「화면이 결과를 받을 때」의 `it` 을 바꾼다:

```ts
  it("이번 요청 번호로 결과 그림을 고른다", async () => {
    const { readFileSync } = await import("node:fs");
    const 받기 = readFileSync(new URL("../collect.ts", import.meta.url), "utf8");
    expect(받기).toMatch(/pickCollectedImage(<[^>]*>)?\(poll\.images, submission\.requestRowId\)/);
    expect(받기).not.toContain("poll.images?.[0]");
  });
```

같은 파일 import 에 `pendingJobRowIds, rowJobRequestIds` 를 더하고 파일 끝에 더한다:

```ts
describe("아직 안 받은 줄 (B3, 최종 리뷰 2026-10-06)", () => {
  const 일감 = (requestRowId: string) => ({ requestRowId, falRequestId: "f", endpoint: "e" });
  const rows = [
    { id: "u", role: "user", body: "포스터" },
    { id: "a", role: "image", body: withRowJob("", 일감("r1")) },
    { id: "b", role: "image", body: withRowJob(editRowBody("r1"), 일감("r2")) },
    { id: "c", role: "image", body: "" }, // 옛 줄 — 받을 정보가 없다
    { id: "d", role: "assistant", body: withRowJob("", 일감("r9")) }, // 그림 줄이 아니다
  ];

  it("그림 줄의 요청 번호를 모은다", () => {
    expect(rowJobRequestIds(rows)).toEqual(["r1", "r2"]);
  });

  it("안 끝난 요청의 그림 줄 id 만 준다", () => {
    expect(pendingJobRowIds(rows, new Set(["r2", "r9"]))).toEqual(["b"]);
    expect(pendingJobRowIds(rows, new Set())).toEqual([]);
  });
});
```

`apps/web/lib/easy/__tests__/pending-requests.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const st = vi.hoisted(() => ({
  local: true,
  reads: 0,
  rows: [] as Array<{ id: string; userId: string; costUsd: number | null }>,
}));
vi.mock("../../local-store", () => ({
  isLocalStoreEnabled: () => st.local,
  getLocalDatabase: () => ({
    read: async (select: (data: unknown) => unknown) => { st.reads += 1; return select({ posterRequests: st.rows }); },
  }),
}));
vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => { throw new Error("운영 저장소는 이 시험에서 안 쓴다"); },
}));

const { unfinishedOf, unfinishedPosterRequests } = await import("../pending-requests");

/**
 * **아직 결과를 안 받은 요청**(2026-10-06 설계 B3, 최종 리뷰). 끝난 요청을 다시 물으면
 * `status` 가 결과를 또 저장하고 또 정산한다 — 끝났는지는 요청 줄의 `costUsd` 로 본다.
 */
beforeEach(() => {
  st.local = true; st.reads = 0;
  st.rows = [
    { id: "r1", userId: "me", costUsd: null }, // 안 끝남
    { id: "r2", userId: "me", costUsd: 0 }, // 끝남 — 0장이어도 숫자다
    { id: "r3", userId: "me", costUsd: 0.04 }, // 끝남
    { id: "r4", userId: "other", costUsd: null }, // 남의 것
  ];
});

describe("끝났는지", () => {
  it("costUsd 가 비어 있는 것만 안 끝났다", () => {
    expect(unfinishedOf([{ id: "a", costUsd: null }, { id: "b", costUsd: 0 }, { id: "c", costUsd: undefined }]))
      .toEqual(new Set(["a", "c"]));
  });

  it("내 요청 가운데 안 끝난 것만 준다 — 끝난 것 · 남의 것 · 모르는 것은 아니다", async () => {
    expect(await unfinishedPosterRequests("me", ["r1", "r2", "r3", "r4", "r9"])).toEqual(new Set(["r1"]));
  });

  it("물을 요청이 없으면 저장소를 안 읽는다", async () => {
    expect(await unfinishedPosterRequests("me", [])).toEqual(new Set());
    expect(st.reads).toBe(0);
  });

  it("못 읽으면 빈 목록 — 이어 받지 않는다", async () => {
    st.local = false;
    expect(await unfinishedPosterRequests("me", ["r1"])).toEqual(new Set());
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/collect.test.ts app/easy/__tests__/use-resume-images.test.tsx app/easy/__tests__/message-row.test.tsx app/easy/__tests__/row-image.test.ts lib/easy/__tests__/pending-requests.test.ts`
Expected: FAIL — `Cannot find module '../collect'` / `'../use-resume-images'` / `'../pending-requests'`, `pendingJobRowIds is not a function`, 실패 줄 시험은 「이미지를 만들고 있습니다」가 보임

- [ ] **Step 3: `collect.ts` 를 만든다**

`apps/web/app/easy/collect.ts`:

```ts
import { observeAccountResponse } from "../../lib/membership/account-events";
import { billableFetch } from "../../lib/billable-fetch";
import { pickCollectedImage } from "./row-image";

/**
 * **결과를 받는다** — 기존 `status` 라우트에 물어 받는다(포스터 화면과 같은 길).
 *
 * `easy-client.tsx` 안에 있던 것을 옮겼다(2026-10-06 설계 B3). 만든 직후와 **다시 열
 * 때**(`use-resume-images.ts`)가 같은 함수를 쓴다 — 두 벌이면 하나는 곧 어긋난다.
 */
export interface EasySubmission {
  requestRowId: string;
  falRequestId: string;
  endpoint: string;
  estimatedUsd?: number;
}

/** 끝났는데 이번 요청의 그림이 없을 때(설계 B5). 전에는 「만들고 있습니다」가 영원히 돌았다. */
export const NO_IMAGE_MADE = "이미지가 나오지 않았습니다. 같은 말을 다시 보내 주세요.";

const 묻는간격 = 10_000;
const 기다린다 = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 받으면 그 그림, 화면을 떠났으면 `undefined`. 0장이면 `NO_IMAGE_MADE` 로 던진다. */
export async function collectEasyImage(
  projectId: string,
  submission: EasySubmission,
  isAlive: () => boolean,
  wait: (ms: number) => Promise<void> = 기다린다,
): Promise<{ id: string; url: string } | undefined> {
  const body = {
    requestRowId: submission.requestRowId,
    falRequestId: submission.falRequestId,
    endpoint: submission.endpoint,
    unitCostUsd: submission.estimatedUsd ?? 0,
  };
  for (;;) {
    if (!isAlive()) return undefined;
    await wait(묻는간격);
    if (!isAlive()) return undefined;
    /*
      결과를 묻는 자리다. 예약이 아니라 **정산**이라 열쇠를 요구하지 않지만,
      포스터 화면과 같은 길(`billableFetch`)로 보낸다.
    */
    const poll = await (await billableFetch(`/api/poster/projects/${projectId}/status`, {
      body: JSON.stringify(body),
    })).json();
    observeAccountResponse(poll, false);
    if (!poll.ok) throw new Error(poll.message ?? "상태를 확인하지 못했습니다.");
    if (poll.done) {
      // 이번 요청의 그림 — 고치기는 같은 작업에 그림을 더해 첫 장이 원본이다(`row-image.ts`).
      const first = pickCollectedImage<{ id: string; url: string; generationRequestId?: string }>(poll.images, submission.requestRowId);
      if (!first) throw new Error(NO_IMAGE_MADE);
      return { id: first.id, url: first.url };
    }
  }
}
```

- [ ] **Step 4: `use-resume-images.ts` 를 만든다**

`apps/web/app/easy/use-resume-images.ts`:

```ts
"use client";

import * as React from "react";
import { NO_IMAGE_MADE, collectEasyImage } from "./collect";
import { rowJobOf, type EasyRowJob } from "./row-image";
import type { EasyMessage } from "./turn";

/**
 * **다시 열면 이어 받는다**(2026-10-06 설계 B3).
 *
 * 그림을 받아 저장하는 일은 화면이 `status` 에 물을 때만 일어난다. 만드는 중에 떠났다
 * 돌아오면 아무도 안 물어서 「이미지를 만들고 있습니다」가 영원히 돌았다. 그림 줄에
 * 적어 둔 받을 정보(`row-image.ts` 의 `;job=`)로 만든 직후와 같은 함수를 부른다.
 *
 * 받을 정보가 없는 옛 줄은 지금처럼 둔다 — 무엇을 물을지 모른다.
 *
 * **아직 안 끝난 요청의 줄만** 묻는다(최종 리뷰 2026-10-06). `status` 는 끝난 요청을 다시
 * 물으면 결과를 또 저장하고 또 정산한다(`lib/poster/flow.ts` 의 `collectPoster`). 끝났는지는
 * 서버가 요청 줄로 보고 `pendingIds` 로 넘긴다(`_components/load.ts` → `lib/easy/pending-requests.ts`).
 */
export interface EasyResumeTarget {
  rowId: string;
  projectId: string;
  job: EasyRowJob;
}

export function resumeTargets(
  messages: readonly EasyMessage[],
  urls: Readonly<Record<string, string>>,
  cardnewsIds: ReadonlySet<string>,
  /** 서버가 본 「아직 결과를 안 받은 그림 줄」. 여기 없는 줄은 끝난 것이다. */
  pendingIds: ReadonlySet<string>,
): EasyResumeTarget[] {
  return messages.flatMap((message) => {
    if (message.role !== "image" || !message.workId || urls[message.id] || cardnewsIds.has(message.id)) return [];
    if (!pendingIds.has(message.id)) return [];
    const job = rowJobOf(message.body);
    return job ? [{ rowId: message.id, projectId: message.workId, job }] : [];
  });
}

/** 줄 id → 못 받은 까닭. 받은 그림은 `onImage` 로 넘긴다. **처음 그릴 때 한 번만** 묻는다. */
export function useEasyResume(input: {
  messages: readonly EasyMessage[];
  urls: Readonly<Record<string, string>>;
  cardnewsIds: ReadonlySet<string>;
  pendingIds: ReadonlySet<string>;
  isAlive: () => boolean;
  onImage: (rowId: string, image: { id: string; url: string }) => void;
}): Readonly<Record<string, string>> {
  const [failed, setFailed] = React.useState<Record<string, string>>({});
  const first = React.useRef(input);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { messages, urls, cardnewsIds, pendingIds, isAlive, onImage } = first.current;
    for (const target of resumeTargets(messages, urls, cardnewsIds, pendingIds)) {
      collectEasyImage(target.projectId, target.job, isAlive)
        .then((image) => { if (image && isAlive()) onImage(target.rowId, image); })
        .catch((cause: unknown) => {
          if (!isAlive()) return;
          const message = cause instanceof Error ? cause.message : NO_IMAGE_MADE;
          setFailed((current) => ({ ...current, [target.rowId]: message }));
        });
    }
  }, []);

  return failed;
}
```

- [ ] **Step 4-2: 서버가 「아직 안 받은 줄」을 알려 준다**

`apps/web/lib/easy/pending-requests.ts`:

```ts
import "server-only";

import { getLocalDatabase, isLocalStoreEnabled } from "../local-store";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * **아직 결과를 안 받은 그림 요청**(2026-10-06 설계 B3, 최종 리뷰).
 *
 * 다시 열 때 이어 받을 줄을 고른다. `status` 는 끝난 요청을 다시 물으면 결과를 **또 저장하고
 * 또 정산한다**(`lib/poster/flow.ts` 의 `collectPoster` 는 이미 받았는지 안 본다). 그래서 받을
 * 정보(`;job=`)가 있어도 끝난 요청은 다시 묻지 않는다.
 *
 * **끝났다 = 요청 줄의 `costUsd` 가 채워졌다.** 만들 때는 비어 있고 결과를 받을 때
 * `PosterRequestStore.complete` 가 처음 채운다(0장이어도 숫자다). 작업의 `status`
 * (`generating`)는 쓰지 않는다 — 고치기 라우트는 그것을 안 바꾸고, 한 작업에 요청이 여럿이다.
 *
 * 저장소 인터페이스(`packages/poster-core`)에 요청 줄을 읽는 길이 없고 그 패키지는 0줄이라
 * 여기서 읽는다. 운영은 **회원 세션**으로 자기 요청 줄만 읽힌다(RLS `members read own poster
 * requests`). 못 읽으면 빈 목록 — 이어 받지 않는다. 또 저장 · 또 정산보다 「만들고
 * 있습니다」가 덜 나쁘다.
 */
export function unfinishedOf(rows: ReadonlyArray<{ id: string; costUsd: number | null | undefined }>): Set<string> {
  return new Set(rows.filter((row) => row.costUsd === null || row.costUsd === undefined).map((row) => row.id));
}

type LocalRequest = { id: string; userId: string; costUsd: number | null };

export async function unfinishedPosterRequests(userId: string, requestIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(requestIds)];
  if (!ids.length) return new Set();
  try {
    if (isLocalStoreEnabled()) {
      // 로컬 파일 저장소의 포스터 요청 칸(`lib/poster/local-store.ts` 의 `posterRequests`). 주인 조건을 같이 건다.
      return unfinishedOf(await getLocalDatabase().read((data) =>
        ((data as { posterRequests?: LocalRequest[] }).posterRequests ?? [])
          .filter((row) => row.userId === userId && ids.includes(row.id))));
    }
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("poster_generation_requests").select("id,cost_usd").in("id", ids);
    if (error) return new Set();
    return unfinishedOf(((data ?? []) as Array<{ id: string; cost_usd: number | null }>)
      .map((row) => ({ id: row.id, costUsd: row.cost_usd })));
  } catch {
    return new Set();
  }
}
```

`apps/web/app/easy/row-image.ts` — `rowJobOf` 아래에 더한다:

```ts
type JobRow = { id: string; role: string; body?: string | null };

/** 그림 줄들의 받을 정보 요청 번호(설계 B3). 서버가 이것으로 끝났는지 묻는다. */
export function rowJobRequestIds(rows: ReadonlyArray<JobRow>): string[] {
  return rows.flatMap((row) => {
    const job = row.role === "image" ? rowJobOf(row.body) : undefined;
    return job ? [job.requestRowId] : [];
  });
}

/** 안 끝난 요청(`unfinished`)을 가리키는 그림 줄 id. 화면은 이 줄만 이어 받는다. */
export function pendingJobRowIds(rows: ReadonlyArray<JobRow>, unfinished: ReadonlySet<string>): string[] {
  return rows.flatMap((row) => {
    const job = row.role === "image" ? rowJobOf(row.body) : undefined;
    return job && unfinished.has(job.requestRowId) ? [row.id] : [];
  });
}
```

`apps/web/app/easy/_components/load.ts`:

(a) `import { editedRequestIds, pickRowImage } from "../row-image";` 를 `import { editedRequestIds, pendingJobRowIds, pickRowImage, rowJobRequestIds } from "../row-image";` 로 바꾸고, `import { cardnewsProject, ... } from "../../../lib/easy/cardnews-steps";` 아래에 `import { unfinishedPosterRequests } from "../../../lib/easy/pending-requests";` 를 더한다

(b) `  const projectIds = [...new Set(rows.map((row) => row.workId).filter(Boolean) as string[])];` 바로 **아래**에 넣는다:

```ts
  /*
   * **아직 결과를 안 받은 그림 줄**(2026-10-06 설계 B3, 최종 리뷰). 화면은 이 줄만 이어
   * 받는다 — 끝난 요청을 다시 물으면 `status` 가 결과를 또 저장하고 또 정산한다.
   */
  const pending = pendingJobRowIds(rows, await unfinishedPosterRequests(membership.user.id, rowJobRequestIds(rows)));
```

(c) 끝의 `  return { conversation, messages, urls, options, cardnews };` 를 `  return { conversation, messages, urls, options, cardnews, pending };` 로

`apps/web/app/easy/[id]/page.tsx` — `      initialCardnews={loaded.cardnews}` 다음 줄에 `      initialPending={loaded.pending}` 를 더한다

- [ ] **Step 5: 줄 그림에 「못 받음」을 더한다**

`apps/web/app/easy/_components/message.tsx`:

(a) props 를 찾아:

```tsx
  cardnews,
}: {
  message: EasyMessage;
```

이렇게 바꾼다:

```tsx
  cardnews,
  failed,
}: {
  message: EasyMessage;
```

(b) 타입 끝을 찾아:

```tsx
  cardnews?: React.ComponentProps<typeof EasyCardnewsCard>;
}) {
```

이렇게 바꾼다:

```tsx
  cardnews?: React.ComponentProps<typeof EasyCardnewsCard>;
  /** 다시 열어 이어 받다가 못 받은 까닭(2026-10-06 설계 B3 · B5). 있으면 「만들고 있습니다」 대신 보인다. */
  failed?: string;
}) {
```

(c) 그림 자리 끝을 찾아:

```tsx
      ) : (
        <EasyImageWorking />
      )}
```

이렇게 바꾼다:

```tsx
      ) : failed ? (
        <p role="alert" className="max-w-64 whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-base leading-7 text-destructive">
          {failed}
        </p>
      ) : (
        <EasyImageWorking />
      )}
```

- [ ] **Step 6: 화면이 새 함수를 쓰게 한다**

`apps/web/app/easy/easy-client.tsx`:

(a) `import { pickCollectedImage } from "./row-image";` 를 아래 두 줄로 바꾼다(`pickCollectedImage` 는 이제 `collect.ts` 가 쓴다):

```tsx
import { collectEasyImage } from "./collect";
import { useEasyResume } from "./use-resume-images";
```

(a-2) props — 아래를 찾아:

```tsx
  /** 줄 id → 카드뉴스 작업(2단계 §8). 다시 열 때 `load.ts` 가 찾아 준다. */
  initialCardnews?: Record<string, CardnewsProjectLike & { title?: string }>;
}
```

이렇게 바꾼다:

```tsx
  /** 줄 id → 카드뉴스 작업(2단계 §8). 다시 열 때 `load.ts` 가 찾아 준다. */
  initialCardnews?: Record<string, CardnewsProjectLike & { title?: string }>;
  /** 아직 결과를 안 받은 그림 줄 id(2026-10-06 설계 B3). 다시 열 때 이 줄만 이어 받는다(`load.ts`). */
  initialPending?: string[];
}
```

그리고 `  initialCardnews,\n}: EasyClientProps) {` 를 `  initialCardnews,\n  initialPending,\n}: EasyClientProps) {` 로

(b) `  React.useEffect(() => () => { alive.current = false; }, []);` 바로 **아래**에 넣는다:

```tsx
  // 다시 열면 아직 결과를 안 받은 줄을 이어 받는다(2026-10-06 설계 B3). 만든 직후와 같은 받기 함수다.
  const failed = useEasyResume({
    messages: initialMessages, urls: initialUrls ?? {}, cardnewsIds: new Set(Object.keys(initialCardnews ?? {})),
    pendingIds: new Set(initialPending ?? []),
    isAlive: () => alive.current,
    onImage: (rowId, image) => setUrls((current) => ({ ...current, [rowId]: image.url })),
  });
```

(c) `      const image = await collect(body.projectId, body.submission);` → `      const image = await collectEasyImage(body.projectId, body.submission, () => alive.current);`

(d) 아래 함수 전체(32줄)를 지운다 — 빈 줄 하나까지:

```tsx
  /** 기존 `status` 라우트에 물어 결과를 받는다. */
  async function collect(
    projectId: string,
    submission: { requestRowId: string; falRequestId: string; endpoint: string; estimatedUsd?: number },
  ): Promise<{ id: string; url: string } | undefined> {
    const body = {
      requestRowId: submission.requestRowId,
      falRequestId: submission.falRequestId,
      endpoint: submission.endpoint,
      unitCostUsd: submission.estimatedUsd ?? 0,
    };
    for (;;) {
      if (!alive.current) return undefined;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      if (!alive.current) return undefined;
      /*
        결과를 묻는 자리다. 예약이 아니라 **정산**이라 열쇠를 요구하지 않지만,
        포스터 화면과 같은 길(`billableFetch`)로 보내 둔다 — 한 화면에서 두
        길을 쓰면 어느 쪽이 무엇이었는지 다음 사람이 다시 알아봐야 한다.
      */
      const poll = await (await billableFetch(`/api/poster/projects/${projectId}/status`, {
        body: JSON.stringify(body),
      })).json();
      observeAccountResponse(poll, false);
      if (!poll.ok) throw new Error(poll.message ?? "상태를 확인하지 못했습니다.");
      if (poll.done) {
        // 이번 요청의 그림 — 고치기는 같은 작업에 그림을 더해 첫 장이 원본이다(`row-image.ts`).
        const first = pickCollectedImage<{ id: string; url: string; generationRequestId?: string }>(poll.images, submission.requestRowId);
        return first ? { id: first.id, url: first.url } : undefined;
      }
    }
  }

```

(e) 줄 그리기 — `              cardnews={cardnews.rowProps(message.id, turn.busy)}` 다음 줄에 `              failed={failed[message.id]}` 를 더한다

(f) 결과 칸 — `            working={cardnews.working || shown.some((one) => one.role === "image" && !urls[one.id] && !cardnews.views[one.id])}` 를 `            working={cardnews.working || shown.some((one) => one.role === "image" && !urls[one.id] && !cardnews.views[one.id] && !failed[one.id])}` 로

`billableFetch` · `observeAccountResponse` 는 `send()` · `upload()` 가 계속 쓰므로 import 를 지우지 않는다.

- [ ] **Step 7: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__ lib/easy/__tests__ app/api/easy/__tests__`
Expected: PASS (실패 0)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/easy/collect.ts apps/web/app/easy/use-resume-images.ts apps/web/lib/easy/pending-requests.ts apps/web/app/easy/row-image.ts apps/web/app/easy/_components/load.ts "apps/web/app/easy/[id]/page.tsx" apps/web/app/easy/_components/message.tsx apps/web/app/easy/easy-client.tsx apps/web/app/easy/__tests__/collect.test.ts apps/web/app/easy/__tests__/use-resume-images.test.tsx apps/web/app/easy/__tests__/message-row.test.tsx apps/web/app/easy/__tests__/row-image.test.ts apps/web/lib/easy/__tests__/pending-requests.test.ts
git commit -m "fix(easy): 다시 열면 아직 안 받은 이미지만 이어 받고 0장이면 실패로 알린다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 「이대로 만들기」는 기본값으로, 고른 값은 한 묶음으로 (B1 · B2)

**Files:**
- Create: `apps/web/app/easy/turn-carry.ts`
- Modify: `apps/web/app/easy/easy-client.tsx` (`send()` 의 묶음, 「이대로 만들기」)
- Test: `apps/web/app/easy/__tests__/turn-carry.test.ts` (새)

**Interfaces:**
- Consumes: `EasyResend`(`cardnews-state.ts`), `EASY_DEFAULT_RATIO`(`ask.ts`)
- Produces: `interface EasyCarry { ratio?: string; look?: string }`, `askSubmission(prompt: string, picked: { ratio: string; look: string }): EasyResend`, `carryChoices(input: { continuing: boolean; carry: EasyCarry; picked?: EasyCarry }): EasyCarry`
- 갈래(kind)는 지금의 `cardnews.beginTurn`/`rememberKind`(`continuingKind`)가 이미 잇는다 — 이 묶음은 비율 · 그림체를 잇는다

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/turn-carry.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EASY_DEFAULT_RATIO, easyAsk } from "../ask";
import { askSubmission, carryChoices } from "../turn-carry";

/**
 * **대화가 끊기던 두 자리**(2026-10-06 설계 B1 · B2).
 *
 * B1 아무것도 안 고르고 「이대로 만들기」를 누르면 빈 값을 빼고 보내서, 서버는 「안
 *    골랐다」로 보고 또 물었다 — 같은 물음이 끝없이 떴다.
 * B2 비율에 답한 뒤 갈래 물음이 뜨고 갈래 단추를 누르면, 앞서 고른 비율이 안 실려
 *    비율을 또 물었다(핑퐁).
 */
describe("「이대로 만들기」 (B1)", () => {
  it("아무것도 안 골랐으면 기본 비율을 고른 값으로 싣는다", () => {
    expect(askSubmission("고양이 그려줘", { ratio: "", look: "" }))
      .toEqual({ prompt: "고양이 그려줘", ratio: EASY_DEFAULT_RATIO });
  });

  it("그러면 서버가 또 묻지 않는다", () => {
    const 보낸것 = askSubmission("고양이 그려줘", { ratio: "", look: "" });
    expect(easyAsk({ attachmentCount: 0, chosenRatio: 보낸것.ratio, chosenLook: 보낸것.look }).asks).toBe(false);
  });

  it("고른 것이 있으면 그대로, 그림체만 골랐어도 비율은 기본값", () => {
    expect(askSubmission("x", { ratio: "9:16", look: "look-a" })).toEqual({ prompt: "x", ratio: "9:16", look: "look-a" });
    expect(askSubmission("x", { ratio: "", look: "look-a" })).toEqual({ prompt: "x", ratio: EASY_DEFAULT_RATIO, look: "look-a" });
  });
});

describe("물음에 답할 때 앞서 고른 것을 함께 (B2)", () => {
  it("비율을 고른 뒤 갈래 단추로 다시 보내면 그 비율을 싣는다", () => {
    const 첫답 = carryChoices({ continuing: true, carry: {}, picked: { ratio: "4:5" } });
    expect(carryChoices({ continuing: true, carry: 첫답, picked: {} })).toEqual({ ratio: "4:5" });
  });

  it("새로 고른 값이 앞의 값을 이긴다", () => {
    expect(carryChoices({ continuing: true, carry: { ratio: "4:5", look: "a" }, picked: { ratio: "9:16" } }))
      .toEqual({ ratio: "9:16", look: "a" });
  });

  /** Review Focus 5 */
  it("새로 친 말이면 앞서 고른 것을 버린다 — 다른 주문에 옛 비율이 몰래 붙지 않는다", () => {
    expect(carryChoices({ continuing: false, carry: { ratio: "4:5", look: "a" }, picked: { ratio: "9:16" } })).toEqual({});
  });

  it("빈 값은 싣지 않는다", () => {
    expect(carryChoices({ continuing: true, carry: {}, picked: { ratio: "", look: "" } })).toEqual({});
  });
});

describe("화면이 묶음을 쓴다", () => {
  const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");

  it("「이대로 만들기」는 askSubmission 으로 보낸다", () => {
    expect(화면).toContain("send(askSubmission(보낼말, { ratio: askRatio, look: askLook }))");
  });

  it("보낼 때 고른 값 묶음을 싣는다", () => {
    expect(화면).toContain("carryChoices({ continuing: 이어감, carry: carried.current, picked: 다시 })");
    expect(화면).toContain("...(고른값.ratio ? { ratio: 고른값.ratio } : {})");
    expect(화면).not.toContain("...(다시?.ratio ? { ratio: 다시.ratio } : {})");
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/turn-carry.test.ts`
Expected: FAIL — `Cannot find module '../turn-carry'`

- [ ] **Step 3: `turn-carry.ts` 를 만든다**

`apps/web/app/easy/turn-carry.ts`:

```ts
import { EASY_DEFAULT_RATIO } from "./ask";
import type { EasyResend } from "./cardnews-state";

/**
 * **같은 말에 이어 답할 때 싣는 것**(2026-10-06 설계 B1 · B2). 화면 안에 두면 값으로 못
 * 잰다. 갈래(kind)는 `cardnews-state.ts` 의 `continuingKind` 가 이미 잇는다 — 여기는
 * 비율 · 그림체다.
 */
export interface EasyCarry {
  ratio?: string;
  look?: string;
}

/**
 * 「이대로 만들기」(B1). 아무것도 안 골랐으면 **기본 비율을 고른 값으로** 싣는다. 빈 값을
 * 빼고 보내면 서버가 「안 골랐다」로 보고 같은 물음을 또 띄웠다.
 */
export function askSubmission(prompt: string, picked: { ratio: string; look: string }): EasyResend {
  return { prompt, ratio: picked.ratio || EASY_DEFAULT_RATIO, ...(picked.look ? { look: picked.look } : {}) };
}

/**
 * 이번에 실을 비율 · 그림체(B2). 같은 말에 이어 답하면(`continuing`) 앞서 고른 것에 이번에
 * 고른 것을 덮어 싣는다. **새로 친 말이면 비운다** — 다른 주문에 옛 값이 몰래 붙지 않게.
 * 돌려준 값이 곧 다음 묶음이다.
 */
export function carryChoices(input: { continuing: boolean; carry: EasyCarry; picked?: EasyCarry }): EasyCarry {
  if (!input.continuing) return {};
  const ratio = input.picked?.ratio || input.carry.ratio;
  const look = input.picked?.look || input.carry.look;
  return { ...(ratio ? { ratio } : {}), ...(look ? { look } : {}) };
}
```

- [ ] **Step 4: 화면에 잇는다**

`apps/web/app/easy/easy-client.tsx`:

(a) `import { useEasyResume } from "./use-resume-images";` 아래에 `import { askSubmission, carryChoices, type EasyCarry } from "./turn-carry";` 를 더한다

(b) `  const [askLook, setAskLook] = React.useState("");` 아래에 더한다:

```tsx
  // 같은 말에 이어 답할 때 앞서 고른 비율 · 그림체(설계 B2). 새로 친 말이면 비운다.
  const carried = React.useRef<EasyCarry>({});
```

(c) 아래를 찾아:

```tsx
    if (!prompt || (!다시 && !turn.canSend)) return;
    // 고른 갈래는 이어지는 답에만 싣는다. 새로 친 말은 서버가 다시 가른다(2단계 §4).
    const kind = cardnews.beginTurn({ explicit: 다시?.kind, continuing: Boolean(다시 || 말답), photoMode: photoAsking?.mode });
```

이렇게 바꾼다:

```tsx
    if (!prompt || (!다시 && !turn.canSend)) return;
    const 이어감 = Boolean(다시 || 말답);
    const 고른값 = carryChoices({ continuing: 이어감, carry: carried.current, picked: 다시 });
    carried.current = 고른값;
    // 고른 갈래는 이어지는 답에만 싣는다. 새로 친 말은 서버가 다시 가른다(2단계 §4).
    const kind = cardnews.beginTurn({ explicit: 다시?.kind, continuing: 이어감, photoMode: photoAsking?.mode });
```

(d) 아래를 찾아:

```tsx
          ...(다시?.ratio ? { ratio: 다시.ratio } : {}),
          ...(다시?.look ? { look: 다시.look } : {}),
```

이렇게 바꾼다:

```tsx
          ...(고른값.ratio ? { ratio: 고른값.ratio } : {}),
          ...(고른값.look ? { look: 고른값.look } : {}),
```

(e) `                void send({ prompt: 보낼말, ratio: askRatio, look: askLook });` 를 `                void send(askSubmission(보낼말, { ratio: askRatio, look: askLook }));` 로

- [ ] **Step 5: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__`
Expected: PASS (실패 0)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 6: 커밋**

```bash
git add apps/web/app/easy/turn-carry.ts apps/web/app/easy/easy-client.tsx apps/web/app/easy/__tests__/turn-carry.test.ts
git commit -m "fix(easy): 「이대로 만들기」는 기본 비율로 보내고 물음에 답할 때 고른 값을 함께 싣는다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 광고 물음 단추 · 「광고소재 열기」 (A5 화면)

**Files:**
- Create: `apps/web/app/easy/_components/ad-rows.tsx`
- Modify: `apps/web/app/easy/_components/message.tsx` (도우미 줄 갈래, `onAdChoice`)
- Modify: `apps/web/app/easy/easy-client.tsx` (`send(다시?, 친말?)`, 마지막 물음 줄에만 단추)
- Test (더함): `apps/web/app/easy/__tests__/message-row.test.tsx`

**Interfaces:**
- Consumes: Task 3 의 `AD_CHOICE_IMAGE`, `AD_CHOICE_SPECS`, `AD_HREF`, `isAdQuestion`, `isAdGuide`, `visibleBody`
- Produces: `EasyAdQuestion({ body, bubble, onChoose? })`, `EasyAdGuide({ body, bubble })`, `EasyMessageRow` 새 prop `onAdChoice?: (answer: string) => void`, 화면 `send(다시?: EasyResend, 친말?: string)`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/message-row.test.tsx`:
- 맨 위 import 에 `import { readFileSync } from "node:fs";` 를 더한다
- `import { EasyMessageRow } from "../_components/message";` 아래에 더한다:

```tsx
import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_QUESTION, adGuideBody } from "../ad-ask";

const 글자 = (node: unknown): string => typeof node === "string"
  ? node
  : node && typeof node === "object" && "children" in node
    ? ((node as { children: unknown[] }).children ?? []).map(글자).join("")
    : "";
```

- 파일 끝에 더한다:

```tsx
describe("광고 물음 · 안내 줄 (A5)", () => {
  const 물음 = { id: "q", role: "assistant" as const, body: AD_QUESTION };

  it("단추를 넘기면 두 단추를 달고, 누르면 그 글을 보낸다", () => {
    const onAdChoice = vi.fn();
    act(() => { view = create(<EasyMessageRow message={물음} onAdChoice={onAdChoice} />); });
    const 단추 = view.root.findAllByType("button");
    expect(단추.map(글자)).toEqual([AD_CHOICE_IMAGE, AD_CHOICE_SPECS]);
    act(() => { 단추[1]!.props.onClick(); });
    expect(onAdChoice).toHaveBeenCalledWith(AD_CHOICE_SPECS);
  });

  /** Review Focus 1 — 지난 물음 · 보내는 중에는 단추가 없다. */
  it("단추를 안 넘기면 물음 글만 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={물음} />); });
    expect(view.root.findAllByType("button")).toHaveLength(0);
    expect(글()).toContain("규격별로 이미지를 베리에이션하고 싶으세요?");
  });

  it("안내 줄은 표시를 떼고 보이고 「광고소재 열기」를 /ad 로 단다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "g", role: "assistant", body: adGuideBody("「광고소재」에서 합니다.") }} />); });
    expect(글()).toContain("「광고소재」에서 합니다.");
    expect(글()).not.toContain("ad-guide:");
    const 고리 = view.root.findByType("a");
    expect(고리.props.href).toBe("/ad");
    expect(글자(고리)).toBe("광고소재 열기");
  });
});

describe("화면이 마지막 물음에만 단추를 단다 (Review Focus 1)", () => {
  const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");

  it("마지막 줄이고 보내는 중이 아닐 때만 단추를 넘기고, 누르면 그 글을 새 말로 보낸다", () => {
    expect(화면).toContain(
      "onAdChoice={message.id === shown[shown.length - 1]?.id && !turn.busy ? (answer) => void send(undefined, answer) : undefined}",
    );
    expect(화면).toContain("const prompt = 다시?.prompt ?? 말답?.prompt ?? 친말 ?? draft.trim();");
  });

  /**
   * 최종 리뷰(2026-10-06): 단추로 보낸 턴이 실패하면 단추 글(「광고 이미지 만들기」)이 입력창에
   * 들어갔다. 사용자가 친 말이 아니라 되돌릴 것이 없다 — 쓰던 말도 지우지 않는다(Step 5(c)).
   */
  it("단추로 보낸 턴이 실패해도 단추 글을 입력창에 넣지 않는다", () => {
    expect(화면).toContain("if (!친말) setDraft(prompt);");
    expect(화면).not.toMatch(/\n\s*setDraft\(prompt\);/);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/message-row.test.tsx`
Expected: FAIL — 단추 0개(물음 줄이 그냥 말풍선), 안내 줄에 `ad-guide:` 가 보이고 `a` 가 없음, 화면 글자 없음

- [ ] **Step 3: `ad-rows.tsx` 를 만든다**

`apps/web/app/easy/_components/ad-rows.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@fixup/ui";
import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_HREF } from "../ad-ask";

/**
 * **광고 물음 줄 · 규격 안내 줄**(2026-10-06 설계 A5).
 *
 * 둘 다 대화에 남은 도우미 줄이다. 물음 줄의 단추는 **마지막 줄일 때만** 화면이 넘긴다 —
 * 지난 물음의 단추를 누르면 지금 맥락과 다른 지시로 값이 나간다. 단추 대신 말로 답해도 된다.
 */
export function EasyAdQuestion({ body, bubble, onChoose }: {
  body: string;
  bubble: string;
  onChoose?: (answer: string) => void;
}) {
  return (
    <div className="grid max-w-[85%] gap-2">
      <p className={bubble}>{body}</p>
      {onChoose ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onChoose(AD_CHOICE_IMAGE)}>{AD_CHOICE_IMAGE}</Button>
          <Button size="sm" variant="secondary" onClick={() => onChoose(AD_CHOICE_SPECS)}>{AD_CHOICE_SPECS}</Button>
        </div>
      ) : null}
    </div>
  );
}

/** 규격 안내 줄. 상세페이지 안내처럼 그 줄에 도구로 가는 단추를 단다. */
export function EasyAdGuide({ body, bubble }: { body: string; bubble: string }) {
  return (
    <div className="grid max-w-[85%] gap-2">
      <p className={bubble}>{body}</p>
      <Button asChild size="sm" variant="secondary" className="w-fit">
        <Link href={AD_HREF}>광고소재 열기</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: 줄 그리기에 잇는다**

`apps/web/app/easy/_components/message.tsx`:

(a) `import { DETAIL_PAGE_HREF, isDetailPageGuide } from "../detail-page";` 아래에 더한다:

```tsx
import { isAdGuide, isAdQuestion, visibleBody } from "../ad-ask";
import { EasyAdGuide, EasyAdQuestion } from "./ad-rows";
```

(b) props — `  failed,\n}: {` 를 `  failed,\n  onAdChoice,\n}: {` 로, 타입 끝 `  failed?: string;\n}) {` 를 아래로:

```tsx
  failed?: string;
  /** 광고 물음 줄의 단추를 누를 때(설계 A5). 화면이 마지막 물음 줄에만 넘긴다. */
  onAdChoice?: (answer: string) => void;
}) {
```

(c) 도우미 줄의 마지막 갈래를 찾아:

```tsx
        ) : (
          <p className={cn("max-w-[85%]", 말풍선)}>{message.body}</p>
        )}
```

이렇게 바꾼다:

```tsx
        ) : isAdQuestion(message) ? (
          <EasyAdQuestion body={message.body} bubble={말풍선} onChoose={onAdChoice} />
        ) : isAdGuide(message) ? (
          <EasyAdGuide body={visibleBody(message)} bubble={말풍선} />
        ) : (
          <p className={cn("max-w-[85%]", 말풍선)}>{message.body}</p>
        )}
```

- [ ] **Step 5: 화면이 단추 글을 새 말로 보낸다**

`apps/web/app/easy/easy-client.tsx`:

(a) `send` 머리를 찾아:

```tsx
  async function send(
    /** 물어본 뒤 다시 보낼 때 쓴다. 비우면 입력창의 말을 보낸다. */
     다시?: EasyResend,
  ) {
```

이렇게 바꾼다:

```tsx
  async function send(
    /** 물어본 뒤 다시 보낼 때 쓴다. 비우면 입력창의 말을 보낸다. */
     다시?: EasyResend,
    /** 단추로 고른 답(광고 물음, 설계 A5). 입력창의 말 대신 새 말로 보낸다. */
    친말?: string,
  ) {
```

(b) 아래 두 줄을 찾아:

```tsx
    const 말답 = !다시 && photoAsking && draft.trim() ? photoAnswer(photoAsking, draft) : undefined;
    const prompt = 다시?.prompt ?? 말답?.prompt ?? draft.trim();
```

이렇게 바꾼다:

```tsx
    const 말답 = !다시 && !친말 && photoAsking && draft.trim() ? photoAnswer(photoAsking, draft) : undefined;
    const prompt = 다시?.prompt ?? 말답?.prompt ?? 친말 ?? draft.trim();
```

(c) 아래를 찾아:

```tsx
    } else {
      setDraft("");
```

이렇게 바꾼다(단추로 보낼 때는 쓰던 말을 지우지 않는다):

```tsx
    } else {
      if (!친말) setDraft("");
```

(c-2) 실패 뒤 되돌리기 — `catch` 안의 아래를 찾아:

```tsx
      // 다시 칠 수 있게 되돌린다. 친 말을 잃으면 처음부터 써야 한다.
      setDraft(prompt);
```

이렇게 바꾼다(최종 리뷰 2026-10-06 — 단추로 보낸 턴이 실패하면 단추 글이 입력창에 들어갔다):

```tsx
      // 다시 칠 수 있게 되돌린다. 친 말을 잃으면 처음부터 써야 한다.
      // 단추로 보낸 턴(친말)은 사용자가 친 말이 아니다 — 입력창에 넣지 않는다(쓰던 말도 그대로다).
      if (!친말) setDraft(prompt);
```

(d) 줄 그리기 — `              failed={failed[message.id]}` 다음 줄에 더한다:

```tsx
              onAdChoice={message.id === shown[shown.length - 1]?.id && !turn.busy ? (answer) => void send(undefined, answer) : undefined}
```

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__`
Expected: PASS (실패 0) — `shell-wiring.test.ts` · `chat-look.test.ts` 의 `message.tsx` 글자 검사도 그대로 초록

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/easy/_components/ad-rows.tsx apps/web/app/easy/_components/message.tsx apps/web/app/easy/easy-client.tsx apps/web/app/easy/__tests__/message-row.test.tsx
git commit -m "fix(easy): 광고 물음 줄에 두 단추를, 규격 안내 줄에 「광고소재 열기」를 단다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 라이브러리 「과정 보기」 → 쉽게 대화 (C)

**Files:**
- Create: `apps/web/app/library/easy-href.ts`
- Modify: `apps/web/lib/easy/store-core.ts` (끝에 함수 하나), `apps/web/lib/easy/store.ts:6-17, 47-51, 166-174, 292-301`
- Modify: `apps/web/app/api/easy/works/route.ts:19-20`
- Modify: `apps/web/app/library/works-tab.tsx:17-21, 119-130, 328, 538-563, 669, 699-707`
- Test: `apps/web/app/library/__tests__/easy-href.test.ts` (새), `apps/web/app/library/__tests__/works-tab-easy-href.test.tsx` (새), `apps/web/app/api/easy/__tests__/works-route.test.ts` (새)
- Test (더함): `apps/web/lib/easy/__tests__/work-ids.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `store-core.ts`: `collectEasyWorkConversations(page: (from: number, to: number) => PromiseLike<{ data: { work_id: string | null; conversation_id: string }[] | null; error: { message: string } | null }>): Promise<Record<string, string>>` (`collectEasyWorkIds` 는 관리자 목록이 쓰므로 그대로 둔다)
  - `EasyStore.listWorkConversations(): Promise<Record<string, string>>` — `listWorkIds()` 를 **대신한다**(쓰는 곳이 works 라우트 하나뿐)
  - `GET /api/easy/works` → `{ ok: true, workIds: string[], conversations: Record<string, string> }`
  - `easy-href.ts`: `interface EasyWorks { ids: Set<string>; conversations: Map<string, string> }`, `readEasyWorks(body: unknown): EasyWorks | null`, `stepsHref(work: { id: string; tool: string; href: string; mine: boolean }, conversations: ReadonlyMap<string, string> | null): string`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/easy/__tests__/work-ids.test.ts` — import 를 `import { EASY_WORK_PAGE, collectEasyWorkConversations, collectEasyWorkIds } from "../store-core";` 로 바꾸고 파일 끝에 더한다:

```ts
describe("쉽게 작업 → 대화 (2026-10-06 설계 C)", () => {
  it("작업마다 그 대화를 준다 — 빈 칸은 빼고, 겹치는 작업은 처음 것", async () => {
    const map = await collectEasyWorkConversations(async () => ({
      data: [
        { work_id: "p1", conversation_id: "c1" }, { work_id: null, conversation_id: "c1" },
        { work_id: "p1", conversation_id: "c1" }, { work_id: "p2", conversation_id: "c2" },
      ],
      error: null,
    }));
    expect(map).toEqual({ p1: "c1", p2: "c2" });
  });

  it("한 쪽을 꽉 채우면 다음 쪽도 받는다", async () => {
    const 쪽 = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, index) => ({ work_id: `${prefix}${index}`, conversation_id: "c" }));
    const pages = [쪽(EASY_WORK_PAGE, "a"), 쪽(2, "b")];
    const map = await collectEasyWorkConversations(async () => ({ data: pages.shift() ?? [], error: null }));
    expect(Object.keys(map)).toHaveLength(EASY_WORK_PAGE + 2);
  });

  it("못 읽으면 실패다", async () => {
    await expect(collectEasyWorkConversations(async () => ({ data: null, error: { message: "boom" } })))
      .rejects.toThrow("boom");
  });
});
```

`apps/web/app/api/easy/__tests__/works-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1" } }),
}));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({ listWorkConversations: async () => ({ p1: "c1", p2: "c2" }) }),
}));

const { GET } = await import("../works/route");

describe("내 쉽게 작업 목록 (2026-10-06 설계 C)", () => {
  it("작업 id 목록은 그대로 주고, 작업 → 대화를 함께 준다", async () => {
    expect(await (await GET()).json()).toEqual({ ok: true, workIds: ["p1", "p2"], conversations: { p1: "c1", p2: "c2" } });
  });
});
```

`apps/web/app/library/__tests__/easy-href.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readEasyWorks, stepsHref } from "../easy-href";

/**
 * **「과정 보기」가 쉽게 대화로 간다**(2026-10-06 설계 C). 카드 주소가 늘 `/poster/{id}` ·
 * `/sns/{id}` 라 쉽게로 만든 것도 다양하게 · 카드뉴스 화면으로 갔다.
 */
const C = "11111111-1111-4111-8111-111111111111";
const 작업 = (over: Record<string, unknown> = {}) =>
  ({ id: "p1", tool: "poster", href: "/poster/p1", mine: true, ...over }) as { id: string; tool: string; href: string; mine: boolean };

describe("쉽게 작업 목록 읽기", () => {
  it("작업 id 와 작업 → 대화를 읽는다", () => {
    const easy = readEasyWorks({ ok: true, workIds: ["p1"], conversations: { p1: C } });
    expect([...easy!.ids]).toEqual(["p1"]);
    expect(easy!.conversations.get("p1")).toBe(C);
  });

  it("대화가 없는 옛 응답도 읽는다 — 거르기는 그대로 된다", () => {
    const easy = readEasyWorks({ ok: true, workIds: ["p1"] });
    expect([...easy!.ids]).toEqual(["p1"]);
    expect(easy!.conversations.size).toBe(0);
  });

  it("못 읽으면 null — 빈 목록으로 대신하지 않는다", () => {
    expect(readEasyWorks({ ok: false })).toBeNull();
    expect(readEasyWorks(null)).toBeNull();
  });

  it("대화 id 모양이 아니면 버린다", () => {
    expect(readEasyWorks({ ok: true, workIds: ["p1"], conversations: { p1: "../admin" } })!.conversations.size).toBe(0);
  });
});

describe("과정 보기 주소", () => {
  const 대화 = new Map([["p1", C], ["s1", C]]);

  it("내 쉽게 이미지는 그 대화로 간다", () => {
    expect(stepsHref(작업(), 대화)).toBe(`/easy/${C}`);
  });

  it("내 쉽게 카드뉴스도 그 대화로 간다", () => {
    expect(stepsHref(작업({ id: "s1", tool: "sns", href: "/sns/s1" }), 대화)).toBe(`/easy/${C}`);
  });

  /** Review Focus 4 */
  it("대화를 지웠으면(목록에 없음) 도구 화면 그대로", () => {
    expect(stepsHref(작업({ id: "p9", href: "/poster/p9" }), 대화)).toBe("/poster/p9");
  });

  it("남의 작업이면 도구 화면 그대로 — 남의 대화는 열 수 없다", () => {
    expect(stepsHref(작업({ mine: false }), 대화)).toBe("/poster/p1");
  });

  it("목록을 못 읽었거나 관리자 전체 보기면(null) 도구 화면 그대로", () => {
    expect(stepsHref(작업(), null)).toBe("/poster/p1");
  });

  it("상세페이지 · 리디자인은 건드리지 않는다", () => {
    expect(stepsHref(작업({ tool: "create", href: "/create?draft=p1" }), 대화)).toBe("/create?draft=p1");
  });
});
```

`apps/web/app/library/__tests__/works-tab-easy-href.test.tsx`:

```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ push: vi.fn(), conversations: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: st.push, replace: vi.fn() }) }));
vi.mock("../../_components/image-viewer", () => ({ openImageGallery: vi.fn() }));
vi.mock("../../_components/thumb-image", () => ({ ThumbImage: () => null }));
// 지우기 확인 창은 Radix 포털이라 이 렌더러가 못 그린다 — `works-tab-document-delete.test.tsx` 와 같은 모의.
vi.mock("@fixup/ui", async (load) => {
  const actual = await load<Record<string, unknown>>();
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: Box, DialogHeader: Box, DialogTitle: Box, DialogDescription: Box, DialogFooter: Box,
  };
});

import { WorksTab } from "../works-tab";

/** **라이브러리에서 쉽게 작업을 열면 쉽게 대화로**(2026-10-06 설계 C, 사용자 보고 3). */
const P = "44444444-4444-4444-8444-444444444444";
const C = "11111111-1111-4111-8111-111111111111";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function reply(url: string): Response {
  if (url.startsWith("/api/showcase/manage")) return json(403, { ok: false });
  if (url.startsWith("/api/sns/projects")) return json(200, { ok: true, projects: [] });
  if (url.startsWith("/api/poster/projects")) {
    return json(200, { ok: true, projects: [{
      id: P, title: "쉽게 포스터", status: "generating", ratio: "1:1", modelId: "gpt-image-2",
      createdAt: "2026-10-06T00:00:00.000Z", updatedAt: "2026-10-06T00:00:00.000Z", data: { instruction: "포스터" }, images: [],
    }] });
  }
  if (url.startsWith("/api/easy/works")) {
    return json(200, st.conversations ? { ok: true, workIds: [P], conversations: { [P]: C } } : { ok: true, workIds: [P] });
  }
  if (url.startsWith("/api/library")) return json(200, { ok: true, items: [] });
  return json(404, { ok: false });
}

let view: ReactTestRenderer;
const flush = async () => { for (let i = 0; i < 20; i += 1) await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); }); };
async function 연다() {
  await act(async () => { view = create(<WorksTab />); });
  await flush();
}
const 과정보기 = () => view.root.find((node) => node.type === "button" && node.props["aria-label"] === "쉽게 포스터 과정 보기");
/**
 * **제목으로 그 카드를 찾는다**(최종 리뷰 2026-10-06). 「처음 나온 cursor-pointer」로 고르면
 * 카드가 늘거나 다른 누를 것이 같은 꼴이면 엉뚱한 것을 누른다. 카드 본문(누르면 뷰어 · 이동)
 * 가운데 **이 제목 글자를 품은 것** 하나만 고른다 — 둘 이상이면 `find` 가 실패해 알려 준다.
 */
const 카드 = (title: string) => view.root.find((node) =>
  typeof node.type === "string"
  && typeof node.props.onClick === "function"
  && String(node.props.className ?? "").includes("cursor-pointer")
  && node.findAll((child) => child.children.includes(title)).length > 0);

beforeEach(() => {
  st.push.mockReset();
  st.conversations = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => reply(url)));
});
afterEach(() => { act(() => view?.unmount()); vi.unstubAllGlobals(); });

describe("과정 보기 → 쉽게 대화", () => {
  it("내 쉽게 작업의 과정 보기는 그 대화로 간다", async () => {
    await 연다();
    await act(async () => { 과정보기().props.onClick({ stopPropagation() {} }); });
    expect(st.push).toHaveBeenCalledWith(`/easy/${C}`);
  });

  it("그림 없는 카드를 눌러도 그 대화로 간다", async () => {
    await 연다();
    await act(async () => { 카드("쉽게 포스터").props.onClick(); });
    expect(st.push).toHaveBeenCalledWith(`/easy/${C}`);
  });

  it("대화를 모르는 옛 응답이면 지금처럼 도구 화면으로 간다", async () => {
    st.conversations = false;
    await 연다();
    await act(async () => { 과정보기().props.onClick({ stopPropagation() {} }); });
    expect(st.push).toHaveBeenCalledWith(`/poster/${P}`);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run lib/easy/__tests__/work-ids.test.ts app/api/easy/__tests__/works-route.test.ts app/library/__tests__/easy-href.test.ts app/library/__tests__/works-tab-easy-href.test.tsx`
Expected: FAIL — `collectEasyWorkConversations is not a function`, `listWorkConversations is not a function`, `Cannot find module '../easy-href'`, 과정 보기가 `/poster/…` 로 감

- [ ] **Step 3: 저장소가 작업 → 대화를 준다**

`apps/web/lib/easy/store-core.ts` 파일 끝에 더한다:

```ts
type WorkConversationPage = PromiseLike<{
  data: { work_id: string | null; conversation_id: string }[] | null;
  error: { message: string } | null;
}>;

/**
 * 쉽게 대화의 그림 줄이 가리키는 작업 → **그 대화**(2026-10-06 설계 C). 라이브러리
 * 「과정 보기」가 쉽게 작업을 그 대화로 보낸다. 한 작업은 한 대화에서 나오므로 처음 본
 * 것을 쓴다. 1000줄에서 잘리지 않게 끝날 때까지 나눠 받는다(`collectEasyWorkIds` 와 같다).
 */
export async function collectEasyWorkConversations(
  page: (from: number, to: number) => WorkConversationPage,
): Promise<Record<string, string>> {
  const found = new Map<string, string>();
  for (let from = 0; ; from += EASY_WORK_PAGE) {
    const { data, error } = await page(from, from + EASY_WORK_PAGE - 1);
    if (error) throw new Error(`쉽게 작업 목록: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      if (row.work_id && !found.has(row.work_id)) found.set(row.work_id, row.conversation_id);
    }
    if (rows.length < EASY_WORK_PAGE) return Object.fromEntries(found);
  }
}
```

`apps/web/lib/easy/store.ts`:

(a) import 의 `  collectEasyWorkIds,` 를 `  collectEasyWorkConversations,` 로

(b) 인터페이스의 아래를 찾아:

```ts
  /**
   * 내 쉽게 대화가 만든 작업의 id. 라이브러리가 쉽게와 다양하게를 가르는 데 쓴다 —
   * 둘 다 같은 포스터 작업으로 저장되어 작업만 보고는 못 가른다.
   */
  listWorkIds(): Promise<string[]>;
```

이렇게 바꾼다:

```ts
  /**
   * 내 쉽게 대화가 만든 작업 → 그 대화. 라이브러리가 쉽게와 다양하게를 가르고(작업만
   * 보고는 못 가른다), 「과정 보기」를 그 대화로 보내는 데 쓴다(2026-10-06 설계 C).
   */
  listWorkConversations(): Promise<Record<string, string>>;
```

(c) Supabase 쪽의 아래를 찾아:

```ts
    async listWorkIds() {
      const supabase = await createSupabaseServerClient();
      return collectEasyWorkIds((from, to) => supabase
        .from("easy_messages")
        .select("work_id")
```

이렇게 바꾼다:

```ts
    async listWorkConversations() {
      const supabase = await createSupabaseServerClient();
      return collectEasyWorkConversations((from, to) => supabase
        .from("easy_messages")
        .select("work_id,conversation_id")
```

(d) 로컬 쪽의 아래를 찾아:

```ts
    async listWorkIds() {
      return database.read((data) => {
        const mine = new Set(bucket(data, "easyConversations")
          .filter((row) => row.userId === userId)
          .map((row) => row.id));
        return [...new Set(bucket(data, "easyMessages")
          .filter((row) => row.workId && mine.has(row.conversationId))
          .map((row) => row.workId!))];
      });
    },
```

이렇게 바꾼다:

```ts
    async listWorkConversations() {
      return database.read((data) => {
        const mine = new Set(bucket(data, "easyConversations")
          .filter((row) => row.userId === userId)
          .map((row) => row.id));
        const found = new Map<string, string>();
        for (const row of bucket(data, "easyMessages")) {
          if (row.workId && mine.has(row.conversationId) && !found.has(row.workId)) found.set(row.workId, row.conversationId);
        }
        return Object.fromEntries(found);
      });
    },
```

`apps/web/app/api/easy/works/route.ts` 의 아래를 찾아:

```ts
    const workIds = await easyStoreForUser(auth.member.userId).listWorkIds();
    return Response.json({ ok: true, workIds });
```

이렇게 바꾼다:

```ts
    const conversations = await easyStoreForUser(auth.member.userId).listWorkConversations();
    // `workIds` 는 그대로 준다 — 쉽게와 다양하게를 가르는 화면이 이 칸을 읽는다(설계 C).
    return Response.json({ ok: true, workIds: Object.keys(conversations), conversations });
```

- [ ] **Step 4: `easy-href.ts` 를 만든다**

`apps/web/app/library/easy-href.ts`:

```ts
/**
 * 라이브러리 「과정 보기」 · 그림 없는 카드가 **어디로 가나**(2026-10-06 설계 C).
 *
 * 쉽게로 만든 작업도 포스터 · 카드뉴스 작업으로 저장되어 카드 주소가 늘 `/poster/{id}` ·
 * `/sns/{id}` 였다. 그래서 쉽게 작업의 과정 보기가 다양하게 · 카드뉴스 화면으로 갔다.
 * **내** 쉽게 작업이면 그 대화(`/easy/{대화}`)로 보낸다. 대화를 지웠거나(목록에 없음),
 * 남의 작업이거나, 목록을 못 읽었으면(관리자 전체 보기 포함) 지금처럼 도구 화면이다 —
 * 남의 대화는 열 수 없다.
 *
 * 순수한 규칙이라 값으로 잰다(`__tests__/easy-href.test.ts`).
 */
export interface EasyWorks {
  ids: Set<string>;
  conversations: Map<string, string>;
}

const 대화모양 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/api/easy/works` 의 답. 못 읽으면 `null` — 빈 목록으로 대신하면 쉽게 작업이 「다양하게」로 간다. */
export function readEasyWorks(body: unknown): EasyWorks | null {
  const value = body as { ok?: unknown; workIds?: unknown; conversations?: unknown } | null;
  if (!value?.ok || !Array.isArray(value.workIds)) return null;
  const ids = new Set(value.workIds.filter((id): id is string => typeof id === "string"));
  const conversations = new Map<string, string>();
  if (value.conversations && typeof value.conversations === "object") {
    for (const [workId, conversationId] of Object.entries(value.conversations as Record<string, unknown>)) {
      if (typeof conversationId === "string" && 대화모양.test(conversationId)) conversations.set(workId, conversationId);
    }
  }
  return { ids, conversations };
}

/** 과정 보기 · 그림 없는 카드가 갈 주소. */
export function stepsHref(
  work: { id: string; tool: string; href: string; mine: boolean },
  conversations: ReadonlyMap<string, string> | null,
): string {
  if (!work.mine || !conversations) return work.href;
  if (work.tool !== "poster" && work.tool !== "sns") return work.href;
  const conversationId = conversations.get(work.id);
  return conversationId ? `/easy/${conversationId}` : work.href;
}
```

- [ ] **Step 5: 작업물 탭에 잇는다**

`apps/web/app/library/works-tab.tsx`:

(a) `} from "./work-filter";` 아래에 `import { readEasyWorks, stepsHref, type EasyWorks } from "./easy-href";` 를 더한다

(b) 아래를 찾아:

```tsx
async function readEasyWorkIds(): Promise<Set<string> | null> {
  try {
    const body = await (await fetch("/api/easy/works", { cache: "no-store" })).json();
    return body?.ok && Array.isArray(body.workIds) ? new Set(body.workIds as string[]) : null;
  } catch {
    return null;
  }
}
```

이렇게 바꾼다:

```tsx
async function fetchEasyWorks(): Promise<EasyWorks | null> {
  try {
    return readEasyWorks(await (await fetch("/api/easy/works", { cache: "no-store" })).json());
  } catch {
    return null;
  }
}
```

(그 위 주석 「쉽게로 만든 작업 id. **못 읽으면 `null`**…」은 그대로 둔다)

(c) `  const [easyIds, setEasyIds] = React.useState<Set<string> | null>(null);` 아래에 더한다:

```tsx
  const [easyConversations, setEasyConversations] = React.useState<Map<string, string> | null>(null); // 쉽게 작업 → 대화(설계 C)
```

(d) 효과 안 `    setEasyIds(null);` 다음 줄에 `    setEasyConversations(null);` 를 더한다

(e) 회원 쪽 — `                readEasyWorkIds(),` 를 `                fetchEasyWorks(),` 로, `              if (alive) setEasyIds(easy);` 를 `              if (alive) { setEasyIds(easy?.ids ?? null); setEasyConversations(easy?.conversations ?? null); }` 로

(f) 카드 — `onClick={() => (work.imageCount ? void openWork(work) : router.push(work.href))}` 를 `onClick={() => (work.imageCount ? void openWork(work) : router.push(stepsHref(work, easyConversations)))}` 로

(g) 과정 보기 — 아래를 찾아:

```tsx
                  // 카드를 누른 것으로도 읽히면 뷰어와 이동이 함께 일어난다.
                  event.stopPropagation();
                  router.push(work.href);
```

이렇게 바꾼다:

```tsx
                  // 카드를 누른 것으로도 읽히면 뷰어와 이동이 함께 일어난다.
                  event.stopPropagation();
                  router.push(stepsHref(work, easyConversations));
```

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/library/__tests__ lib/easy/__tests__ app/api/easy/__tests__`
Expected: PASS (실패 0) — `works-tab-document-delete.test.tsx` 도 초록(옛 꼴 `{ ok: true, workIds: [] }` 를 그대로 읽는다)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

Run: `wc -l apps/web/app/library/works-tab.tsx`
Expected: 800 이하

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/easy/store-core.ts apps/web/lib/easy/store.ts apps/web/app/api/easy/works/route.ts apps/web/app/library/easy-href.ts apps/web/app/library/works-tab.tsx apps/web/lib/easy/__tests__/work-ids.test.ts apps/web/app/api/easy/__tests__/works-route.test.ts apps/web/app/library/__tests__/easy-href.test.ts apps/web/app/library/__tests__/works-tab-easy-href.test.tsx
git commit -m "fix(library): 쉽게로 만든 작업의 과정 보기는 그 쉽게 대화로 간다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 실제 모델 확인 · 최종 확인

**Files:**
- Create (저장소 밖): `C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/easy-chat-flow-eval.mts`
- 저장소 파일은 바꾸지 않는다(실패가 나오면 멈추고 보고한다)

**Interfaces:**
- Consumes: Task 1~9 전부 — `createEasyChatProvider`, `judgeEasyTurn`, `writeAdGuide`, `easyAdStep`, `adImageInstruction(rows, prompt, answered)`, `AD_ANSWER_NOTE`, `AD_QUESTION`, `adGuideBody`
- Produces: 검증 결과(사용자 보고용)

**이 Task 가 확인하지 않는 것 — B3(다시 열면 이어 받기).** 로컬 개발 서버는 React StrictMode 라 효과가 한 번 꺼졌다 켜지며 `alive` ref 가 `false` 로 남는다(`easy-client.tsx` 의 `React.useEffect(() => () => { alive.current = false; }, [])`, 설계 §3 「개발 서버 전용 문제」). 그래서 로컬에서는 이어 받기가 시작하자마자 멈춘다 — **로컬 결과로 B3 가 된다 · 안 된다를 말하지 않는다.** B3 는 단위 시험(Task 5 · 6)과 **배포 뒤 사용자 손 확인(만드는 중 새로고침)**으로만 본다. 보고에도 그렇게 적는다.

- [ ] **Step 1: 실제 모델 확인 스크립트를 쓴다 (값 몇백 원)**

**Write 도구로** 만든다(heredoc 은 `\n` 을 먹는다). 키는 파일 안에서 읽고 출력하지 않는다.

```ts
import { readFileSync } from "node:fs";
import { createEasyChatProvider } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/lib/easy/chat-provider.ts";
import { judgeEasyTurn } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/lib/easy/judge.ts";
import { writeAdGuide } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/lib/easy/ad-turn.ts";
import { AD_ANSWER_NOTE, AD_QUESTION, adGuideBody, adImageInstruction, easyAdStep } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/app/easy/ad-ask.ts";

// 키 이름만 고른다. 값은 출력하지 않는다.
const env = Object.fromEntries(
  readFileSync("C:/Users/PC/Desktop/coding/fixup-image-agent/apps/web/.env.local", "utf8").split(/\r?\n/)
    .filter((line) => line.startsWith("ANTHROPIC_API_KEY="))
    .map((line) => [line.split("=")[0], line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const provider = createEasyChatProvider(env, "claude-sonnet-5");

type Row = { id: string; role: "user" | "assistant" | "image"; body: string; workId?: string };
const 없음 = { hasDraft: false, made: false, madeImage: false };
const 첫말 = "2번째 사진에 있는 사람들은 화장품으로 변경 (기초 화장품 : 로션 스킨 앰플 크림) 왼쪽 위에 문구 \" 겨울철에 화장품 한 알 챙기세요\" 오른쪽 밑에 로고는 1번쨰 사진에 있는 로고로 바꿔주세요 상자에 있는 문구는 \"fixup beauty\"으로 수정";
const 캡처말 = "두번째 사진에 있는 사람을 화장품 으로 바꿔줘 (기초 화장품 : 로션, 스킨, 크림, 세럼) 그리고 박스에 있는 문구는 fixupbeauty 왼쪽 위에 문구는 \"겨울철에 화장품 한알씩 챙기세요\", 오른쪽 아래 부분은 첫번째 사진 로고로 바꿔줘";
const 옛고정문장 = "이 대화에는 아직 고칠 이미지나 카드뉴스가 없습니다. 먼저 무엇을 만들지 알려 주세요. 예: 「카페 신메뉴 포스터 만들어줘」";
const 광고말 = "겨울 화장품 광고 소재 만들어줘";
const 물은뒤: Row[] = [{ id: "u1", role: "user", body: 광고말 }, { id: "q1", role: "assistant", body: AD_QUESTION }];

interface Case {
  name: string; history: Row[]; prompt: string; attachments?: number; choices?: typeof 없음;
  // instructionIs: 지시가 정확히 이 글이어야 한다(답이 아닌 말에 처음 말이 섞이지 않는지).
  expect: string[]; instructionHas?: string; instructionIs?: string; replyHas?: string;
}
const cases: Case[] = [
  { name: "운영 18:25 첫 말 · 사진 2", history: [], prompt: 첫말, attachments: 2, expect: ["image"] },
  { name: "캡처 첫 말 · 사진 2", history: [], prompt: 캡처말, attachments: 2, expect: ["image"] },
  // either 면 「이미지 한 장」 단추 → A2 로 반드시 새 이미지다
  { name: "캡처 두 번째 말 · 사진 2", history: [{ id: "1", role: "user", body: 캡처말 }, { id: "2", role: "assistant", body: 옛고정문장 }], prompt: "광고 사진을 만들어주세요", attachments: 2, expect: ["image", "either"] },
  { name: "「광고 소재 만들어줘」", history: [], prompt: "광고 소재 만들어줘", expect: ["ask(code)"] },
  { name: "물음 뒤 말로 「사이즈별로요」", history: 물은뒤, prompt: "사이즈별로요", expect: ["ad_specs"] },
  { name: "「광고 소재 네이버 카카오 규격별로」", history: [], prompt: "광고 소재 네이버 카카오 규격별로", expect: ["ad_specs"] },
  {
    name: "안내 뒤 「아니야, 이미지 더…」",
    history: [...물은뒤, { id: "u2", role: "user", body: "규격별로 베리에이션" }, { id: "g1", role: "assistant", body: adGuideBody("네이버 · 구글 · 카카오 규격별 이미지는 「광고소재」에서 만듭니다.") }],
    prompt: "아니야, 이미지 더 만들 거야. 겨울 화장품 이미지 만들어줘", expect: ["image"],
  },
  { name: "물음 뒤 말로 「광고 이미지로요」", history: 물은뒤, prompt: "광고 이미지로요", expect: ["image"], instructionHas: 광고말 },
  // 최종 리뷰(2026-10-06): 답이 아닌 이미지 주문에는 처음 말을 잇지 않는다 — 모델이 note 에 answer 를 안 적어야 한다.
  {
    name: "물음 뒤 딴 주문 「그건 됐고 고양이 포스터 만들어줘」", history: 물은뒤, prompt: "그건 됐고 고양이 포스터 만들어줘",
    expect: ["image"], instructionIs: "그건 됐고 고양이 포스터 만들어줘",
  },
  // 최종 리뷰(2026-10-06): 물음 바로 뒤에는 「광고 소재」가 또 있어도 다시 묻지 않는다(코드). either 면 갈래 단추로 이어진다.
  { name: "물음 뒤 「광고 소재로 쓸 이미지요」", history: 물은뒤, prompt: "광고 소재로 쓸 이미지요", expect: ["image", "either"] },
  { name: "「광고 소재 말고 그냥 이미지」", history: [], prompt: "광고 소재 말고 그냥 겨울 화장품 이미지 만들어줘", expect: ["image"] },
  { name: "만든 이미지 고치기", history: [{ id: "u1", role: "user", body: "카페 포스터 만들어줘" }, { id: "i1", role: "image", body: "", workId: "p1" }], prompt: "배경만 파랗게 바꿔줘", choices: { ...없음, madeImage: true }, expect: ["image_edit"] },
  { name: "카드뉴스 원고 고치기", history: [{ id: "u1", role: "user", body: "신메뉴 카드뉴스 만들어줘" }, { id: "i1", role: "image", body: "", workId: "s1" }], prompt: "더 짧게 써줘", choices: { ...없음, hasDraft: true }, expect: ["revise"] },
  // 최종 리뷰(2026-10-06): 되는지 **묻기만** 하면 talk, **만들어 달라면** 그 갈래(A4).
  { name: "질문 — 상세페이지 되나", history: [], prompt: "여기서 상세페이지도 만들 수 있어?", expect: ["talk"], replyHas: "상세페이지 만들기" },
  { name: "주문 — 상세페이지", history: [], prompt: "우리 화장품 상세페이지 만들어줘", expect: ["detail_page"] },
  { name: "주문 — 「광고 소재」 없이 규격별로", history: [], prompt: "이 이미지 네이버 구글 카카오 사이즈별로 다 만들어줘", expect: ["ad_specs"] },
  { name: "질문 — 쓰는 법", history: [], prompt: "포스터 만들 때 뭘 적어야 해?", expect: ["talk"] },
];

async function 한번(one: Case): Promise<{ 결과: string; 덧붙임: string }> {
  const 코드 = easyAdStep(one.prompt, one.history as never);
  if (코드 === "ask") return { 결과: "ask(code)", 덧붙임: "" };
  const decision = await judgeEasyTurn({
    decide: (text, wants) => provider.decide(text, wants),
    history: one.history as never, prompt: one.prompt, attachmentCount: one.attachments ?? 0,
    choices: one.choices ?? 없음, adStep: 코드,
  });
  let 결과: string = decision.wants;
  let 덧붙임 = "";
  if (결과 === "ad_specs") {
    const guide = await writeAdGuide((text) => provider.writeAdGuide(text), { prompt: one.prompt, imageCount: 0 });
    const 빠진것 = ["01", "02", "03", "크레딧", "1.2"].filter((word) => !guide.includes(word));
    if (빠진것.length) 결과 += `(안내 부족: ${빠진것.join(",")})`;
    덧붙임 = ` | ${guide.slice(0, 140)}`;
  }
  if (결과 === "image") {
    // 라우트와 같은 규칙 — 단추를 눌렀거나 모델이 답이라고 표시했을 때만 처음 말을 잇는다.
    const 답했나 = 코드 === "image" || decision.note === AD_ANSWER_NOTE;
    const 지시 = adImageInstruction(one.history as never, one.prompt, 답했나) ?? one.prompt;
    if (one.instructionHas && !지시.includes(one.instructionHas)) 결과 += "(지시 누락)";
    if (one.instructionIs !== undefined && 지시 !== one.instructionIs) 결과 += "(지시 섞임)";
    덧붙임 = ` | 지시: ${지시.slice(0, 60)}`;
  }
  if (결과 === "talk") {
    if (!decision.reply) 결과 += "(빈 답)";
    else if (one.replyHas && !decision.reply.includes(one.replyHas)) 결과 += "(답 부족)";
    덧붙임 = ` | ${decision.reply.slice(0, 120)}`;
  }
  return { 결과, 덧붙임 };
}

const runs = Number(process.argv[2] ?? 3);
let 실패 = 0;
for (const one of cases) {
  // 코드가 정하는 경우(묻기 · 단추 · 규격 낱말)는 모델 판단이 없으니 한 번만 돈다.
  const 횟수 = easyAdStep(one.prompt, one.history as never) ? 1 : runs;
  for (let i = 0; i < 횟수; i += 1) {
    const { 결과, 덧붙임 } = await 한번(one);
    const ok = one.expect.includes(결과);
    if (!ok) 실패 += 1;
    process.stdout.write(`${ok ? "OK  " : "FAIL"} ${one.name} #${i + 1}: ${결과}${덧붙임}\n`);
  }
}
process.stdout.write(`\n실패 ${실패}건\n`);
```

- [ ] **Step 2: 실제 모델로 돌린다**

Run:
```bash
cd C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web && NODE_PATH="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/stubs" npx tsx --conditions react-server "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/easy-chat-flow-eval.mts" 3
```
Expected: 마지막 줄 `실패 0건`. **하나라도 FAIL 이면 다음 단계로 가지 않는다** — 출력 전체를 사용자에게 그대로 보고하고 결정을 묻는다(프롬프트를 몰래 고치지 않는다). 키가 출력에 없는지 눈으로 확인한다.

- [ ] **Step 3: 전체 시험 · 타입 · 린트 · 비용 화면 검사**

각각 새로 돌리고 출력 끝까지 읽는다:

Run: `pnpm test`
Expected: 모든 패키지 실패 0

Run: `pnpm -r typecheck`
Expected: 모든 패키지 에러 0

Run: `pnpm lint`
Expected: 에러 0 (경고는 이번 변경 파일에 새로 생긴 것이 없어야 한다)

Run: `pnpm check:cost-forecast`
Expected: exit 0

- [ ] **Step 4: 처음 만들기 경로 0줄 · 크기 확인**

Run: `git diff --stat 7585059a -- apps/web/app/api/poster apps/web/app/api/sns packages apps/web/app/poster apps/web/app/sns`
Expected: 출력 없음

Run: `wc -l apps/web/app/easy/easy-client.tsx apps/web/app/library/works-tab.tsx apps/web/app/api/easy/generate/route.ts apps/web/app/easy/chat.ts`
Expected: `easy-client.tsx` 806 이하(처음 806), `works-tab.tsx` 800 이하. 줄 수를 보고에 적는다

Run: `git status --short`
Expected: 출력 없음(모두 커밋됨)

- [ ] **Step 5: 로컬 화면 확인 준비 (값이 드는 만들기는 하지 않는다)**

로컬에서 보는 것은 둘뿐이다 — 「이대로 만들기」(B1, Step 6)와 과정 보기 주소(C, Step 7). B3(다시 열어 이어 받기)는 여기서 보지 않는다(이 Task 머리의 까닭).

워크트리에는 `.env.local` 이 없다. 메인 폴더의 것을 복사한다(`.gitignore` 의 `.env*` 로 커밋되지 않는다). 이 파일은 **Supabase 가 비어 있어** 로컬 파일 저장소만 쓴다(CLAUDE.md).

Run: `cp C:/Users/PC/Desktop/coding/fixup-image-agent/apps/web/.env.local C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/.env.local`

Run (run_in_background): `cd C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow && pnpm --filter @fixup/web exec next dev -p 3108`
Expected: 출력에 `Ready` (Monitor 로 기다린다)

- [ ] **Step 6: 「이대로 만들기」 확인 — 브라우저 도구 한 번(단독 메시지)**

`mcp__plugin_playwright_playwright__browser_run_code_unsafe` 에 아래 code 를 넣는다. 두 요청 모두 **가로채서** 서버로 안 보낸다 — 판단 · 생성 값이 안 든다.

```js
async (page) => {
  const seen = [];
  await page.route('**/api/easy/generate', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = JSON.parse(route.request().postData() || '{}');
    seen.push(body);
    if (seen.length === 1) return route.fulfill({ json: { ok: true, asked: true, textModel: body.textModel } });
    return route.fulfill({ status: 400, json: { ok: false, message: '확인용으로 여기서 멈췄습니다', retryable: false } });
  });
  await page.goto('http://localhost:3108/easy');
  const skip = page.getByRole('button', { name: '없이 시작' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole('textbox').fill('바다 풍경 이미지 만들어줘');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '이대로 만들기' }).click();
  await page.getByText('확인용으로 여기서 멈췄습니다').waitFor();
  return seen.map((one) => ({ prompt: one.prompt, ratio: one.ratio ?? null, look: one.look ?? null }));
}
```

Expected: `[{ prompt: "바다 풍경 이미지 만들어줘", ratio: null, look: null }, { prompt: "바다 풍경 이미지 만들어줘", ratio: "1:1", look: null }]` — 두 번째 요청에 기본 비율이 실려 같은 물음이 다시 뜨지 않는다

- [ ] **Step 7: 라이브러리 과정 보기 확인 — 브라우저 도구 한 번(단독 메시지)**

로컬은 운영 데이터가 없으므로 목록 응답을 가로채 쉽게 작업 하나를 보인다:

```js
async (page) => {
  const P = '44444444-4444-4444-8444-444444444444';
  const C = '11111111-1111-4111-8111-111111111111';
  await page.route('**/api/showcase/manage', (route) => route.fulfill({ status: 403, json: { ok: false } }));
  await page.route('**/api/sns/projects', (route) => route.fulfill({ json: { ok: true, projects: [] } }));
  await page.route('**/api/poster/projects', (route) => route.fulfill({ json: { ok: true, projects: [{
    id: P, title: '쉽게 확인용', status: 'generating', ratio: '1:1', modelId: 'gpt-image-2',
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z', data: { instruction: '확인' }, images: [],
  }] } }));
  await page.route('**/api/easy/works', (route) => route.fulfill({ json: { ok: true, workIds: [P], conversations: { [P]: C } } }));
  await page.goto('http://localhost:3108/library');
  await page.getByRole('button', { name: '쉽게 확인용 과정 보기' }).click();
  await page.waitForURL('**/easy/' + C);
  return page.url();
}
```

Expected: `http://localhost:3108/easy/11111111-1111-4111-8111-111111111111` (그 대화가 로컬에 없어 404 화면이어도 된다 — 주소가 쉽게 대화인지 보는 것이다)

- [ ] **Step 8: 정리**

dev 서버를 끈다:

Run: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3108 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`

복사한 `.env.local` 을 지운다(이 단계에서 만든 복사본이다):

Run: `rm C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/.env.local`

Run: `git status --short`
Expected: 출력 없음. **푸시하지 않는다.**

- [ ] **Step 9: 보고**

사용자에게 쉬운 말로 적는다: 각 명령의 실제 결과(통과 수 · 에러 0 · exit 0), 실제 모델 표(17 경우 · 실패 수), 로컬 두 확인의 결과 주소 · 요청 값, `easy-client.tsx` 줄 수, 0줄 확인 출력. 배포 뒤 사용자 손 확인 둘(캡처와 같은 요청, 만드는 중 새로고침)이 남았다고 적는다. **「만드는 중 새로고침해도 이미지가 들어온다(B3)」는 로컬에서 확인하지 않았다고 분명히 적는다** — 개발 서버 StrictMode 때문에 로컬에서는 볼 수 없고(이 Task 머리), 단위 시험만 통과한 상태다. 배포 뒤 사용자 손 확인이 B3 의 첫 실제 확인이다.

---

## 자체 점검 (작성 뒤)

**1. 설계 대조**

| 설계 | Task |
|---|---|
| A1 선택지 = 쓸 수 있는 갈래, 프롬프트 · 틀 같은 함수 | 1 (`easyAvailableWants` · `easyChatSpec`) |
| A1-2 만든 것 없을 때 「사진 속 ○○ 바꿔줘」 = image | 1 (`easyFirstPhotoLines`) |
| A2 단추로 고른 갈래가 늘 이긴다(이어 온 갈래는 예전 규칙) | 2 (`kindPicked` · `골랐나`) |
| A3 빈 답 재질문, 그래도 비면 기본 문장, 골랐으면 재질문 없음 | 2 |
| A4 하는 일 · 안 하는 일, 만들어 달라는 말 ≠ 묻기만 하는 말 | 1 (`easyCapabilityLines(wants)`) · 3 (`ad_specs` 줄) |
| A5 묻는 때 · 안 묻는 때 · 코드 낱말 찾기 · 부정 · 물음 뒤 재질문 없음 | 3 (`easyAdStep` · `hasAdNegation`) · 4 (선택지에서 `ad_specs` 빼기) |
| A5 광고 이미지 = 물음 앞의 말 + 답(답일 때만) | 3 (`adImageInstruction(…, answered)` · `AD_ANSWER_NOTE` · `easyAdAnswerLines`) · 4 (라우트 `답했나` · `지시`) |
| A5 규격 안내 = LLM + 코드가 넣는 사실(화면 단계 이름 · 실제 값) + `/ad` 단추 | 3 (`ad-guide.ts` 가 `AD_STEPS` · `AD_SPECS` 를 읽음) · 4 (`writeAdGuide` 실패 시 대신 쓰는 안내 · `countEasyImages` · `adGuideTurn`) · 8 (`EasyAdGuide`) |
| A5 물음 · 안내 줄 저장, 말로 답해도 · 새로고침 뒤에도 · 단추 답이 실패한 뒤에도 | 4 (도우미 줄 저장) · 3 (`easyAdAnswerLines`) · 5 (`adQuestionOrigin` 이 단추 답 + 실패 줄을 건너뜀) |
| A5 대화는 끊기지 않는다(모드 없음) | 3 · 4 의 「물음이 마지막 줄이 아니면」 · 「안내 뒤 이미지」 · 「답이 아닌 이미지 주문」 시험 |
| B1 「이대로 만들기」 기본값 | 7 |
| B2 고른 것 한 묶음 | 7 (비율 · 그림체) + 기존 `continuingKind`(갈래) |
| B3 다시 열면 이어 받기(안 끝난 요청만) | 5 (`;job=`) · 6 (`pending-requests.ts` · `pendingJobRowIds` · `useEasyResume`) — 확인은 배포 뒤 손 확인(10) |
| B4 실패도 대화에(알고 낸 실패가 아니면 일반 문장) | 5 · 8 (실패 뒤 단추 글을 입력창에 안 넣음) |
| B5 0장이면 실패 | 6 (`NO_IMAGE_MADE`) |
| C 작업 → 대화, 내 쉽게 작업만, 지웠거나 남의 것이면 그대로 | 9 |
| §5 단위 시험 목록 | 1~9 의 시험 |
| §5 실제 모델 · 로컬 화면 · 처음 만들기 0줄 | 10 |

빠진 것 없음. D1~D3 은 범위 밖(2차). 광고 물음 뒤 카드뉴스로 답할 때 처음 말을 잃는 것도 2차 D1(「범위 밖 · 알려 둘 것」).

**최종 리뷰 반영 (2026-10-06)**

| # | 고친 것 | 자리 |
|---|---|---|
| 1 | 물음 바로 뒤에는 `ask` 를 다시 내지 않는다(규격 낱말 → `specs`, 아니면 판단 모델) | Task 3 Step 1 · 3 (`easyAdStep`), Task 4 Step 1 (라우트 시험) |
| 2 | 처음 말 잇기는 단추 또는 `note` = `answer` 일 때만 | Task 3 Step 1 · 3 · 5 · 6, Task 4 Step 1 · 5(f), Task 10 (「딴 주문」 경우) |
| 3 | 안내 사실을 코드에 맞춤 — 단계 이름은 `AD_STEPS`, 투명 규격만 1크레딧(`AD_SPECS` · `lib/ad/cost.ts`) | Task 3 Files · Step 1 · 4, 설계 A5 |
| 4 | `easyCapabilityLines(wants)` — 만들어 달라면 그 갈래, 묻기만 하면 talk, `ad_specs` 는 있을 때만 | Task 1 Step 1 · 3 · 4(f), Task 3 Step 1 · 5 · 6(i), Task 10 |
| 5 | 이미지 수 = 서로 다른 포스터 작업 수(`countEasyImages`) | Task 4 Step 1 · 4 · 5(d) |
| 6 | 다시 열기는 안 끝난 요청(`costUsd` 빈 것)의 줄만 | Task 6 Files · Step 1 · 4 · 4-2 · 6 |
| 7 | 단추로 고른 턴에만 `kindPicked`, 서버는 그때만 강제 | Task 2 Interfaces · Step 1 · 5(b)(c)(d) |
| 8 | 안내 글 모델이 실패해도 대신 쓰는 안내 | Task 4 Step 1 · 4 |
| 9 | 실패 뒤 단추 글을 입력창에 안 넣음, 단추 답 + 실패 줄 건너뛰기 | Task 8 Step 1 · 5(c-2), Task 5 Step 1 · 5 |
| 10 | 광고 물음 뒤 카드뉴스 답 → 범위 밖(2차 D1) | 「범위 밖 · 알려 둘 것」, 설계 §3 |
| 11 | 골랐으면 A3 재질문 · 규격 안내 쓰기 없음 | Task 2 Step 1 · 4, Task 4 Step 1 · 5(d) |
| 12 | 알고 낸 실패가 아니면 일반 문장 | Task 5 Interfaces · Step 1 · 3 · 5(d) |
| 13 | 「광고 소재도 크레딧 들어?」도 묻는다 — 사용자 규칙 그대로 | 「범위 밖 · 알려 둘 것」 |
| 14 | B3 는 로컬에서 확인 못 함 — 배포 뒤 확인 | Task 10 머리 · Step 5 · Step 9, 「범위 밖 · 알려 둘 것」 |
| — | `카드()` 를 제목으로 찾기 · Dialog 모의 | Task 9 Step 1 |
| — | chat-provider-wiring 줄 번호 12~17 | Task 1 Files · Step 1 |

**2. 자리 채우기 검사** — 「TBD」 · 「적절히」 · 「Task N 과 같이」 없음. 모든 코드 단계에 코드가 있다.

**3. 이름 맞추기** — `easyAvailableWants` · `EasyChoices`(Task 1, Task 3 에서 `adNegated` 더함) · `easyCapabilityLines(wants)`(Task 1, Task 3 에서 `ad_specs` 줄 더함 — 두 곳 모두 `easyChatPrompt` 의 `갈래` 를 넘긴다) · `EasyPromptOptions`(Task 2 `retry`, Task 3 `adNegated`) · `judgeEasyTurn`(Task 2 `kindPicked`, Task 4 `adStep`) · 라우트 `고른갈래`/`골랐나`(Task 2 에서 판단 앞으로 올림 → Task 4 의 안내 쓰기 조건) · `easyChatSpec` · `writeAdGuide`(제공자 · `ad-turn.ts` 두 곳, 뜻이 다르다: 제공자는 글 모델 호출, `ad-turn.ts` 는 프롬프트를 지어 부르고 읽고 실패하면 `AD_GUIDE_FALLBACK` 를 돌려주는 함수) · `AD_ANSWER_NOTE`/`adImageInstruction(rows, prompt, answered)`(Task 3 → 4 · 10) · `countEasyImages`(Task 4) · `withRowJob`/`rowJobOf`/`EasyRowJob`(Task 5 → 6) · `FAILED_TURN_GENERIC`/`isFailureRowBody`(Task 5, `ad-ask.ts` 가 읽는다) · `rowJobRequestIds`/`pendingJobRowIds`/`unfinishedPosterRequests`(Task 6, `load.ts` 의 `pending` → `initialPending` → `pendingIds`) · `collectEasyImage`/`NO_IMAGE_MADE`(Task 6) · `failed` prop(Task 6 → 8 에서 `onAdChoice` 앞) · `carryChoices`/`askSubmission`(Task 7) · `stepsHref`/`readEasyWorks`/`listWorkConversations`(Task 9). Task 8 의 `send(undefined, answer)` 는 Task 8 Step 5 에서 만든 둘째 인자 `친말` 이고, 같은 Step 의 (c-2) 가 실패 뒤 되돌리기에서 그것을 본다. Task 2 Step 5(d) 의 `kindPicked` 줄은 Task 7 이 바꾸는 `ratio` · `look` 줄과 겹치지 않는다.

**4. Review Focus** — 여섯 줄 모두 소유 Task 에 시험이 있다: 1 → Task 8 「단추를 안 넘기면」 · 화면 글자 검사, 2 → Task 2 「말로 끝나지 않는 갈래」 · 「갈래를 단추로 골랐으면」, 3 → Task 5 「주소에 쉼표 · 쌍반점 · 표시 글자」, 4 → Task 9 「대화를 지웠으면」 · 「남의 작업」 · 「null」, 5 → Task 7 「새로 친 말이면 앞서 고른 것을 버린다」, 6 → Task 6 「끝났는데 그림이 없는 줄은 이어 받지 않는다」 · `pending-requests.test.ts`.
