/**
 * **지난 기간 비교 규칙**(계획 2026-10-06 site-analytics). 순수 함수만 둔다.
 * 지난 기간은 이번 창 바로 앞에 붙고 길이가 같다 — 끝 시각만 정하면 RPC 가 같은 길이로 거슬러 센다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 이번 창 첫날(한국 날짜, 오늘 - (days-1)) 0시 한국 시각에서 1초 앞. */
export function previousWindowEnd(days: number, now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const todayStartKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  const firstDayStartUtc = todayStartKst - (days - 1) * DAY_MS - KST_OFFSET_MS;
  return new Date(firstDayStartUtc - 1000);
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
