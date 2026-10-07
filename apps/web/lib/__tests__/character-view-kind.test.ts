import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **캐릭터를 불러올 때 종류·그림체도 함께 준다**(2026-10-07 사용자 승인, ③).
 *
 * 상세페이지·리디자인은 이 함수로 캐릭터 그림을 불러온다. 전에는 생김새 설명만
 * 줘서, 고양이 캐릭터도 받는 쪽에서는 「사람」으로 읽혔다.
 */
vi.mock("server-only", () => ({}));

const original = { ...process.env };
let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "character-view-kind-"));
  process.env.LOCAL_STORE = "1";
  process.env.LOCAL_STORE_ROOT = root;
});
afterEach(() => {
  process.env = { ...original };
  rmSync(root, { recursive: true, force: true });
});

const PNG = Buffer.from("front").toString("base64");

describe("캐릭터 그림 불러오기", () => {
  it("종류·그림체·생김새를 함께 준다", async () => {
    const { createCharacter, loadCharacterView } = await import("../characters");
    const created = await createCharacter({
      userId: "u1", name: "나비", description: "회색 고양이", aspectRatio: "3:4", kind: "animal", look: "anime",
      chosenBase64: PNG, chosenMimeType: "image/png", angles: [], sheet: false,
    });
    if (!created.ok) throw new Error(created.message);

    const view = await loadCharacterView("u1", created.id, "front");
    expect(view?.kind).toBe("animal");
    expect(view?.look).toBe("anime");
    expect(view?.identityPrompt).toBeTruthy();
  });
});

describe("리디자인이 종류·그림체를 넘긴다", () => {
  const route = readFileSync(new URL("../../app/api/redesign/generate/route.ts", import.meta.url), "utf8");

  it("지키는 문장과 첨부 이름표에 캐릭터의 종류·그림체를 준다", () => {
    expect(route).toMatch(/buildSceneWithCharacterDirective\(\{[\s\S]*?kind: view\.kind,[\s\S]*?look: view\.look,/);
    expect(route).toMatch(/characters\.push\(\{[\s\S]*?kind: view\.kind,/);
  });
});
