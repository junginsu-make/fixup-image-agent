/**
 * **그림 모델의 회원용 이름과 설명 — 정본은 여기 하나다**(2026-10-08 사용자 결정).
 *
 * 그동안 이름이 세 군데(sns-core·pdp-core·상세페이지 목록)에 따로 적혀 같은 말이
 * 다른 모델을 가리켰다(「정밀형」이 셋). 이제 목록들은 이름을 여기서 받는다.
 *
 * **숨긴 모델도 지우지 않는다.** 저장된 작업이 그 id 를 들고 있다. 고르는
 * 화면에만 안 보이고, 이름은 「이전 방식」으로 읽힌다.
 *
 * 실제 모델 이름은 적지 않는다 — 회원 화면 검사(`model-name.test.ts`)가 이
 * 폴더도 훑는다.
 */
export interface ImageModelName {
  id: string;
  name: string;
  /** 마우스를 올리면 보이는 한 문장. 다른 모델과 견주지 않는다. */
  summary: string;
  /** 이름 옆 괄호에 들어갈 짧은 말. 숨긴 모델은 빈 문자열. */
  strength: string;
  visible: boolean;
}

export const RETIRED_MODEL_NAME = "이전 방식";

const retired = (id: string): ImageModelName => ({ id, name: RETIRED_MODEL_NAME, summary: "", strength: "", visible: false });

export const IMAGE_MODEL_NAMES: readonly ImageModelName[] = [
  {
    id: "gpt-image-2.5-flare",
    name: "표준형",
    summary: "어떤 그림이든 고르게 잘 만드는 기본 모델입니다. 특히 글자가 많은 그림에서 한글을 정확하게 그립니다.",
    strength: "글자가 많은 그림의 한글",
    visible: true,
  },
  {
    id: "nano-banana-pro",
    name: "디테일형",
    summary: "질감과 인물 표현이 섬세합니다. 특히 여러 장에서 같은 인물을 일관되게 유지하는 데 뛰어납니다.",
    strength: "질감과 인물 표현, 같은 인물 유지",
    visible: true,
  },
  {
    id: "nano-banana-2.1",
    name: "속도형",
    summary: "고른 품질로 그림을 만들고, 특히 여러 장을 빠르게 만드는 데 뛰어납니다. 참고 그림을 많이 받을 수 있습니다.",
    strength: "여러 장을 빠르게",
    visible: true,
  },
  retired("gpt-image-2.5-sunburst"),
  retired("gpt-image-2"),
  retired("nano-banana-2"),
  retired("nano-banana"),
  retired("seedream-5-pro"),
  retired("qwen-image-2-pro"),
];

const BY_ID = new Map(IMAGE_MODEL_NAMES.map((entry) => [entry.id, entry] as const));

export const VISIBLE_IMAGE_MODEL_IDS: readonly string[] = IMAGE_MODEL_NAMES.filter((entry) => entry.visible).map((entry) => entry.id);

export function imageModelName(id: string | null | undefined): string {
  if (!id) return "—";
  return BY_ID.get(id)?.name ?? RETIRED_MODEL_NAME;
}

export function imageModelSummary(id: string): string {
  return BY_ID.get(id)?.summary ?? "";
}

export function imageModelStrength(id: string): string {
  return BY_ID.get(id)?.strength ?? "";
}

export function isVisibleImageModel(id: string | null | undefined): boolean {
  return id != null && BY_ID.get(id)?.visible === true;
}
