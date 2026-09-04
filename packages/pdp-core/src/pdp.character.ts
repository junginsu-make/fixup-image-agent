import {
  type LookSubject,
  imageLookDirective,
  priorityLine,
  userInstructionHead,
  userInstructionTail,
} from "@fixup/shared";
import type { AspectRatio, ImageModelId } from "./types";

/**
 * 캐릭터.
 *
 * 처음에는 상세페이지의 등장인물만 다뤘다. 상세페이지에 사람이 나오면 섹션마다
 * 다른 사람이 나오는 문제를 풀려고 만든 것이다. 그래서 프롬프트가 사람 몸을
 * 못 박고 있었다 — 사람 등신 비율, 모공, 두 눈, 뒷머리 모양.
 *
 * 지금은 동물·캐릭터·사물까지 다룬다. 고양이에게 사람 등신을 요구하고 2등신
 * 캐릭터에게 해부학적 정확성을 요구하면 어긋난다. 그래서 **종류가 몸을 정하고
 * 결이 질감을 정한다**로 나눴다. 「애니풍 사람」과 「실사 동물」이 둘 다
 * 자연스러운 요구라 하나로 묶을 수 없다.
 *
 * 프롬프트의 뿌리는 character-ip-service 다. 실제로 겪어봐야 나오는 문장들이
 * 들어 있다 — 뒷모습에 얼굴을 그리지 말라는 지시 같은 것.
 *
 * 각도는 앞·뒤·좌·우 넷으로 고정한다. 원본은 여섯(45도 좌우와 90도 측면
 * 좌우)이지만, 90도 측면은 얼굴이 반만 보여 정체성 기준으로 쓰기 나쁘다.
 * 그래서 좌·우는 45도로 돌린 시점을 쓴다.
 */

/**
 * 각도 — 여섯 종.
 *
 * 이름에 각도를 적는 이유가 있다. 2026-09 이전에는 `left`·`right` 가 **45도**를
 * 뜻했다. 90도 측면을 더하면서 그 이름을 재활용하면, 마이그레이션을 한 군데라도
 * 빠뜨렸을 때 45도 자료가 90도로 조용히 뒤바뀐다. 이름이 다르면 모르는 값으로
 * 남아 눈에 띈다(→ `migrateAngle`).
 */
export type CharacterAngle =
  | "front"
  | "left_45"
  | "right_45"
  | "left_90"
  | "right_90"
  | "back";

/** 무엇을 만드는가. 몸과 각도 지시가 여기서 갈린다. */
export type CharacterKind = "person" | "animal" | "character" | "object";

/** 어떤 결로 만드는가. 질감과 기본 모델이 여기서 갈린다. */
export type CharacterLook = "photoreal" | "anime" | "3d" | "illustration";

/**
 * 첨부한 그림을 어떻게 쓰는가. **둘은 정반대다.**
 *
 *   style    결만 가져온다. 그 그림의 캐릭터는 베끼지 않는다
 *   extract  그 그림의 캐릭터를 그대로 뽑아낸다. 배경은 버린다
 *
 * 나누지 않으면 모델이 절충한다 — 원본과 닮았지만 다른 것이 나온다.
 */
export type CharacterReferenceRole = "style" | "extract";

export interface CharacterAngleInfo {
  id: CharacterAngle;
  label: string;
  /**
   * 프롬프트에 그대로 들어가는 영어 지시문 — **사람 기준**이다.
   *
   * 다른 종류는 `angleDirective` 로 가져간다. 이 칸을 사람 것으로 남겨 둔 것은
   * 상세페이지가 이 목록을 그대로 쓰기 때문이다.
   */
  directive: string;
}

const PERSON_ANGLE: Record<CharacterAngle, string> = {
  front:
    "a straight-on front view with the head and torso facing the camera, both sides of the " +
    "face equally visible",
  left_45:
    "a subject-left three-quarter view, with the character rotated about 45 degrees toward " +
    "their own left while both eyes remain visible",
  right_45:
    "a subject-right three-quarter view, with the character rotated about 45 degrees toward " +
    "their own right while both eyes remain visible",
  // 90도는 두 눈이 안 보인다. 보인다고 적으면 모델이 억지로 얼굴을 돌린다.
  left_90:
    "a full side profile facing the subject's own left, rotated 90 degrees from the camera, " +
    "with only one side of the face visible and the silhouette clearly readable",
  right_90:
    "a full side profile facing the subject's own right, rotated 90 degrees from the camera, " +
    "with only one side of the face visible and the silhouette clearly readable",
  back:
    "a direct back view with the face fully hidden; accurately preserve the rear hairstyle, " +
    "silhouette, body proportions and outfit construction, and do not place facial features " +
    "on the back of the head",
};

/**
 * 동물은 얼굴 대신 머리와 주둥이로 말한다.
 *
 * 「두 눈이 보이게」를 그대로 쓰면 옆얼굴이 자연스러운 동물에서 억지 구도가
 * 나온다. 뒷모습에서 지켜야 할 것도 머리 모양이 아니라 털 무늬다.
 */
const ANIMAL_ANGLE: Record<CharacterAngle, string> = {
  front:
    "a straight-on front view with the head and muzzle facing the camera, both sides of the " +
    "head equally visible",
  left_45:
    "a subject-left three-quarter view, rotated about 45 degrees toward its own left, with " +
    "the head and muzzle still clearly readable",
  right_45:
    "a subject-right three-quarter view, rotated about 45 degrees toward its own right, with " +
    "the head and muzzle still clearly readable",
  left_90:
    "a full side profile facing the subject's own left, rotated 90 degrees from the camera, " +
    "showing the whole body length and the coat pattern along that side",
  right_90:
    "a full side profile facing the subject's own right, rotated 90 degrees from the camera, " +
    "showing the whole body length and the coat pattern along that side",
  back:
    "a direct back view from behind; accurately preserve the fur pattern, coat colours, tail " +
    "shape and body silhouette, and do not show the muzzle or eyes from this angle",
};

/**
 * 사물은 얼굴이 없다.
 *
 * 뒤통수에 얼굴을 그리지 말라는 지시가 물건에 가면 모델이 얼굴을 떠올린다.
 * 그 이야기를 아예 하지 않는다.
 */
const OBJECT_ANGLE: Record<CharacterAngle, string> = {
  front: "a straight-on front view of the object, its front surface facing the camera",
  left_45: "a three-quarter view rotated about 45 degrees to show the front and left side together",
  right_45: "a three-quarter view rotated about 45 degrees to show the front and right side together",
  left_90: "a flat side view of the object's left side, rotated 90 degrees from the camera",
  right_90: "a flat side view of the object's right side, rotated 90 degrees from the camera",
  back: "a direct rear view showing the back surface; preserve the silhouette, materials and construction",
};

const ANGLE_BY_KIND: Record<CharacterKind, Record<CharacterAngle, string>> = {
  person: PERSON_ANGLE,
  // 캐릭터도 얼굴이 있다. 사람과 같은 각도 지시를 쓴다 — 다른 것은 몸 비율이다.
  character: PERSON_ANGLE,
  animal: ANIMAL_ANGLE,
  object: OBJECT_ANGLE,
};

/**
 * 앞·좌·우·뒤 순서다. 이 순서가 곧 화면과 라이브러리의 순서이므로
 * 정면이 맨 앞이어야 한다 — 목록 표지와 첫 장이 정면으로 잡힌다.
 */
export const CHARACTER_ANGLES: CharacterAngleInfo[] = [
  { id: "front", label: "정면", directive: PERSON_ANGLE.front },
  { id: "left_45", label: "왼쪽 45°", directive: PERSON_ANGLE.left_45 },
  { id: "right_45", label: "오른쪽 45°", directive: PERSON_ANGLE.right_45 },
  { id: "left_90", label: "왼쪽", directive: PERSON_ANGLE.left_90 },
  { id: "right_90", label: "오른쪽", directive: PERSON_ANGLE.right_90 },
  { id: "back", label: "뒷면", directive: PERSON_ANGLE.back },
];

/**
 * 정면 말고 기본으로 켜 두는 각도.
 *
 * 넷이 예전 기본값이고 대부분의 쓰임에 충분하다. 90도 측면은 얼굴이 반만
 * 보여 정체성 기준으로 쓰기 나쁘므로 필요할 때만 켠다.
 */
export const DEFAULT_EXTRA_ANGLES: CharacterAngle[] = ["left_45", "right_45", "back"];

/**
 * 옛 각도 이름을 지금 이름으로.
 *
 * 2026-09 이전 자료는 `left`·`right` 가 45도를 뜻했고, 그 전에는 파일 이름이
 * `three_quarter` 였다. 그 뜻 그대로 옮긴다.
 *
 * **모르는 이름은 그대로 돌려준다.** 조용히 정면으로 바꾸면 없던 정면이
 * 둘이 되고, 어느 쪽이 진짜인지 알 수 없게 된다.
 */
const OLD_ANGLE: Record<string, CharacterAngle> = {
  left: "left_45",
  right: "right_45",
  three_quarter: "left_45",
};

export function migrateAngle(angle: string): string {
  return OLD_ANGLE[angle] ?? angle;
}

/** 종류에 맞는 각도 지시. 종류를 안 주면 사람으로 본다. */
export function angleDirective(angle: CharacterAngle, kind: CharacterKind = "person"): string {
  return (ANGLE_BY_KIND[kind] ?? PERSON_ANGLE)[angle] ?? PERSON_ANGLE.front;
}

/** 세로 비율은 전신이 들어가야 한다. 억지로 욱여넣으면 신체 비율이 깨진다. */
const TALL_ASPECTS: AspectRatio[] = ["9:16", "3:4"];

/**
 * 구도.
 *
 * 사람과 캐릭터의 차이는 **등신 비율을 강제하느냐**다. 2등신 캐릭터에
 * `anatomically correct human proportions` 를 요구하면 캐릭터가 사람이 된다.
 */
function framingDirective(aspectRatio: AspectRatio, kind: CharacterKind) {
  const tall = TALL_ASPECTS.includes(aspectRatio);
  const visible =
    " Keep the primary identifying features clearly visible and in sharp focus.";

  if (kind === "object") {
    return " Show the whole object inside the frame, with no hands, no people and no props." + visible;
  }

  if (kind === "animal") {
    return tall
      ? " Compose the whole body from head to tail with all paws inside the frame, keeping " +
        "natural proportions for this species; never compress or foreshorten the body." + visible
      : " Compose the animal to fit this aspect ratio cleanly — typically a head-and-shoulders " +
        "or upper-body view — keeping natural proportions for this species." + visible
  }

  if (kind === "character") {
    return tall
      ? " Compose a full-length view from head to toe with the feet inside the frame. Keep the " +
        "character's own stylised proportions consistent throughout; do not redraw it with " +
        "realistic human anatomy." + visible
      : " Compose the character to fit this aspect ratio cleanly — typically a head-to-waist or " +
        "three-quarter view. Keep the character's own stylised proportions consistent; do not " +
        "redraw it with realistic human anatomy." + visible;
  }

  return tall
    ? " Compose a full-length view from head to toe with the feet inside the frame, keeping " +
      "natural, anatomically correct body proportions and realistic limb length; never " +
      "compress, shorten or foreshorten the figure to fit the frame." + visible
    : " Compose the character to fit this aspect ratio cleanly — typically a head-to-waist or " +
      "three-quarter view — with natural, anatomically correct body proportions; never squeeze " +
      "a full standing figure into the frame or compress the figure." + visible;
}

/**
 * 결이 정하는 질감.
 *
 * 모공 지시는 **사람이고 실사일 때만** 넣는다. 보정 티가 나면 상세페이지에서
 * 바로 가짜로 보이지만, 고양이에게 사람 모공을 요구하면 그것대로 이상해진다.
 */
/**
 * 결 지시문은 이제 `@fixup/shared` 것을 쓴다.
 *
 * 캐릭터만 결을 고르던 시절에는 여기 있는 것이 맞았다. 지금은 다섯 도구가
 * 다 고른다 — 같은 「실사」인데 도구마다 다른 그림이 나오면 도구를 못 믿는다.
 *
 * 실사 문구는 2026-09-04 실측으로 한 번 더 다듬어졌다. 여기서 바꾸지 말고
 * `packages/shared/src/image-look.ts` 에서 바꾼다.
 */
function lookDirective(look: CharacterLook, kind: CharacterKind) {
  const subject: LookSubject = kind === "person" || kind === "animal" ? kind : "generic";
  return ` ${imageLookDirective(look, subject)}`;
}

/**
 * 첨부한 그림을 어떻게 쓸지 못 박는다.
 *
 * 아무 말도 안 하면 모델은 참조를 「비슷하게」 다룬다. 그러면 결만 가져오려 해도
 * 그 캐릭터가 따라오고, 그 캐릭터를 뽑아내려 해도 다른 것이 섞인다.
 */
function referenceDirective(role: CharacterReferenceRole, kind: CharacterKind) {
  const noun = kind === "object" ? "object" : "character";
  if (role === "extract") {
    return (
      ` The supplied reference image contains this ${noun}. Reproduce the same character` +
      ` exactly — same face or head shape, same proportions, same outfit or markings and the` +
      " same colour palette. Remove the original background and everything else in the image;" +
      " place the subject alone on a plain neutral background."
    );
  }
  return (
    " The supplied reference image is a STYLE reference. Imitate only its rendering style," +
    " line quality, shading, colour palette and overall finish." +
    ` Do not copy the ${noun} in it — its face, silhouette, outfit, markings and props are not` +
    " yours to reuse. Create a new subject that matches the description below."
  );
}

/**
 * 옛 호출과 새 호출을 함께 받는다.
 *
 * 상세페이지(`/create`)가 아직 `photoreal: boolean` 으로 부른다. 그쪽을 같이
 * 고치면 이 변경 하나에 상세페이지까지 얽힌다. 종류·결을 안 주면 사람으로
 * 떨어뜨려 지금까지와 똑같이 동작하게 둔다.
 */
function resolve(input: { kind?: CharacterKind; look?: CharacterLook; photoreal?: boolean }) {
  return {
    kind: input.kind ?? "person",
    look: input.look ?? (input.photoreal === false ? "illustration" : "photoreal"),
  };
}

/**
 * 네 장이 한 벌로 보이려면 배경이 같아야 한다.
 *
 * 각도 3장은 늘 이 배경으로 만든다. 후보(정면)에만 이 문장이 없어서, 정면은
 * 어딘가의 장면 속에 있고 나머지 셋은 무배경으로 나오는 일이 생겼다.
 */
const PLAIN_BACKGROUND = " Place the subject alone on a plain neutral background.";

/**
 * 후보 — **정면이다.**
 *
 * 고른 후보를 그대로 「정면」으로 저장하고, 나머지 세 각도를 그것을 참조로
 * 만든다. 그런데 여기에 각도 지시가 없었다. 모델이 3/4 뷰나 옆모습을 그리면
 * 정면이 정면이 아닌 채로 나머지 셋의 기준이 되고, 네 장이 한 벌로 안 보인다.
 * 각도 지시는 `buildTurnaroundPrompt` 와 같은 표에서 가져온다.
 */
export function buildCandidatePrompt(input: {
  description: string;
  aspectRatio: AspectRatio;
  kind?: CharacterKind;
  look?: CharacterLook;
  /** 첨부한 그림이 있을 때만. 없으면 첨부 이야기를 아예 하지 않는다. */
  referenceRole?: CharacterReferenceRole;
  /** 옛 호출. `look` 이 있으면 무시된다. */
  photoreal?: boolean;
}) {
  const { kind, look } = resolve(input);
  const noun = kind === "object" ? "object" : "character";
  return (
    // 사용자가 친 말이 **맨 앞**이다. 종류·결은 고르는 값이고 이것은 직접 친
    // 말이라, 둘이 부딪히면 친 말이 이겨야 한다. 「수채화풍으로」라고 적었는데
    // 결이 사진에 머물러 있으면 적은 말이 무시된 것으로 보인다.
    //
    // 반대로 친 말에 없는 것은 고른 값이 그대로 간다 — 결·종류·비율 지시는
    // 아래에 그대로 남아 있다.
    `${userInstructionHead(input.description)}

` +
    `Create exactly one original fictional ${noun}. Preserve the identity-defining ` +
    `traits from the USER INSTRUCTION above consistently. Do not add a second ${noun}.` +
    (input.referenceRole ? referenceDirective(input.referenceRole, kind) : "") +
    ` Show it as ${angleDirective("front", kind)}.` +
    PLAIN_BACKGROUND +
    lookDirective(look, kind) +
    // 첨부가 있을 때만 순위를 밝힌다. 없는데 「레퍼런스보다 세다」고 말하면
    // 모델이 있지도 않은 첨부를 찾는다.
    (input.referenceRole
      ? ` ${priorityLine({ hasUserInstruction: true, hasPreserved: input.referenceRole === "extract" })}`
      : "") +
    // 다시 못 박는 자리는 구도 **바로 앞**이다. 맨 뒤가 더 세지만, 구도를 맨
    // 뒤에 두는 것은 2026-09-04 실측으로 정한 것이라 그 자리를 뺏지 않는다 —
    // 결 지시를 길게 붙였더니 앞쪽 구도 지시가 밀려 전신으로 뽑으라는 말이
    // 무시됐다(발이 프레임 밖으로 나갔다).
    ` ${userInstructionTail(input.description)}` +
    framingDirective(input.aspectRatio, kind)
  );
}

/** 고른 후보를 기준으로 다른 각도를 만든다. 참조 이미지로 그 후보를 함께 보낸다. */
export function buildTurnaroundPrompt(input: {
  identityPrompt: string;
  angle: CharacterAngle;
  kind?: CharacterKind;
  look?: CharacterLook;
  photoreal?: boolean;
}) {
  const { kind, look } = resolve(input);
  const noun = kind === "object" ? "object" : "character";
  const identity = kind === "object"
    ? "shape, proportions, materials, colours and markings"
    : "face, body proportions, hairstyle, outfit and colour palette";
  return (
    `The supplied reference image shows this ${noun}. Generate the same ${noun} as ` +
    `${angleDirective(input.angle, kind)}. Preserve the same ${identity} exactly. ` +
    `Identity description: ${input.identityPrompt}. ` +
    `Generate exactly one ${noun}.` + PLAIN_BACKGROUND +
    lookDirective(look, kind)
  );
}

/**
 * 섹션 구성에 어울리는 각도를 고른다.
 *
 * 캐릭터 4종을 모두 보내면 참조가 늘어 서로를 희석시킨다 — 앵커와 스타일
 * 레퍼런스 둘만으로도 절충이 일어나는 것을 실측했다. 그래서 한 장만 보낸다.
 */
export function pickAngleForSection(layoutNotes: string): CharacterAngle {
  const text = layoutNotes.toLowerCase();

  if (/뒷모습|뒤돌아|뒤에서|behind|back view|walking away|from behind/.test(text)) {
    return "back";
  }
  if (/정면|클로즈업|close-?up|portrait|facing camera|straight-on/.test(text)) {
    return "front";
  }
  // 오른쪽을 보고 선 장면. 왼쪽에 여백이 생겨 글자를 앉히기 좋다.
  if (/오른쪽|우측|right side|facing right/.test(text)) {
    return "right_45";
  }
  // 그 밖의 사용 장면은 좌측 45도가 자연스럽다. 두 눈이 보여 얼굴이 남는다.
  return "left_45";
}

/**
 * 섹션 생성 프롬프트에 덧붙일 지시.
 *
 * 캐릭터와 스타일 레퍼런스가 인물을 두고 다툰다. 정해주지 않으면 모델이
 * 절충하는데 그 절충이 얼굴을 바꾼다. 역할을 나눠 못 박는다 —
 * 얼굴은 캐릭터, 색·서체·구성은 스타일 레퍼런스.
 */
export function buildSceneWithCharacterDirective(input: {
  identityPrompt: string;
  hasStyleReference: boolean;
}) {
  const lines = [
    "One of the supplied reference images is the character identity anchor.",
    "Preserve that person's face, facial geometry, body proportions, hairstyle and skin tone " +
      "exactly. The identity anchor overrides conflicting scene instructions.",
    `Identity description: ${input.identityPrompt}.`,
  ];

  if (input.hasStyleReference) {
    lines.push(
      "The style reference governs colour palette, typography, composition and mood — but it " +
        "must never change the character's face or likeness.",
    );
  }

  lines.push("Pose, expression, clothing and background may change. Generate exactly one character.");
  return lines.join(" ");
}

/**
 * 결에 맞는 기본 모델.
 *
 * **비용보다 품질이 먼저다.** 그래서 값이 싸다는 이유로는 기본값을 바꾸지
 * 않는다 — 지금 여기 적힌 둘은 이 저장소가 실측으로 골라 온 상위 모델이다.
 *
 *   실사   Nano Banana Pro — 실사 인물에서 낫다는 것이 원본의 결론이다
 *   나머지 GPT Image 2 — 측정된 모델 중 표현 폭이 가장 넓다
 *
 * Seedream 5.0 Pro 와 Qwen Image 2.0 Pro 도 고를 수 있게 붙였다. 각각
 * 다중 참조 정체성 유지와 화풍 전이에 맞춰진 모델이고 값도 절반 아래지만,
 * **우리 쓰임에서 나은지는 아직 재지 않았다.** 재기 전에 기본값으로 올리면
 * 품질을 값과 맞바꾸는 셈이 된다. 화면에서 같은 캐릭터를 둘로 만들어 비교한
 * 뒤, 나은 것이 확인되면 이 표 한 줄만 바꾸면 된다.
 *
 * 옛 호출이 `boolean` 을 넘긴다. 같이 받는다.
 */
const MODEL_BY_LOOK: Record<CharacterLook, ImageModelId> = {
  photoreal: "nano-banana-pro",
  anime: "gpt-image-2",
  "3d": "gpt-image-2",
  illustration: "gpt-image-2",
};

export function selectCharacterModel(look: CharacterLook | boolean): ImageModelId {
  if (typeof look === "boolean") return look ? "nano-banana-pro" : "gpt-image-2";
  return MODEL_BY_LOOK[look] ?? "gpt-image-2";
}
