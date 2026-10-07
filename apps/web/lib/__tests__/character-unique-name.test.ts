import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **같은 이름의 캐릭터를 만들지 않는다**(2026-10-07).
 *
 * 라이브러리는 캐릭터 각도를 제목(「이름 (캐릭터) · 정면」)으로만 찾고 지운다.
 * 같은 이름이 둘이면 하나를 지울 때 다른 쪽 그림까지 지워졌다 — 로컬에서
 * 재현했다(지우기 전 2장 → 하나만 지웠는데 0장).
 */
vi.mock("server-only", () => ({}));

const original = { ...process.env };
let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "character-unique-"));
  process.env.LOCAL_STORE = "1";
  process.env.LOCAL_STORE_ROOT = root;
});
afterEach(() => {
  process.env = { ...original };
  rmSync(root, { recursive: true, force: true });
});

const PNG = Buffer.from("front").toString("base64");

/** 정면 한 장짜리. 각도를 안 고르면 그림 모델을 부르지 않는다. */
async function 만들기(name: string) {
  const { createCharacter } = await import("../characters");
  return createCharacter({
    userId: "u1", name, description: name, aspectRatio: "3:4", kind: "person", look: "photoreal",
    chosenBase64: PNG, chosenMimeType: "image/png", angles: [], sheet: false,
  });
}

async function 라이브러리제목들(): Promise<string[]> {
  const { listReferenceImages } = await import("../reference-images");
  return (await listReferenceImages({ userId: "u1", role: "member" as never }))
    .map((image) => image.title ?? "").sort();
}

describe("같은 이름으로 만들기", () => {
  it("두 번째는 (2) 를 붙여 저장하고, 붙인 이름을 돌려준다", async () => {
    const first = await 만들기("민지");
    const second = await 만들기("민지");
    expect(first).toMatchObject({ ok: true, name: "민지" });
    expect(second).toMatchObject({ ok: true, name: "민지 (2)" });
  });

  it("하나를 지워도 다른 캐릭터의 라이브러리 그림은 남는다", async () => {
    const first = await 만들기("민지");
    await 만들기("민지");
    const { deleteCharacter } = await import("../characters");
    await deleteCharacter("u1", first.ok ? first.id : "");
    expect(await 라이브러리제목들()).toEqual(["민지 (2) (캐릭터) · 정면"]);
  });

  it("다른 회원의 이름과는 겹쳐도 된다 — 라이브러리는 회원마다 따로다", async () => {
    const { createCharacter } = await import("../characters");
    await 만들기("민지");
    const other = await createCharacter({
      userId: "u2", name: "민지", description: "민지", aspectRatio: "3:4", kind: "person", look: "photoreal",
      chosenBase64: PNG, chosenMimeType: "image/png", angles: [], sheet: false,
    });
    expect(other).toMatchObject({ ok: true, name: "민지" });
  });
});
