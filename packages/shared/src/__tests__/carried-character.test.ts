import { describe, expect, it } from "vitest";
import { characterAngleDirective } from "../attachment-role";
import {
  carriedCharacterLabel,
  carriedCharacterRules,
  carriedIdentityLine,
  carriedLookException,
  carriedSubjectNoun,
  type CarriedCharacter,
} from "../carried-character";

/**
 * **캐릭터를 다른 도구로 넘길 때 종류·그림체·생김새를 함께 넘긴다**(2026-10-07 사용자 승인, ③).
 *
 * 전에는 다섯 도구가 캐릭터를 모두 「사람 한 명」으로 설명했다 — 고양이·마스코트는
 * 털 무늬·옷을 지키라는 말을 못 들었고, 실사 상세페이지에서는 애니 캐릭터에도
 * 「진짜 사진이어야 한다」가 걸렸다. 사용자 결정: **캐릭터는 제 그림체를 지킨다.**
 */

const 고양이: CarriedCharacter = { kind: "animal", look: "anime", identity: "a small grey tabby cat with a red scarf" };
const 마스코트: CarriedCharacter = { kind: "character", look: "3d", identity: "a round yellow mascot" };
const 물건: CarriedCharacter = { kind: "object", look: "illustration" };
const 사람: CarriedCharacter = { kind: "person", look: "photoreal", identity: "a woman with short black hair" };

describe("종류별로 지킬 것", () => {
  it("동물은 종·털 무늬·옷을 지키고, 사람이나 다른 동물로 바꾸지 않는다", () => {
    const rules = carriedCharacterRules(고양이).join(" ");
    expect(rules).toMatch(/species/i);
    expect(rules).toMatch(/markings/i);
    expect(rules).toMatch(/outfit/i);
    expect(rules).toMatch(/never turn it into a person/i);
  });

  it("캐릭터는 머리·몸 비율과 윤곽이 디자인이라 사람 비율로 바꾸지 않는다", () => {
    const rules = carriedCharacterRules(마스코트).join(" ");
    expect(rules).toMatch(/head-to-body ratio/i);
    expect(rules).toMatch(/outline/i);
    expect(rules).toMatch(/do not make it realistic or human-proportioned/i);
  });

  it("물건은 제품처럼 모양·색·재질을 지킨다", () => {
    const rules = carriedCharacterRules(물건).join(" ");
    expect(rules).toMatch(/silhouette/i);
    expect(rules).toMatch(/materials/i);
    expect(rules).not.toMatch(/face and facial geometry/i);
  });

  it("사람은 여기서 말하지 않는다 — 각 도구의 지금 인물 문장을 그대로 쓴다", () => {
    expect(carriedCharacterRules(사람)).toEqual([]);
  });

  it("어느 종류든 하나만 그린다", () => {
    for (const character of [고양이, 마스코트, 물건]) {
      expect(carriedCharacterRules(character).join(" ")).toMatch(/exactly one/i);
    }
  });
});

describe("그림체 예외 — 캐릭터는 제 그림체를 지킨다(사용자 결정)", () => {
  it("애니 캐릭터는 사진 속에서도 애니로 남는다", () => {
    const line = carriedLookException(고양이);
    expect(line).toMatch(/anime/i);
    expect(line).toMatch(/even if the rest of the image is a real photograph/i);
    expect(line).toMatch(/do not convert it into a photographic/i);
  });

  it("3D·일러스트도 제 이름으로 말한다", () => {
    expect(carriedLookException(마스코트)).toMatch(/3D/);
    expect(carriedLookException(물건)).toMatch(/illustrat/i);
  });

  it("「이 그림처럼」으로 만든 캐릭터는 제 첨부 그림의 결을 따른다", () => {
    expect(carriedLookException({ kind: "animal", look: "auto" })).toMatch(/as shown in its reference images/i);
  });

  it("실사 캐릭터는 예외가 없다 — 지금과 같다", () => {
    expect(carriedLookException(사람)).toBe("");
    expect(carriedLookException({ kind: "animal", look: "photoreal" })).toBe("");
  });

  it("사람이라도 애니로 만든 캐릭터는 예외를 단다 — 실사 페이지가 사진으로 바꾸면 다른 사람이 된다", () => {
    expect(carriedLookException({ kind: "person", look: "anime" })).toMatch(/anime/i);
  });
});

describe("생김새 설명 한 줄", () => {
  it("사람은 지금 문장 그대로다", () => {
    expect(carriedIdentityLine(사람)).toBe("The person's identity: a woman with short black hair.");
  });

  it("사람이 아니면 캐릭터라고 부른다", () => {
    expect(carriedIdentityLine(고양이)).toBe("The character's identity: a small grey tabby cat with a red scarf.");
  });

  it("설명이 없으면 말하지 않는다", () => {
    expect(carriedIdentityLine(물건)).toBe("");
    expect(carriedIdentityLine({ kind: "animal", look: "anime", identity: "   " })).toBe("");
  });
});

describe("이름표·부르는 말", () => {
  it("사람은 지금처럼 PERSON, 나머지는 CHARACTER", () => {
    expect(carriedCharacterLabel("person")).toBe("PERSON");
    expect(carriedCharacterLabel("animal")).toBe("CHARACTER");
    expect(carriedCharacterLabel("character")).toBe("CHARACTER");
    expect(carriedCharacterLabel("object")).toBe("CHARACTER");
  });

  it("부르는 말", () => {
    expect(carriedSubjectNoun("person")).toBe("person");
    expect(carriedSubjectNoun("animal")).toBe("animal character");
    expect(carriedSubjectNoun("character")).toBe("character");
    expect(carriedSubjectNoun("object")).toBe("object character");
  });
});

describe("여러 각도 문장 — 종류를 안다", () => {
  it("종류를 안 주면 지금 문장과 한 글자도 다르지 않다", () => {
    expect(characterAngleDirective(3, "person")).toBe(characterAngleDirective(3));
  });

  it("사람이 아니면 「사람 하나」라고 하지 않고, 옷·소품은 생김새의 일부라 지킨다", () => {
    const line = characterAngleDirective(4, "animal");
    expect(line).toMatch(/SAME character/i);
    expect(line).not.toMatch(/person/i);
    expect(line).toMatch(/exactly one of it/i);
    expect(line).toMatch(/outfit and accessories are part of its design/i);
    expect(line).not.toMatch(/clothing or backgrounds/i);
  });
});
