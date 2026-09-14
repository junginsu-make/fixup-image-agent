import type { Locale } from "./landing-content";

/**
 * 푸터에 적는 만든 사람과 만든 날.
 *
 * 사업자 정보(`legal/business-info.ts`)와 **일부러 갈라 둔다.** 그쪽은 전자상거래법이
 * 요구하는 법정 표시라 한 글자도 바꾸면 안 되는 값이고, 이쪽은 그런 성격이 아니다.
 * 한 덩어리로 묶으면 나중에 이 줄을 고치다가 법정 표시를 건드리게 된다.
 */

/** 만든 사람. */
export const DEVELOPER_NAME = "Is.Jung";

/**
 * 만든 날. **화면에 보이는 그대로 적는다.**
 *
 * 날짜 객체로 두고 자리마다 형식을 만들면 언어에 따라 「2026. 9. 14.」 과
 * 「9/14/2026」 으로 갈린다. 이것은 계산할 값이 아니라 새겨 두는 값이다.
 */
export const DEVELOPED_ON = "2026. 9. 14";

const LABELS: Record<Locale, { developer: string; developedOn: string }> = {
  ko: { developer: "개발자", developedOn: "개발날짜" },
  en: { developer: "Developer", developedOn: "Built" },
};

export interface DeveloperLine {
  label: string;
  value: string;
}

/**
 * 화면에 그릴 두 줄.
 *
 * 값은 두 언어에서 같다 — 이름과 날짜는 번역 대상이 아니다. 이름표만 언어를 따른다.
 * 사업자 정보와 같은 규칙이다.
 */
export function developerLines(locale: Locale): readonly DeveloperLine[] {
  const labels = LABELS[locale];
  return [
    { label: labels.developer, value: DEVELOPER_NAME },
    { label: labels.developedOn, value: DEVELOPED_ON },
  ];
}
