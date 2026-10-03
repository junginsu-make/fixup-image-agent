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
    // 로컬 길은 `isOwnedPath` 를 거치지 않으므로 끝 이름도 허용 모양만 받는다
    expect(carriedPath("A/%2e%2e", "B", null)).toBeNull();
    expect(carriedPath("A/.\t.", "B", null)).toBeNull();
    expect(carriedPath("A/a b.png", "B", null)).toBeNull();
  });
});

describe("옮겨 담기", () => {
  it("새 캐릭터에 없는 각도만 채우고, 파일도 새 자리에 복사한다", async () => {
    await 캐릭터("A", "u1", ["front", "left_45", "back"]);
    await 캐릭터("B", "u1", ["front", "left_45"]);
    const { carryCharacterViews } = await import("../character-carry");

    const result = await carryCharacterViews({ userId: "u1", fromId: "A", toId: "B" });
    expect(result.carried).toEqual(["back"]);
    expect(result.failed).toEqual([]);
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
    const result = await carryCharacterViews({ userId: "u1", fromId: "A", toId: "B" });
    expect(result).toEqual({ carried: [], failed: [] });
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

  it("원본 파일을 못 읽으면 그 각도는 failed, 나머지는 여전히 carry된다", async () => {
    await 캐릭터("A", "u1", ["front", "left_45", "back"]);
    await 캐릭터("B", "u1", ["front"]);
    const { carryCharacterViews } = await import("../character-carry");
    const { removeLocalCharacterFiles } = await import("../characters-store");

    // left_45 파일을 삭제하여 읽기 실패 시뮬레이션
    await removeLocalCharacterFiles(["A/left_45.png"]);

    const result = await carryCharacterViews({ userId: "u1", fromId: "A", toId: "B" });
    expect(result).toEqual({ carried: ["back"], failed: ["left_45"] });
  });

  it("옮겨 담은 각도는 라이브러리에 새 캐릭터 이름으로 등록된다", async () => {
    await 캐릭터("A", "u1", ["front", "left_45", "back"]);
    await 캐릭터("B", "u1", ["front", "left_45"]);
    const { carryCharacterViews } = await import("../character-carry");
    const { characterReferenceTitle } = await import("../character-library");
    const { listReferenceImages } = await import("../reference-images");

    const result = await carryCharacterViews({ userId: "u1", fromId: "A", toId: "B" });
    expect(result.carried).toEqual(["back"]);
    expect(result.referenceIssue).toBeUndefined();

    const refs = await listReferenceImages({ userId: "u1", role: "member" });
    const bRefs = refs.filter((ref) => ref.title === characterReferenceTitle("B", "back"));
    expect(bRefs).toHaveLength(1);
    expect(bRefs[0].purpose).toBe("both");
  });
});

describe("순수 함수", () => {
  it("isUuid: UUID 형식 검증", async () => {
    const { isUuid } = await import("../character-carry");
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    expect(isUuid("invalid-uuid")).toBe(false);
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("isOwnedPath: 경로 소유권 검증", async () => {
    const { isOwnedPath } = await import("../character-carry");
    expect(isOwnedPath("u1/A/back.png", "u1", "A")).toBe(true);
    expect(isOwnedPath("u1/A/back.thumb.webp", "u1", "A")).toBe(true);
    expect(isOwnedPath("u2/A/back.png", "u1", "A")).toBe(false);
    expect(isOwnedPath("u1/C/back.png", "u1", "A")).toBe(false);
    expect(isOwnedPath("u1/A", "u1", "A")).toBe(false);
  });

  it("**isOwnedPath: `..`·`.`·빈 칸·역슬래시가 낀 경로는 막는다** — 주소로 풀리면 남의 경로가 된다", async () => {
    const { isOwnedPath } = await import("../character-carry");
    // storage-js 는 경로를 주소에 이어 붙이고, 주소 해석이 `..` 를 접는다.
    expect(isOwnedPath("u1/A/../../u2/B/front.png", "u1", "A")).toBe(false);
    expect(isOwnedPath("u1/A/./x.png", "u1", "A")).toBe(false);
    expect(isOwnedPath("u1/A//x.png", "u1", "A")).toBe(false);
    expect(isOwnedPath("u1/A/..\\..\\u2/x.png", "u1", "A")).toBe(false);
    expect(isOwnedPath("u1/A/back.png", "u1", "A")).toBe(true);
  });

  it.each([
    ["퍼센트로 쓴 `..`", "u1/A/%2e%2e/%2e%2e/u2/B/front.png"],
    ["대문자·섞어 쓴 `..`", "u1/A/%2E%2e/x.png"],
    ["점 하나만 퍼센트로 쓴 `..`", "u1/A/%2e./x.png"],
    ["탭이 낀 `..`", "u1/A/.\t./.\t./u2/B/front.png"],
    ["물음표", "u1/A/x.png?y"],
    ["해시", "u1/A/x#y.png"],
    ["공백", "u1/A/a b.png"],
    ["줄바꿈", "u1/A/a\nb.png"],
    ["끝의 줄바꿈", "u1/A/x.png\n"],
    ["끝의 점", "u1/A/x."],
    ["앞의 점", "u1/A/.hidden"],
    ["연속한 점", "u1/A/a..b.png"],
  ])("**isOwnedPath: 막는다 — %s** (허용 글자만 통과시키는 목록이다)", async (_label, path) => {
    const { isOwnedPath } = await import("../character-carry");
    // storage-js 는 경로를 인코딩 없이 주소에 잇고, 주소 해석은 탭을 지우고 `%2e%2e` 를 `..` 로 접는다.
    expect(isOwnedPath(path, "u1", "A")).toBe(false);
  });

  it("isOwnedPath: 실제 경로 모양(`left_45.png`, `left_45.thumb.webp`, uuid)은 통과한다", async () => {
    const { isOwnedPath } = await import("../character-carry");
    const user = "11111111-1111-4111-8111-111111111111";
    const character = "22222222-2222-4222-8222-222222222222";
    expect(isOwnedPath("u1/A/left_45.png", "u1", "A")).toBe(true);
    expect(isOwnedPath("u1/A/left_45.thumb.webp", "u1", "A")).toBe(true);
    expect(isOwnedPath(`${user}/${character}/left_45.png`, user, character)).toBe(true);
    expect(isOwnedPath(`${user}/${character}/left_45.thumb.webp`, user, character)).toBe(true);
    // 앞 두 칸이 요청한 사람·캐릭터와 다르면 통과하지 않는다
    expect(isOwnedPath(`${user}/${character}/left_45.png`, user, "other")).toBe(false);
  });
});
