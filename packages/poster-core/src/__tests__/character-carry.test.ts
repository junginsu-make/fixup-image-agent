import { describe, expect, it } from "vitest";
import { buildPosterPrompt } from "../prompt";
import { EMPTY_SLOTS } from "../schemas";

const slots = {
  ...EMPTY_SLOTS,
  kind: "전시 홍보",
  headline: "가을, 셔터를 누르다",
  subline: "필름으로 담은 도시의 온도",
  sideTexts: ["28MM F2.0", "ISO 400"],
  scene: "해질녘 골목",
  subject: "필름 카메라를 든 20대 여성",
  action: "셔터를 누르는 순간",
  typeInteraction: "통과" as const,
  dominantColor: "따뜻한 세피아",
  accentColor: "선명한 주황",
  forbidden: "로고, 워터마크",
};

const images = [
  { kind: "style_reference" as const, title: "SNAP" },
  { kind: "preserved" as const, title: "제품 사진" },
];

const size = { width: 1024, height: 1536 };
import { readFileSync } from "node:fs";
import { promptImagesFrom } from "../prompt-images";
import { characterAngleDirective, restoreAttachments } from "@fixup/shared";

/**
 * **이미지 만들기에도 캐릭터를 종류·그림체·생김새대로 넘긴다**(2026-10-07 사용자 승인, ③).
 *
 * 전에는 같은 캐릭터의 각도 넷을 붙여도 「같은 캐릭터」라는 말이 없어 서로 다른 넷으로
 * 읽혔고, 「사람이 여럿이니 한 명만」에 걸렸다. 생김새 설명도 가지 않았다.
 *
 * `__fixtures__/character-carry-baseline.json` 은 이 변경 **전** 출력이다. 캐릭터 정보가
 * 없는 옛 작업은 한 글자도 바뀌지 않아야 한다.
 */
const baseline = JSON.parse(readFileSync(new URL("../__fixtures__/character-carry-baseline.json", import.meta.url), "utf8"));

const POSTER_CASES = {
  twoPeopleAndStyle: { slots, size, images: [
    { kind: "style_reference" as const, title: "SNAP" },
    { kind: "preserved" as const, subject: "person" as const, title: "민지 · 정면" },
    { kind: "preserved" as const, subject: "person" as const, title: "민지 · 좌측 45도" },
  ] },
  onePersonInstruction: { slots, size, userInstruction: "왼쪽에 크게", attachmentIntent: "1번 사람을 크게", images: [
    { kind: "preserved" as const, subject: "person" as const },
  ] },
  restyledPerson: { slots, size, look: "anime" as const, images: [
    { kind: "preserved" as const, subject: "person" as const, restyle: true },
    { kind: "style_reference" as const },
  ] },
  personAndProduct: { slots, size, look: "photoreal" as const, images: [
    { kind: "preserved" as const, subject: "person" as const },
    { kind: "preserved" as const, subject: "object" as const },
    { kind: "preserved" as const, subject: "person" as const },
  ] },
};

describe("캐릭터 정보가 없는 옛 작업은 변경 전과 같다", () => {
  for (const [name, input] of Object.entries(POSTER_CASES)) {
    it(name, () => {
      expect(buildPosterPrompt(input as never)).toBe(baseline[name]);
    });
  }

  it("저장된 첨부 되살리기도 같다", () => {
    const data = { attachmentOrder: ["a", "b", "c"], preservedIds: ["b", "c"], personIds: ["b", "c"], restyledIds: [] };
    expect(restoreAttachments(data, { a: "A", b: "B", c: "C" })).toEqual(baseline.restored);
    expect(promptImagesFrom(restoreAttachments(data, { a: "A", b: "B", c: "C" }))).toEqual(baseline.promptImages);
  });
});

const 고양이 = { kind: "animal" as const, look: "anime" as const, identity: "a small grey tabby cat with a red scarf" };
const 고양이각도 = { kind: "preserved" as const, subject: "person" as const, characterId: "cat", character: 고양이 };

describe("캐릭터를 종류·그림체·생김새대로", () => {
  const prompt = buildPosterPrompt({ slots, size, look: "photoreal", images: [고양이각도, 고양이각도, 고양이각도] });

  it("동물 캐릭터는 PRESERVED CHARACTER 로 부르고 동물로서 지킬 것을 말한다", () => {
    expect(prompt).toContain("Image 1 is a PRESERVED CHARACTER.");
    expect(prompt).toContain("This is the animal character for this image.");
    expect(prompt).not.toContain("PRESERVED PERSON");
  });

  it("같은 캐릭터의 각도라고 한 번 말하고, 「사람이 여럿」 경고는 하지 않는다", () => {
    expect(prompt).toContain("Images of this animal character (3 of them) are the SAME character");
    expect(prompt).not.toContain("Multiple preserved people");
  });

  it("생김새 설명과 그림체 예외를 한 번씩", () => {
    expect(prompt.split("The character's identity: a small grey tabby cat with a red scarf.").length - 1).toBe(1);
    expect(prompt.split("Rendering exception for this animal character").length - 1).toBe(1);
  });

  it("사람 캐릭터의 각도 둘도 같은 사람이라 말하고, 생김새를 보낸다", () => {
    const 민지 = { kind: "preserved" as const, subject: "person" as const, characterId: "m", character: { kind: "person" as const, look: "photoreal" as const, identity: "short black hair" } };
    const two = buildPosterPrompt({ slots, size, images: [민지, 민지] });
    expect(two).toContain(characterAngleDirective(2));
    expect(two).toContain("The person's identity: short black hair.");
    expect(two).not.toContain("Multiple preserved people");
    expect(two).toContain("Image 1 is a PRESERVED PERSON.");
  });

  it("서로 다른 캐릭터 둘이면 지금처럼 한 명만 그리라고 한다", () => {
    const 강아지 = { ...고양이각도, characterId: "dog" };
    expect(buildPosterPrompt({ slots, size, images: [고양이각도, 강아지] })).toContain("Multiple preserved people");
  });
});

describe("저장된 캐릭터 정보를 첨부에 되살린다", () => {
  const data = {
    attachmentOrder: ["a", "b", "c"], preservedIds: ["b", "c"], personIds: ["b"], restyledIds: [],
    characters: { b: { characterId: "cat", ...고양이 }, c: { characterId: "cat", ...고양이 } },
  };

  it("사람(캐릭터) 자리에만 붙인다 — 물건으로 바꾼 자리에는 안 붙인다", () => {
    const restored = restoreAttachments(data, { a: "A", b: "B", c: "C" });
    expect(restored[1]).toMatchObject({ role: "preserve_person", characterId: "cat", character: 고양이 });
    expect(restored[2]).toEqual({ url: "C", role: "preserve_product" });
    expect(restored[0]).toEqual({ url: "A", role: "style" });
  });

  it("프롬프트 그림까지 이어진다 — 미리보기와 생성이 같은 함수를 쓴다", () => {
    const images = promptImagesFrom(restoreAttachments(data, { a: "A", b: "B", c: "C" }));
    expect(images[1]).toMatchObject({ kind: "preserved", subject: "person", characterId: "cat", character: 고양이 });
  });
});
