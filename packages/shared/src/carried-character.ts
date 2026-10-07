import type { ImageLook } from "./image-look";

/**
 * **캐릭터를 다른 도구로 넘길 때 함께 넘기는 말**(2026-10-07 사용자 승인, ③).
 *
 * 캐릭터 만들기는 종류(사람·동물·캐릭터·물건)와 그림체를 고르게 하고 생김새를
 * 정리해 둔다. 그런데 상세페이지·리디자인·카드뉴스·이미지 만들기는 붙은 캐릭터를
 * 모두 「사람 한 명」으로 설명했다 — 고양이·마스코트는 털 무늬·옷을 지키라는 말을
 * 못 들었고, 실사 상세페이지에서는 애니 캐릭터에도 「진짜 사진이어야 한다」가 걸렸다.
 *
 * 다섯 도구가 이 문장을 같이 쓴다. 도구마다 다르게 말하면 같은 캐릭터가 도구마다
 * 다르게 나온다.
 *
 * **사람 + 실사는 아무것도 바꾸지 않는다.** 그 경우는 지금 잘 되고 있고, 각 도구가
 * 이미 자기 인물 문장을 갖고 있다.
 */

/** 캐릭터 만들기의 종류(`pdp-core` 의 `CharacterKind`)와 같은 값. 이 꾸러미는 그쪽을 못 본다. */
export type CarriedCharacterKind = "person" | "animal" | "character" | "object";

export interface CarriedCharacter {
  kind: CarriedCharacterKind;
  /** 캐릭터를 만든 그림체. 페이지의 그림체와 다를 수 있다. */
  look: ImageLook;
  /** 정리해 둔 생김새(영어). 옛 캐릭터는 비어 있을 수 있다. */
  identity?: string;
}

const KINDS: readonly CarriedCharacterKind[] = ["person", "animal", "character", "object"];

/**
 * 저장된 종류 값을 정리한다. **모르는 값은 사람으로**(2026-10-07 독립 리뷰).
 *
 * 운영 DB 는 제약이 막지만 로컬 저장소는 아니다. 모르는 값이 그대로 가면 상세페이지는
 * 사람 문장에 CHARACTER 이름표를, 리디자인은 지킬 것 없는 문장을 냈다.
 */
export function carriedKindOf(value: unknown): CarriedCharacterKind {
  return KINDS.includes(value as CarriedCharacterKind) ? (value as CarriedCharacterKind) : "person";
}

const NOUN: Record<CarriedCharacterKind, string> = {
  person: "person",
  animal: "animal character",
  character: "character",
  object: "object character",
};

/** 문장 안에서 부르는 말. 사람은 지금처럼 「person」이다. 모르는 값은 「character」. */
export function carriedSubjectNoun(kind: CarriedCharacterKind): string {
  return NOUN[kind] ?? "character";
}

/** 첨부 번호 옆 이름표. 사람은 지금처럼 PERSON 이다. */
export function carriedCharacterLabel(kind: CarriedCharacterKind): "PERSON" | "CHARACTER" {
  return kind === "person" ? "PERSON" : "CHARACTER";
}

/*
 * 「나오면 이것이어야 한다」로 적는다. 「이것이 나온다」고 단정하면 제품 클로즈업처럼
 * 캐릭터를 부르지 않는 장면과 부딪힌다(상세페이지 인물 문장과 같은 까닭).
 */
const RULES: Record<Exclude<CarriedCharacterKind, "person">, string[]> = {
  animal: [
    "This is the animal character for this image. Whenever it appears, it must be recognisably this same animal:",
    "  · species and breed, body proportions and head shape, fur or feather colours, all markings and patterns, eye colour",
    "  · any outfit or accessory it wears — they are part of its design",
    "Do not swap it for a different animal or a generic one, and never turn it into a person.",
  ],
  character: [
    "This is the stylised character (mascot) for this image. Whenever it appears, it must be recognisably this same character:",
    "  · head-to-body ratio, silhouette and outline, face design, colours and markings",
    "  · outfit and accessories — they are part of its design",
    "Its proportions are part of its design: do not make it realistic or human-proportioned, and never turn it into a person.",
  ],
  object: [
    "This is an object character for this image. Whenever it appears, reproduce this exact object:",
    "  · silhouette and proportions, colours, materials and surface finish",
    "  · any face, marks, labels or text drawn on it",
    "Never redesign it, and never turn it into a person or an animal.",
  ],
};

const COMMON_TAIL = "Its pose, expression and framing follow the scene description. Draw exactly one of it.";

/**
 * 종류별로 지킬 것. **사람이면 빈 목록** — 각 도구의 인물 문장을 그대로 쓴다.
 */
export function carriedCharacterRules(character: CarriedCharacter): string[] {
  if (character.kind === "person") return [];
  // 모르는 종류(로컬 저장소의 옛 값 등)로 그림 만들기가 멈추면 안 된다 — 사람 문장으로 둔다.
  const rules = RULES[character.kind as Exclude<CarriedCharacterKind, "person">];
  return rules ? [...rules, COMMON_TAIL] : [];
}

const LOOK_NAME: Record<Exclude<ImageLook, "photoreal" | "auto">, string> = {
  anime: "anime style (clean line art and cel shading)",
  "3d": "3D animation style (stylised rendered character)",
  illustration: "hand-drawn illustration style",
};

/**
 * **그림체 예외**(사용자 결정 2026-10-07: 실사 페이지에서도 캐릭터 그림체 유지).
 *
 * 실사 상세페이지는 「진짜 사진, 3D·일러스트 금지」를 두 번 말한다. 애니 캐릭터에
 * 그 말이 걸리면 사진 속 진짜 고양이가 되어 다른 캐릭터가 된다. 캐릭터만 빼 준다.
 * 실사 캐릭터는 예외가 필요 없다 — 빈 문자열.
 *
 * **「참고 그림 따라 만들기」(`auto`)는 그림체를 모른다**(2026-10-07 독립 리뷰). 진짜
 * 사진을 붙여 만든 사람 캐릭터도 `auto` 다 — 거기에 「사진으로 바꾸지 마라」를 붙이면
 * 지금 잘 되는 사람이 그림처럼 나온다. 그래서 사람 + `auto` 는 지금 그대로(빈 문자열),
 * 사람이 아니면 「참고 그림이 그림이면 그림으로, 사진이면 사진으로」라고만 말한다.
 */
export function carriedLookException(character: CarriedCharacter): string {
  if (character.look === "photoreal") return "";
  const noun = carriedSubjectNoun(character.kind);
  if (character.look === "auto") {
    if (character.kind === "person") return "";
    return (
      `Rendering note for this ${noun}: keep the rendering style shown in its reference images. ` +
      "If they are drawings or 3D renders, keep it that way even if the rest of the image is a real photograph; " +
      "if they are photographs, keep it photographic."
    );
  }
  const style = LOOK_NAME[character.look];
  if (!style) return "";
  return (
    `Rendering exception for this ${noun}: keep it drawn in its own ${style}, exactly as in its reference images, ` +
    "even if the rest of the image is a real photograph. Do not convert it into a photographic or real-life version — " +
    "that would make it a different character. Light and place it so it sits naturally in the scene."
  );
}

/**
 * **「그림 느낌만 바꾸기」를 고른 캐릭터**(사용자 결정 2026-10-07: 사용자 선택이 이긴다).
 *
 * 캐릭터는 원래 제 그림체를 지키지만, 사람이 직접 다시 그려 달라고 골랐으면 그쪽이다.
 * 생김새(무늬·옷·비율)는 지키고 그리는 방식만 장면을 따른다. 그림체 예외는 함께 보내지 않는다.
 */
export const carriedRestyleLine =
  "Redraw it in the rendering style described elsewhere in this prompt — only the drawing medium changes; " +
  "its design (markings, outfit, proportions, colours) must stay recognisable.";

/**
 * 정리해 둔 생김새 한 줄. 없으면 빈 문자열.
 *
 * **사람은 지금 문장과 글자 하나까지 같다** — 앞뒤 빈칸도 자르지 않는다(2026-10-07
 * 독립 리뷰). 고정값 비교: `pdp-core/src/pdp.character-carry-baseline.test.ts`.
 */
export function carriedIdentityLine(character: CarriedCharacter): string {
  if (character.kind === "person") {
    return character.identity ? `The person's identity: ${character.identity}.` : "";
  }
  const identity = character.identity?.trim();
  return identity ? `The character's identity: ${identity}.` : "";
}
