import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **캐릭터를 만든 모델을 저장하고, 빠진 장면도 그 모델로 그린다**(2026-10-07).
 *
 * 전에는 모델을 저장하지 않아 「없는 장면 더 만들기」가 그림체의 기본 모델로
 * 그렸다. 다른 모델로 만든 캐릭터는 나중에 채운 장면만 느낌이 달라졌다.
 */
vi.mock("server-only", () => ({}));

const drawnWith: string[] = [];
vi.mock("../pdp/fal", () => ({
  createPdpImageGenerator: () => async (model: string) => {
    drawnWith.push(model);
    return { base64: Buffer.from("angle").toString("base64"), mimeType: "image/png" };
  },
}));

const original = { ...process.env };
let root = "";

beforeEach(() => {
  drawnWith.length = 0;
  root = mkdtempSync(join(tmpdir(), "character-model-"));
  process.env.LOCAL_STORE = "1";
  process.env.LOCAL_STORE_ROOT = root;
});
afterEach(() => {
  process.env = { ...original };
  rmSync(root, { recursive: true, force: true });
});

const PNG = Buffer.from("front").toString("base64");

async function 만들기(modelId?: string) {
  const { createCharacter } = await import("../characters");
  const result = await createCharacter({
    userId: "u1", name: "민지", description: "민지", aspectRatio: "3:4", kind: "person", look: "photoreal",
    modelId: modelId as never, chosenBase64: PNG, chosenMimeType: "image/png", angles: [], sheet: false,
  });
  if (!result.ok) throw new Error(result.message);
  return result.id;
}

describe("만든 모델", () => {
  it("고른 모델을 저장한다", async () => {
    const id = await 만들기("gpt-image-2.5-flare");
    const { listLocalCharacters } = await import("../characters-store");
    expect((await listLocalCharacters("u1")).find((row) => row.id === id)?.modelId).toBe("gpt-image-2.5-flare");
  });

  it("안 골랐으면 그림체가 정한 모델을 저장한다", async () => {
    const id = await 만들기();
    const { listLocalCharacters } = await import("../characters-store");
    expect((await listLocalCharacters("u1")).find((row) => row.id === id)?.modelId).toBe("nano-banana-pro");
  });

  it("없는 장면은 만든 모델로 그린다 — 실사의 기본 모델이 아니라", async () => {
    const id = await 만들기("gpt-image-2.5-flare");
    const { regenerateAngle } = await import("../characters");
    const result = await regenerateAngle({ userId: "u1", characterId: id, angle: "back" });
    expect(result).toMatchObject({ ok: true, model: "gpt-image-2.5-flare" });
    expect(drawnWith).toEqual(["gpt-image-2.5-flare"]);
  });

  it("다시 만들 때 모델을 골라 보내면 그것이 이긴다", async () => {
    const id = await 만들기("gpt-image-2.5-flare");
    const { regenerateAngle } = await import("../characters");
    await regenerateAngle({ userId: "u1", characterId: id, angle: "back", modelId: "nano-banana-pro" });
    expect(drawnWith).toEqual(["nano-banana-pro"]);
  });

  it("모델 기록이 없는 옛 캐릭터는 지금처럼 그림체의 기본 모델로 그린다", async () => {
    const store = await import("../characters-store");
    await store.insertLocalCharacter({
      id: "old", userId: "u1", name: "옛", sourcePrompt: "옛", identityPrompt: "옛",
      kind: "person", look: "anime", createdAt: "2026-09-01",
    });
    await store.writeLocalCharacterFile("old/front.png", Buffer.from("front"));
    await store.upsertLocalCharacterView({ characterId: "old", userId: "u1", angle: "front", path: "old/front.png", mimeType: "image/png" });
    const { regenerateAngle } = await import("../characters");
    await regenerateAngle({ userId: "u1", characterId: "old", angle: "back" });
    expect(drawnWith).toEqual(["gpt-image-2.5-flare"]);
  });
});

describe("목록에서 빠진 모델", () => {
  it("저장된 모델이 지금 목록에 없으면 그림체의 기본 모델로 그린다 — 모르는 값으로 그리면 거절된다", async () => {
    const store = await import("../characters-store");
    await store.insertLocalCharacter({
      id: "retired", userId: "u1", name: "은퇴", sourcePrompt: "은퇴", identityPrompt: "은퇴",
      kind: "person", look: "photoreal", createdAt: "2026-10-07", modelId: "retired-model",
    });
    await store.writeLocalCharacterFile("retired/front.png", Buffer.from("front"));
    await store.upsertLocalCharacterView({
      characterId: "retired", userId: "u1", angle: "front", path: "retired/front.png", mimeType: "image/png",
    });
    const { regenerateAngle } = await import("../characters");
    await regenerateAngle({ userId: "u1", characterId: "retired", angle: "back" });
    expect(drawnWith).toEqual(["nano-banana-pro"]);
  });
});

describe("마이그레이션", () => {
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/202610070001_character_model.sql", import.meta.url), "utf8",
  );

  it("characters 에 model_id 칸을 더한다 — 다시 돌려도 안전하게", () => {
    expect(sql).toMatch(/alter table public\.characters\s+add column if not exists model_id text/);
  });

  it("앱보다 먼저 적용하라고 첫머리에 적는다", () => {
    expect(sql.split("\n").slice(0, 12).join("\n")).toContain("앱보다 먼저");
  });
});
