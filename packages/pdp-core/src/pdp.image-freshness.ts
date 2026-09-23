import type { SectionBlueprint } from "./types";

/**
 * **이 그림이 지금 문구로 만든 것인가**(N-5, 설계 §4.2).
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 *
 * 상세페이지는 출력 모드가 `full-image` 라 **글자가 이미지 안에 그려진다.**
 * 제목을 「3일 만에」에서 「7일 만에」로 고쳐도 **화면의 이미지는 여전히
 * 「3일 만에」**인데 아무 표시가 없었다.
 *
 * 그대로 내보내면 **고친 글과 다른 이미지**가 나간다. 사용자는 자기가 고친
 * 것이 반영된 줄 안다.
 *
 * 설계 §4.2: 「문구·장면·섹션 순서·참조·모델을 바꾸면 … 이전 생성 자산은
 * 삭제하지 않고 **'이전 구성의 결과'로 표시**한다」.
 *
 * ── 무엇을 세는가 ──────────────────────────────────────────
 *
 * **그림에 실제로 들어가는 것만** 센다(`pdp.image-prompt.ts` 의 `typography`
 * 와 `scene`). 제목·부제·불릿·장면 지시다. 신뢰문장은 2026-09-23 부터
 * 그림에 안 그리므로 안 센다.
 *
 * CTA 는 안 센다 — 이미지에 싣지 않기로 한 결정이 있다(2026-07-30). 근거
 * 딱지나 검수 결과도 안 센다. 그림이 안 바뀌는 것으로 「낡았다」고 하면
 * 사용자는 표시를 무시하게 된다.
 */

/** 그림을 만들 때의 문구 자국. 사람이 읽을 것이 아니라 대조용이다. */
export type ImageStamp = string;

/**
 * 지금 문구의 자국을 찍는다.
 *
 * **장면 지시도 센다.** 같은 글자라도 다른 장면이면 다른 그림이다.
 */
export function imageStampOf(section: SectionBlueprint | null | undefined): ImageStamp {
  if (!section) return "";
  // 신뢰문장은 안 센다 — 그림에 안 그린다(2026-09-23, `pdp.image-prompt.ts`).
  return [
    section.headline ?? "",
    section.subheadline ?? "",
    (section.bullets ?? []).join(""),
    section.prompt_en ?? "",
    section.prompt_ko ?? "",
  ].join("");
}

/**
 * 신뢰문장을 그리던 때의 자국. **그때 만든 그림을 알아보는 데만** 쓴다.
 *
 * 새 공식만 보면 전에 만든 그림이 한꺼번에 「낡음」이 된다 — 사용자는 표시를
 * 무시하게 되고, 무시하지 않으면 멀쩡한 그림을 다시 만드느라 크레딧을 쓴다.
 */
function legacyImageStampOf(section: SectionBlueprint): ImageStamp {
  return [
    section.headline ?? "",
    section.subheadline ?? "",
    (section.bullets ?? []).join(""),
    section.trust_or_objection_line ?? "",
    section.prompt_en ?? "",
    section.prompt_ko ?? "",
  ].join("");
}

/**
 * 이 섹션의 그림이 지금 문구보다 낡았는가.
 *
 * **그림이 없으면 낡을 것도 없다.** 아직 안 만든 섹션이다.
 *
 * **자국이 없으면 낡았다고 하지 않는다.** 이 기능이 생기기 전에 만든
 * 그림이다. 없는 것을 전부 낡았다고 하면 사용자는 표시를 무시한다.
 */
export function isImageStale(section: SectionBlueprint | null | undefined): boolean {
  if (!section?.generatedImage) return false;
  if (!section.imageStamp) return false;
  return section.imageStamp !== imageStampOf(section) && section.imageStamp !== legacyImageStampOf(section);
}

/** 낡은 그림 옆에 붙일 말. */
export const IMAGE_STALE_NOTICE =
  "문구를 고친 뒤입니다. 이 이미지에는 고치기 전 글자가 그려져 있습니다. 다시 만들어야 반영됩니다.";
