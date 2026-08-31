import type { AspectRatio, ImageModelId } from "./types";

/**
 * 상세페이지에 쓸 캐릭터.
 *
 * 지금은 상세페이지에 사람이 나오면 섹션마다 다른 사람이다. 따로 생성되니
 * 1번 섹션의 인물과 4번 섹션의 인물이 남남이고, 사용자가 고를 수도 없다.
 * 인물을 먼저 만들어 고정해두면 그 사람이 페이지 내내 나온다.
 *
 * 프롬프트는 character-ip-service 에서 옮겨왔다. 실제로 겪어봐야 나오는
 * 문장들이 들어 있다 — 뒷모습에 얼굴을 그리지 말라는 지시 같은 것.
 *
 * 각도는 앞·뒤·좌·우 넷으로 고정한다. 원본은 여섯(45도 좌우와 90도 측면
 * 좌우)이지만, 90도 측면은 얼굴이 반만 보여 정체성 기준으로 쓰기 나쁘다.
 * 그래서 좌·우는 45도로 돌린 시점을 쓴다 — 두 눈이 모두 보여 섹션 생성에서
 * 얼굴이 유지된다.
 */

export type CharacterAngle = "front" | "left" | "right" | "back";

export interface CharacterAngleInfo {
  id: CharacterAngle;
  label: string;
  /** 프롬프트에 그대로 들어가는 영어 지시문. */
  directive: string;
}

/**
 * 앞·좌·우·뒤 순서다. 이 순서가 곧 화면과 라이브러리의 순서이므로
 * 정면이 맨 앞이어야 한다 — 목록 표지와 첫 장이 정면으로 잡힌다.
 */
export const CHARACTER_ANGLES: CharacterAngleInfo[] = [
  {
    id: "front",
    label: "정면",
    directive:
      "a straight-on front view with the head and torso facing the camera, both sides of the " +
      "face equally visible",
  },
  {
    id: "left",
    label: "좌측",
    directive:
      "a subject-left three-quarter view, with the character rotated about 45 degrees toward " +
      "their own left while both eyes remain visible",
  },
  {
    id: "right",
    label: "우측",
    directive:
      "a subject-right three-quarter view, with the character rotated about 45 degrees toward " +
      "their own right while both eyes remain visible",
  },
  {
    id: "back",
    label: "뒷모습",
    directive:
      "a direct back view with the face fully hidden; accurately preserve the rear hairstyle, " +
      "silhouette, body proportions and outfit construction, and do not place facial features " +
      "on the back of the head",
  },
];

/** 세로 비율은 전신이 들어가야 한다. 억지로 욱여넣으면 신체 비율이 깨진다. */
const TALL_ASPECTS: AspectRatio[] = ["9:16", "3:4"];

function framingDirective(aspectRatio: AspectRatio) {
  if (TALL_ASPECTS.includes(aspectRatio)) {
    return (
      " Compose a full-length view from head to toe with the feet inside the frame, keeping " +
      "natural, anatomically correct body proportions and realistic limb length; never " +
      "compress, shorten or foreshorten the figure to fit the frame. Keep the face and " +
      "primary identifying features clearly visible and in sharp focus."
    );
  }
  return (
    " Compose the character to fit this aspect ratio cleanly — typically a head-to-waist or " +
    "three-quarter view — with natural, anatomically correct body proportions; never squeeze " +
    "a full standing figure into the frame or compress the figure. Keep the face and primary " +
    "identifying features clearly visible and in sharp focus."
  );
}

/**
 * 실사 인물의 피부.
 *
 * 보정 티가 나면 상세페이지에서 바로 가짜로 보인다. 실사가 아니면 넣지 않는다 —
 * 일러스트에 모공을 요구하면 이상해진다.
 */
function skinDirective(photoreal: boolean) {
  if (!photoreal) return "";
  return (
    " Render believable unretouched human skin with visible fine pores, subtle vellus hair, " +
    "gentle local skin-tone variation, faint natural blemishes, realistic under-eye and lip " +
    "texture, and physically plausible highlights. Avoid beauty filters, airbrushing, " +
    "porcelain, waxy or plastic skin, excessive smoothing, CGI skin and artificially " +
    "exaggerated pores."
  );
}

export function buildCandidatePrompt(input: {
  description: string;
  aspectRatio: AspectRatio;
  photoreal: boolean;
}) {
  return (
    "Create exactly one original fictional character. Preserve these identity-defining " +
    `traits consistently: ${input.description}. Do not add a second character.` +
    framingDirective(input.aspectRatio) +
    skinDirective(input.photoreal)
  );
}

/** 고른 후보를 기준으로 다른 각도를 만든다. 참조 이미지로 그 후보를 함께 보낸다. */
export function buildTurnaroundPrompt(input: {
  identityPrompt: string;
  angle: CharacterAngle;
  photoreal: boolean;
}) {
  const angle = CHARACTER_ANGLES.find((entry) => entry.id === input.angle) ?? CHARACTER_ANGLES[0];
  return (
    "The supplied reference image shows this character. Generate the same character as " +
    `${angle.directive}. Preserve the same person's face, body proportions, hairstyle, ` +
    `outfit and colour palette exactly. Identity description: ${input.identityPrompt}. ` +
    "Generate exactly one character on a plain neutral background." +
    skinDirective(input.photoreal)
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
 * 캐릭터 생성에 쓸 모델.
 *
 * 실사 인물은 Nano Banana Pro 가 낫다는 것이 원본의 결론이다. 우리는 원본과
 * 달리 Seedream 을 쓰지 않으므로, 실사가 아니어도 우리가 가진 모델 안에서 고른다.
 */
export function selectCharacterModel(photoreal: boolean): ImageModelId {
  return photoreal ? "nano-banana-pro" : "gpt-image-2";
}
