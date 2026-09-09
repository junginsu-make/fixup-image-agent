import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { ImageGenOptions } from "@fixup/pdp-core";
import type { OverlayTextAlign } from "./pdp-drafts";

/**
 * 편집기가 보여 주는 고정 목록들.
 *
 * 값만 있고 판단이 없다. 화면 파일에 두면 2,700줄짜리가 더 길어지기만 하고
 * 읽을 때마다 스크롤을 지나쳐야 한다.
 */

export const FONT_OPTIONS = [
  { label: "Pretendard", value: "'Pretendard', sans-serif" },
  { label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Monospace", value: "monospace" },
];

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

export const ALIGN_OPTIONS: Array<{ value: OverlayTextAlign; label: string; Icon: typeof AlignLeft }> = [
  { value: "left", label: "왼쪽", Icon: AlignLeft },
  { value: "center", label: "가운데", Icon: AlignCenter },
  { value: "right", label: "오른쪽", Icon: AlignRight },
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
