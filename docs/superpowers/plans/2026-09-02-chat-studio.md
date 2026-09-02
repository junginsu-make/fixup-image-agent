# 채팅 스튜디오 구현 계획

> **작업자에게:** 이 계획은 한 작업씩 진행합니다. 각 단계는 체크박스(`- [ ]`)로 표시돼 있습니다.

**목표:** 대화로 무엇을 만들지 정하고 그 자리에서 결과물까지 받는 화면(`/studio`)을 만든다. 기존 단계 화면은 남긴다.

**구조:** LLM 이 대화를 이끌고, 코드는 두 가지만 잡는다 — ①없으면 서버가 거부하는 것 ②실측으로 확인된 LLM 이 빠뜨리는 것. 대화에서 모인 것은 **기존 파이프라인**(`/api/sns/projects`, `/api/poster/projects`)으로 그대로 넘긴다. 새 생성 경로도, 새 프롬프트 기계도 만들지 않는다.

**기술:** Next.js 15 App Router · TypeScript · vitest · zod 4 · `@anthropic-ai/sdk`

**설계 문서:** `docs/superpowers/specs/2026-09-02-chat-studio-design.md`

## 전역 제약

- **대화는 브라우저에만 저장한다.** `sessionStorage`. 서버에 표를 만들지 않는다.
- **생성 결과물은 전부 라이브러리(참고 이미지)로 자동 저장한다.** 서버에서 건다.
- **대화 모델은 Claude.** 실패하면 OpenAI 로 넘어간다. 기존 `structured.ts` 를 쓴다.
- **도구는 카드뉴스·포스터만.** 상세페이지·리디자인·캐릭터는 이번에 안 넣는다.
- **기존 화면(`/sns/new`, `/poster/new`)을 지우지 않는다.**
- **스텝바는 `/studio` 에 두지 않는다.** 작업판이 그 일을 한다.
- 새 파일은 200~400줄, 최대 800줄. 함수는 50줄 이내.
- 커밋 메시지는 한국어. 무엇을 왜 바꿨는지 적는다.

## 이미 있는 것 (건드리지 말 것)

| 파일 | 하는 일 |
|---|---|
| `apps/web/lib/studio/intake.ts` | 언제 만들 수 있는가 · 첨부 역할 · 캐릭터 안내 |
| `apps/web/lib/studio/turn.ts` | 한 턴 처리 · 안내자 지시 · 값 걸러내기 |
| `apps/web/lib/studio/model-choice.ts` | 쓸 수 있는 모델만 남기기 |

테스트 49개가 이미 있다(`apps/web/lib/studio/__tests__/`). 이 계획은 그 위에 얹는다.

## 스키마와 어긋나는 곳 — Task 1 에서 맞춘다

코드를 대조하니 세 군데가 안 맞는다. **Task 1 이 이것부터 고친다.**

| 지금 `intake`/`turn` | 실제 스키마 (`api/sns/projects/schema.ts`) |
|---|---|
| `cardCount` 2~20 | `min(4).max(8)` — 4~8 만 받는다 |
| `sourceKind: "url"` | `kind: "web"` |
| `sourceKind: "none"` | 그런 값이 없다 |

---

## 파일 구조

**새로 만든다**

| 파일 | 책임 |
|---|---|
| `apps/web/lib/studio/launch.ts` | intake → 기존 프로젝트 생성 입력으로 옮기기 |
| `apps/web/lib/studio/session.ts` | 대화·intake 를 sessionStorage 에 넣고 꺼내기 |
| `apps/web/lib/studio/providers.ts` | 대화용 Claude/OpenAI 제공자 만들기 |
| `apps/web/app/api/studio/chat/route.ts` | 한 턴 API |
| `apps/web/app/studio/page.tsx` | 서버 컴포넌트 껍데기 |
| `apps/web/app/studio/studio-client.tsx` | 3분할 배치 · 상태 보관 |
| `apps/web/app/studio/_components/chat-pane.tsx` | 대화 · 입력 · 끌어다 놓기 |
| `apps/web/app/studio/_components/board-pane.tsx` | 작업판 · 만들기 버튼 |
| `apps/web/app/studio/_components/result-pane.tsx` | 결과 · 접기 |

**고친다**

| 파일 | 무엇을 |
|---|---|
| `apps/web/lib/studio/intake.ts` | 장수 4~8, `sourceKind` 를 스키마에 맞춤 |
| `apps/web/lib/studio/turn.ts` | 같은 값 맞춤 |
| `apps/web/lib/sns/queued-flow.ts` | 카드 저장 뒤 라이브러리 자동 보관 |
| `apps/web/app/api/poster/projects/[id]/generate/route.ts` | 결과 뒤 라이브러리 자동 보관 |
| `packages/ui/src/components/app-shell.tsx` | 왼쪽 메뉴에 「스튜디오」 넣기 |

---

## Task 1: 스키마에 값 맞추기

**파일**
- 고침: `apps/web/lib/studio/intake.ts`
- 고침: `apps/web/lib/studio/turn.ts`
- 테스트: `apps/web/lib/studio/__tests__/intake.test.ts`

**인터페이스**
- 만들어 내는 것: `Intake["sourceKind"] = "text" | "youtube" | "web" | "none"`, `cardCount` 는 4~8

- [ ] **1단계: 실패하는 테스트를 쓴다**

`apps/web/lib/studio/__tests__/intake.test.ts` 의 `describe("카드뉴스에 필요한 것")` 안에 넣는다.

```ts
  it("장수는 4~8장만 받는다", () => {
    // /api/sns/projects 스키마가 min(4).max(8) 이다. 3장이나 12장을 받아
    // 두면 만들기를 눌렀을 때 서버가 거부한다 — 대화가 다 끝난 뒤에.
    expect(missingSlots({ ...full, cardCount: 3 }).map((slot) => slot.id)).toContain("cardCount");
    expect(missingSlots({ ...full, cardCount: 12 }).map((slot) => slot.id)).toContain("cardCount");
    expect(missingSlots({ ...full, cardCount: 4 })).toEqual([]);
    expect(missingSlots({ ...full, cardCount: 8 })).toEqual([]);
  });

  it("웹 주소는 web 이라고 부른다", () => {
    // 스키마의 kind 가 "web" 이다. "url" 로 두면 옮길 때 한 번 더 번역해야 한다.
    expect(isReady({ ...full, sourceKind: "web", sourceRef: "https://example.com/a" })).toBe(true);
  });
```

- [ ] **2단계: 실패를 확인한다**

```
cd apps/web && npx vitest run lib/studio/__tests__/intake.test.ts
```

예상: `장수는 4~8장만 받는다` 실패 (지금은 3도 12도 통과시킨다)

- [ ] **3단계: 최소한으로 고친다**

`intake.ts` 의 `Intake` 타입에서 `sourceKind` 를 바꾼다.

```ts
  /** 내용을 어디서 가져오나. none 은 "설명만으로 만들어 주세요". */
  sourceKind?: "text" | "youtube" | "web" | "none";
```

`missingSlots` 의 장수 검사를 바꾼다.

```ts
  // 스키마가 4~8만 받는다(api/sns/projects/schema.ts). 범위 밖이면 아직 안 정한 것으로 본다.
  const cardCountOk = typeof intake.cardCount === "number" && intake.cardCount >= 4 && intake.cardCount <= 8;
  if (intake.tool === "sns" && !cardCountOk) missing.push(SLOT.cardCount);
```

`needsRef` 검사에서 `"url"` 을 `"web"` 으로 바꾼다.

```ts
  const needsRef = intake.sourceKind === "youtube" || intake.sourceKind === "web" || intake.sourceKind === "text";
```

`SLOT.cardCount.why` 를 고친다.

```ts
    why: "몇 장으로 만들지 정해야 이야기를 나눌 수 있습니다. 4장에서 8장까지 되고, 보통 6장을 씁니다.",
```

`turn.ts` 의 `TURN_SCHEMA` 에서 두 값을 고친다.

```ts
          sourceKind: { type: "string", enum: ["text", "youtube", "web", "none"] },
          cardCount: { type: "integer", minimum: 4, maximum: 8 },
```

`turn.ts` 의 `sanitize` 에서 목록과 범위를 고친다.

```ts
  if (["text", "youtube", "web", "none"].includes(String(source.sourceKind))) {
    next.sourceKind = source.sourceKind as Intake["sourceKind"];
  }
  ...
  if (typeof source.cardCount === "number" && Number.isInteger(source.cardCount)
    && source.cardCount >= 4 && source.cardCount <= 8) {
    next.cardCount = source.cardCount;
  }
```

- [ ] **4단계: 통과를 확인한다**

```
cd apps/web && npx vitest run lib/studio
```

예상: 전부 통과 (51개)

- [ ] **5단계: 커밋**

```bash
git add apps/web/lib/studio
git commit -m "fix(studio): 대화가 모으는 값을 실제 스키마에 맞춘다

장수를 2~20으로 받고 있었는데 /api/sns/projects 는 4~8만 받는다.
대화가 다 끝나고 만들기를 눌렀을 때 서버가 거부하면 되돌릴 데가 없다.
웹 주소도 스키마와 같은 이름(web)으로 부른다."
```

---

## Task 2: 대화에서 모은 것을 프로젝트 입력으로 옮기기

**파일**
- 만듦: `apps/web/lib/studio/launch.ts`
- 테스트: `apps/web/lib/studio/__tests__/launch.test.ts`

**인터페이스**
- 쓰는 것: Task 1 의 `Intake`, `@fixup/shared` 의 `toCardNewsAttachment` / `toPosterImage`
- 만들어 내는 것:
  - `toSnsProjectInput(intake: Intake, attachments: LaunchAttachment[]): Record<string, unknown>`
  - `toPosterProjectInput(intake: Intake, attachments: LaunchAttachment[]): Record<string, unknown>`
  - `interface LaunchAttachment { id: string; assetPath: string; url: string; role: AttachmentRole }`

- [ ] **1단계: 실패하는 테스트를 쓴다**

`apps/web/lib/studio/__tests__/launch.test.ts` 를 새로 만든다.

```ts
import { describe, expect, it } from "vitest";
import { toPosterProjectInput, toSnsProjectInput, type LaunchAttachment } from "../launch";
import type { Intake } from "../intake";

const attachments: LaunchAttachment[] = [
  { id: "ref", assetPath: "u/references/ref.png", url: "https://x/ref.png", role: "style" },
  { id: "prod", assetPath: "u/references/prod.jpg", url: "https://x/prod.jpg", role: "preserve_product" },
];

const intake: Intake = {
  tool: "sns",
  topic: "수분 세럼 신제품 출시",
  sourceKind: "text",
  sourceRef: "히알루론산 2% 함유",
  cardCount: 6,
  attachmentsDecided: true,
  notes: ["톤은 유머러스하게", "경쟁사 이름은 빼기"],
};

describe("카드뉴스 입력으로 옮기기", () => {
  it("주제와 내용이 자리를 찾아간다", () => {
    const input = toSnsProjectInput(intake, attachments);
    expect(input.title).toBe("수분 세럼 신제품 출시");
    expect(input.source).toEqual({ kind: "text", text: "히알루론산 2% 함유" });
  });

  it("메모는 toneNote 로 간다", () => {
    // 담을 곳이 없으면 "톤은 유머러스하게" 가 사라진다. 스키마에 이미 자리가 있다.
    expect(toSnsProjectInput(intake, attachments).toneNote).toBe("톤은 유머러스하게\n경쟁사 이름은 빼기");
  });

  it("메모가 없으면 toneNote 를 넣지 않는다", () => {
    expect(toSnsProjectInput({ ...intake, notes: undefined }, attachments).toneNote).toBeUndefined();
  });

  it("역할이 카드뉴스 어휘로 번역된다", () => {
    const input = toSnsProjectInput(intake, attachments) as { attachments: Array<Record<string, unknown>> };
    expect(input.attachments[0]).toMatchObject({ id: "ref", kind: "style_reference", role: "body" });
    expect(input.attachments[1]).toMatchObject({ id: "prod", kind: "keep_identity", subject: "object" });
  });

  it("장수를 정했으면 fixed 로 보낸다", () => {
    const input = toSnsProjectInput(intake, attachments);
    expect(input.cardCountMode).toBe("fixed");
    expect(input.cardCount).toBe(6);
  });

  it("유튜브 주소는 youtube 로 간다", () => {
    const input = toSnsProjectInput(
      { ...intake, sourceKind: "youtube", sourceRef: "https://youtu.be/abc" },
      attachments,
    );
    expect(input.source).toEqual({ kind: "youtube", url: "https://youtu.be/abc" });
  });

  it("웹 주소는 web 으로 간다", () => {
    const input = toSnsProjectInput(
      { ...intake, sourceKind: "web", sourceRef: "https://example.com/a" },
      attachments,
    );
    expect(input.source).toEqual({ kind: "web", url: "https://example.com/a" });
  });

  it("설명만으로 만들 때는 주제를 본문으로 쓴다", () => {
    // 스키마에 "none" 이 없다. 주제와 메모를 글로 묶어 보낸다.
    const input = toSnsProjectInput(
      { ...intake, sourceKind: "none", sourceRef: undefined },
      attachments,
    ) as { source: { kind: string; text: string } };
    expect(input.source.kind).toBe("text");
    expect(input.source.text).toContain("수분 세럼 신제품 출시");
  });
});

describe("포스터 입력으로 옮기기", () => {
  const poster: Intake = { ...intake, tool: "poster", cardCount: undefined };

  it("따라 만들 것과 지킬 것을 나눠 보낸다", () => {
    const input = toPosterProjectInput(poster, attachments) as {
      referenceIds: string[]; preservedIds: string[]; personIds: string[];
    };
    expect(input.referenceIds).toEqual(["ref"]);
    expect(input.preservedIds).toEqual(["prod"]);
    expect(input.personIds).toEqual([]);
  });

  it("인물로 지정한 것은 personIds 에도 들어간다", () => {
    const withPerson: LaunchAttachment[] = [
      attachments[0]!,
      { id: "model", assetPath: "u/references/m.png", url: "https://x/m.png", role: "preserve_person" },
    ];
    const input = toPosterProjectInput(poster, withPerson) as { preservedIds: string[]; personIds: string[] };
    expect(input.preservedIds).toEqual(["model"]);
    expect(input.personIds).toEqual(["model"]);
  });

  it("한 줄 지시에 주제와 메모가 함께 들어간다", () => {
    const input = toPosterProjectInput(poster, attachments) as { instruction: string };
    expect(input.instruction).toContain("수분 세럼 신제품 출시");
    expect(input.instruction).toContain("톤은 유머러스하게");
  });
});
```

- [ ] **2단계: 실패를 확인한다**

```
cd apps/web && npx vitest run lib/studio/__tests__/launch.test.ts
```

예상: `Cannot find module '../launch'`

- [ ] **3단계: 최소한으로 구현한다**

`apps/web/lib/studio/launch.ts` 를 만든다.

```ts
import { toCardNewsAttachment, toPosterImage, type AttachmentRole } from "@fixup/shared";
import type { Intake } from "./intake";

/**
 * 대화에서 모은 것을 기존 프로젝트 입력으로 옮긴다.
 *
 * **새 생성 경로를 만들지 않는다.** 카드뉴스와 포스터는 이미 검증된 흐름이
 * 있다. 여기서 하는 일은 번역뿐이다 — 대화의 말을 그 흐름이 아는 모양으로
 * 바꿔 준다.
 */

export interface LaunchAttachment {
  id: string;
  assetPath: string;
  url: string;
  role: AttachmentRole;
}

/** 메모는 줄바꿈으로 이어 붙인다. 원고와 이미지 프롬프트에 그대로 실린다. */
function toneNoteOf(intake: Intake): string | undefined {
  const notes = (intake.notes ?? []).filter((note) => note.trim());
  return notes.length ? notes.join("\n") : undefined;
}

/** 스키마에 "none" 이 없다. 설명만으로 만들 때는 주제와 메모를 글로 묶는다. */
function sourceOf(intake: Intake) {
  const ref = intake.sourceRef?.trim() ?? "";
  if (intake.sourceKind === "youtube") return { kind: "youtube" as const, url: ref };
  if (intake.sourceKind === "web") return { kind: "web" as const, url: ref };
  if (intake.sourceKind === "text" && ref) return { kind: "text" as const, text: ref };
  return {
    kind: "text" as const,
    text: [intake.topic ?? "", ...(intake.notes ?? [])].filter(Boolean).join("\n"),
  };
}

export function toSnsProjectInput(intake: Intake, attachments: LaunchAttachment[]) {
  const fixed = typeof intake.cardCount === "number";
  return {
    title: intake.topic ?? "제목 없는 작업",
    source: sourceOf(intake),
    toneNote: toneNoteOf(intake),
    attachments: attachments.map((attachment) => {
      const mapped = toCardNewsAttachment(attachment.role);
      return {
        id: attachment.id,
        kind: mapped.kind,
        assetPath: attachment.assetPath,
        url: attachment.url,
        // 자리는 대화에서 정하지 않는다. 속지로 두고 작업판에서 고친다.
        ...(mapped.kind === "style_reference" ? { role: "body" as const } : {}),
        ...(mapped.subject ? { subject: mapped.subject } : {}),
      };
    }),
    ratio: "4:5" as const,
    cardCountMode: fixed ? ("fixed" as const) : ("auto" as const),
    ...(fixed ? { cardCount: intake.cardCount } : {}),
    language: "ko" as const,
    modelId: "gpt-image-2" as const,
  };
}

export function toPosterProjectInput(intake: Intake, attachments: LaunchAttachment[]) {
  const mapped = attachments.map((attachment) => ({
    id: attachment.id,
    poster: toPosterImage(attachment.role),
  }));
  const preserved = mapped.filter((entry) => entry.poster?.kind === "preserved");
  return {
    title: intake.topic ?? "제목 없는 포스터",
    ratio: "2:3",
    modelId: "gpt-image-2",
    variants: 2,
    instruction: [intake.topic ?? "", ...(intake.notes ?? [])].filter(Boolean).join(" · "),
    referenceIds: mapped.filter((entry) => entry.poster?.kind === "style_reference").map((entry) => entry.id),
    preservedIds: preserved.map((entry) => entry.id),
    personIds: preserved.filter((entry) => entry.poster?.subject === "person").map((entry) => entry.id),
  };
}
```

- [ ] **4단계: 통과를 확인한다**

```
cd apps/web && npx vitest run lib/studio/__tests__/launch.test.ts
```

예상: 11개 통과

- [ ] **5단계: 타입 검사**

```
cd .. && npx pnpm --filter @fixup/web typecheck
```

예상: 오류 0

- [ ] **6단계: 커밋**

```bash
git add apps/web/lib/studio
git commit -m "feat(studio): 대화에서 모은 것을 기존 프로젝트 입력으로 옮긴다

새 생성 경로를 만들지 않는다. 카드뉴스와 포스터는 이미 검증된 흐름이
있으니 여기서는 번역만 한다. 메모는 스키마에 이미 있는 toneNote 로
넘겨 원고와 이미지 프롬프트에 그대로 실리게 한다."
```

---

## Task 3: 대화를 브라우저에 담기

**파일**
- 만듦: `apps/web/lib/studio/session.ts`
- 테스트: `apps/web/lib/studio/__tests__/session.test.ts`

**인터페이스**
- 쓰는 것: Task 1 의 `Intake`, `turn.ts` 의 `TurnMessage`
- 만들어 내는 것:
  - `interface StudioSession { messages: TurnMessage[]; intake: Intake; attachments: LaunchAttachment[]; projectId?: string; tool?: "sns" | "poster" }`
  - `readSession(storage: Pick<Storage, "getItem">): StudioSession`
  - `writeSession(session: StudioSession, storage: Pick<Storage, "setItem">): void`
  - `clearSession(storage: Pick<Storage, "removeItem">): void`

- [ ] **1단계: 실패하는 테스트를 쓴다**

`apps/web/lib/studio/__tests__/session.test.ts` 를 새로 만든다.

```ts
import { describe, expect, it } from "vitest";
import { clearSession, readSession, writeSession, type StudioSession } from "../session";

function fakeStorage(seed: Record<string, string> = {}) {
  const box = { ...seed };
  return {
    box,
    getItem: (key: string) => box[key] ?? null,
    setItem: (key: string, value: string) => { box[key] = value; },
    removeItem: (key: string) => { delete box[key]; },
  };
}

const session: StudioSession = {
  messages: [{ role: "user", text: "세럼 카드뉴스요" }],
  intake: { tool: "sns", topic: "세럼" },
  attachments: [],
};

describe("대화를 브라우저에 담는다", () => {
  it("넣은 것을 그대로 꺼낸다", () => {
    const storage = fakeStorage();
    writeSession(session, storage);
    expect(readSession(storage)).toEqual(session);
  });

  it("아무것도 없으면 빈 대화를 준다", () => {
    expect(readSession(fakeStorage())).toEqual({ messages: [], intake: {}, attachments: [] });
  });

  it("깨진 값이 들어 있어도 죽지 않는다", () => {
    // 사용자가 개발자 도구로 건드리거나 옛 판이 남아 있을 수 있다.
    const storage = fakeStorage({ "fixup:studio:v1": "{망가진" });
    expect(readSession(storage)).toEqual({ messages: [], intake: {}, attachments: [] });
  });

  it("모양이 다른 값도 빈 대화로 돌린다", () => {
    const storage = fakeStorage({ "fixup:studio:v1": '{"messages":"글자"}' });
    expect(readSession(storage).messages).toEqual([]);
  });

  it("지우면 사라진다", () => {
    const storage = fakeStorage();
    writeSession(session, storage);
    clearSession(storage);
    expect(readSession(storage).messages).toEqual([]);
  });
});
```

- [ ] **2단계: 실패를 확인한다**

```
cd apps/web && npx vitest run lib/studio/__tests__/session.test.ts
```

예상: `Cannot find module '../session'`

- [ ] **3단계: 최소한으로 구현한다**

`apps/web/lib/studio/session.ts` 를 만든다.

```ts
import type { Intake } from "./intake";
import type { LaunchAttachment } from "./launch";
import type { TurnMessage } from "./turn";

/**
 * 대화는 브라우저에만 둔다.
 *
 * 서버에 표를 만들지 않는다 — 대화가 쓸 만한지 먼저 확인하고, 이어서 하기가
 * 필요해지면 그때 옮긴다. 지금 넣으면 안 쓸 표를 만들 수 있다.
 *
 * 새로고침하면 사라진다. 다만 **만들기를 누른 뒤에는** 프로젝트가 서버에
 * 생기므로 결과는 남는다. 사라지는 것은 대화뿐이다.
 */

const KEY = "fixup:studio:v1";

export interface StudioSession {
  messages: TurnMessage[];
  intake: Intake;
  attachments: LaunchAttachment[];
  /** 만들기를 누른 뒤 생긴 프로젝트. 결과 칸이 이걸로 조회한다. */
  projectId?: string;
  tool?: "sns" | "poster";
}

const EMPTY: StudioSession = { messages: [], intake: {}, attachments: [] };

export function readSession(storage: Pick<Storage, "getItem">): StudioSession {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<StudioSession>;
    // 옛 판이 남아 있거나 사용자가 손댔을 수 있다. 모양이 아니면 빈 대화로 시작한다.
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      intake: parsed.intake && typeof parsed.intake === "object" ? parsed.intake : {},
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      ...(typeof parsed.projectId === "string" ? { projectId: parsed.projectId } : {}),
      ...(parsed.tool === "sns" || parsed.tool === "poster" ? { tool: parsed.tool } : {}),
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeSession(session: StudioSession, storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(KEY, JSON.stringify(session));
  } catch {
    // 저장 공간이 꽉 찼거나 시크릿 모드일 수 있다. 대화는 계속 이어져야 한다.
  }
}

export function clearSession(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // 지우지 못해도 대화는 계속 이어져야 한다.
  }
}
```

- [ ] **4단계: 통과를 확인한다**

```
cd apps/web && npx vitest run lib/studio/__tests__/session.test.ts
```

예상: 5개 통과

- [ ] **5단계: 커밋**

```bash
git add apps/web/lib/studio
git commit -m "feat(studio): 대화를 브라우저에만 담는다

서버에 표를 만들지 않는다. 대화가 쓸 만한지 먼저 확인하고, 이어서
하기가 필요해지면 그때 옮긴다.

깨진 값이 들어 있어도 빈 대화로 시작한다 — 옛 판이 남아 있거나
사용자가 개발자 도구로 건드렸을 수 있다."
```

---

## Task 4: 대화 API

**파일**
- 만듦: `apps/web/lib/studio/providers.ts`
- 만듦: `apps/web/app/api/studio/chat/route.ts`
- 테스트: `apps/web/app/api/studio/__tests__/chat.test.ts`

**인터페이스**
- 쓰는 것: `turn.ts` 의 `runTurn` / `TURN_SCHEMA`, `structured.ts` 의 `AnthropicStructuredProvider` / `OpenAIStructuredProvider`
- 만들어 내는 것:
  - `createStudioProvider(environment?: Record<string, string | undefined>): StructuredProvider`
  - `POST /api/studio/chat` — 받는 것 `{ intake, messages }`, 주는 것 `{ ok, reply, chips, intake, missing, ready, suggestion }`

- [ ] **1단계: 실패하는 테스트를 쓴다**

`apps/web/app/api/studio/__tests__/chat.test.ts` 를 새로 만든다. 라우트는 인증과 환경변수를 타므로 **몸통 로직만** 시험한다.

```ts
import { describe, expect, it } from "vitest";
import { chatBody } from "../chat/body";

describe("대화 API 의 몸통", () => {
  const provider = (payload: unknown) => ({ async generate() { return payload; } });

  it("첫 요청이면 인사만 돌려준다", async () => {
    // 사용자가 아직 아무 말도 안 했는데 LLM 을 부르면 돈만 쓴다.
    const result = await chatBody({ intake: {}, messages: [] }, provider({ reply: "부르면 안 된다" }));
    expect(result.reply).toMatch(/어떤 내용으로/);
    expect(result.ready).toBe(false);
  });

  it("사용자가 말하면 LLM 을 부른다", async () => {
    const result = await chatBody(
      { intake: {}, messages: [{ role: "user", text: "세럼 카드뉴스" }] },
      provider({ reply: "카드뉴스로 하겠습니다.", learned: { tool: "sns", topic: "세럼" } }),
    );
    expect(result.reply).toBe("카드뉴스로 하겠습니다.");
    expect(result.intake.tool).toBe("sns");
  });

  it("모자란 것을 함께 돌려준다", async () => {
    const result = await chatBody(
      { intake: {}, messages: [{ role: "user", text: "세럼 카드뉴스" }] },
      provider({ reply: "네", learned: { tool: "sns" } }),
    );
    expect(result.missing.map((slot) => slot.id)).toContain("topic");
  });

  it("보낸 것이 모양이 아니면 거절한다", async () => {
    await expect(chatBody({ intake: null, messages: "글자" } as never, provider({})))
      .rejects.toThrow();
  });
});
```

- [ ] **2단계: 실패를 확인한다**

```
cd apps/web && npx vitest run app/api/studio/__tests__/chat.test.ts
```

예상: `Cannot find module '../chat/body'`

- [ ] **3단계: 몸통을 구현한다**

`apps/web/app/api/studio/chat/body.ts` 를 만든다.

```ts
import { z } from "zod";
import { OPENING_MESSAGE, runTurn, type TurnResult } from "../../../../lib/studio/turn";
import { missingSlots } from "../../../../lib/studio/intake";
import type { StructuredProvider } from "../../../../lib/llm/structured";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
}).strict();

export const ChatBodySchema = z.object({
  intake: z.record(z.string(), z.unknown()),
  messages: z.array(MessageSchema).max(60),
}).strict();

/**
 * 한 턴.
 *
 * 사용자가 아직 아무 말도 안 했으면 LLM 을 부르지 않는다. 인사는 정해진
 * 문장이라 돈을 쓸 이유가 없다.
 */
export async function chatBody(raw: unknown, provider: StructuredProvider): Promise<TurnResult> {
  const input = ChatBodySchema.parse(raw);
  const intake = input.intake as TurnResult["intake"];

  if (input.messages.length === 0) {
    return {
      reply: OPENING_MESSAGE,
      chips: [],
      intake,
      missing: missingSlots(intake),
      ready: false,
      suggestion: null,
    };
  }
  return runTurn({ intake, messages: input.messages }, provider);
}
```

- [ ] **4단계: 통과를 확인한다**

```
cd apps/web && npx vitest run app/api/studio/__tests__/chat.test.ts
```

예상: 4개 통과

- [ ] **5단계: 제공자와 라우트를 붙인다**

`apps/web/lib/studio/providers.ts` 를 만든다.

```ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AnthropicStructuredProvider, OpenAIStructuredProvider, type StructuredProvider } from "../llm/structured";
import { TURN_SCHEMA } from "./turn";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";

/**
 * 대화는 Claude 로 한다. 실패하면 OpenAI 로 넘어간다.
 *
 * 원고·기획에 쓰는 것과 같은 모델이라 말투가 일관된다.
 */
export function createStudioProvider(
  environment: Record<string, string | undefined> = process.env,
): StructuredProvider {
  const anthropicKey = environment.ANTHROPIC_API_KEY;
  const openaiKey = environment.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) throw new Error("대화에 쓸 AI 키가 설정되지 않았습니다.");

  const backup = openaiKey
    ? new OpenAIStructuredProvider(
        new OpenAI({ apiKey: openaiKey, maxRetries: 2, timeout: 120_000 }),
        environment.OPENAI_DRAFT_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
        TURN_SCHEMA,
      )
    : null;

  if (!anthropicKey) return backup!;

  const primary = new AnthropicStructuredProvider(
    new Anthropic({ apiKey: anthropicKey, maxRetries: 2, timeout: 120_000 }),
    environment.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    TURN_SCHEMA,
  );

  return {
    async generate(prompt: string) {
      try {
        return await primary.generate(prompt);
      } catch (error) {
        if (!backup) throw error;
        return backup.generate(prompt);
      }
    },
  };
}
```

`apps/web/app/api/studio/chat/route.ts` 를 만든다.

```ts
import { authenticateApiMember } from "../../../../lib/membership/api";
import { createStudioProvider } from "../../../../lib/studio/providers";
import { chatBody } from "./body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 대화 한 턴은 LLM 한 번이다. 길어야 30초.
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const result = await chatBody(await request.json(), createStudioProvider());
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "대화를 잇지 못했습니다." },
      { status: 400 },
    );
  }
}
```

- [ ] **6단계: 타입 검사와 전체 테스트**

```
cd .. && npx pnpm --filter @fixup/web typecheck && npx pnpm --filter @fixup/web test
```

예상: 오류 0, 테스트 전부 통과

- [ ] **7단계: 살아 있는 서버로 확인한다**

```
curl -s -X POST http://localhost:3100/api/studio/chat \
  -H 'content-type: application/json' \
  -d '{"intake":{},"messages":[]}' | head -c 300
```

예상: `{"ok":true,"reply":"안녕하세요. 어떤 내용으로 만들어 드릴까요?...`

- [ ] **8단계: 커밋**

```bash
git add apps/web/lib/studio apps/web/app/api/studio
git commit -m "feat(studio): 대화 API

첫 요청에는 LLM 을 부르지 않는다. 인사는 정해진 문장이라 돈을 쓸
이유가 없다.

Claude 로 하고 실패하면 OpenAI 로 넘어간다. 원고·기획에 쓰는 것과
같은 모델이라 말투가 일관된다."
```

---

## Task 5: 화면 — 3분할과 대화

**파일**
- 만듦: `apps/web/app/studio/page.tsx`
- 만듦: `apps/web/app/studio/studio-client.tsx`
- 만듦: `apps/web/app/studio/_components/chat-pane.tsx`
- 고침: `packages/ui/src/components/app-shell.tsx`

**인터페이스**
- 쓰는 것: Task 3 의 `readSession`/`writeSession`, Task 4 의 `POST /api/studio/chat`
- 만들어 내는 것: `/studio` 경로. 작업판과 결과 칸은 Task 6·7 에서 채운다.

- [ ] **1단계: 껍데기를 만든다**

`apps/web/app/studio/page.tsx`

```tsx
import type { Metadata } from "next";
import { StudioClient } from "./studio-client";

export const metadata: Metadata = { title: "스튜디오" };

export default function StudioPage() {
  return <StudioClient />;
}
```

- [ ] **2단계: 대화 칸을 만든다**

`apps/web/app/studio/_components/chat-pane.tsx`

```tsx
"use client";

import * as React from "react";
import { Button, Input } from "@fixup/ui";
import type { TurnMessage } from "../../../lib/studio/turn";

/**
 * 대화 칸.
 *
 * 그림을 끌어다 놓으면 곧바로 라이브러리로 올린다. 임시로 들고 있다가
 * 나중에 올리지 않는다 — 기존 파이프라인이 id 와 assetPath 로 받고,
 * 대화가 사라져도 그림은 남아야 한다.
 */
export function ChatPane({
  messages, chips, busy, onSend, onDropFiles,
}: {
  messages: TurnMessage[];
  chips: string[];
  busy: boolean;
  onSend(text: string): void;
  onDropFiles(files: FileList): void;
}) {
  const [draft, setDraft] = React.useState("");
  const [over, setOver] = React.useState(false);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
    onSend(trimmed);
  }

  return (
    <section
      className={`flex min-h-0 flex-col ${over ? "bg-primary-soft" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (event.dataTransfer.files.length) onDropFiles(event.dataTransfer.files);
      }}
    >
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className={`mb-3 flex ${message.role === "user" ? "justify-end" : ""}`}>
            <div className={`max-w-[80%] rounded-xl border px-3 py-2 text-sm ${
              message.role === "user" ? "border-transparent bg-primary-soft" : "bg-background"
            }`}>
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          </div>
        ))}
        {busy ? <p className="text-sm text-muted-foreground">생각하는 중…</p> : null}
      </div>

      {chips.length ? (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {chips.map((chip) => (
            <Button key={chip} size="sm" variant="secondary" disabled={busy} onClick={() => send(chip)}>{chip}</Button>
          ))}
        </div>
      ) : null}

      <form
        className="flex gap-2 border-t p-4"
        onSubmit={(event) => { event.preventDefault(); send(draft); }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="메시지를 입력하세요. 그림은 끌어다 놓으면 됩니다"
          aria-label="메시지"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !draft.trim()}>보내기</Button>
      </form>
    </section>
  );
}
```

- [ ] **3단계: 세 칸을 붙인다**

`apps/web/app/studio/studio-client.tsx`

```tsx
"use client";

import * as React from "react";
import { AppShell } from "@fixup/ui";
import { readSession, writeSession, type StudioSession } from "../../lib/studio/session";
import { missingSlots } from "../../lib/studio/intake";
import { OPENING_MESSAGE, type TurnMessage } from "../../lib/studio/turn";
import { ChatPane } from "./_components/chat-pane";

export function StudioClient() {
  const [session, setSession] = React.useState<StudioSession>({ messages: [], intake: {}, attachments: [] });
  const [chips, setChips] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  // 브라우저에만 담는다. 처음 열면 인사부터 띄운다.
  React.useEffect(() => {
    const saved = readSession(window.sessionStorage);
    setSession(saved.messages.length
      ? saved
      : { ...saved, messages: [{ role: "assistant", text: OPENING_MESSAGE }] });
  }, []);

  React.useEffect(() => {
    if (session.messages.length) writeSession(session, window.sessionStorage);
  }, [session]);

  async function send(text: string) {
    const messages: TurnMessage[] = [...session.messages, { role: "user", text }];
    setSession((current) => ({ ...current, messages }));
    setBusy(true);
    setChips([]);
    try {
      const response = await fetch("/api/studio/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intake: session.intake, messages }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.message ?? "대화를 잇지 못했습니다.");
      setSession((current) => ({
        ...current,
        intake: body.intake,
        messages: [...messages, { role: "assistant", text: body.reply }],
      }));
      setChips(body.chips ?? []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "대화를 잇지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  /** 끌어다 놓은 그림은 그 자리에서 라이브러리로 올린다. */
  async function upload(files: FileList) {
    setBusy(true);
    try {
      const added = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("id", crypto.randomUUID());
        form.set("title", file.name.replace(/\.[^.]+$/, ""));
        form.set("purpose", "both");
        form.set("file", file);
        const body = await (await fetch("/api/reference-images", { method: "POST", body: form })).json();
        if (!body.ok) throw new Error(body.message ?? "그림을 올리지 못했습니다.");
        added.push({
          id: body.image.id,
          assetPath: body.image.storagePath,
          url: body.image.signedUrl ?? "",
          role: undefined,
        });
      }
      setSession((current) => ({
        ...current,
        attachments: [...current.attachments, ...added] as StudioSession["attachments"],
        intake: { ...current.intake, attachmentsDecided: true,
          attachments: [...(current.intake.attachments ?? []),
            ...added.map((entry) => ({ id: entry.id, title: entry.id }))] },
      }));
      await send(`그림 ${added.length}장을 올렸어요.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "그림을 올리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const missing = missingSlots(session.intake);

  return (
    <AppShell>
      {message ? <p role="alert" className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
      <div className="grid h-[calc(100vh-4rem)] grid-cols-[1fr_330px_250px] max-xl:grid-cols-1">
        <ChatPane messages={session.messages} chips={chips} busy={busy} onSend={send} onDropFiles={upload} />
        <aside className="border-l p-4">
          <p className="text-meta text-subtle-foreground">작업판</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {missing.length ? `아직 ${missing.length}가지가 비어 있습니다.` : "다 모였습니다."}
          </p>
        </aside>
        <aside className="border-l bg-muted/30 p-4">
          <p className="text-meta text-subtle-foreground">결과</p>
        </aside>
      </div>
    </AppShell>
  );
}
```

- [ ] **4단계: 왼쪽 메뉴에 넣는다**

`packages/ui/src/components/app-shell.tsx` 의 도구 목록 맨 앞에 넣는다. 기존 항목의 모양을 그대로 따른다.

```tsx
  { href: "/studio", label: "스튜디오", desc: "대화로 만들기", icon: MessageSquare },
```

`lucide-react` 에서 `MessageSquare` 를 import 한다.

- [ ] **5단계: 브라우저로 확인한다**

`http://localhost:3100/studio` 를 연다. 확인할 것:

- 인사 문구가 뜬다
- 메시지를 보내면 답이 온다
- 새로고침해도 대화가 남아 있다
- 콘솔 오류 0건

- [ ] **6단계: 커밋**

```bash
git add apps/web/app/studio packages/ui/src/components/app-shell.tsx
git commit -m "feat(studio): 대화 화면

스텝바를 두지 않는다. 작업판이 진행 상황을 대신한다.

그림을 끌어다 놓으면 곧바로 라이브러리로 올린다. 임시로 들고 있다가
나중에 올리지 않는다 — 기존 파이프라인이 id 와 assetPath 로 받고,
대화가 사라져도 그림은 남아야 한다."
```

---

## Task 6: 작업판 — 상태를 비추고 만들기를 연다

**파일**
- 만듦: `apps/web/app/studio/_components/board-pane.tsx`
- 고침: `apps/web/app/studio/studio-client.tsx`

**인터페이스**
- 쓰는 것: Task 2 의 `toSnsProjectInput`/`toPosterProjectInput`, `@fixup/shared` 의 `ATTACHMENT_ROLE_LABEL`
- 만들어 내는 것: 만들기를 누르면 `session.projectId` 와 `session.tool` 이 채워진다

- [ ] **1단계: 작업판을 만든다**

`apps/web/app/studio/_components/board-pane.tsx`

```tsx
"use client";

import { ATTACHMENT_ROLE_LABEL, type AttachmentRole } from "@fixup/shared";
import { Badge, Button } from "@fixup/ui";
import type { Intake, MissingSlot } from "../../../lib/studio/intake";

const ROLES: AttachmentRole[] = ["style", "preserve_product", "preserve_person"];

/**
 * 작업판 — 마법사가 아니라 **지금 상태를 비추는 거울**이다.
 *
 * 스텝바를 없앤 대신 이 칸이 「어디인지」와 「되돌아가기」를 맡는다.
 * 그래서 여기서 못 고치는 항목이 있으면 안 된다.
 *
 * 돈 쓰는 버튼은 맨 아래 고정이다. 대화 메시지는 스크롤되어 사라진다.
 */
export function BoardPane({
  intake, missing, busy, onRoleChange, onLaunch,
}: {
  intake: Intake;
  missing: MissingSlot[];
  busy: boolean;
  onRoleChange(id: string, role: AttachmentRole): void;
  onLaunch(): void;
}) {
  const attachments = intake.attachments ?? [];

  return (
    <aside className="flex min-h-0 flex-col border-l bg-muted/20">
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-meta text-subtle-foreground">작업판</p>

        <dl className="mt-3 grid gap-3 text-sm">
          <Row name="만들 것" value={intake.tool === "sns" ? "카드뉴스" : intake.tool === "poster" ? "포스터" : null} />
          <Row name="주제" value={intake.topic ?? null} />
          <Row name="내용" value={intake.sourceRef ? `${intake.sourceRef.slice(0, 40)}…` : null} />
          {intake.tool === "sns" ? <Row name="장수" value={intake.cardCount ? `${intake.cardCount}장` : null} /> : null}
        </dl>

        {attachments.length ? (
          <div className="mt-5 grid gap-3">
            <p className="text-meta text-subtle-foreground">첨부 그림</p>
            {attachments.map((attachment) => (
              <div key={attachment.id} className="rounded-lg border bg-background p-2">
                <p className="truncate text-xs font-bold">{attachment.title}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ROLES.map((role) => (
                    <Button
                      key={role}
                      size="sm"
                      variant={attachment.role === role ? "default" : "secondary"}
                      onClick={() => onRoleChange(attachment.id, role)}
                    >{ATTACHMENT_ROLE_LABEL[role]}</Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {intake.notes?.length ? (
          <div className="mt-5">
            <p className="text-meta text-subtle-foreground">메모</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {intake.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t bg-background p-4">
        {missing.length ? (
          <>
            <Badge variant="secondary">아직 {missing.length}가지</Badge>
            <ul className="mt-2 text-xs text-muted-foreground">
              {missing.map((slot) => <li key={slot.id}>· {slot.label}</li>)}
            </ul>
          </>
        ) : null}
        <Button className="mt-3 w-full" disabled={busy || missing.length > 0} onClick={onLaunch}>
          {busy ? "만드는 중…" : "원고 만들기"}
        </Button>
        <p className="mt-2 text-center text-meta text-subtle-foreground">
          원고를 먼저 만듭니다. 이미지는 확인 후에 만듭니다
        </p>
      </div>
    </aside>
  );
}

function Row({ name, value }: { name: string; value: string | null }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 flex-none text-subtle-foreground">{name}</dt>
      <dd className="m-0 flex-1">{value ?? <span className="text-subtle-foreground">—</span>}</dd>
    </div>
  );
}
```

- [ ] **2단계: 만들기를 붙인다**

`studio-client.tsx` 에 넣는다. 임시 작업판 `<aside>` 를 `<BoardPane .../>` 로 바꾸고 아래 두 함수를 더한다.

```tsx
  function setRole(id: string, role: AttachmentRole) {
    setSession((current) => ({
      ...current,
      attachments: current.attachments.map((entry) => entry.id === id ? { ...entry, role } : entry),
      intake: {
        ...current.intake,
        attachments: (current.intake.attachments ?? []).map((entry) =>
          entry.id === id ? { ...entry, role } : entry),
      },
    }));
  }

  /** 대화에서 모인 것을 기존 흐름으로 넘긴다. 새 생성 경로를 만들지 않는다. */
  async function launch() {
    setBusy(true);
    try {
      const tool = session.intake.tool!;
      const attachments = session.attachments.filter((entry) => entry.role);
      const input = tool === "sns"
        ? toSnsProjectInput(session.intake, attachments as never)
        : toPosterProjectInput(session.intake, attachments as never);
      const path = tool === "sns" ? "/api/sns/projects" : "/api/poster/projects";
      const body = await (await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      })).json();
      if (!body.ok) throw new Error(body.message ?? "작업을 만들지 못했습니다.");
      setSession((current) => ({ ...current, projectId: body.project.id, tool }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "작업을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **3단계: 타입 검사**

```
npx pnpm --filter @fixup/web typecheck
```

예상: 오류 0

- [ ] **4단계: 브라우저로 확인한다**

`/studio` 에서 대화로 카드뉴스를 정하고 그림을 끌어다 놓는다. 확인할 것:

- 작업판에 주제·장수가 채워진다
- 그림마다 역할 버튼 세 개가 뜨고, 누르면 바뀐다
- 역할이 비어 있으면 「원고 만들기」가 잠겨 있다
- 다 채우면 열리고, 누르면 프로젝트가 생긴다

- [ ] **5단계: 커밋**

```bash
git add apps/web/app/studio
git commit -m "feat(studio): 작업판과 원고 만들기

작업판은 마법사가 아니라 지금 상태를 비추는 거울이다. 스텝바를 없앤
대신 이 칸이 어디인지와 되돌아가기를 맡는다.

돈 쓰는 버튼은 맨 아래 고정이다 — 대화 메시지는 스크롤되어 사라진다.
원고(LLM, 몇 센트)와 이미지(fal, 비쌈)를 나눠 두고 여기서는 원고까지만
연다."
```

---

## Task 7: 결과 칸

**파일**
- 만듦: `apps/web/app/studio/_components/result-pane.tsx`
- 고침: `apps/web/app/studio/studio-client.tsx`

**인터페이스**
- 쓰는 것: Task 6 이 채운 `session.projectId` / `session.tool`
- 만들어 내는 것: 결과 이미지를 보여 준다. 크게 보기는 기존 `data-zoomable` 이 받는다

- [ ] **1단계: 결과 칸을 만든다**

`apps/web/app/studio/_components/result-pane.tsx`

```tsx
"use client";

import * as React from "react";
import { Button } from "@fixup/ui";

interface ResultImage { id: string; url: string; label: string }

/**
 * 결과 칸.
 *
 * 좁은 화면에서는 접는다. 1440에서 네 칸이면 각 320px 안팎이고, 거기에
 * 6장을 넣으면 무엇이 나왔는지 알아볼 수 없다. 자세히 보는 것은 기존
 * 원본 크기 뷰어가 받는다(data-zoomable).
 */
export function ResultPane({ projectId, tool }: { projectId?: string; tool?: "sns" | "poster" }) {
  const [images, setImages] = React.useState<ResultImage[]>([]);
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    if (!projectId || !tool) return;
    let alive = true;
    const path = tool === "sns" ? `/api/sns/projects/${projectId}/status` : `/api/poster/projects/${projectId}/status`;
    async function poll() {
      try {
        const body = await (await fetch(path, { cache: "no-store" })).json();
        if (!alive || !body.ok) return;
        setImages((body.images ?? body.cards ?? [])
          .filter((entry: { assetUrl?: string; url?: string }) => entry.assetUrl || entry.url)
          .map((entry: { id?: string; index?: number; assetUrl?: string; url?: string }) => ({
            id: String(entry.id ?? entry.index ?? ""),
            url: (entry.assetUrl ?? entry.url)!,
            label: `${entry.index ?? ""}`,
          })));
      } catch {
        // 조회가 한 번 실패해도 다음 차례에 다시 본다.
      }
    }
    void poll();
    const timer = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [projectId, tool]);

  if (!open) {
    return (
      <aside className="border-l bg-muted/30 p-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>결과 펴기</Button>
      </aside>
    );
  }

  return (
    <aside className="min-h-0 overflow-y-auto border-l bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-meta text-subtle-foreground">결과 {images.length ? `· ${images.length}장` : ""}</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>접기</Button>
      </div>
      {!projectId ? (
        <p className="mt-3 text-sm text-muted-foreground">아직 만든 것이 없습니다.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {images.map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.id}
              src={image.url}
              alt={image.label}
              data-zoomable
              className="w-full cursor-zoom-in rounded-md border"
            />
          ))}
        </div>
      )}
    </aside>
  );
}
```

- [ ] **2단계: 붙인다**

`studio-client.tsx` 의 임시 결과 `<aside>` 를 바꾼다.

```tsx
        <ResultPane projectId={session.projectId} tool={session.tool} />
```

- [ ] **3단계: 타입 검사와 브라우저 확인**

```
npx pnpm --filter @fixup/web typecheck
```

`/studio` 에서 원고까지 만든 뒤 결과 칸이 뜨는지, 접기·펴기가 되는지, 그림을 누르면 원본 크기 뷰어가 열리는지 본다.

- [ ] **4단계: 커밋**

```bash
git add apps/web/app/studio
git commit -m "feat(studio): 결과 칸

좁은 화면에서는 접는다. 1440에서 네 칸이면 각 320px 안팎이라 6장을
넣으면 무엇이 나왔는지 알아볼 수 없다. 자세히 보는 것은 기존 원본
크기 뷰어가 받는다."
```

---

## Task 8: 만든 결과를 라이브러리에 자동으로 담기

**파일**
- 고침: `apps/web/lib/sns/queued-flow.ts`
- 만듦: `apps/web/lib/studio/auto-archive.ts`
- 테스트: `apps/web/lib/studio/__tests__/auto-archive.test.ts`

**인터페이스**
- 쓰는 것: `lib/reference-images.ts` 의 `saveReferenceImage`
- 만들어 내는 것: `archiveResult(input: { userId, title, index, bytes, mimeType }, save?): Promise<void>`

- [ ] **1단계: 실패하는 테스트를 쓴다**

`apps/web/lib/studio/__tests__/auto-archive.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { archiveResult, resultTitle } from "../auto-archive";

describe("보관할 때 붙이는 이름", () => {
  it("작업 이름과 몇 번째인지 함께 적는다", () => {
    // 라이브러리에는 온갖 그림이 섞인다. 이름만 봐도 어느 작업의 몇 번째인지
    // 알아야 다시 찾을 수 있다.
    expect(resultTitle("수분 세럼 카드뉴스", 3)).toBe("수분 세럼 카드뉴스 · 3");
  });

  it("이름이 없으면 그래도 뭔가 적는다", () => {
    expect(resultTitle("", 1)).toBe("만든 결과 · 1");
  });
});

describe("자동 보관", () => {
  it("받은 것을 그대로 넘긴다", async () => {
    const seen: unknown[] = [];
    await archiveResult(
      { userId: "u1", title: "세럼 카드뉴스", index: 2, bytes: new Uint8Array([1]), mimeType: "image/png" },
      async (input) => { seen.push(input); },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ userId: "u1", title: "세럼 카드뉴스 · 2", purpose: "both" });
  });

  it("보관에 실패해도 던지지 않는다", async () => {
    // 보관은 곁다리다. 여기서 던지면 멀쩡히 만든 그림까지 실패로 처리된다.
    await expect(archiveResult(
      { userId: "u1", title: "세럼", index: 1, bytes: new Uint8Array([1]), mimeType: "image/png" },
      async () => { throw new Error("창고가 꽉 찼습니다"); },
    )).resolves.toBeUndefined();
  });
});
```

- [ ] **2단계: 실패를 확인한다**

```
cd apps/web && npx vitest run lib/studio/__tests__/auto-archive.test.ts
```

예상: `Cannot find module '../auto-archive'`

- [ ] **3단계: 구현한다**

`apps/web/lib/studio/auto-archive.ts`

```ts
import { randomUUID } from "node:crypto";
import { saveReferenceImage } from "../reference-images";

/**
 * 만든 결과를 참고 이미지 창고에 담는다.
 *
 * **서버에서 건다.** 브라우저에서 걸면 창을 닫거나 새로고침한 사이에 끝난
 * 장이 빠진다.
 *
 * **실패해도 던지지 않는다.** 보관은 곁다리다 — 여기서 던지면 멀쩡히 만든
 * 그림까지 실패로 처리된다. 캐릭터에서 쓰는 방식과 같다.
 */

type SaveFn = (input: {
  userId: string; id: string; title: string; purpose: "both"; bytes: Uint8Array; mimeType: string;
}) => Promise<unknown>;

/** 라이브러리에는 온갖 그림이 섞인다. 어느 작업의 몇 번째인지 이름에 적는다. */
export function resultTitle(projectTitle: string, index: number): string {
  return `${projectTitle.trim() || "만든 결과"} · ${index}`;
}

export async function archiveResult(
  input: { userId: string; title: string; index: number; bytes: Uint8Array; mimeType: string },
  save: SaveFn = saveReferenceImage as SaveFn,
): Promise<void> {
  try {
    await save({
      userId: input.userId,
      id: randomUUID(),
      title: resultTitle(input.title, input.index),
      purpose: "both",
      bytes: input.bytes,
      mimeType: input.mimeType,
    });
  } catch (error) {
    console.warn("[studio] 결과 보관 실패, 그림은 유지합니다", error);
  }
}
```

- [ ] **4단계: 통과를 확인한다**

```
cd apps/web && npx vitest run lib/studio/__tests__/auto-archive.test.ts
```

예상: 4개 통과

- [ ] **5단계: 카드뉴스 흐름에 건다**

`apps/web/lib/sns/queued-flow.ts` 의 `card.assetPath = saved.assetPath` 두 곳(155행, 250행 부근) 바로 뒤에 넣는다. `saved` 에 이미지 바이트가 없으면 저장된 파일을 다시 읽어 쓴다. 그 지점의 실제 변수명을 확인한 뒤 아래를 맞춰 넣는다.

```ts
      // 만든 결과는 전부 라이브러리로 간다. 곁다리라 실패해도 그림은 살린다.
      await archiveResult({
        userId,
        title: projectTitle,
        index: card.index,
        bytes: imageBytes,
        mimeType: "image/png",
      });
```

- [ ] **6단계: 전체 테스트와 타입 검사**

```
cd .. && npx pnpm --filter @fixup/web typecheck && npx pnpm -r test
```

예상: 오류 0, 전부 통과

- [ ] **7단계: 실제로 한 장 만들어 확인한다**

`/studio` 에서 카드뉴스를 한 장 만든 뒤 라이브러리 → 참고 이미지에 `제목 · 1` 로 들어왔는지 본다.

- [ ] **8단계: 커밋**

```bash
git add apps/web/lib/studio apps/web/lib/sns/queued-flow.ts
git commit -m "feat(studio): 만든 결과를 라이브러리에 자동으로 담는다

지금은 「참고 이미지로 보관」을 눌러야 들어간다. 누르는 걸 잊으면
사라진다. 서버에서 걸어 빠질 일을 없앤다 — 브라우저에서 걸면 창을
닫은 사이에 끝난 장이 빠진다.

보관에 실패해도 던지지 않는다. 곁다리라 여기서 던지면 멀쩡히 만든
그림까지 실패로 처리된다."
```

---

## Task 9: 포스터도 자동 보관하고, 끝까지 한 번 돌려 본다

**파일**
- 고침: `apps/web/app/api/poster/projects/[id]/generate/route.ts`
- 고침: `docs/superpowers/specs/2026-09-02-chat-studio-design.md`

- [ ] **1단계: 포스터 결과에 건다**

포스터는 이미지가 저장되는 지점에서 같은 방식으로 부른다. `archiveResult` 를 쓰고, 제목은 프로젝트 제목과 변형 번호를 쓴다.

```ts
      await archiveResult({
        userId: auth.member.userId,
        title: project.title,
        index: image.variantIndex + 1,
        bytes: imageBytes,
        mimeType: "image/png",
      });
```

- [ ] **2단계: 카드뉴스를 끝까지 돌린다**

`/studio` 에서:

1. "수분 세럼 신제품 카드뉴스 만들어 주세요" 라고 적는다
2. 안내자가 되묻는 대로 답한다
3. 레퍼런스 그림 한 장을 끌어다 놓는다
4. 안내자가 무엇으로 쓸지 묻는지 확인한다 — **묻지 않으면 실패다**
5. 작업판에서 역할을 확인하고 「원고 만들기」를 누른다
6. 원고가 작업판에 뜨는지 본다
7. 「이미지 만들기」로 한두 장 만든다
8. 결과 칸에 뜨는지, 라이브러리에 들어갔는지 본다

- [ ] **3단계: 포스터도 끝까지 돌린다**

같은 방식으로 포스터를 만든다. 레퍼런스 없이 시작하면 안내자가 그것부터 챙기는지 확인한다.

- [ ] **4단계: 설계 문서에 결과를 적는다**

`docs/superpowers/specs/2026-09-02-chat-studio-design.md` 맨 아래에 「돌려 본 결과」 절을 더한다. 무엇이 잘 됐고 무엇이 어긋났는지 적는다. 어긋난 것은 다음 작업 거리다.

- [ ] **5단계: 커밋**

```bash
git add apps/web docs
git commit -m "feat(studio): 포스터 결과도 자동 보관하고 끝까지 돌려 본다

카드뉴스와 포스터를 대화로 시작해 결과까지 받아 봤다. 무엇이 어긋났는지
설계 문서에 적어 뒀다."
```

---

## 자체 점검

**설계 문서 항목별 확인**

| 설계 | 어느 작업 |
|---|---|
| 3분할 화면 | Task 5 |
| 스텝바 없음 | Task 5·6 (작업판이 대신) |
| 대화는 브라우저에만 | Task 3 |
| 안내자가 자유롭게 대화 | 이미 있음 (`turn.ts`) |
| 도구를 먼저 고르게 하지 않음 | 이미 있음 (`OPENING_MESSAGE`) |
| 그림을 붙이면 묻는다 | 이미 있음 (`intake.ts`) + Task 5 (끌어다 놓기) |
| 캐릭터 안내 | 이미 있음 (`characterSuggestion`) — Task 6 에서 작업판에 띄운다 |
| 프롬프트는 기존 기계가 쓴다 | Task 2 (`toneNote` 로 넘김) |
| 모델은 못 쓰는 것만 걸러냄 | 이미 있음 (`model-choice.ts`) |
| 기존 파이프라인으로 넘김 | Task 2·6 |
| 결과물 전부 자동 저장 | Task 8·9 |
| 만들기 버튼 두 단계 | Task 6 (원고) · Task 9 (이미지) |
| 좁은 화면에서 결과 접기 | Task 7 |

**빠진 것 하나** — `characterSuggestion` 을 작업판에 띄우는 일이 Task 6 의 코드에 없다. Task 6 의 작업판에 아래를 더한다.

```tsx
        {suggestion ? (
          <a href={suggestion.href} className="mt-4 block rounded-lg border border-primary/40 bg-primary-soft p-3 text-sm">
            <strong>{suggestion.label}</strong>
            <span className="mt-1 block text-muted-foreground">{suggestion.why}</span>
          </a>
        ) : null}
```

`BoardPane` 의 props 에 `suggestion: StudioSuggestion | null` 을 더하고, `studio-client.tsx` 에서 `characterSuggestion(session.intake)` 를 넘긴다.

**이름 맞춤 확인** — `Intake`, `MissingSlot`, `StudioSuggestion`, `AttachmentRole`, `LaunchAttachment`, `StudioSession`, `TurnMessage`, `TurnResult` 가 작업들 사이에서 같은 이름으로 쓰인다. `archiveResult` 와 `resultTitle` 도 Task 8·9 에서 같다.
