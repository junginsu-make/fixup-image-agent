import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **지워진 라이브러리 사본을 캐릭터 원본에서 다시 채운다**(2026-10-07).
 *
 * 카드뉴스·이미지 만들기는 캐릭터 각도를 라이브러리 사본(제목으로)에서 찾는다.
 * 라이브러리에서 그 그림을 지우면 캐릭터에는 그림이 있어도 「찾지 못했습니다」가
 * 떴다. 원본은 캐릭터 저장소에 그대로 있으니 거기서 다시 채운다.
 */
vi.mock("server-only", () => ({}));

/*
  **무거운 모듈은 미리 불러 둔다.** 첫 시험이 부르면서 5초를 넘기면, 시간이 다 된
  시험이 뒤에서 계속 돌며 다음 시험의 폴더를 건드렸다(2026-10-07 리뷰가 재현).
*/
beforeAll(async () => {
  await import("../characters");
  await import("../reference-images");
}, 60_000);

const original = { ...process.env };
let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "character-restore-"));
  process.env.LOCAL_STORE = "1";
  process.env.LOCAL_STORE_ROOT = root;
});
afterEach(() => {
  process.env = { ...original };
  rmSync(root, { recursive: true, force: true });
});

const PNG = Buffer.from("front").toString("base64");

async function 만들기(userId = "u1") {
  const { createCharacter } = await import("../characters");
  const result = await createCharacter({
    userId, name: "민지", description: "민지", aspectRatio: "3:4", kind: "person", look: "photoreal",
    chosenBase64: PNG, chosenMimeType: "image/png", angles: [], sheet: false,
  });
  if (!result.ok) throw new Error(result.message);
  return result.id;
}

async function 제목들(userId = "u1"): Promise<string[]> {
  const { listReferenceImages } = await import("../reference-images");
  return (await listReferenceImages({ userId, role: "member" as never })).map((image) => image.title ?? "").sort();
}

describe("restoreCharacterReferences", () => {
  it("라이브러리에서 지운 각도를 원본에서 다시 채운다", async () => {
    const id = await 만들기();
    const { removeReferenceImagesByTitle } = await import("../reference-images");
    await removeReferenceImagesByTitle("u1", "민지 (캐릭터) · 정면");
    expect(await 제목들()).toEqual([]);

    const { restoreCharacterReferences } = await import("../characters");
    expect(await restoreCharacterReferences("u1", id, ["front"])).toEqual({ restored: ["front"], unavailable: [] });
    expect(await 제목들()).toEqual(["민지 (캐릭터) · 정면"]);
  });

  it("이미 있으면 다시 넣지 않는다 — 같은 제목이 둘이 되면 안 된다", async () => {
    const id = await 만들기();
    const { restoreCharacterReferences } = await import("../characters");
    expect(await restoreCharacterReferences("u1", id, ["front"])).toEqual({ restored: [], unavailable: [] });
    expect(await 제목들()).toEqual(["민지 (캐릭터) · 정면"]);
  });

  it("원본에도 없는 각도는 「없음」으로 알린다", async () => {
    const id = await 만들기();
    const { restoreCharacterReferences } = await import("../characters");
    expect(await restoreCharacterReferences("u1", id, ["back"])).toEqual({ restored: [], unavailable: ["back"] });
  });

  it("다각도 한 장과 모르는 이름은 받지 않는다 — 정체성 기준으로 못 쓴다", async () => {
    const id = await 만들기();
    const { restoreCharacterReferences } = await import("../characters");
    expect(await restoreCharacterReferences("u1", id, ["sheet", "top"])).toEqual({ restored: [], unavailable: [] });
  });

  it("같은 캐릭터를 동시에 두 번 채워도 하나만 넣는다", async () => {
    const id = await 만들기();
    const { removeReferenceImagesByTitle } = await import("../reference-images");
    await removeReferenceImagesByTitle("u1", "민지 (캐릭터) · 정면");
    const { restoreCharacterReferences } = await import("../characters");
    const [a, b] = await Promise.all([
      restoreCharacterReferences("u1", id, ["front"]),
      restoreCharacterReferences("u1", id, ["front"]),
    ]);
    expect([...a!.restored, ...b!.restored]).toEqual(["front"]);
    expect(await 제목들()).toEqual(["민지 (캐릭터) · 정면"]);
  });

  it("남의 캐릭터는 채우지 않는다", async () => {
    const id = await 만들기("u2");
    const { restoreCharacterReferences } = await import("../characters");
    expect(await restoreCharacterReferences("u1", id, ["front"])).toBeNull();
    expect(await 제목들("u1")).toEqual([]);
  });
});
