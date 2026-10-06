/**
 * **지난 기간 비교 규칙**(계획 2026-10-06 site-analytics). 순수 함수만 둔다.
 * 지난 기간은 이번 창과 길이·모양이 같다 — 끝 시각만 정하면 RPC 가 같은 길이로 거슬러 센다.
 */
const DAY_MS = 86_400_000;

/**
 * `days` 일 전 **같은 시각**. 이번 창 마지막 날(오늘)은 지금 시각까지만 차 있으니, 지난 창 마지막 날도
 * 같은 시각까지만 세야 같은 조건으로 견준다(오늘 낮 12시까지를 어제 하루 전체와 견주면 늘 줄어 보인다).
 * 그 대신 지난 창 마지막 날의 남은 시간은 어느 쪽에도 안 들어간다.
 */
export function previousWindowEnd(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export type Change = { kind: "up" | "down" | "same"; percent: number } | { kind: "new" } | { kind: "none" };

export function change(current: number, previous: number | null): Change {
  if (previous === null) return { kind: "none" };
  if (previous === 0) return current > 0 ? { kind: "new" } : { kind: "same", percent: 0 };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { kind: "same", percent: 0 };
  return percent > 0 ? { kind: "up", percent } : { kind: "down", percent: -percent };
}

export function changeText(c: Change): string {
  switch (c.kind) {
    case "up": return `▲ ${c.percent}%`;
    case "down": return `▼ ${c.percent}%`;
    case "same": return "변화 없음";
    case "new": return "새로 생김";
    default: return "";
  }
}
