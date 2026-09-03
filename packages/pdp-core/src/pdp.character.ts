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

export type CharacterAngle = "front" | "left" | "right" | "back";

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
  left:
    "a subject-left three-quarter view, with the character rotated about 45 degrees toward " +
    "their own left while both eyes remain visible",
  right:
    "a subject-right three-quarter view, with the character rotated about 45 degrees toward " +
    "their own right while both eyes remain visible",
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
  left:
    "a subject-left three-quarter view, rotated about 45 degrees toward its own left, with " +
    "the head and muzzle still clearly readable",
  right:
    "a subject-right three-quarter view, rotated about 45 degrees toward its own right, with " +
    "the head and muzzle still clearly readable",
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
  left: "a three-quarter view rotated about 45 degrees to show the front and left side together",
  right: "a three-quarter view rotated about 45 degrees to show the front and right side together",
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
  { id: "left", label: "좌측", directive: PERSON_ANGLE.left },
  { id: "right", label: "우측", directive: PERSON_ANGLE.right },
  { id: "back", label: "뒷모습", directive: PERSON_ANGLE.back },
];

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
    return (
      " Show the whole object inside the frame against a plain neutral background, with no " +
      "hands, no people and no props." + visible
    );
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
function lookDirective(look: CharacterLook, kind: CharacterKind) {
  if (look === "photoreal") {
    if (kind === "person") {
      return (
        " Render believable unretouched human skin with visible fine pores, subtle vellus hair, " +
        "gentle local skin-tone variation, faint natural blemishes, realistic under-eye and lip " +
        "texture, and physically plausible highlights. Avoid beauty filters, airbrushing, " +
        "porcelain, waxy or plastic skin, excessive smoothing, CGI skin and artificially " +
        "exaggerated pores."
      );
    }
    if (kind === "animal") {
      return (
        " Render photographic realism with individual fur strands, natural coat sheen and " +
        "physically plausible light. Avoid a plush-toy or CGI look."
      );
    }
    return (
      " Render photographic realism with believable material surfaces, fine texture detail and " +
      "physically plausible light."
    );
  }

  if (look === "anime") {
    return (
      " Render in a clean anime / cel-shaded style: flat colour areas, crisp line art, simple " +
      "shadow shapes and a limited palette. No photographic texture."
    );
  }

  if (look === "3d") {
    return (
      " Render as a polished 3D character render with soft global illumination, physically " +
      "based materials and gently rounded forms, like a modern animated feature."
    );
  }

  return (
    " Render as a hand-drawn illustration with visible brush or ink strokes, slightly uneven " +
    "line weight and painted texture. No photographic realism."
  );
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
    `Create exactly one original fictional ${noun}. Preserve these identity-defining ` +
    `traits consistently: ${input.description}. Do not add a second ${noun}.` +
    (input.referenceRole ? referenceDirective(input.referenceRole, kind) : "") +
    framingDirective(input.aspectRatio, kind) +
    lookDirective(look, kind)
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
    `Generate exactly one ${noun} on a plain neutral background.` +
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
    return "right";
  }
  // 그 밖의 사용 장면은 좌측 45도가 자연스럽다. 두 눈이 보여 얼굴이 남는다.
  return "left";
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
 * 기본 모델.
 *
 * 실사는 Nano Banana Pro 가 낫다는 것이 원본의 결론이다. 나머지 결은
 * GPT Image 2 를 쓴다. **기본값일 뿐 화면에서 바꿀 수 있다.**
 *
 * 옛 호출이 `boolean` 을 넘긴다. 같이 받는다.
 */
export function selectCharacterModel(look: CharacterLook | boolean): ImageModelId {
  const photoreal = typeof look === "boolean" ? look : look === "photoreal";
  return photoreal ? "nano-banana-pro" : "gpt-image-2";
}
