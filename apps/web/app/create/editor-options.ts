import type { ImageGenOptions } from "@fixup/pdp-core";
import type { OverlayTextAlign } from "./pdp-drafts";

/**
 * 편집기가 보여 주는 고정 목록들.
 *
 * 값만 있고 판단이 없다. 화면 파일에 두면 2,700줄짜리가 더 길어지기만 하고
 * 읽을 때마다 스크롤을 지나쳐야 한다.
 */

/**
 * 고를 수 있는 글꼴.
 *
 * **여기 적는 이름은 실제로 부르는 이름이어야 한다.** 전에는 `'Pretendard'` 와
 * `'Noto Sans KR'` 이 있었는데, 이 저장소가 `@font-face` 로 부르는 이름은
 * `Pretendard Variable` 하나뿐이고 Noto 는 파일도 선언도 없었다. 고른 대로 안
 * 찍히고 OS 기본 글꼴로 떨어졌다 — 화면에도, 내려받은 그림에도.
 *
 * 같은 사고가 이미 있었다(`layout.tsx` 머리말). `packages/ui` 의 `--font-sans`
 * 가 "Pretendard" 를 맨 앞에 적어 두고도 불러오지 않아 맑은 고딕으로 떨어졌다.
 *
 * 글꼴을 더할 때는 **부르는 자리(`pretendard.css` 같은 곳)를 먼저 만들고**
 * 여기에 적는다. `__tests__/editor-fonts.test.ts` 가 값으로 잰다.
 */
export const FONT_OPTIONS = [
  // 본문과 같은 글꼴. 한글이 제대로 찍히는 유일한 선택지다.
  { label: "프리텐다드", value: "'Pretendard Variable', system-ui, sans-serif" },
  // 아래 둘은 어느 기계에나 있는 것이라 부르지 않아도 된다. 한글은 OS 기본으로 간다.
  { label: "Georgia (영문)", value: "Georgia, 'Times New Roman', serif" },
  { label: "고정폭 (영문)", value: "monospace" },
];

/**
 * 새 글자 레이어가 쓰는 글꼴.
 *
 * **목록 안의 값이어야 한다.** 목록에 없는 값이 기본이면 고르는 칸이 빈 채로
 * 뜨고, 사용자는 그것을 고칠 방법이 없다. 전에는 기본이 `'Pretendard'` 였는데
 * 그 이름은 부르는 자리가 없어 **모든 새 레이어가 OS 기본 글꼴로 찍혔다.**
 */
export const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0]!.value;

/**
 * 저장돼 있던 글꼴 값을 지금 쓸 수 있는 것으로 되돌린다.
 *
 * **옛 초안을 버리지 않기 위해서다.** 목록을 고쳤다고 이미 저장된 레이어가
 * 계속 깨진 채로 있으면, 고친 보람이 새 작업에만 돌아간다.
 */
export function normalizeFontFamily(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_FONT_FAMILY;
  return FONT_OPTIONS.some((option) => option.value === trimmed) ? trimmed : DEFAULT_FONT_FAMILY;
}

export const STYLE_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["style"]>; label: string; description: string }> = [
  { value: "studio", label: "스튜디오컷", description: "정제된 배경과 집중도 높은 제품 연출" },
  { value: "lifestyle", label: "라이프스타일컷", description: "실사용 장면과 감정선이 느껴지는 연출" },
  { value: "outdoor", label: "아웃도어컷", description: "씬이 살아있는 외부 공간 연출" },
];

export const MODEL_GENDER_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelGender"]>; label: string }> = [
  { value: "female", label: "여자 모델" },
  { value: "male", label: "남자 모델" },
];

export const MODEL_AGE_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelAgeRange"]>; label: string }> = [
  { value: "teen", label: "10대 후반" },
  { value: "20s", label: "20대" },
  { value: "30s", label: "30대" },
  { value: "40s", label: "40대" },
  { value: "50s_plus", label: "50대+" },
];

export const MODEL_COUNTRY_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelCountry"]>; label: string }> = [
  { value: "korea", label: "한국" },
  { value: "japan", label: "일본" },
  { value: "usa", label: "미국" },
  { value: "france", label: "프랑스" },
  { value: "germany", label: "독일" },
  { value: "africa", label: "아프리카" },
];

export const FONT_WEIGHT_OPTIONS = [
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "700", label: "Bold" },
  { value: "900", label: "Black" },
];

// 아이콘을 들고 있었다. 글자가 있는 단추 앞에는 아이콘을 안 둔다(2026-09-22).
export const ALIGN_OPTIONS: Array<{ value: OverlayTextAlign; label: string }> = [
  { value: "left", label: "왼쪽" },
  { value: "center", label: "가운데" },
  { value: "right", label: "오른쪽" },
];

export const BASIC_SOLID_COLORS = [
  "#ffffff",
  "#f4efe6",
  "#d9d2c3",
  "#c4b8a0",
  "#c8474d",
  "#e05a63",
  "#102532",
  "#1d3748",
  "#4cb7aa",
  "#cf6f52",
  "#d8b65b",
  "#111111",
];
