# 캐릭터 「과정 보기」를 도구에서 열기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라이브러리에서 내 캐릭터의 「과정 보기」를 누르면 캐릭터 도구가 그 캐릭터의 값과 정면으로 채워진 채 열리고, 고쳐서 저장하면 원본은 그대로 둔 채 새 캐릭터가 생긴다.

**Architecture:** `/characters/[id]` 가 내 캐릭터면 `CharacterStudio` 에 `opened` 를 넘긴다. 새 훅이 입력 칸과 「고른 정면(`chosen`)」을 채우고, 원래 정면 그대로 저장됐으면 새 서버 경로가 원본의 나머지 각도를 새 캐릭터로 복사한다. 처음 만들기 함수(`handleCandidates`·`handleCreate`·`startOver`)와 `POST /api/characters` 는 한 줄도 바꾸지 않고 그대로 쓴다.

**Tech Stack:** Next.js 15 App Router · React 18 · TypeScript · vitest 4 + react-test-renderer · Supabase(운영) / 파일 저장소 `LOCAL_STORE=1`(로컬) · zod 4

**Spec:** `docs/superpowers/specs/2026-10-02-reopen-work-in-tool-design.md` (「1단계 — 캐릭터」)

## Global Constraints

- 처음 만들기 경로 0줄 변경: `CharacterStudio.tsx` 의 `handleCandidates`~`handleRedo` 사이, `app/api/characters/route.ts`, `lib/characters.ts` 의 `createCharacter`·`generateCandidates`
- 원본 캐릭터는 읽기만 한다. 다시 만들면 언제나 새 캐릭터
- 남의 캐릭터는 지금의 보기 전용 화면(`[id]/detail-client.tsx`) 그대로
- 함수 50줄·중첩 4단계 이하, 새 파일 400줄 이하. `CharacterStudio.tsx`(1245줄)와 `lib/characters.ts`(895줄)는 이미 상한을 넘었다 — 새 로직은 새 파일에 두고 거기에는 배선만 한다
- 불변: 배열·객체를 고치지 말고 새로 만든다(시험의 `calls.length = 0` 같은 기존 관례는 예외)
- 사용자에게 보이는 오류 문구는 내부 구조를 흘리지 않는다. 서버 로그는 `console.error("[경로]", error)`
- 커밋·푸시는 사용자가 요청할 때만. 작업은 워크트리 `.worktrees/double-shell`(브랜치 `fix/double-studio-shell`)에서 한다
- 시험 명령은 `apps/web` 에서 `npx vitest run <파일>`

## Review Focus

- **원본이 바뀌면 안 된다** — 연 캐릭터로 새 캐릭터를 만들고 각도를 옮겨 담은 뒤에도 원본의 각도 수·경로·파일이 그대로여야 한다 → Task 2 시험 「원본은 그대로」
- **정면을 다시 뽑고 저장하면 옮겨 담지 않는다** — 다른 인물이 되므로 원본 각도를 섞으면 안 된다 → Task 3 시험 「정면을 바꿨으면 안 옮긴다」
- **최근 100개 밖의 오래된 캐릭터도 열린다** → Task 1 시험 「id 로 찾으면 개수 제한을 걸지 않는다」
- **남의 캐릭터 id 를 섞어 옮겨 담기를 부르면 아무것도 복사되지 않고 404** → Task 2 시험 「남의 캐릭터면 못 찾는다」
- **정면 그림을 못 불러오면(서명 주소 만료·네트워크)** 설정만 채우고 정면 없이 시작하며 그 사실을 알린다 → Task 3 시험 「정면을 못 받으면 설정만 채운다」

---

### Task 1: 캐릭터 하나를 100개 제한 없이 읽는다

**Files:**
- Modify: `apps/web/lib/characters.ts` — `listCharacters`(694-764)
- Modify: `apps/web/app/api/characters/[id]/route.ts` — 머리 주석·`listCharacters` 호출
- Modify: `apps/web/app/api/admin/works/store.ts` — `readAnyCharacter`(366-373)
- Test: `apps/web/lib/__tests__/character-read-one.test.ts` (새 파일)

**Interfaces:**
- Produces: `listCharacters(userId, teamId?, options?: { allMembers?: boolean; ids?: string[] })` — `ids` 가 있으면 그 id 만, 개수 제한 없이. 빈 배열이면 질의 없이 `[]`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
// apps/web/lib/__tests__/character-read-one.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **캐릭터 하나를 열 때 최근 100개 안에서만 찾지 않는다.**
 *
 * `GET /api/characters/[id]` 와 관리자 단건 읽기가 목록(최근 100개)을 받아
 * 거기서 id 를 찾았다. 101번째보다 오래된 캐릭터는 「찾을 수 없습니다」가 됐다
 * (2026-10-02 조사). 「과정 보기」가 도구를 열려면 어떤 캐릭터든 읽혀야 한다.
 */

vi.mock("server-only", () => ({}));
vi.mock("../pdp/fal", () => ({
  createPdpImageGenerator: () => async () => ({ base64: "", mimeType: "image/png" }),
}));

const calls: Array<{ method: string; args: unknown[] }> = [];
const 옛캐릭터 = {
  id: "c-old", user_id: "u1", name: "옛 캐릭터", source_prompt: "노란 모자",
  identity_prompt: "노란 모자", kind: "person", look: "photoreal", created_at: "2026-01-01",
};

function 질의(result: { data: unknown; error: null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "in", "eq", "or"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(result);
  return builder;
}

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => 질의({ data: table === "characters" ? [옛캐릭터] : [], error: null }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
  }),
}));

const { listCharacters } = await import("../characters");
const original = { ...process.env };

beforeEach(() => {
  calls.length = 0;
  delete process.env.LOCAL_STORE;
});
afterEach(() => {
  process.env = { ...original };
});

describe("운영 저장소", () => {
  it("**id 로 찾으면 개수 제한을 걸지 않는다**", async () => {
    const found = await listCharacters("u1", null, { ids: ["c-old"] });

    expect(found.map((character) => character.id)).toEqual(["c-old"]);
    expect(calls).toContainEqual({ method: "in", args: ["id", ["c-old"]] });
    expect(calls.some((call) => call.method === "limit")).toBe(false);
  });

  it("id 를 안 주면 지금처럼 최근 100개다", async () => {
    await listCharacters("u1");
    expect(calls).toContainEqual({ method: "limit", args: [100] });
  });

  it("빈 id 목록이면 묻지 않고 비어 있다", async () => {
    expect(await listCharacters("u1", null, { ids: [] })).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("로컬 저장소", () => {
  let root = "";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "character-read-one-"));
    process.env.LOCAL_STORE = "1";
    process.env.LOCAL_STORE_ROOT = root;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("id 로 찾으면 그 캐릭터만 돌려준다", async () => {
    const { insertLocalCharacter } = await import("../characters-store");
    for (const id of ["a", "b"]) {
      await insertLocalCharacter({
        id, userId: "u1", name: id, sourcePrompt: id, identityPrompt: id,
        kind: "person", look: "photoreal", createdAt: `2026-10-0${id === "a" ? 1 : 2}`,
      });
    }

    const found = await listCharacters("u1", null, { ids: ["a"] });
    expect(found.map((character) => character.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run lib/__tests__/character-read-one.test.ts`
Expected: FAIL — 「id 로 찾으면 개수 제한을 걸지 않는다」(`in` 호출 없음·`limit` 호출 있음), 「빈 id 목록이면」, 「로컬 … 그 캐릭터만」(둘 다 돌려줌)

- [ ] **Step 3: `listCharacters` 에 `ids` 를 더한다**

`apps/web/lib/characters.ts` 의 `listCharacters` 를 아래처럼 바꾼다(바뀌는 곳만 보인다 — 각도 짝짓기·서명 이하 본문은 그대로).

```ts
export async function listCharacters(
  userId: string,
  teamId: string | null = null,
  options: { allMembers?: boolean; ids?: string[] } = {},
): Promise<CharacterSummary[]> {
  /*
   * **id 를 주면 그것만, 개수 제한 없이 찾는다.**
   *
   * 목록은 최근 100개로 자른다. 하나를 열 때 그 안에서 찾으면 오래된 캐릭터는
   * 「찾을 수 없습니다」가 된다(2026-10-02). 각도 짝짓기와 서명은 여전히 이
   * 함수 한 곳에만 둔다 — 단건용을 따로 만들지 않는 이유는 위와 같다.
   */
  const ids = options.ids;
  if (ids && !ids.length) return [];

  if (isLocalStoreEnabled()) {
    const [rows, views] = await Promise.all([
      listLocalCharacters(userId),
      listLocalCharacterViews(userId),
    ]);
    return rows
      .filter((row) => !ids || ids.includes(row.id))
      .map((row) => {
        // (기존 map 본문 그대로)
      });
  }

  const supabase = createSupabaseAdminClient();
  const ordered = supabase.from("characters").select("*").order("created_at", { ascending: false });
  const { data, error } = await scopedRead(
    ids ? ordered.in("id", ids) : ordered.limit(100),
    { userId, teamId, isAdmin: options.allMembers === true },
  );
  // (이하 기존 그대로)
```

`apps/web/app/api/characters/[id]/route.ts` — 호출과, 이제 틀린 말이 된 주석 두 문단을 고친다.

```ts
/**
 * 캐릭터 한 장.
 *
 * **새 질의를 쓰지 않는다.** `listCharacters` 가 팀 범위·각도 짝짓기·서명
 * 주소까지 이미 다 해 준다. 단건용 질의를 따로 만들면 그 규칙이 두 군데로
 * 갈리고 언젠가 한쪽만 고쳐진다 — 이 저장소가 반복해서 당한 방식이다.
 *
 * **id 를 넘겨 그것만 찾는다.** 목록은 최근 100개로 잘려, 그 안에서 찾으면
 * 오래된 캐릭터가 404 가 됐다(2026-10-02).
 *
 * 남의 것이면 목록에 없으므로 **404** 가 된다. 관리자는 별도 통로로 읽는다
 * (`api/admin/works` 와 같은 갈래).
 */
export async function GET(_request: Request, context: Context) {
  // …
    const characters = await listCharacters(
      auth.member.userId, await teamIdOf(auth.member.userId), { ids: [id] });
```

`apps/web/app/api/admin/works/store.ts` 의 `readAnyCharacter`:

```ts
  const characters = await listCharacters("", null, { allMembers: true, ids: [id] });
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run lib/__tests__/character-read-one.test.ts app/characters/__tests__`
Expected: PASS

- [ ] **Step 5: 되돌려 재 본다** — `ordered.in("id", ids)` 를 `ordered.limit(100)` 으로 잠시 바꿔 첫 시험이 실패하는지 보고 되돌린다

---

### Task 2: 원본의 나머지 각도를 새 캐릭터로 옮겨 담는 서버 경로

**Files:**
- Create: `apps/web/lib/character-carry.ts`
- Create: `apps/web/app/api/characters/[id]/carry/route.ts`
- Test: `apps/web/lib/__tests__/character-carry.test.ts`
- Test: `apps/web/app/api/characters/__tests__/carry-route.test.ts`

**Interfaces:**
- Produces: `carryCharacterViews({ userId, fromId, toId }): Promise<string[]>` — 옮겨 담은 각도 이름. 둘 중 하나라도 요청한 사람 것이 아니거나 둘이 같으면 `CharacterCarryNotFound` 를 던진다
- Produces: `POST /api/characters/{toId}/carry` 본문 `{ fromId: string }` → `200 { ok: true, carried: string[] }` · `400` 본문 오류 · `404 { ok: false, message: "캐릭터를 찾을 수 없습니다." }` · `500 { ok: false, message: "각도를 옮겨 담지 못했습니다." }`
- Produces: `anglesToCarry(fromAngles, toAngles)`, `carriedPath(originalPath, toId, ownerPrefix)` (순수 함수, 시험용으로 내보냄)

- [ ] **Step 1: 실패하는 시험을 쓴다 (lib)**

```ts
// apps/web/lib/__tests__/character-carry.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **새 캐릭터에 원본의 나머지 각도를 옮겨 담는다.**
 *
 * 「과정 보기」로 연 캐릭터에서 정면을 그대로 두고 각도 한 장만 다시 만들면,
 * 사용자 결정(2026-10-02)대로 **새 캐릭터**가 생긴다. 그 새 캐릭터에 다시 만든
 * 한 장만 있으면 나머지 각도가 빈다. 그래서 없는 각도만 원본에서 채운다.
 * 원본은 읽기만 한다.
 */

vi.mock("server-only", () => ({}));

const original = { ...process.env };
let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "character-carry-"));
  process.env.LOCAL_STORE = "1";
  process.env.LOCAL_STORE_ROOT = root;
});
afterEach(() => {
  process.env = { ...original };
  rmSync(root, { recursive: true, force: true });
});

async function 캐릭터(id: string, userId: string, angles: string[]) {
  const store = await import("../characters-store");
  await store.insertLocalCharacter({
    id, userId, name: id, sourcePrompt: id, identityPrompt: id,
    kind: "person", look: "photoreal", createdAt: "2026-10-02",
  });
  for (const angle of angles) {
    const path = `${id}/${angle}.png`;
    await store.writeLocalCharacterFile(path, Buffer.from(`${id}:${angle}`));
    await store.upsertLocalCharacterView({ characterId: id, userId, angle, path, mimeType: "image/png" });
  }
}

async function 각도들(userId: string, id: string) {
  const { listLocalCharacterViews } = await import("../characters-store");
  return (await listLocalCharacterViews(userId))
    .filter((view) => view.characterId === id)
    .map((view) => ({ angle: view.angle, path: view.path }))
    .sort((a, b) => a.angle.localeCompare(b.angle));
}

describe("순수 규칙", () => {
  it("원본에 있고 새 캐릭터에 없는 각도만, 정면은 빼고", async () => {
    const { anglesToCarry } = await import("../character-carry");
    expect(anglesToCarry(["front", "left_45", "back", "sheet"], ["front", "left_45"]))
      .toEqual(["back", "sheet"]);
  });

  it("경로의 끝 이름을 새 캐릭터 자리로 옮긴다 — 사본(.thumb.webp)도", async () => {
    const { carriedPath } = await import("../character-carry");
    expect(carriedPath("u1/A/back.png", "B", "u1")).toBe("u1/B/back.png");
    expect(carriedPath("u1/A/back.thumb.webp", "B", "u1")).toBe("u1/B/back.thumb.webp");
    expect(carriedPath("A/back.png", "B", null)).toBe("B/back.png");
    expect(carriedPath("u1/A/..", "B", "u1")).toBeNull();
  });
});

describe("옮겨 담기", () => {
  it("새 캐릭터에 없는 각도만 채우고, 파일도 새 자리에 복사한다", async () => {
    await 캐릭터("A", "u1", ["front", "left_45", "back"]);
    await 캐릭터("B", "u1", ["front", "left_45"]);
    const { carryCharacterViews } = await import("../character-carry");

    expect(await carryCharacterViews({ userId: "u1", fromId: "A", toId: "B" })).toEqual(["back"]);
    expect(await 각도들("u1", "B")).toEqual([
      { angle: "back", path: "B/back.png" },
      { angle: "front", path: "B/front.png" },
      { angle: "left_45", path: "B/left_45.png" },
    ]);
    const { readLocalCharacterFile } = await import("../characters-store");
    expect((await readLocalCharacterFile("B/back.png")).toString()).toBe("A:back");
    // 새 캐릭터가 다시 만든 각도는 덮어쓰지 않는다
    expect((await readLocalCharacterFile("B/left_45.png")).toString()).toBe("B:left_45");
  });

  it("**원본은 그대로다**", async () => {
    await 캐릭터("A", "u1", ["front", "left_45", "back"]);
    await 캐릭터("B", "u1", ["front"]);
    const before = await 각도들("u1", "A");
    const { carryCharacterViews } = await import("../character-carry");

    await carryCharacterViews({ userId: "u1", fromId: "A", toId: "B" });

    expect(await 각도들("u1", "A")).toEqual(before);
    const { readLocalCharacterFile } = await import("../characters-store");
    expect((await readLocalCharacterFile("A/back.png")).toString()).toBe("A:back");
  });

  it("두 번 불러도 더 채울 것이 없으면 아무것도 안 한다", async () => {
    await 캐릭터("A", "u1", ["front", "back"]);
    await 캐릭터("B", "u1", ["front"]);
    const { carryCharacterViews } = await import("../character-carry");

    await carryCharacterViews({ userId: "u1", fromId: "A", toId: "B" });
    expect(await carryCharacterViews({ userId: "u1", fromId: "A", toId: "B" })).toEqual([]);
  });

  it("**남의 캐릭터면 못 찾는다** — 어느 쪽이든", async () => {
    await 캐릭터("A", "u1", ["front", "back"]);
    await 캐릭터("C", "u2", ["front", "back"]);
    const { carryCharacterViews, CharacterCarryNotFound } = await import("../character-carry");

    await expect(carryCharacterViews({ userId: "u1", fromId: "C", toId: "A" }))
      .rejects.toBeInstanceOf(CharacterCarryNotFound);
    await expect(carryCharacterViews({ userId: "u1", fromId: "A", toId: "C" }))
      .rejects.toBeInstanceOf(CharacterCarryNotFound);
    expect(await 각도들("u2", "C")).toEqual([
      { angle: "back", path: "C/back.png" },
      { angle: "front", path: "C/front.png" },
    ]);
  });

  it("자기 자신으로는 옮겨 담지 않는다", async () => {
    await 캐릭터("A", "u1", ["front"]);
    const { carryCharacterViews, CharacterCarryNotFound } = await import("../character-carry");
    await expect(carryCharacterViews({ userId: "u1", fromId: "A", toId: "A" }))
      .rejects.toBeInstanceOf(CharacterCarryNotFound);
  });
});
```

- [ ] **Step 2: 실패하는 시험을 쓴다 (경로)**

```ts
// apps/web/app/api/characters/__tests__/carry-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/** 옮겨 담기 경로가 본문을 거르고, 못 찾음을 404 로 바꾸는가. */

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
}));
const carry = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../../../../lib/character-carry", () => {
  class CharacterCarryNotFound extends Error {}
  return { CharacterCarryNotFound, carryCharacterViews: carry.fn };
});

const { POST } = await import("../[id]/carry/route");
const { CharacterCarryNotFound } = await import("../../../../lib/character-carry");

function 요청(body: unknown) {
  return new Request("http://localhost/api/characters/B/carry", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
}
const 자리 = { params: Promise.resolve({ id: "B" }) };

beforeEach(() => carry.fn.mockReset());

describe("POST /api/characters/[id]/carry", () => {
  it("세션 사용자·주소의 id·본문의 fromId 로 부르고 옮긴 각도를 돌려준다", async () => {
    carry.fn.mockResolvedValue(["back"]);
    const response = await POST(요청({ fromId: "A" }), 자리);
    expect(carry.fn).toHaveBeenCalledWith({ userId: "u1", fromId: "A", toId: "B" });
    expect(await response.json()).toEqual({ ok: true, carried: ["back"] });
  });

  it("본문에 fromId 가 없으면 400 이고 부르지 않는다", async () => {
    const response = await POST(요청({}), 자리);
    expect(response.status).toBe(400);
    expect(carry.fn).not.toHaveBeenCalled();
  });

  it("못 찾으면 404", async () => {
    carry.fn.mockRejectedValue(new CharacterCarryNotFound());
    const response = await POST(요청({ fromId: "C" }), 자리);
    expect(response.status).toBe(404);
  });

  it("그 밖의 오류는 500 이고 내부 문구를 흘리지 않는다", async () => {
    carry.fn.mockRejectedValue(new Error("relation character_views does not exist"));
    const response = await POST(요청({ fromId: "A" }), 자리);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("relation");
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run lib/__tests__/character-carry.test.ts app/api/characters/__tests__/carry-route.test.ts`
Expected: FAIL — 모듈 `../character-carry`·`../[id]/carry/route` 를 찾을 수 없음

- [ ] **Step 4: `lib/character-carry.ts` 를 쓴다**

```ts
// apps/web/lib/character-carry.ts
import "server-only";

import { createSupabaseAdminClient } from "./supabase/admin";
import { isLocalStoreEnabled } from "./local-store";
import {
  findLocalCharacter,
  listLocalCharacterViews,
  readLocalCharacterFile,
  upsertLocalCharacterView,
  writeLocalCharacterFile,
} from "./characters-store";

/**
 * **새 캐릭터에 원본의 나머지 각도를 옮겨 담는다.**
 *
 * 「과정 보기」로 연 캐릭터에서 정면을 그대로 두고 저장하면 새 캐릭터가 생긴다
 * (2026-10-02 사용자 결정: 원본은 그대로, 언제나 새 캐릭터). 그때 고르지 않은
 * 각도가 새 캐릭터에 비지 않게 원본에서 채운다.
 *
 * - **두 캐릭터가 모두 요청한 사람 것일 때만.** 팀 범위도 넓히지 않는다
 * - **새 캐릭터에 없는 각도만.** 다시 만든 각도는 덮어쓰지 않는다
 * - **원본은 읽기만 한다.** 파일은 새 자리로 복사한다 — 원본 경로를 가리키면
 *   원본을 지울 때 새 캐릭터 그림도 사라진다(9월 16일 설계의 복사 규칙과 같다)
 *
 * 그림을 새로 그리지 않으므로 크레딧이 들지 않는다.
 */

const BUCKET = "characters";

export class CharacterCarryNotFound extends Error {
  constructor() {
    super("캐릭터를 찾을 수 없습니다.");
  }
}

export interface CarryInput {
  userId: string;
  fromId: string;
  toId: string;
}

/** 옮겨 담을 각도 — 원본에 있고 새 캐릭터에 없는 것. 정면은 새 캐릭터에 늘 있다. */
export function anglesToCarry(fromAngles: string[], toAngles: string[]): string[] {
  const have = new Set(toAngles);
  return fromAngles.filter((angle) => angle !== "front" && !have.has(angle));
}

/**
 * 원본 경로의 끝 이름(`{각도}.{확장자}`)을 새 캐릭터 자리로 옮긴다.
 *
 * 운영은 첫 칸이 소유자다(버킷 정책이 그 칸으로 판정한다). 로컬은 그 칸이 없다.
 */
export function carriedPath(originalPath: string, toId: string, ownerPrefix: string | null): string | null {
  const tail = originalPath.split("/").at(-1);
  if (!tail || tail === "." || tail === "..") return null;
  return ownerPrefix ? `${ownerPrefix}/${toId}/${tail}` : `${toId}/${tail}`;
}

/** 순서대로 하나씩 — 로컬 저장소는 한 파일을 읽고 고쳐 쓰므로 동시에 쓰면 앞의 것이 사라진다. */
async function inOrder<T, R>(items: T[], run: (item: T) => Promise<R | null>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(async (previous, item) => {
    const done = await previous;
    const result = await run(item);
    return result === null ? done : [...done, result];
  }, Promise.resolve([]));
}

export async function carryCharacterViews(input: CarryInput): Promise<string[]> {
  if (input.fromId === input.toId) throw new CharacterCarryNotFound();
  return isLocalStoreEnabled() ? carryLocal(input) : carryRemote(input);
}

async function carryLocal({ userId, fromId, toId }: CarryInput): Promise<string[]> {
  const [from, to] = await Promise.all([
    findLocalCharacter(userId, fromId),
    findLocalCharacter(userId, toId),
  ]);
  if (!from || !to) throw new CharacterCarryNotFound();

  const views = await listLocalCharacterViews(userId);
  const fromViews = views.filter((view) => view.characterId === fromId);
  const toAngles = views.filter((view) => view.characterId === toId).map((view) => view.angle);
  const angles = anglesToCarry(fromViews.map((view) => view.angle), toAngles);

  return inOrder(fromViews.filter((view) => angles.includes(view.angle)), async (view) => {
    const path = carriedPath(view.path, toId, null);
    if (!path) return null;
    await writeLocalCharacterFile(path, await readLocalCharacterFile(view.path));
    await upsertLocalCharacterView({ characterId: toId, userId, angle: view.angle, path, mimeType: view.mimeType });
    return view.angle;
  });
}

interface RemoteView {
  character_id: string;
  angle: string;
  path: string;
  thumb_path: string | null;
  mime_type: string | null;
}

function contentTypeOf(path: string, fallback: string | null): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return fallback ?? "image/png";
}

type Storage = ReturnType<ReturnType<typeof createSupabaseAdminClient>["storage"]["from"]>;

/**
 * 한 장을 복사한다. **`contentType` 을 반드시 준다** — 안 주면 Buffer 본문에
 * `text/plain` 이 붙는다(`api/admin/works/store.ts` 의 `moveAssets` 와 같은 이유).
 */
async function copyFile(storage: Storage, from: string, to: string, contentType: string): Promise<boolean> {
  const file = await storage.download(from);
  if (file.error || !file.data) {
    console.error(`[character-carry] 원본을 못 읽었습니다(${from}): ${file.error?.message ?? "알 수 없음"}`);
    return false;
  }
  const uploaded = await storage.upload(to, Buffer.from(await file.data.arrayBuffer()), { contentType, upsert: true });
  if (uploaded.error) {
    console.error(`[character-carry] 새 자리에 못 올렸습니다(${to}): ${uploaded.error.message}`);
    return false;
  }
  return true;
}

async function carryRemote({ userId, fromId, toId }: CarryInput): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data: owned, error } = await admin.from("characters")
    .select("id").eq("user_id", userId).in("id", [fromId, toId]);
  if (error) throw new Error(error.message);
  if ((owned ?? []).length !== 2) throw new CharacterCarryNotFound();

  const { data, error: viewError } = await admin.from("character_views")
    .select("character_id,angle,path,thumb_path,mime_type").in("character_id", [fromId, toId]);
  if (viewError) throw new Error(viewError.message);
  const views = (data ?? []) as RemoteView[];
  const fromViews = views.filter((view) => view.character_id === fromId);
  const toAngles = views.filter((view) => view.character_id === toId).map((view) => view.angle);
  const angles = anglesToCarry(fromViews.map((view) => view.angle), toAngles);
  const storage = admin.storage.from(BUCKET);

  return inOrder(fromViews.filter((view) => angles.includes(view.angle)), async (view) => {
    const path = carriedPath(view.path, toId, userId);
    if (!path || !(await copyFile(storage, view.path, path, contentTypeOf(view.path, view.mime_type)))) return null;
    const thumb = view.thumb_path ? carriedPath(view.thumb_path, toId, userId) : null;
    const thumbPath = thumb && view.thumb_path
      && (await copyFile(storage, view.thumb_path, thumb, contentTypeOf(thumb, null))) ? thumb : null;
    const { error: upsertError } = await admin.from("character_views").upsert(
      { character_id: toId, user_id: userId, angle: view.angle, path, thumb_path: thumbPath, mime_type: view.mime_type },
      { onConflict: "character_id,angle" },
    );
    if (upsertError) throw new Error(upsertError.message);
    return view.angle;
  });
}
```

- [ ] **Step 5: 경로를 쓴다**

```ts
// apps/web/app/api/characters/[id]/carry/route.ts
import { z } from "zod";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { CharacterCarryNotFound, carryCharacterViews } from "../../../../../lib/character-carry";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ fromId: z.string().min(1).max(100) });

/**
 * 「과정 보기」로 연 캐릭터에서 새로 만든 캐릭터(주소의 id)에 원본(`fromId`)의
 * 나머지 각도를 옮겨 담는다. 규칙은 `lib/character-carry.ts`.
 *
 * 그림을 그리지 않으므로 크레딧 예약이 없다.
 */
export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, message: "요청을 확인해 주세요." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const carried = await carryCharacterViews({
      userId: auth.member.userId, fromId: parsed.data.fromId, toId: id,
    });
    return Response.json({ ok: true, carried });
  } catch (error) {
    if (error instanceof CharacterCarryNotFound) {
      return Response.json({ ok: false, message: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[characters/:id/carry]", error);
    return Response.json({ ok: false, message: "각도를 옮겨 담지 못했습니다." }, { status: 500 });
  }
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run lib/__tests__/character-carry.test.ts app/api/characters/__tests__/carry-route.test.ts app/api/__tests__`
Expected: PASS (`app/api/__tests__` 의 경로 계약 시험도 그대로 초록)

- [ ] **Step 7: 되돌려 재 본다** — `anglesToCarry` 에서 `!have.has(angle)` 를 빼 「다시 만든 각도는 덮어쓰지 않는다」가 실패하는지, `carryLocal` 의 `if (!from || !to)` 를 `if (!to)` 로 바꿔 「남의 캐릭터면」이 실패하는지 보고 되돌린다

---

### Task 3: 도구를 그 캐릭터로 연다

**Files:**
- Create: `apps/web/app/characters/opened-character.ts`
- Create: `apps/web/app/characters/use-opened-character.ts`
- Create: `apps/web/app/characters/opened-notice.tsx`
- Create: `apps/web/app/characters/[id]/open-client.tsx`
- Modify: `apps/web/app/characters/[id]/page.tsx`
- Modify: `apps/web/app/characters/CharacterStudio.tsx` — import 3줄, 함수 머리 1줄, 254줄 다음에 배선 블록, 503줄 앞에 안내 1줄
- Test: `apps/web/app/characters/__tests__/opened-character.test.ts`
- Test: `apps/web/app/characters/__tests__/use-opened-character.test.tsx`
- Test: `apps/web/app/characters/__tests__/open-in-studio-wiring.test.ts`

**Interfaces:**
- Consumes: `GET /api/characters/{id}` → `{ ok, character: { id, name, sourcePrompt, kind, look, views: {angle,url}[], mine } }`(Task 1), `POST /api/characters/{id}/carry`(Task 2)
- Produces: `OpenedCharacter`, `OpenedValues`, `OpenedFront`, `openedValues`, `frontViewUrl`, `madeFromOpenedFront`, `blobToFront`, `carryRequest`, `carriedNote`(opened-character.ts) · `useOpenedCharacter(input): { front: "idle" | "loading" | "loaded" | "missing" }` · `<OpenedNotice name front />` · `<CharacterOpenClient characterId />` · `CharacterStudio({ opened?: OpenedCharacter })`

- [ ] **Step 1: 실패하는 시험을 쓴다 (순수 규칙)**

```ts
// apps/web/app/characters/__tests__/opened-character.test.ts
import { describe, expect, it } from "vitest";
import {
  blobToFront, carriedNote, frontViewUrl, madeFromOpenedFront, openedValues, type OpenedCharacter,
} from "../opened-character";

const KINDS = [{ id: "person" }, { id: "animal" }, { id: "character" }, { id: "object" }];
const LOOKS = ["auto", "photoreal", "anime", "3d", "illustration"] as const;
const 호롱이: OpenedCharacter = {
  id: "c1", name: "호롱이 2", sourcePrompt: "여러 각도의 캐릭터 이미지", kind: "character", look: "3d",
  views: [{ angle: "front", url: "https://x/front.png" }, { angle: "back", url: "https://x/back.png" }],
};

describe("연 캐릭터로 칸을 채운다", () => {
  it("저장된 이름·설명·종류·그림체를 그대로", () => {
    expect(openedValues(호롱이, KINDS, LOOKS)).toEqual({
      name: "호롱이 2", description: "여러 각도의 캐릭터 이미지", kind: "character", look: "3d",
    });
  });

  it("모르는 종류·그림체는 첫 종류·실사로 — 옛 줄이 칸을 깨지 않게", () => {
    expect(openedValues({ ...호롱이, kind: "robot", look: "pixel" }, KINDS, LOOKS))
      .toMatchObject({ kind: "person", look: "photoreal" });
  });

  it("정면 주소를 찾는다. 없으면 null", () => {
    expect(frontViewUrl(호롱이)).toBe("https://x/front.png");
    expect(frontViewUrl({ ...호롱이, views: [] })).toBeNull();
  });

  it("마지막으로 고른 정면이 연 캐릭터의 정면일 때만 옮겨 담는다", () => {
    expect(madeFromOpenedFront("AAA", "AAA")).toBe(true);
    expect(madeFromOpenedFront("BBB", "AAA")).toBe(false);
    expect(madeFromOpenedFront(null, "AAA")).toBe(false);
    expect(madeFromOpenedFront("AAA", null)).toBe(false);
  });

  it("그림 본문을 base64 로 읽는다", async () => {
    const front = await blobToFront(new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }));
    expect(front).toEqual({ base64: "AQID", mimeType: "image/webp" });
  });

  it("옮겨 담은 장수를 알린다. 없으면 말하지 않는다", () => {
    expect(carriedNote(2)).toBe("원래 캐릭터에서 고르지 않은 각도 2장을 옮겨 담았습니다.");
    expect(carriedNote(0)).toBe("");
  });
});
```

- [ ] **Step 2: 실패하는 시험을 쓴다 (훅)**

```tsx
// apps/web/app/characters/__tests__/use-opened-character.test.tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenedCharacter } from "../use-opened-character";
import type { OpenedCharacter, OpenedFront, OpenedValues } from "../opened-character";

const KINDS = [{ id: "person" }, { id: "character" }];
const LOOKS = ["photoreal", "3d"] as const;
const 호롱이: OpenedCharacter = {
  id: "orig", name: "호롱이", sourcePrompt: "주황 호랑이", kind: "character", look: "3d",
  views: [{ angle: "front", url: "https://x/front.png" }],
};

const prefill = vi.fn<(values: OpenedValues, front: OpenedFront | null) => void>();
const onCarried = vi.fn<(id: string) => Promise<void>>(async () => {});
const announce = vi.fn<(text: string) => void>();
const fetchMock = vi.fn();
let state: ReturnType<typeof useOpenedCharacter>;
let view: ReactTestRenderer;

function Probe(props: { chosenBase64: string | null; createdId: string | null }) {
  state = useOpenedCharacter({
    opened: 호롱이, kinds: KINDS, looks: LOOKS, prefill, onCarried, announce, ...props,
  });
  return null;
}

async function 연다(front: Response | Error) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "https://x/front.png") {
      if (front instanceof Error) throw front;
      return front;
    }
    return new Response(JSON.stringify({ ok: true, carried: ["back"] }));
  });
  await act(async () => { view = create(<Probe chosenBase64={null} createdId={null} />); });
}

async function 다시(props: { chosenBase64: string | null; createdId: string | null }) {
  await act(async () => { view.update(<Probe {...props} />); });
}

const carryCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/carry"));

beforeEach(() => {
  prefill.mockReset(); onCarried.mockClear(); announce.mockReset(); fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { act(() => view.unmount()); vi.unstubAllGlobals(); });

describe("연 캐릭터로 도구를 채운다", () => {
  it("값과 정면을 채운다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    expect(prefill).toHaveBeenCalledWith(
      { name: "호롱이", description: "주황 호랑이", kind: "character", look: "3d" },
      { base64: "AQID", mimeType: "image/png" },
    );
    expect(state.front).toBe("loaded");
  });

  it("**정면을 못 받으면 설정만 채운다**", async () => {
    await 연다(new Error("expired"));
    expect(prefill).toHaveBeenCalledWith(expect.objectContaining({ name: "호롱이" }), null);
    expect(state.front).toBe("missing");
  });
});

describe("옮겨 담기", () => {
  it("원래 정면으로 만든 새 캐릭터에 한 번만 옮겨 담는다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 다시({ chosenBase64: "AQID", createdId: null });
    await 다시({ chosenBase64: null, createdId: "new1" });
    await 다시({ chosenBase64: null, createdId: "new1" });

    expect(carryCalls()).toHaveLength(1);
    expect(carryCalls()[0]![0]).toBe("/api/characters/new1/carry");
    expect(JSON.parse(String(carryCalls()[0]![1].body))).toEqual({ fromId: "orig" });
    expect(onCarried).toHaveBeenCalledWith("new1");
    expect(announce).toHaveBeenCalledWith("원래 캐릭터에서 고르지 않은 각도 1장을 옮겨 담았습니다.");
  });

  it("**정면을 바꿨으면 안 옮긴다** — 다른 인물이다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 다시({ chosenBase64: "AQID", createdId: null });
    await 다시({ chosenBase64: "ZZZZ", createdId: null });
    await 다시({ chosenBase64: null, createdId: "new2" });
    expect(carryCalls()).toHaveLength(0);
  });

  it("원본 자신은 옮겨 담기 대상이 아니다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 다시({ chosenBase64: "AQID", createdId: "orig" });
    expect(carryCalls()).toHaveLength(0);
  });

  it("옮겨 담기가 실패하면 그렇다고 알린다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ ok: false, message: "각도를 옮겨 담지 못했습니다." }), { status: 500 }));
    await 다시({ chosenBase64: "AQID", createdId: null });
    await 다시({ chosenBase64: null, createdId: "new3" });
    expect(announce).toHaveBeenCalledWith("각도를 옮겨 담지 못했습니다.");
    expect(onCarried).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 실패하는 시험을 쓴다 (배선)**

```ts
// apps/web/app/characters/__tests__/open-in-studio-wiring.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **내 캐릭터는 도구로, 남의 캐릭터는 보기 전용으로.**
 *
 * jsdom 이 없어 페이지 렌더로는 못 잰다. 찾지 말고 **센다** — 여는 태그와
 * 인자를 한 덩어리로 묶는다(2026-09-16 설계의 가드).
 */
const 읽기 = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");
const 횟수 = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length;

describe("과정 보기가 도구를 연다", () => {
  const page = 읽기("[id]", "page.tsx");
  const open = 읽기("[id]", "open-client.tsx");
  const studio = 읽기("CharacterStudio.tsx");

  it("페이지는 여는 갈림길만 그린다", () => {
    expect(횟수(page, /<CharacterOpenClient characterId=\{id\} \/>/g)).toBe(1);
    expect(page).not.toContain("<CharacterDetailClient");
  });

  it("내 것이면 도구, 아니면 보기 전용", () => {
    expect(횟수(open, /<CharacterStudio opened=\{state\.character\} \/>/g)).toBe(1);
    expect(횟수(open, /<CharacterDetailClient characterId=\{characterId\} \/>/g)).toBe(1);
    expect(open).toContain("body.character?.mine === true");
  });

  it("도구가 연 캐릭터를 받아 채우고 알린다", () => {
    expect(studio).toContain("export function CharacterStudio({ opened }: { opened?: OpenedCharacter } = {})");
    expect(횟수(studio, /useOpenedCharacter\(\{/g)).toBe(1);
    expect(횟수(studio, /<OpenedNotice name=\{opened\.name\} front=\{opening\.front\} \/>/g)).toBe(1);
  });
});
```

- [ ] **Step 4: 실패를 확인한다**

Run: `npx vitest run app/characters/__tests__/opened-character.test.ts app/characters/__tests__/use-opened-character.test.tsx app/characters/__tests__/open-in-studio-wiring.test.ts`
Expected: FAIL — 모듈 없음, 배선 횟수 0

- [ ] **Step 5: `opened-character.ts` 를 쓴다**

```ts
// apps/web/app/characters/opened-character.ts
/**
 * 라이브러리 「과정 보기」로 연 캐릭터 — 도구 칸을 무엇으로 채울지.
 *
 * 저장된 것: 이름·설명·종류·그림체·각도 그림. **저장 안 된 것**: 처음에 붙인
 * 참고 그림과 역할, 고른 모델(비율은 늘 3:4). 그래서 그 둘은 비운 채 연다
 * (2026-10-02 조사).
 */

export interface OpenedCharacter {
  id: string;
  name: string;
  sourcePrompt: string;
  kind: string;
  look: string;
  views: ReadonlyArray<{ angle: string; url: string | null }>;
}

export interface OpenedValues {
  name: string;
  description: string;
  kind: string;
  look: string;
}

export interface OpenedFront {
  base64: string;
  mimeType: string;
}

/** 칸에 넣을 값. 모르는 종류·그림체(옛 줄)는 첫 종류·실사로 내린다. */
export function openedValues(
  opened: OpenedCharacter,
  kinds: ReadonlyArray<{ id: string }>,
  looks: readonly string[],
): OpenedValues {
  return {
    name: opened.name,
    description: opened.sourcePrompt,
    kind: kinds.some((entry) => entry.id === opened.kind) ? opened.kind : kinds[0]?.id ?? "person",
    look: looks.includes(opened.look) ? opened.look : "photoreal",
  };
}

export function frontViewUrl(opened: OpenedCharacter): string | null {
  return opened.views.find((view) => view.angle === "front")?.url ?? null;
}

/**
 * 새 캐릭터가 **연 캐릭터의 정면 그대로** 만들어졌는가. 그때만 옮겨 담는다.
 * 「다시 뽑기」로 정면이 바뀌었으면 다른 인물이다.
 */
export function madeFromOpenedFront(lastChosen: string | null, openedFront: string | null): boolean {
  return Boolean(lastChosen && openedFront && lastChosen === openedFront);
}

/** 그림 본문을 base64 로. 서버는 정면 본문을 그대로 받는다(`chosenBase64`). */
export async function blobToFront(blob: Blob): Promise<OpenedFront> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return { base64: btoa(binary), mimeType: blob.type || "image/png" };
}

export function carryRequest(fromId: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fromId }),
  };
}

export function carriedNote(count: number): string {
  return count ? `원래 캐릭터에서 고르지 않은 각도 ${count}장을 옮겨 담았습니다.` : "";
}
```

- [ ] **Step 6: `use-opened-character.ts` 를 쓴다**

```ts
// apps/web/app/characters/use-opened-character.ts
"use client";

import { useEffect, useRef, useState } from "react";
import {
  blobToFront, carriedNote, carryRequest, frontViewUrl, madeFromOpenedFront, openedValues,
  type OpenedCharacter, type OpenedFront, type OpenedValues,
} from "./opened-character";

export type OpenedFrontState = "idle" | "loading" | "loaded" | "missing";

interface Input {
  opened: OpenedCharacter | undefined;
  kinds: ReadonlyArray<{ id: string }>;
  looks: readonly string[];
  /** 칸과 고른 정면을 채운다. **한 번만** 부른다. 바뀌지 않는 함수를 넘긴다. */
  prefill: (values: OpenedValues, front: OpenedFront | null) => void;
  chosenBase64: string | null;
  createdId: string | null;
  /** 옮겨 담은 뒤 목록과 결과를 새로 받는다. 바뀌지 않는 함수를 넘긴다. */
  onCarried: (createdId: string) => Promise<void>;
  /** 결과 자리에 한 줄 덧붙인다. */
  announce: (text: string) => void;
}

/**
 * 「과정 보기」로 연 캐릭터를 도구에 채우고, 원래 정면 그대로 저장된 새
 * 캐릭터에 원본의 나머지 각도를 옮겨 담는다.
 *
 * **처음 만들기 함수는 건드리지 않는다**(사용자 지시 2026-09-29). 저장은 기존
 * `handleCreate` 가 하고, 여기서는 그 결과(`createdId`)를 보고 뒤따른다.
 */
export function useOpenedCharacter(input: Input): { front: OpenedFrontState } {
  const { opened, kinds, looks, prefill, chosenBase64, createdId, onCarried, announce } = input;
  const [front, setFront] = useState<OpenedFrontState>(opened ? "loading" : "idle");
  const openedFront = useRef<string | null>(null);
  const lastChosen = useRef<string | null>(null);
  const handled = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!opened) return;
    let alive = true;
    void (async () => {
      const loaded = await loadFront(frontViewUrl(opened));
      if (!alive) return;
      openedFront.current = loaded?.base64 ?? null;
      prefill(openedValues(opened, kinds, looks), loaded);
      setFront(loaded ? "loaded" : "missing");
    })();
    return () => { alive = false; };
  }, [opened, kinds, looks, prefill]);

  // 저장 직후 `chosen` 은 비워진다. 그 전에 마지막으로 고른 정면을 기억한다.
  useEffect(() => {
    if (chosenBase64) lastChosen.current = chosenBase64;
  }, [chosenBase64]);

  useEffect(() => {
    if (!opened || !createdId || createdId === opened.id || handled.current.has(createdId)) return;
    handled.current = new Set([...handled.current, createdId]);
    if (!madeFromOpenedFront(lastChosen.current, openedFront.current)) return;
    void carry(opened.id, createdId, onCarried, announce);
  }, [opened, createdId, onCarried, announce]);

  return { front };
}

async function loadFront(url: string | null): Promise<OpenedFront | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    return response.ok ? await blobToFront(await response.blob()) : null;
  } catch {
    return null;
  }
}

async function carry(
  fromId: string,
  createdId: string,
  onCarried: (createdId: string) => Promise<void>,
  announce: (text: string) => void,
) {
  try {
    const response = await fetch(`/api/characters/${encodeURIComponent(createdId)}/carry`, carryRequest(fromId));
    const body = await response.json().catch(() => null) as { ok?: boolean; carried?: string[]; message?: string } | null;
    if (!body?.ok) throw new Error(body?.message ?? "원래 캐릭터의 각도를 옮겨 담지 못했습니다.");
    await onCarried(createdId);
    const note = carriedNote(body.carried?.length ?? 0);
    if (note) announce(note);
  } catch (error) {
    announce(error instanceof Error ? error.message : "원래 캐릭터의 각도를 옮겨 담지 못했습니다.");
  }
}
```

- [ ] **Step 7: `opened-notice.tsx` 를 쓴다**

```tsx
// apps/web/app/characters/opened-notice.tsx
import type { OpenedFrontState } from "./use-opened-character";

/**
 * 연 캐릭터의 값을 가져왔다는 안내. 다양하게(`poster/new-client.tsx:547-550`)의
 * 「값을 가져왔습니다」와 같은 자리·같은 말투다.
 */
export function OpenedNotice({ name, front }: { name: string; front: OpenedFrontState }) {
  return (
    <div role="status" className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
      <b>「{name || "이름 없는 캐릭터"}」</b> 의 값을 가져왔습니다. 고쳐서 만들면
      <b> 새 캐릭터</b>가 하나 더 생기고 원래 캐릭터는 그대로 남습니다. 정면을 그대로 두고
      각도를 고르면, 고르지 않은 각도는 원래 캐릭터에서 옮겨 담습니다.
      <span className="mt-1 block text-xs text-muted-foreground">
        처음에 붙였던 참고 그림과 고른 모델은 저장되지 않아 비어 있습니다.
        {front === "missing"
          ? " 정면 그림을 불러오지 못해 설정만 채웠습니다. 「정면 만들기」로 다시 시작하세요."
          : " 필요하면 「설정 고치기」에서 다시 고르세요."}
      </span>
    </div>
  );
}
```

- [ ] **Step 8: 스튜디오에 배선한다** (`CharacterStudio.tsx` — 이 넷 말고는 손대지 않는다)

1) import 3줄을 `import { lookAfterRole, roleAfterLook } from "./look-role";` 다음에:

```ts
import { useOpenedCharacter } from "./use-opened-character";
import { OpenedNotice } from "./opened-notice";
import type { OpenedCharacter, OpenedFront, OpenedValues } from "./opened-character";
```

2) 함수 머리:

```ts
export function CharacterStudio({ opened }: { opened?: OpenedCharacter } = {}) {
```

3) `useEffect(() => { void load(); void loadLibrary(); }, [load, loadLibrary]);` 다음 줄에:

```ts
  /*
   * 라이브러리 「과정 보기」로 열었으면 그 캐릭터로 칸과 고른 정면을 채운다.
   * 저장은 아래 `handleCreate` 그대로다 — 언제나 **새 캐릭터**가 된다.
   * 그림체 칸은 첨부가 비었을 때의 규칙(`lookAfterRole`)으로 맞추고, 고른 정면에는
   * 저장된 그림체를 그대로 얼린다 — 처음 만들 때와 같은 값으로 각도를 그린다.
   */
  const prefillOpened = useCallback((values: OpenedValues, front: OpenedFront | null) => {
    setName(values.name);
    setDescription(values.description);
    setKind(values.kind as Kind);
    setLook(lookAfterRole("extract", values.look as Look));
    if (!front) return;
    setChosen({
      ...front, description: values.description, name: values.name,
      kind: values.kind as Kind, look: values.look as Look, modelId: "",
    });
  }, []);
  const showCarried = useCallback(async (createdId: string) => {
    const refreshed = await load();
    setCreated(refreshed.find((entry) => entry.id === createdId) ?? null);
  }, [load]);
  const appendMessage = useCallback((text: string) => {
    setMessage((current) => [current, text].filter(Boolean).join(" "));
  }, []);
  const opening = useOpenedCharacter({
    opened, kinds: KINDS, looks: LOOKS, prefill: prefillOpened,
    chosenBase64: chosen?.base64 ?? null, createdId: created?.id ?? null,
    onCarried: showCarried, announce: appendMessage,
  });
```

4) `{/* 다른 도구와 같은 막대다. …` 주석 바로 앞에:

```tsx
      {opened && step === "make" ? <OpenedNotice name={opened.name} front={opening.front} /> : null}
```

- [ ] **Step 9: 여는 갈림길과 페이지를 쓴다**

```tsx
// apps/web/app/characters/[id]/open-client.tsx
"use client";

import * as React from "react";
import { CharacterStudio } from "../CharacterStudio";
import { CharacterDetailClient } from "./detail-client";
import type { OpenedCharacter } from "../opened-character";

/**
 * 라이브러리 「과정 보기」의 갈림길.
 *
 * **내 캐릭터면 도구를 그 값으로 연다** — 단계마다 보고 고쳐 새 캐릭터로 만든다
 * (2026-10-02 사용자 요구). **남의 캐릭터**(팀·관리자)는 지금의 보기 전용 화면과
 * 「내 것으로 복사」다 — 회원용 쓰기 경로를 넓히지 않는다.
 */
export function CharacterOpenClient({ characterId }: { characterId: string }) {
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "mine"; character: OpenedCharacter } | { kind: "other" }
  >({ kind: "loading" });

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}`, { cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (!alive) return;
        setState(body?.ok && body.character?.mine === true
          ? { kind: "mine", character: body.character as OpenedCharacter }
          : { kind: "other" });
      } catch {
        if (alive) setState({ kind: "other" });
      }
    })();
    return () => { alive = false; };
  }, [characterId]);

  if (state.kind === "loading") return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (state.kind === "mine") return <CharacterStudio opened={state.character} />;
  return <CharacterDetailClient characterId={characterId} />;
}
```

`apps/web/app/characters/[id]/page.tsx` — import 와 반환, 머리 주석만:

```tsx
import { requireActiveMember } from "../../../lib/membership/server";
import { CharacterOpenClient } from "./open-client";

export const dynamic = "force-dynamic";

/**
 * 캐릭터 하나를 여는 화면.
 *
 * 내 캐릭터면 캐릭터 도구가 그 값으로 열리고, 남의 것이면 보기 전용 화면이다
 * (`open-client.tsx`). 서버에서 미리 담지 않고 화면에서 가져온다 — 카드뉴스·
 * 포스터와 같은 방식이다.
 *
 * **셸은 `characters/layout.tsx` 가 씌운다.** 여기서 또 감싸면 대시보드 안에
 * 대시보드가 보인다(2026-10-02).
 */
export default async function CharacterDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  await requireActiveMember();
  const { id } = await params;
  return <CharacterOpenClient characterId={id} />;
}
```

- [ ] **Step 10: 통과를 확인한다**

Run: `npx vitest run app/characters app/__tests__/studio-page-frame.test.ts`
Expected: PASS

- [ ] **Step 11: 되돌려 재 본다** — `use-opened-character.ts` 에서 `if (!madeFromOpenedFront(...)) return;` 를 지워 「정면을 바꿨으면 안 옮긴다」가 실패하는지, `handled.current.has(createdId) ||` 를 지워 「한 번만」이 실패하는지 보고 되돌린다

---

### Task 4: 전체 확인

**Files:** 없음(확인만)

- [ ] **Step 1: 처음 만들기 0줄 변경 증거**

Run (`.worktrees/double-shell` 에서):

```bash
git diff --stat origin/master -- apps/web/app/api/characters/route.ts
diff <(git show origin/master:apps/web/app/characters/CharacterStudio.tsx | sed -n '/const handleCandidates = async/,/const handleRedo = async/p') \
     <(sed -n '/const handleCandidates = async/,/const handleRedo = async/p' apps/web/app/characters/CharacterStudio.tsx) \
  && echo "처음 만들기 함수 0줄 변경"
diff <(git show origin/master:apps/web/lib/characters.ts | sed -n '/export async function generateCandidates/,/^async function generateAngle/p;/export async function createCharacter/,/export async function regenerateAngle/p') \
     <(sed -n '/export async function generateCandidates/,/^async function generateAngle/p;/export async function createCharacter/,/export async function regenerateAngle/p' apps/web/lib/characters.ts) \
  && echo "createCharacter·generateCandidates 0줄 변경"
```

Expected: 첫 줄 출력 없음, 두 「0줄 변경」 문구가 나온다

- [ ] **Step 2: 타입·린트·전체 시험**

Run (`apps/web`): `npx tsc --noEmit -p .` → exit 0 · `npx eslint app/characters lib/character-carry.ts lib/characters.ts "app/api/characters" app/api/admin/works/store.ts` → exit 0 · `npx vitest run` → 실패 0

- [ ] **Step 3: 로컬 화면 확인**

1. `apps/web/.env.local` 은 메인 폴더에서 이미 복사해 두었다(Supabase 비움, `LOCAL_STORE=1`, `LOCAL_AUTH_BYPASS`)
2. `LOCAL_STORE_ROOT` 를 스크래치 폴더로 잡고, `lib/local-store/index.ts` 의 `store.json` 모양대로 로컬 사용자(로컬 우회 사용자 id 는 `lib/membership` 의 우회 코드에서 확인)의 캐릭터 하나와 각도 셋(front·left_45·back, 작은 PNG)을 넣는다
3. `npx next dev -p 3077` 로 띄우고 브라우저로 `/characters/<그 id>` 를 연다 — 안내 띠, 채워진 칸(잠김), 정면 그림, 각도 고르기 단추가 보이는지
4. 「정면 한 장으로 저장」 → 결과 단계에 **새 캐릭터**가 생기고 left_45·back 이 옮겨 담겼는지, 원본은 그대로인지(`store.json`)
5. 「설정 고치기」 → 칸이 풀리는지
6. 그림을 새로 그리는 단추(다시 뽑기·각도 만들기)는 로컬에서 누르지 않는다 — fal 에 실제 요청이 나간다
7. 다 보면 서버를 끄고(포트 3077 남은 프로세스까지) 스크래치 자료를 지운다

- [ ] **Step 4: 독립 리뷰** — 브랜치 전체 diff(`git diff origin/master`)를 새 리뷰어에게 맡기고, 지적을 고친 뒤 다시 Step 2 를 돈다
