import { describe, expect, it } from "vitest";
import {
  NAME_LIMIT, blobToFront, carriedNote, frontViewUrl, madeFromOpenedFront, nameAfterSave, openedValues, renamedForCopy,
  type OpenedCharacter,
} from "../opened-character";

const KINDS = [{ id: "person" }, { id: "animal" }, { id: "character" }, { id: "object" }];
const LOOKS = ["auto", "photoreal", "anime", "3d", "illustration"] as const;
const 호롱이: OpenedCharacter = {
  id: "c1", name: "호롱이 2", sourcePrompt: "여러 각도의 캐릭터 이미지", kind: "character", look: "3d",
  views: [{ angle: "front", url: "https://x/front.png" }, { angle: "back", url: "https://x/back.png" }],
};

describe("연 캐릭터로 칸을 채운다", () => {
  it("이름에는 「(수정본)」을 붙이고, 설명·종류·그림체는 저장된 그대로", () => {
    expect(openedValues(호롱이, KINDS, LOOKS, [])).toEqual({
      name: "호롱이 2 (수정본)", description: "여러 각도의 캐릭터 이미지", kind: "character", look: "3d",
      modelId: "",
    });
  });

  // 만든 모델을 저장하게 됐다(202610070001). 새 캐릭터도 같은 모델로 그려야 옮겨 온 각도와 느낌이 맞는다.
  it("원래 캐릭터를 만든 모델을 이어받는다", () => {
    expect(openedValues({ ...호롱이, modelId: "gpt-image-2.5-flare" }, KINDS, LOOKS, []))
      .toMatchObject({ modelId: "gpt-image-2.5-flare" });
  });

  it("이미 있는 이름과 겹치지 않게 번호를 붙인다", () => {
    expect(openedValues(호롱이, KINDS, LOOKS, ["호롱이 2 (수정본)"]))
      .toMatchObject({ name: "호롱이 2 (수정본 2)" });
  });

  it("모르는 종류·그림체는 첫 종류·실사로 — 옛 줄이 칸을 깨지 않게", () => {
    expect(openedValues({ ...호롱이, kind: "robot", look: "pixel" }, KINDS, LOOKS, []))
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

  it("그림 형식이 아닌 본문(text/plain 등)은 image/png 로 — 서버가 형식을 믿는다", async () => {
    const front = await blobToFront(new Blob([new Uint8Array([1, 2, 3])], { type: "text/plain" }));
    expect(front).toEqual({ base64: "AQID", mimeType: "image/png" });
  });

  it("형식이 비었으면 image/png", async () => {
    const front = await blobToFront(new Blob([new Uint8Array([1, 2, 3])]));
    expect(front.mimeType).toBe("image/png");
  });
});

describe("새 캐릭터 이름", () => {
  it("저장할 때 자르는 길이는 처음 만들기와 같다", () => {
    expect(NAME_LIMIT).toBe(40);
  });

  it("원래 이름 뒤에 「(수정본)」을 붙인다", () => {
    expect(renamedForCopy("호롱이", [])).toBe("호롱이 (수정본)");
  });

  it("이미 있는 이름이면 번호를 올린다", () => {
    expect(renamedForCopy("호롱이", ["호롱이 (수정본)"])).toBe("호롱이 (수정본 2)");
    expect(renamedForCopy("호롱이", ["호롱이 (수정본)", "호롱이 (수정본 2)"])).toBe("호롱이 (수정본 3)");
  });

  it("**수정본을 다시 열어도** 같은 이름이 또 생기지 않는다 — 자기 이름은 이미 쓰였다", () => {
    expect(renamedForCopy("호롱이 (수정본)", [])).toBe("호롱이 (수정본 2)");
  });

  it("원래 이름이 아니라 뿌리 이름에서 빈 번호를 찾는다", () => {
    expect(renamedForCopy("호롱이 (수정본 2)", ["호롱이 (수정본 3)"])).toBe("호롱이 (수정본)");
  });

  it("이름 목록의 앞뒤 공백은 무시하고 견준다", () => {
    expect(renamedForCopy("호롱이", ["  호롱이 (수정본) "])).toBe("호롱이 (수정본 2)");
  });

  it.each([40, 39, 35])("**%i자 이름도** 자르는 길이 안에서 끝에 「(수정본)」이 남고 원래와 다르다", (length) => {
    const original = "가".repeat(length);
    const copy = renamedForCopy(original, []);
    expect(copy.length).toBeLessThanOrEqual(NAME_LIMIT);
    expect(copy.endsWith("(수정본)")).toBe(true);
    expect(copy).not.toBe(original);
  });

  it("긴 이름도 번호가 붙은 채 자르는 길이 안에 든다", () => {
    const original = "가".repeat(40);
    const first = renamedForCopy(original, []);
    const second = renamedForCopy(original, [first]);
    expect(second).not.toBe(first);
    expect(second.length).toBeLessThanOrEqual(NAME_LIMIT);
    expect(second.endsWith("(수정본 2)")).toBe(true);
  });

  it("빈 이름은 빈 채로 둔다", () => {
    expect(renamedForCopy("  ", [])).toBe("");
  });

  it("받은 이름 목록을 건드리지 않는다", () => {
    const taken = Object.freeze(["호롱이 (수정본)"]);
    expect(renamedForCopy("호롱이", taken)).toBe("호롱이 (수정본 2)");
    expect(taken).toEqual(["호롱이 (수정본)"]);
  });
});

describe("옮겨 담은 결과를 알린다", () => {
  it("옮긴 것도 못 옮긴 것도 없으면 말하지 않는다", () => {
    expect(carriedNote(0, 0)).toBe("");
  });

  it("옮겼으면 장수를 알린다", () => {
    expect(carriedNote(2, 0)).toBe("원래 캐릭터에서 각도 2장을 옮겨 담았습니다.");
  });

  it("일부만 옮겼으면 못 옮긴 장수도 알린다", () => {
    expect(carriedNote(2, 1)).toBe(
      "원래 캐릭터에서 각도 2장을 옮겨 담았고, 1장은 옮기지 못했습니다. 「내 캐릭터」에서 다시 만드세요.",
    );
  });

  it("하나도 못 옮겼으면 그렇다고 알린다", () => {
    expect(carriedNote(0, 3)).toBe("원래 캐릭터의 각도 3장을 옮기지 못했습니다. 「내 캐릭터」에서 다시 만드세요.");
  });
});

describe("저장한 뒤 이름 칸", () => {
  it("**칸이 방금 만든 이름 그대로면** 다음 빈 꼬리로 바꾼다 — 같은 이름이 또 생기지 않게", () => {
    expect(nameAfterSave("호롱이 (수정본)", "호롱이 (수정본)", ["호롱이", "호롱이 (수정본)"]))
      .toBe("호롱이 (수정본 2)");
  });

  it("방금 만든 이름이 목록에 아직 없어도 겹치지 않는다", () => {
    expect(nameAfterSave("호롱이 (수정본)", "호롱이 (수정본)", [])).toBe("호롱이 (수정본 2)");
  });

  it("**방금 저장한 이름에서 이어 간다** — 사용자가 직접 정한 이름이면 그 이름 뒤에 꼬리를 붙인다", () => {
    expect(nameAfterSave("새이름", "새이름", [])).toBe("새이름 (수정본)");
    expect(nameAfterSave("새이름", "새이름", ["호롱이", "새이름"])).toBe("새이름 (수정본)");
  });

  it("앞뒤 공백은 무시하고 견준다", () => {
    expect(nameAfterSave("  호롱이 (수정본) ", "호롱이 (수정본)", [])).toBe("호롱이 (수정본 2)");
  });

  it("**사용자가 칸을 고쳤으면 그대로 둔다**", () => {
    expect(nameAfterSave("내 호랑이", "호롱이 (수정본)", [])).toBeNull();
  });

  it("방금 만든 캐릭터를 모르면 건드리지 않는다", () => {
    expect(nameAfterSave("호롱이 (수정본)", null, [])).toBeNull();
  });

  it("받은 이름 목록을 건드리지 않는다", () => {
    const taken = Object.freeze(["호롱이 (수정본)"]);
    expect(nameAfterSave("호롱이 (수정본)", "호롱이 (수정본)", taken)).toBe("호롱이 (수정본 2)");
    expect(taken).toEqual(["호롱이 (수정본)"]);
  });
});
