/** 보기 기간. 주소의 `?days=` 는 이 셋만 받는다 — 아무 수나 받으면 1년치를 매번 훑게 된다. */
export const ANALYTICS_RANGES = [7, 30, 90] as const;

export function pickDays(raw: string | undefined): number {
  const value = Number(raw);
  return (ANALYTICS_RANGES as readonly number[]).includes(value) ? value : 30;
}
