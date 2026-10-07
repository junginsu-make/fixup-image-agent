/**
 * **「돌고 있다」를 말하는 낱말은 이것만 쓴다**(2026-10-08 사용자).
 *
 * 기능마다 「저장 중…」「그리는 중…」「쓰는 중…」처럼 말이 제각각이었다.
 * 단추 글자와 위쪽 띠 문구가 같은 낱말을 쓰게 한 곳에 모은다.
 */
export const WORKING_TEXT = {
  plan: "기획 중",
  write: "작성 중",
  make: "만드는 중",
  edit: "고치는 중",
  analyze: "분석 중",
  review: "검수 중",
  save: "저장 중",
} as const;

export type WorkingKind = keyof typeof WORKING_TEXT;

/** 일하는 동안 단추에 띄우는 글자. */
export function workingButton(kind: WorkingKind): string {
  return `${WORKING_TEXT[kind]}…`;
}
