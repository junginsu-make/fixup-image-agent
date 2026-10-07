import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosterProjectInputSchema } from "@fixup/poster-core";
import { createPosterService } from "../projects/poster-service";

/**
 * **이미지 만들기에도 캐릭터를 종류·그림체·생김새대로 넘긴다**(2026-10-07 사용자 승인, ③).
 *
 * 이 화면은 캐릭터 번호를 들고 다니지 않는다 — 라이브러리 그림의 **제목**(「나비 · 정면」)
 * 으로 캐릭터를 알아본다(`characterIdByTitle`). 서버도 작업을 만들 때 같은 방법으로
 * **볼 수 있는 캐릭터만** 찾아 작업에 적어 둔다. 미리보기와 생성이 그 기록을 같이 읽는다.
 */
vi.mock("server-only", () => ({}));

const original = { ...process.env };
let root = "";
beforeEach(() => {
  vi.stubEnv("AD_EXPORT", "1");
  root = mkdtempSync(join(tmpdir(), "poster-character-"));
  process.env.LOCAL_STORE = "1";
  process.env.LOCAL_STORE_ROOT = root;
});
afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...original };
  rmSync(root, { recursive: true, force: true });
});

const PNG = Buffer.from("front").toString("base64");

async function 캐릭터(userId: string, name: string) {
  const { createCharacter } = await import("../../../../lib/characters");
  const created = await createCharacter({
    userId, name, description: "회색 고양이", aspectRatio: "3:4", kind: "animal", look: "anime",
    chosenBase64: PNG, chosenMimeType: "image/png", angles: [], sheet: false,
  });
  if (!created.ok) throw new Error(created.message);
  return created.id;
}

describe("제목으로 캐릭터를 찾는다", () => {
  it("내 캐릭터의 각도 제목이면 그 캐릭터의 종류·그림체·생김새를 준다", async () => {
    const id = await 캐릭터("u1", "나비");
    const { characterReferenceTitle } = await import("../../../../lib/character-library");
    const { carriedCharactersForReferences } = await import("../../../../lib/carried-characters-server");
    const found = await carriedCharactersForReferences("u1", [
      { id: "r1", title: characterReferenceTitle("나비", "front") },
      { id: "r2", title: "그냥 사진" },
    ]);
    expect(found.r1).toMatchObject({ characterId: id, kind: "animal", look: "anime" });
    expect(found.r2).toBeUndefined();
  });

  it("남의 캐릭터 이름과 같은 제목이어도 찾지 않는다", async () => {
    await 캐릭터("owner", "남의것");
    const { characterReferenceTitle } = await import("../../../../lib/character-library");
    const { carriedCharactersForReferences } = await import("../../../../lib/carried-characters-server");
    const found = await carriedCharactersForReferences("u1", [{ id: "r1", title: characterReferenceTitle("남의것", "front") }]);
    expect(found.r1).toBeUndefined();
  });
});

describe("작업에 적어 둔다", () => {
  it("만들 때 받은 캐릭터 정보를 작업 기록에 넣는다", async () => {
    const created: Array<{ data: Record<string, unknown> }> = [];
    const service = createPosterService({
      list: async () => [], get: async () => undefined, update: async () => ({}) as never, remove: async () => true,
      create: async (row: never) => { created.push(row); return { ...(row as object), id: "p1", createdAt: "t", updatedAt: "t" } as never; },
    });
    const characters = { r1: { characterId: "c1", kind: "animal" as const, look: "anime" as const, identity: "grey cat" } };
    await service.create(PosterProjectInputSchema.parse({
      title: "고양이", ratio: "2:3", modelId: "gpt-image-2", variants: 1, instruction: "고양이 포스터",
      referenceIds: [], preservedIds: ["11111111-1111-4111-8111-111111111111"], personIds: ["11111111-1111-4111-8111-111111111111"],
    }), characters);
    expect(created[0]!.data.characters).toEqual(characters);
  });

  it("없으면 칸을 만들지 않는다 — 옛 작업과 같은 모양", async () => {
    const created: Array<{ data: Record<string, unknown> }> = [];
    const service = createPosterService({
      list: async () => [], get: async () => undefined, update: async () => ({}) as never, remove: async () => true,
      create: async (row: never) => { created.push(row); return { ...(row as object), id: "p1", createdAt: "t", updatedAt: "t" } as never; },
    });
    await service.create(PosterProjectInputSchema.parse({
      title: "t", ratio: "2:3", modelId: "gpt-image-2", variants: 1, instruction: "x", referenceIds: [],
    }));
    expect("characters" in created[0]!.data).toBe(false);
  });

  it("작업 만들기가 사람으로 지킬 그림의 제목으로 찾아 넘긴다", () => {
    const route = readFileSync(new URL("../projects/route.ts", import.meta.url), "utf8");
    expect(route).toMatch(/carriedCharactersForPosterPeople\(auth\.member, parsed\.data\.personIds\)/);
    expect(route).toMatch(/service\.create\(parsed\.data, characters\)/);
  });
});
