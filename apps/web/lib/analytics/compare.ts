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

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `end` 의 한국 날짜에서 `days - 1` 일 앞 날의 0시(한국 시각). RPC 의 `window_start` 와 같은 셈. */
export function windowStart(days: number, end: Date): Date {
  const kst = new Date(end.getTime() + KST_OFFSET_MS);
  const dayStartKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(dayStartKst - (days - 1) * DAY_MS - KST_OFFSET_MS);
}

/**
 * 앞선 창 전체가 기록이 시작된 뒤에 있어야 견준다. 기록 시작 전 날이 섞이면 앞선 값이 비거나 모자라
 * 「새로 생김」이나 부풀려진 ▲ 가 나온다. 기록 시작을 모르면 견주지 않는다.
 */
export function canCompare(days: number, now: Date, trackingStart: Date | null): boolean {
  if (!trackingStart) return false;
  return windowStart(days, previousWindowEnd(days, now)).getTime() >= trackingStart.getTime();
}

/** 견주지 못할 때 화면 위에 보일 한 줄. 날짜는 한국 날짜 `MM/DD`. */
export function trackingNote(days: number, trackingStart: Date | null): string {
  if (!trackingStart) return "아직 방문 기록이 없습니다.";
  const kst = new Date(trackingStart.getTime() + KST_OFFSET_MS);
  const md = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}/${String(kst.getUTCDate()).padStart(2, "0")}`;
  return `방문 기록이 ${md}에 시작돼, 앞선 ${days}일과 견줄 자료가 아직 모자랍니다.`;
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
