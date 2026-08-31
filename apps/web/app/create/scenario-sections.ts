import type { SectionBlueprint } from "@fixup/pdp-core";

/**
 * 사용자가 시나리오에서 새로 추가하는 섹션.
 *
 * **장면 지시(prompt_ko·prompt_en)를 비워 두면 안 된다.** 이미지 생성은 prompt_en 만
 * 보고, 비어 있으면 서버가 400 을 낸다("이미지 프롬프트가 없는 섹션입니다",
 * pdp.service.ts). 사용자는 왜 막혔는지 알 수 없다 — 2026-07-30 운영에서 실제로 겪었다.
 *
 * 그래서 **바로 생성되는 기본 장면**을 넣어 둔다. 사용자가 화면에서 고쳐 쓰면 되고,
 * 고치면 mergeArtDirection 이 그 한국어 방향을 prompt_en 에 실어 보낸다.
 */
export function createEmptySection(index: number): SectionBlueprint {
  const number = index + 1;
  return {
    section_id: `S${number}`,
    section_name: `섹션 ${number}`,
    goal: "",
    headline: "",
    headline_en: "",
    subheadline: "",
    subheadline_en: "",
    bullets: [],
    bullets_en: [],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: `IMG_S${number}`,
    purpose: "",
    prompt_ko: "제품을 중심에 둔 밝은 스튜디오 장면",
    prompt_en: "product centered on a bright clean studio background, soft even lighting",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
    // 게이트가 구버전으로 오해하지 않도록 버전을 단다. 근거는 비어도 된다 —
    // 사실 표지가 없는 문구에는 근거를 요구하지 않는다.
    evidenceVersion: 1,
    evidence: [],
  };
}
