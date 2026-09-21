import { Type } from "./pdp.llm";
import type { DesignSystem, SectionBlueprint } from "./types";

/**
 * **페이지 전체가 공유하는 디자인.**
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 섹션 이미지는 **서로를 모른 채 각각 생성된다.** 앵커 이미지에는 글자가 없어
 * 서체를 전달할 수도 없다. 그래서 무엇을 공유할지 한 번 정해 모든 섹션에 실어
 * 보내야 한다 — 안 그러면 섹션마다 서체가 바뀌고 색이 바뀌고 등장인물이 바뀐다.
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────
 *
 * 그 장치가 **글 경로에만 있었다.** 사진 경로는 섹션마다 `style_guide` 를
 * 제각각 적었다. 프롬프트가 「전체 통일 스타일」이라고 적어 두긴 했지만,
 * **여섯 섹션이 각자 자기 문장을 쓰면 통일될 수가 없다.**
 *
 * 새로 추가한 섹션은 더했다 — 형제의 `style_guide` 를 통째로 베꼈다. 그 형제를
 * 사용자가 고치거나 지우면 **계승이 조용히 끊긴다.**
 *
 * U-15 가 「새 섹션 디자인 계승·전체 페이지 통일 검수 부족」이라 적은 자리다.
 */

/**
 * 공용 서술의 머리말. **표지 노릇을 한다.**
 *
 * 이 문자열로 「이 섹션이 공용 디자인을 받았는가」를 판단하므로, 바꾸면 이미
 * 저장된 초안이 전부 「안 받은 것」이 된다. 바꾸지 않는다.
 */
export const DESIGN_SYSTEM_MARKER = "[페이지 공용 디자인 시스템 — 모든 섹션이 동일하게 따른다]";

export const DESIGN_SYSTEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headlineFont: { type: Type.STRING },
    bodyFont: { type: Type.STRING },
    palette: { type: Type.ARRAY, items: { type: Type.STRING } },
    cast: { type: Type.STRING },
  },
} as const;

/** 공용 디자인을 **먼저** 정하라는 지시. 섹션 규칙보다 앞에 둔다. */
export const DESIGN_SYSTEM_RULES = `# 페이지 전체의 디자인을 먼저 정한다 (designSystem)

섹션 이미지는 서로를 모른 채 각각 만들어진다. 여기서 한 번 정하지 않으면
**섹션마다 서체가 바뀌고 색이 바뀌고 등장인물이 바뀐다.**

- headlineFont / bodyFont: 한국어 서체 성격을 한국어로 묘사한다(예: "굵은 기하학적
  산세리프", "가늘고 단정한 산세리프"). 그림처럼 쓰는 레터링이 아닌 한 페이지
  안에서 서체는 바뀌지 않는다.
- palette: 배경·본문·강조 3색을 한국어로 적는다.
- cast: 페이지에 반복 등장할 인물 한 명을 구체적으로 묘사한다(나이대, 성별, 머리,
  옷차림). 한국인으로 쓴다. **사람이 나오지 않는 페이지면 빈 문자열로 둔다** —
  모든 상품에 사람이 나와야 하는 것은 아니다.

여기 적은 값은 **모든 섹션에 그대로 실려 나간다.** 섹션별 style_guide 에는 그
섹션만의 연출(세트·조명·구도)을 적고, 서체·색·등장인물을 다시 정하지 않는다.`;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeDesignSystem(raw: unknown): DesignSystem | undefined {
  const input = (raw ?? {}) as Record<string, unknown>;
  const system: DesignSystem = {
    headlineFont: asText(input.headlineFont),
    bodyFont: asText(input.bodyFont),
    palette: Array.isArray(input.palette)
      ? input.palette.map(asText).filter(Boolean)
      : [],
    cast: asText(input.cast),
  };

  const empty = !system.headlineFont && !system.bodyFont && !system.palette.length && !system.cast;
  return empty ? undefined : system;
}

/**
 * 공용 디자인을 모든 섹션이 똑같이 받도록 **한 문장으로** 만든다.
 *
 * `buildImagePrompt` 가 `style_guide` 를 그대로 프롬프트에 넣으므로, 별도 배관
 * 없이 전 섹션에 같은 지시가 전달된다.
 */
export function describeDesignSystem(system: DesignSystem): string {
  return [
    DESIGN_SYSTEM_MARKER,
    system.headlineFont ? `헤드라인 서체: ${system.headlineFont}` : "",
    system.bodyFont ? `본문 서체: ${system.bodyFont}` : "",
    system.palette.length ? `색 팔레트: ${system.palette.join(" / ")}` : "",
    system.cast ? `반복 등장 인물: ${system.cast} — 모든 섹션에 같은 사람이 나온다` : "",
    "이 값들은 섹션마다 바뀌면 안 된다.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * 표지부터 뒤를 잘라낸다. 섹션이 원래 쓰던 지시만 남는다.
 *
 * **`style_guide` 편집창을 여는 날 이 함수를 함께 고쳐야 한다.** 표지는 문장
 * 끝에 붙으므로, 사용자가 그 뒤에 무언가 적으면 다음 `applyDesignSystem` 한
 * 번에 사라진다. 지금은 화면 어디에도 `style_guide` 입력이 없어 안전하다
 * (`PdpEditor` 는 읽기만 한다). 편집을 열려면 표지+서술 한 덩어리만 도려내는
 * 방식으로 바꿀 것.
 */
function withoutDesignSystem(styleGuide: string | undefined): string {
  const text = styleGuide ?? "";
  const at = text.indexOf(DESIGN_SYSTEM_MARKER);
  return (at === -1 ? text : text.slice(0, at)).trim();
}

/**
 * 공용 디자인을 섹션에 싣는다.
 *
 * **두 번 실어도 한 번만 붙는다.** 다시 기획할 때마다 같은 문장이 쌓이면
 * 프롬프트가 길어지고, 디자인을 바꿨을 때 옛 서술과 새 서술이 **함께 남아**
 * 모델이 어느 쪽을 따를지 알 수 없게 된다. 그래서 붙이기 전에 옛 것을 걷어낸다.
 */
export function applyDesignSystem(
  section: SectionBlueprint,
  system: DesignSystem | undefined,
): SectionBlueprint {
  if (!system) return section;

  const own = withoutDesignSystem(section.style_guide);
  return { ...section, style_guide: [own, describeDesignSystem(system)].filter(Boolean).join(" ") };
}

/**
 * **공용 디자인 없이 만들어질 섹션**을 찾는다.
 *
 * 표지가 있는지만 보지 않는다 — **지금 디자인의 서술과 같은지**를 본다. 표지만
 * 보면 옛 디자인을 든 섹션이 통과하고, 그 섹션만 옛 서체·옛 인물로 만들어진다.
 */
export function sectionsMissingDesignSystem(
  sections: SectionBlueprint[],
  system: DesignSystem | undefined,
): string[] {
  // 정한 것이 없으면 「안 따랐다」고 말할 근거도 없다.
  if (!system) return [];

  const expected = describeDesignSystem(system);
  return sections
    .filter((section) => !(section.style_guide ?? "").includes(expected))
    .map((section) => section.section_id);
}

/**
 * `style_guide` 에서 **공용 디자인 부분만** 떼어낸다.
 *
 * 컷 타입 우선(`style-first`) 모드는 섹션의 연출 지시를 버리고 장면을 새로
 * 짠다. 그런데 `style_guide` 를 통째로 버리면 **페이지 공용 디자인까지 사라져**
 * 그 섹션만 다른 서체·다른 사람으로 만들어진다. 토글은 섹션마다 따로라 한
 * 섹션만 켜도 그렇게 된다.
 *
 * 컷 타입이 덮어야 하는 것은 그 섹션의 구도지 페이지 전체의 서체가 아니다.
 */
export function designSystemPartOf(styleGuide: string | undefined): string {
  const text = styleGuide ?? "";
  const at = text.indexOf(DESIGN_SYSTEM_MARKER);
  return at === -1 ? "" : text.slice(at).trim();
}
