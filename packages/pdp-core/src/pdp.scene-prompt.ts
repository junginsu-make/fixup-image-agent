/** 기획 방식과 옛 초안에 관계없이 이미지에 쓸 장면을 하나로 정한다. */
export const DEFAULT_SECTION_SCENE = "product centered on a bright clean studio background, soft even lighting";

export function sectionScenePrompt(section: {
  prompt_en?: unknown; prompt_ko?: unknown; headline?: unknown; section_name?: unknown;
}): string {
  for (const value of [section.prompt_en, section.prompt_ko, section.headline, section.section_name]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return DEFAULT_SECTION_SCENE;
}
