# 라이브러리에서 작업의 단계별 과정 열기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라이브러리 작업물에서 그 작업의 단계별 화면으로 들어갈 수 있게 하고, 관리자는 남의 작업도 보고 자기 것으로 복사해 다시 만들 수 있게 한다.

**Architecture:** 회원용 읽기·쓰기 경로는 **한 줄도 건드리지 않는다.** 관리자 길은 서비스 키를 쓰는 별도 통로(`api/admin/works/store.ts`)로만 넓히고, 화면은 「남의 작업 보는 중」 상태를 받아 쓰는 단추를 잠근다. 다시 만들기는 남의 작업을 고치는 대신 **관리자 소유로 복사**해 기존 흐름을 그대로 태운다.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Supabase(Postgres + Storage) · vitest

**Spec:** `docs/superpowers/specs/2026-09-16-library-open-work-steps-design.md`

## Global Constraints

- **회원용 경로 불변.** `snsFlowStoreForUser`·`posterStoresForUser` 와 그 아래 쓰기 질의(`.eq("user_id", userId)`)를 수정하지 않는다. 관리자 조건을 그 함수들 안에 심지 않는다.
- **RLS 정책 불변.** `same_team` 및 `team reads *` 정책을 수정하지 않는다. 관리자 읽기는 서비스 키(`createSupabaseAdminClient`)로만 간다.
- **관리자 판정은 한 곳에서.** `hasFullScope(viewerFrom(auth.member), <action>)` (`apps/web/lib/access/core.ts:98`). 손으로 role 을 비교하지 않는다.
- **관리자가 아니면 404.** 403 은 대상의 존재를 흘린다.
- **저장 경로 첫 칸은 소유자 id.** `{user_id}/sns/{projectId}/{cardIndex}.png`, `{user_id}/poster/{projectId}/{variantIndex}.png`, 사본은 `{원본}.thumb.webp` (`apps/web/lib/grid-thumbnail-path.ts` 의 `gridThumbPath`).
- **격자는 사본, 확대·생성 입력은 원본** (`apps/web/app/_components/grid-src.ts`).
- **소유자는 세션에서 강제한다.** 요청 본문의 `userId` 는 무시한다.
- **버킷:** 카드뉴스·포스터 결과는 `library` 버킷. (`apps/web/lib/server-library.ts` 의 `BUCKET`)
- 시험 실행: `cd apps/web && npx vitest run <path>`
- 타입 검사: `npx tsc --noEmit -p apps/web/tsconfig.json` — **신규 오류 0** 이 기준(기존 CSS 관련 `TS2882` 8건은 무시)

---

## File Structure

| 파일 | 책임 | 단계 |
|---|---|---|
| `apps/web/app/library/work-steps.ts` | **신규.** 「과정 보기」 단추를 누구에게 낼지 정하는 순수 규칙 | 1·2 |
| `apps/web/app/library/__tests__/work-steps.test.ts` | **신규.** 위 규칙의 시험 | 1·2 |
| `apps/web/app/library/works-tab.tsx` | 카드에 단추를 붙인다. 카드 본문 클릭은 그대로 | 1·2·3 |
| `apps/web/app/api/admin/works/store.ts` | 관리자 전용 단건 읽기·복사를 `listAllWorks`·`deleteAnyWork` 옆에 더한다 | 2·3 |
| `apps/web/app/api/admin/works/copy-paths.ts` | **신규.** 복사할 때 저장 경로를 새 소유자·새 작업 id 로 바꾸는 순수 규칙 | 3 |
| `apps/web/app/api/admin/works/__tests__/copy-paths.test.ts` | **신규.** 위 규칙의 시험 | 3 |
| `apps/web/app/api/admin/works/[kind]/[id]/route.ts` | **신규.** 관리자 단건 읽기(GET) | 2 |
| `apps/web/app/api/admin/works/[kind]/[id]/copy/route.ts` | **신규.** 관리자 복사(POST) | 3 |
| `apps/web/app/sns/[id]/project-client.tsx` | 「남의 작업 보는 중」이면 쓰는 단추를 잠그고 띠를 띄운다 | 2·3 |
| `apps/web/app/poster/[id]/poster-client.tsx` | 같음 | 2·3 |

**왜 순수 규칙을 따로 빼는가** — 이 저장소에는 jsdom 이 없어 컴포넌트를 렌더해 잴 수 없다. 판단을 `.ts` 로 빼면 값으로 잴 수 있다. `works-cover.ts` 가 같은 이유로 갈라져 있다.

---

## Task 1: 라이브러리 카드에 「과정 보기」 단추

**Files:**
- Create: `apps/web/app/library/work-steps.ts`
- Create: `apps/web/app/library/__tests__/work-steps.test.ts`
- Modify: `apps/web/app/library/works-tab.tsx` (import 추가 · 카드 안 단추 추가)

**Interfaces:**
- Produces: `canOpenSteps(work: { mine: boolean }, isAdmin: boolean | null): boolean` — 단추를 낼지 정한다. Task 2 가 같은 함수의 관리자 갈래를 켠다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/library/__tests__/work-steps.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { canOpenSteps } from "../work-steps";

/**
 * 「과정 보기」 단추를 누구에게 내는가.
 *
 * 카드 본문 클릭은 그대로 그림 뷰어를 연다(2026-09-16 사용자 결정) —
 * 쓰던 동작을 뺏지 않는다. 단추만 따로 붙인다.
 *
 * **남의 작업에는 아직 안 낸다.** 지금 눌러 봐야 단계별 화면이 404 다 —
 * 상세 화면의 데이터 경로가 RLS 를 타고, `same_team` 에 관리자 예외가 없다.
 * 2단계에서 관리자 읽기 통로를 낸 뒤에 연다.
 */
describe("canOpenSteps", () => {
  it("내 작업이면 낸다", () => {
    expect(canOpenSteps({ mine: true }, false)).toBe(true);
  });

  it("관리자라도 남의 작업에는 아직 안 낸다", () => {
    // 2단계에서 true 로 바뀐다. 그때 이 시험도 함께 고친다.
    expect(canOpenSteps({ mine: false }, true)).toBe(false);
  });

  it("남의 작업에는 안 낸다", () => {
    expect(canOpenSteps({ mine: false }, false)).toBe(false);
  });

  it("관리자인지 아직 모르면(null) 내 것만 낸다", () => {
    // `isAdmin` 은 관리 목록을 받아 봐야 정해진다. 그 전에는 null 이다.
    expect(canOpenSteps({ mine: true }, null)).toBe(true);
    expect(canOpenSteps({ mine: false }, null)).toBe(false);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `cd apps/web && npx vitest run app/library/__tests__/work-steps.test.ts`
Expected: FAIL — `Cannot find module '../work-steps'`

- [ ] **Step 3: 최소 구현**

`apps/web/app/library/work-steps.ts`

```ts
/**
 * 「과정 보기」 단추를 누구에게 내는가.
 *
 * 단추는 그 작업의 단계별 화면(`/sns/{id}`·`/poster/{id}`)으로 간다. 그 화면의
 * 데이터 경로는 RLS 를 타므로 **읽을 수 있는 사람에게만 내야 한다** — 못 읽는
 * 사람에게 내면 눌러서 「찾을 수 없습니다」를 보게 된다.
 *
 * 관리자가 남의 작업을 읽는 길은 2단계에서 열린다. 그때까지는 내 것만.
 */
export function canOpenSteps(work: { mine: boolean }, _isAdmin: boolean | null): boolean {
  return work.mine;
}
```

- [ ] **Step 4: 시험을 돌려 통과를 확인한다**

Run: `cd apps/web && npx vitest run app/library/__tests__/work-steps.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 카드에 단추를 붙인다**

`apps/web/app/library/works-tab.tsx` — import 에 추가:

```ts
import { canOpenSteps } from "./work-steps";
```

`lucide-react` import 에 `ListOrdered` 를 더한다:

```ts
import { Loader2, ListOrdered, Trash2 } from "lucide-react";
```

지우기 단추 블록(`{work.mine || isAdmin ? (` … `) : null}`) **바로 다음**에 넣는다:

```tsx
{/* 「과정 보기」 — 카드 본문 클릭은 그대로 그림 뷰어를 연다.

    완성된 작업은 그림이 있어 언제나 뷰어가 열렸고, 단계별 화면으로 가는 길이
    거기 가려져 있었다(`onClick` 이 「그림이 있으면 뷰어, 없으면 이동」이다).
    쓰던 동작을 뺏지 않고 길만 따로 낸다. */}
{canOpenSteps(work, isAdmin) ? (
  <button
    type="button"
    aria-label={`${work.title} 과정 보기`}
    onClick={(event) => {
      // 카드를 누른 것으로도 읽히면 뷰어와 이동이 함께 일어난다.
      event.stopPropagation();
      router.push(work.href);
    }}
    className={cn(DELETE_CORNER_BUTTON, "left-1.5 right-auto")}
  ><ListOrdered className="size-3.5" /></button>
) : null}
```

- [ ] **Step 6: 배선 가드 시험을 더한다**

`apps/web/app/library/__tests__/work-steps.test.ts` 끝에 추가:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 규칙을 만들어 놓고 화면이 안 부르면 소용이 없다.
 *
 * 이 저장소는 소스 대조 시험이 **통과만 하는** 사고를 두 번 겪었다
 * (2026-09-08·2026-09-15). 그래서 **찾지 말고 센다** — 여는 태그와 인자를
 * 한 덩어리로 보고, 자리 수를 박는다.
 */
describe("화면이 규칙을 부르는가", () => {
  const source = readFileSync(
    join(__dirname, "..", "works-tab.tsx"), "utf8");

  it("카드가 canOpenSteps 로 단추를 가린다", () => {
    const wired = source.match(/\{canOpenSteps\(work, isAdmin\) \?/g) ?? [];
    expect(wired.length).toBe(1);
  });

  it("단추가 그 작업의 주소로 간다", () => {
    expect(source).toContain("router.push(work.href)");
  });

  it("카드 본문 클릭은 그대로 뷰어를 연다", () => {
    // 이 줄이 바뀌면 지금 쓰던 동작을 뺏은 것이다.
    expect(source).toContain(
      "work.images.length ? openWork(work) : router.push(work.href)");
  });
});
```

- [ ] **Step 7: 시험·타입·린트를 돌린다**

```bash
cd apps/web && npx vitest run app/library/__tests__/work-steps.test.ts
cd /c/Users/PC/Desktop/coding/fixup-image-agent && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "error TS" | grep -v TS2882
cd apps/web && npx next lint --file app/library/works-tab.tsx --file app/library/work-steps.ts
```

Expected: 시험 7건 PASS · 타입 오류 출력 없음 · 린트 0 warnings

- [ ] **Step 8: 되돌려 재 본다 (가드가 진짜 잡는가)**

`works-tab.tsx` 의 `{canOpenSteps(work, isAdmin) ?` 를 `{work.mine ?` 로 바꾸고 시험을 돌린다.
Expected: FAIL — "카드가 canOpenSteps 로 단추를 가린다"
그 뒤 원래대로 되돌리고 다시 돌려 PASS 를 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add apps/web/app/library/work-steps.ts apps/web/app/library/__tests__/work-steps.test.ts apps/web/app/library/works-tab.tsx
git commit -m "feat(library): 작업물 카드에서 그 작업의 과정으로 바로 간다"
```

---

## Task 2: 관리자가 남의 작업을 본다 (읽기만)

**Files:**
- Modify: `apps/web/app/api/admin/works/store.ts` (`readAnyWork` 추가)
- Create: `apps/web/app/api/admin/works/[kind]/[id]/route.ts`
- Modify: `apps/web/app/library/work-steps.ts` (관리자 갈래 켜기)
- Modify: `apps/web/app/library/__tests__/work-steps.test.ts`
- Modify: `apps/web/app/sns/[id]/project-client.tsx`, `apps/web/app/poster/[id]/poster-client.tsx` (보기 전용 상태)

**Interfaces:**
- Consumes: `canOpenSteps` (Task 1)
- Produces:
  - `readAnyWork(kind: "sns" | "poster", id: string): Promise<Record<string, unknown> | null>` — 서비스 키로 한 건을 읽는다. 없으면 `null`.
  - `GET /api/admin/works/{kind}/{id}` → `{ ok: true, work }` 또는 404

- [ ] **Step 1: 단추 규칙의 관리자 갈래 시험을 고친다**

`apps/web/app/library/__tests__/work-steps.test.ts` 에서 이 시험을 바꾼다:

```ts
  it("관리자는 남의 작업에도 낸다", () => {
    // 2단계에서 관리자 읽기 통로가 열렸다. 이제 눌러도 404 가 아니다.
    expect(canOpenSteps({ mine: false }, true)).toBe(true);
  });
```

(기존 "관리자라도 남의 작업에는 아직 안 낸다" 를 이것으로 교체)

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `cd apps/web && npx vitest run app/library/__tests__/work-steps.test.ts`
Expected: FAIL — `expected false to be true`

- [ ] **Step 3: 규칙을 고친다**

`apps/web/app/library/work-steps.ts`

```ts
export function canOpenSteps(work: { mine: boolean }, isAdmin: boolean | null): boolean {
  return work.mine || isAdmin === true;
}
```

주석의 마지막 문단을 바꾼다: `관리자가 남의 작업을 읽는 길은 2단계에서 열린다. 그때까지는 내 것만.` → `관리자는 서비스 키로 읽는 별도 통로(api/admin/works/[kind]/[id])가 있어 남의 작업도 연다.`

- [ ] **Step 4: 돌려서 통과를 확인한다**

Run: `cd apps/web && npx vitest run app/library/__tests__/work-steps.test.ts`
Expected: PASS

- [ ] **Step 5: 관리자 단건 읽기의 시험을 쓴다**

`apps/web/app/api/admin/works/__tests__/read-any-work.test.ts` (신규)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 관리자 단건 읽기.
 *
 * 목록(`listAllWorks`)은 서비스 키로 RLS 를 우회해 전부 보여 주는데, 상세
 * 화면은 세션 클라이언트라 RLS 가 적용되고 `same_team` 에 관리자 예외가 없다.
 * 그래서 목록에서는 보이는데 눌러서는 못 여는 상태였다.
 *
 * **회원용 길에 조건을 심지 않는다.** `deleteAnyWork` 가 같은 이유로 갈라져
 * 있고, 그 까닭이 route 주석에 적혀 있다.
 */
vi.mock("server-only", () => ({}));

let snsRows: Array<Record<string, unknown>> = [];
let posterRows: Array<Record<string, unknown>> = [];
let queriedTable = "";

function builderFor(table: string) {
  queriedTable = table;
  const rows = table === "sns_projects" ? snsRows : posterRows;
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    order: () => self,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (x: unknown) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null })),
  };
  return self;
}

vi.mock("../../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (t: string) => builderFor(t) }),
}));

const { readAnyWork } = await import("../store");

beforeEach(() => { snsRows = []; posterRows = []; queriedTable = ""; });

describe("readAnyWork", () => {
  it("카드뉴스 한 건을 소유자와 무관하게 읽는다", async () => {
    snsRows = [{ id: "s1", user_id: "남의-id", title: "겨울" }];

    const work = await readAnyWork("sns", "s1");

    expect(queriedTable).toBe("sns_projects");
    expect(work).toMatchObject({ id: "s1", title: "겨울" });
  });

  it("포스터는 다른 표를 본다", async () => {
    posterRows = [{ id: "p1", user_id: "남의-id", title: "가을" }];

    await readAnyWork("poster", "p1");

    expect(queriedTable).toBe("poster_projects");
  });

  it("없으면 null 이다 — 던지지 않는다", async () => {
    expect(await readAnyWork("sns", "없는-id")).toBeNull();
  });
});
```

- [ ] **Step 6: 돌려서 실패를 확인한다**

Run: `cd apps/web && npx vitest run app/api/admin/works/__tests__/read-any-work.test.ts`
Expected: FAIL — `readAnyWork` is not a function

- [ ] **Step 7: `readAnyWork` 를 구현한다**

`apps/web/app/api/admin/works/store.ts` 의 `deleteAnyWork` **앞**에 추가:

```ts
/**
 * 한 건을 **소유자와 무관하게** 읽는다.
 *
 * 목록과 같은 방식(서비스 키)이다. 회원용 길(`snsFlowStoreForUser`·
 * `posterStoresForUser`)에 관리자 조건을 심지 않는 이유는 `deleteAnyWork`
 * 와 같다 — 같은 함수에 조건을 심으면 언젠가 그 조건이 어긋나 회원이 남의
 * 것을 읽는다.
 *
 * **부르는 쪽이 관리자인지 먼저 확인해야 한다.** 이 함수는 묻지 않는다.
 */
export async function readAnyWork(
  kind: "sns" | "poster",
  id: string,
): Promise<Record<string, unknown> | null> {
  const table = kind === "sns" ? "sns_projects" : "poster_projects";
  const { data, error } = await createSupabaseAdminClient()
    .from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown> | null) ?? null;
}
```

- [ ] **Step 8: 돌려서 통과를 확인한다**

Run: `cd apps/web && npx vitest run app/api/admin/works/__tests__/read-any-work.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: 라우트를 만든다**

`apps/web/app/api/admin/works/[kind]/[id]/route.ts` (신규)

```ts
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { hasFullScope, viewerFrom } from "../../../../../../lib/access/core";
import { readAnyWork } from "../../store";

type Context = { params: Promise<{ kind: string; id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자가 남의 작업 한 건을 읽는다.
 *
 * **관리자가 아니면 404 다.** 403 으로 답하면 「그 작업이 있긴 하다」가 샌다 —
 * id 를 하나씩 넣어 보며 남의 작업 존재를 셀 수 있게 된다.
 */
export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const { kind, id } = await context.params;
  if (kind !== "sns" && kind !== "poster") {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }
  if (!hasFullScope(viewerFrom(auth.member), "read")) {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const work = await readAnyWork(kind, id);
    if (!work) return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: true, work });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
```

`ScopeAction` 은 `"read" | "delete" | "export"` 다(`apps/web/lib/access/core.ts:41`).
읽기이므로 `"read"` 를 쓴다. `scope()` 가 `role === "admin"` 일 때만 `{ kind: "all" }`
을 주므로(`:65-70`) 관리자만 통과한다.

- [ ] **Step 9-1: 관문의 배선 가드를 더한다**

라우트는 세션 인증을 타서 값으로 재기 어렵다. 이 저장소가 쓰는 방식대로 소스로
지키되 **찾지 말고 센다.**

`apps/web/app/api/admin/works/__tests__/admin-gate.test.ts` (신규)

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 관리자 통로의 관문.
 *
 * **관리자가 아니면 404 다.** 403 으로 답하면 「그 작업이 있긴 하다」가 샌다 —
 * id 를 하나씩 넣어 보며 남의 작업 존재를 셀 수 있게 된다.
 *
 * `readAnyWork` 는 스스로 묻지 않는다. 묻는 것은 라우트뿐이라 여기가 유일한
 * 방어선이다.
 */
const ROOT = join(__dirname, "..", "[kind]", "[id]");
const ROUTES = ["route.ts"];   // 3단계에서 "copy/route.ts" 가 붙는다

describe("관리자 통로 관문", () => {
  it.each(ROUTES)("%s 가 hasFullScope 로 한 번 막는다", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    const gates = source.match(/hasFullScope\(viewerFrom\(auth\.member\), "read"\)/g) ?? [];
    expect(gates.length).toBe(1);
  });

  it.each(ROUTES)("%s 가 막을 때 403 이 아니라 404 를 준다", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(source).not.toContain("status: 403");
    expect(source).toContain("status: 404");
  });
});
```

Run: `cd apps/web && npx vitest run app/api/admin/works/__tests__/admin-gate.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 10: 상세 화면에 「보는 중」 상태를 만든다**

`apps/web/app/sns/[id]/project-client.tsx` 와 `apps/web/app/poster/[id]/poster-client.tsx` 에서:

1. 첫 데이터 요청이 **404** 로 오면 `/api/admin/works/{kind}/{id}` 를 한 번 더 부른다
2. 거기서 받아오면 `readOnly = true` 로 두고, 화면 맨 위에 띠를 띄운다:

```tsx
{readOnly ? (
  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
    <b>{ownerEmail ?? "다른 회원"}</b> 님의 작업을 보는 중입니다. 고칠 수 없습니다.
  </div>
) : null}
```

3. 쓰는 단추(생성·중지·원고 수정·저장)에 `disabled={readOnly || ...}` 를 더한다

- [ ] **Step 11: 시험·타입·린트를 돌린다**

```bash
cd apps/web && npx vitest run
cd /c/Users/PC/Desktop/coding/fixup-image-agent && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "error TS" | grep -v TS2882
cd apps/web && npx next lint --file app/api/admin/works/store.ts --file app/library/work-steps.ts
```

Expected: 기존 실패 1건(`reserve-operation-whitelist.test.ts` — 커밋 안 된 마이그레이션 SQL 을 훑는 시험) 외 전부 PASS · 타입 오류 출력 없음 · 린트 0 warnings

- [ ] **Step 12: 커밋**

```bash
git add apps/web/app/api/admin/works apps/web/app/library apps/web/app/sns/\[id\]/project-client.tsx apps/web/app/poster/\[id\]/poster-client.tsx
git commit -m "feat(admin): 관리자가 남의 작업 과정을 볼 수 있게 한다 (읽기만)"
```

---

## Task 3: 내 것으로 복사해서 다시 만들기

**Files:**
- Create: `apps/web/app/api/admin/works/copy-paths.ts`
- Create: `apps/web/app/api/admin/works/__tests__/copy-paths.test.ts`
- Modify: `apps/web/app/api/admin/works/store.ts` (`copyWorkToSelf` 추가)
- Create: `apps/web/app/api/admin/works/[kind]/[id]/copy/route.ts`
- Modify: `apps/web/app/sns/[id]/project-client.tsx`, `apps/web/app/poster/[id]/poster-client.tsx` (복사 단추)

**Interfaces:**
- Consumes: `readAnyWork` (Task 2)
- Produces: `copyWorkToSelf(kind: "sns" | "poster", id: string, ownerUserId: string): Promise<{ id: string }>`

- [ ] **Step 1: 경로 바꾸기 규칙의 시험을 쓴다**

`apps/web/app/api/admin/works/__tests__/copy-paths.test.ts` (신규)

```ts
import { describe, expect, it } from "vitest";
import { copiedAssetPath } from "../copy-paths";

/**
 * 복사본의 그림이 놓일 자리.
 *
 * **원본 경로를 그대로 물려받으면 안 된다.** 버킷 정책이 경로 첫 칸으로
 * 소유자를 판정하므로(`docs/DEPLOY.md`), 남의 첫 칸을 그대로 쓰면
 *
 *   1. 관리자 작업인데 그림의 소유 판정이 어긋나고
 *   2. 원래 회원이 자기 작업을 지우면 복사본의 그림이 같이 사라진다
 *
 * 그래서 첫 칸을 **복사한 사람**으로, 작업 칸을 **새 작업 id** 로 바꾼다.
 */
describe("copiedAssetPath", () => {
  it("첫 칸을 복사한 사람으로 바꾼다", () => {
    expect(copiedAssetPath("회원A/sns/작업1/0.png", "관리자B", "작업2"))
      .toBe("관리자B/sns/작업2/0.png");
  });

  it("작업 칸도 새 작업 id 로 바꾼다", () => {
    expect(copiedAssetPath("회원A/poster/작업1/2.png", "관리자B", "작업9"))
      .toBe("관리자B/poster/작업9/2.png");
  });

  it("작은 사본의 이름을 지킨다", () => {
    // `.thumb.webp` 는 `gridThumbPath` 가 정한 규칙이다. 여기서 깨면
    // 복사본이 격자에서 원본을 받아 2026-09-15 에 고친 것이 되살아난다.
    expect(copiedAssetPath("회원A/sns/작업1/0.thumb.webp", "관리자B", "작업2"))
      .toBe("관리자B/sns/작업2/0.thumb.webp");
  });

  it("모양이 다른 경로는 건드리지 않고 null 을 준다", () => {
    // 규약을 벗어난 옛 경로가 있으면 조용히 엉뚱한 자리에 쓰지 않는다.
    expect(copiedAssetPath("이상한경로.png", "관리자B", "작업2")).toBeNull();
    expect(copiedAssetPath("", "관리자B", "작업2")).toBeNull();
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `cd apps/web && npx vitest run app/api/admin/works/__tests__/copy-paths.test.ts`
Expected: FAIL — `Cannot find module '../copy-paths'`

- [ ] **Step 3: 최소 구현**

`apps/web/app/api/admin/works/copy-paths.ts` (신규)

```ts
/**
 * 복사본의 그림이 놓일 자리.
 *
 * 저장 경로 규약은 `{user_id}/{도구}/{작업}/{남은 이름}` 이다
 * (`docs/DEPLOY.md`). 버킷 정책이 **첫 칸으로 소유자를 판정**하므로 복사할
 * 때 첫 칸을 새 소유자로, 작업 칸을 새 작업 id 로 바꿔야 한다.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 문자열 규칙이라 시험에서 값으로
 * 잰다 — `grid-thumbnail-path.ts` 가 같은 이유로 갈라져 있다.
 *
 * 규약을 벗어난 경로는 `null` 을 준다. 조용히 엉뚱한 자리에 쓰는 것보다
 * 그 한 장을 못 옮겼다고 알리는 편이 낫다.
 */
export function copiedAssetPath(
  originalPath: string,
  newOwnerId: string,
  newProjectId: string,
): string | null {
  const parts = originalPath.split("/");
  if (parts.length < 4) return null;
  const [, tool, , ...rest] = parts;
  if (!tool || !rest.length) return null;
  return [newOwnerId, tool, newProjectId, ...rest].join("/");
}
```

- [ ] **Step 4: 돌려서 통과를 확인한다**

Run: `cd apps/web && npx vitest run app/api/admin/works/__tests__/copy-paths.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 복사 동작의 시험을 쓴다**

`apps/web/app/api/admin/works/__tests__/copy-work.test.ts` (신규)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 관리자가 남의 작업을 **자기 것으로 복사**한다.
 *
 * 남의 작업을 고치는 대신 복사하는 이유 — 쓰기 경로를 안 넓혀도 되기 때문이다.
 * 그 방어선은 「팀원의 카드뉴스에서 생성을 돌리면 크레딧이 예약·차감되고 fal 에
 * 실제 요청이 나간 뒤 결과만 어디에도 안 남았다」는 사고를 겪고 세운 것이다
 * (`lib/sns-flow-store.ts:113`).
 */
vi.mock("server-only", () => ({}));

const uploads: Array<{ path: string }> = [];
let inserted: Record<string, unknown> | null = null;
let sourceRow: Record<string, unknown> | null = null;
const downloaded: string[] = [];

function builderFor(_table: string) {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    insert: (row: Record<string, unknown>) => { inserted = row; return self; },
    maybeSingle: async () => ({ data: sourceRow, error: null }),
    single: async () => ({ data: { ...(inserted ?? {}), id: "새작업" }, error: null }),
    then: (r: (x: unknown) => unknown) => Promise.resolve(r({ data: [], error: null })),
  };
  return self;
}

vi.mock("../../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (t: string) => builderFor(t),
    storage: {
      from: () => ({
        download: async (path: string) => {
          downloaded.push(path);
          return { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null };
        },
        upload: async (path: string) => { uploads.push({ path }); return { error: null }; },
      }),
    },
  }),
}));

const { copyWorkToSelf } = await import("../store");

beforeEach(() => {
  uploads.length = 0; downloaded.length = 0; inserted = null; sourceRow = null;
});

describe("copyWorkToSelf", () => {
  it("소유자를 부르는 쪽이 준 사람으로 강제한다", async () => {
    // 원본 행에 남의 user_id 가 들어 있어도 복사본은 세션 사용자 것이다.
    sourceRow = {
      id: "원본", user_id: "회원A", title: "겨울", ratio: "1:1",
      language: "ko", model_id: "m", card_count_mode: "auto",
      data: { cards: [] },
    };

    await copyWorkToSelf("sns", "원본", "관리자B");

    expect(inserted!.user_id).toBe("관리자B");
  });

  it("그림을 새 자리에 올리고 경로를 바꿔 적는다", async () => {
    sourceRow = {
      id: "원본", user_id: "회원A", title: "겨울", ratio: "1:1",
      language: "ko", model_id: "m", card_count_mode: "auto",
      data: { cards: [{ assetPath: "회원A/sns/원본/0.png", thumbPath: "회원A/sns/원본/0.thumb.webp" }] },
    };

    await copyWorkToSelf("sns", "원본", "관리자B");

    // 원본에서 받아서
    expect(downloaded).toContain("회원A/sns/원본/0.png");
    expect(downloaded).toContain("회원A/sns/원본/0.thumb.webp");
    // 새 자리에 올린다 — 첫 칸이 복사한 사람이다
    expect(uploads.every((u) => u.path.startsWith("관리자B/"))).toBe(true);
    // 적어 둔 경로도 새 자리다
    const cards = (inserted!.data as { cards: Array<{ assetPath: string }> }).cards;
    expect(cards[0]!.assetPath.startsWith("관리자B/")).toBe(true);
  });

  it("작은 사본도 함께 옮긴다", async () => {
    sourceRow = {
      id: "원본", user_id: "회원A", title: "겨울", ratio: "1:1",
      language: "ko", model_id: "m", card_count_mode: "auto",
      data: { cards: [{ assetPath: "회원A/sns/원본/0.png", thumbPath: "회원A/sns/원본/0.thumb.webp" }] },
    };

    await copyWorkToSelf("sns", "원본", "관리자B");

    expect(uploads.some((u) => u.path.endsWith(".thumb.webp"))).toBe(true);
  });
});
```

- [ ] **Step 6: 돌려서 실패를 확인한다**

Run: `cd apps/web && npx vitest run app/api/admin/works/__tests__/copy-work.test.ts`
Expected: FAIL — `copyWorkToSelf` is not a function

- [ ] **Step 7: `copyWorkToSelf` 를 구현한다**

`apps/web/app/api/admin/works/store.ts` 에 추가한다.

**순서가 중요하다** — 행을 **먼저** 만들어야 새 작업 id 가 나오고, 그래야 그림을
어디에 둘지 정할 수 있다.

```ts
/**
 * 남의 작업을 **내 것으로 복사한다.**
 *
 * 고치는 대신 복사하는 이유 — 쓰기 경로를 안 넓혀도 되기 때문이다. 그 방어선은
 * 「팀원의 카드뉴스에서 생성을 돌리면 크레딧이 예약·차감되고 fal 에 실제 요청이
 * 나간 뒤 결과만 어디에도 안 남았다」는 사고를 겪고 세운 것이다
 * (`lib/sns-flow-store.ts:113`).
 *
 * **소유자는 부르는 쪽이 준 값만 쓴다.** 원본 행의 `user_id` 는 버린다.
 *
 * **부르는 쪽이 관리자인지 먼저 확인해야 한다.** 이 함수는 묻지 않는다.
 */
export async function copyWorkToSelf(
  kind: "sns" | "poster",
  id: string,
  ownerUserId: string,
): Promise<{ id: string }> {
  const admin = createSupabaseAdminClient();
  const source = await readAnyWork(kind, id);
  if (!source) throw new Error("원본을 찾을 수 없습니다.");

  // 1) 행을 먼저 만든다 — 새 작업 id 가 있어야 그림 자리를 정한다.
  const created = kind === "sns"
    ? await insertSnsCopy(admin, source, ownerUserId)
    : await insertPosterCopy(admin, source, ownerUserId);

  // 2) 그림을 새 자리로 옮긴다. 원본은 읽기만 한다.
  //    `copiedAssetPath` 가 null 이면 규약을 벗어난 옛 경로다 — 옮기지 않고
  //    그 칸을 비운다. 조용히 엉뚱한 자리에 쓰는 것보다 낫다.
  const moved = await moveAssets(admin, source, ownerUserId, created.id, kind);

  // 3) 바뀐 경로를 적는다.
  await writeCopiedPaths(admin, kind, created.id, moved);
  return { id: created.id };
}
```

**두 갈래가 다른 점은 경로가 어디 적혀 있느냐뿐이다.**

| 도구 | 그림 경로가 있는 곳 | 옮긴 뒤 쓰는 곳 |
|---|---|---|
| 카드뉴스 | `data.cards[].assetPath` · `.thumbPath` | 같은 `data` 를 고쳐 `sns_projects.data` 로 `update` |
| 포스터 | `poster_images` 행의 `asset_path` · `thumb_path` | 복사한 `poster_images` 행들을 `insert` |

`moveAssets` 는 두 갈래에서 **경로 목록을 뽑는 방법만** 다르고, 내려받아
올리는 부분은 같다 — 목록을 뽑는 함수를 갈래별로 두고 나머지는 공유한다.
버킷은 둘 다 `library` 다.

`insertSnsCopy` 는 기존 생성 경로와 같은 칸을 쓴다
(`api/sns/projects/project-store.ts:62` 의 `insert` 목록에서 `candidate_id` 만 뺀다).
`insertPosterCopy` 는 `projectInsertRow(ownerUserId, ...)`
(`lib/poster/supabase-store-core.ts:110`) 를 그대로 쓴다 — 그 함수가 이미
`user_id` 를 인자로만 받는다.

- [ ] **Step 8: 돌려서 통과를 확인한다**

Run: `cd apps/web && npx vitest run app/api/admin/works/__tests__/copy-work.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: 복사 라우트를 만든다**

`apps/web/app/api/admin/works/[kind]/[id]/copy/route.ts` (신규)

```ts
import { authenticateApiMember } from "../../../../../../../lib/membership/api";
import { hasFullScope, viewerFrom } from "../../../../../../../lib/access/core";
import { copyWorkToSelf } from "../../../store";

type Context = { params: Promise<{ kind: string; id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 남의 작업을 **내 것으로 복사한다.**
 *
 * **본문을 읽지 않는다.** 소유자는 세션에서만 온다 — 읽으면 언젠가 그 값이
 * 소유자로 쓰이고, 그때 남의 이름으로 작업이 생긴다.
 *
 * 관문은 읽기와 같다. 읽을 수 있는 것만 복사할 수 있다.
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const { kind, id } = await context.params;
  if (kind !== "sns" && kind !== "poster") {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }
  if (!hasFullScope(viewerFrom(auth.member), "read")) {
    return Response.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const copied = await copyWorkToSelf(kind, id, auth.member.userId);
    return Response.json({ ok: true, id: copied.id });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "복사하지 못했습니다." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 9-1: 관문 가드에 복사 라우트를 더한다**

`apps/web/app/api/admin/works/__tests__/admin-gate.test.ts` 의 목록을 늘린다:

```ts
const ROUTES = ["route.ts", "copy/route.ts"];
```

Run: `cd apps/web && npx vitest run app/api/admin/works/__tests__/admin-gate.test.ts`
Expected: PASS (4 tests — 라우트 2개 × 검사 2개)

- [ ] **Step 10: 화면에 복사 단추를 붙인다**

Task 2 에서 만든 「보는 중」 띠 안에 넣는다:

```tsx
<Button size="sm" onClick={async () => {
  const body = await (await fetch(`/api/admin/works/${kind}/${id}/copy`, { method: "POST" })).json();
  if (body.ok) router.push(`/${kind}/${body.id}`);
}}>내 작업으로 복사</Button>
```

- [ ] **Step 11: 전체 검증**

```bash
cd apps/web && npx vitest run
cd /c/Users/PC/Desktop/coding/fixup-image-agent && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "error TS" | grep -v TS2882
cd apps/web && NEXT_DIST_DIR=.next-build npx next build
cd /c/Users/PC/Desktop/coding/fixup-image-agent && git checkout apps/web/next-env.d.ts apps/web/tsconfig.json
```

Expected: 기존 실패 1건 외 전부 PASS · 타입 오류 출력 없음 · 빌드 exit 0

- [ ] **Step 12: 커밋**

```bash
git add apps/web/app/api/admin/works apps/web/app/sns/\[id\]/project-client.tsx apps/web/app/poster/\[id\]/poster-client.tsx
git commit -m "feat(admin): 남의 작업을 내 것으로 복사해 다시 만든다"
```

---

## 구현에서 정하고 보고할 것

설계의 「열린 것」에 적힌 두 가지.

- **복사본 제목** — 원본 그대로 쓸지 「(사본)」 을 붙일지. 목록에서 원본과 구분이 안 되면 헷갈리므로 붙이는 쪽을 기본으로 하고, 구현 시 화면을 보고 정해 보고한다.
- **관리자가 남의 작업을 열었다는 기록** — 이번에는 남기지 않는다. 회원 자료를 보는 일이라 나중에 필요해질 수 있다는 것만 적어 둔다.
