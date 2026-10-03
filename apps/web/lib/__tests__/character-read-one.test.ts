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
    // 개수 제한이 없어도 범위는 그대로다 — 남의 캐릭터가 id 로 읽히면 안 된다.
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "u1"] });
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
