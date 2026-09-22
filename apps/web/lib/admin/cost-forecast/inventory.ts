import type { Scenario } from "./schema";
import type { Usage } from "./usage";

export const sumKnown = (...values: Array<number | null>): number | null => values.some(x => x === null) ? null : values.reduce<number>((a, b) => a + b!, 0);
export interface InventoryState { initialGB: number | null; cohorts: Array<{ month: number; gb: number | null }>; }
export function monthDate(start: string, index: number) { const [year, month] = start.split("-").map(Number); return new Date(Date.UTC(year!, month! - 1 + index, 1)); }
export function daysInMonth(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); }

/** Daily trapezoids, so a new month's files are not charged as if present on day one. */
export function advanceInventory(state: InventoryState, usage: Usage, cfg: Scenario["storage"], date: Date, index: number, active: number) {
  if (cfg.initialDeleteMonth === index + 1) state.initialGB = 0;
  if (cfg.retentionMonths !== null) state.cohorts = state.cohorts.filter(c => index - c.month < cfg.retentionMonths!);
  const start = sumKnown(state.initialGB, ...state.cohorts.map(x => x.gb));
  const perMonth = sumKnown(usage.savedMB === null ? null : usage.savedMB / 1000, cfg.additionalUploadGB, cfg.uploadPerActiveMB === null ? null : cfg.uploadPerActiveMB * active / 1000, cfg.orphanGBMonthly);
  const days = daysInMonth(date), monthKey = date.toISOString().slice(0, 7);
  let current = start, gbHours = start === null ? null : 0, newFiles: number | null = perMonth === null ? null : 0;
  for (let day = 1; day <= days; day++) {
    const key = `${monthKey}-${String(day).padStart(2, "0")}`;
    const events = cfg.events.filter(e => e.date === key);
    const added = events.reduce((n, e) => n + e.addGB, 0);
    let deleted = events.reduce((n, e) => n + e.deleteGB, 0);
    if (current === null || perMonth === null || newFiles === null) { current = null; gbHours = null; newFiles = null; continue; }
    newFiles += Math.max(0, perMonth / days) + added;
    deleted += Math.max(0, -perMonth / days);
    // Explicit deletions consume oldest stock, preserving ages of the newly created files.
    if (state.initialGB !== null) { const n = Math.min(state.initialGB, deleted); state.initialGB -= n; deleted -= n; }
    for (const cohort of state.cohorts) if (cohort.gb !== null) { const n = Math.min(cohort.gb, deleted); cohort.gb -= n; deleted -= n; }
    newFiles = Math.max(0, newFiles - deleted);
    const end = sumKnown(state.initialGB, ...state.cohorts.map(x => x.gb), newFiles)!;
    gbHours = gbHours! + (current + end) / 2 * 24;
    current = end;
  }
  state.cohorts.push({ month: index, gb: newFiles });
  return { endGB: current, averageGB: gbHours === null ? null : gbHours / (days * 24), gbHours, addedGB: perMonth };
}

export function advanceDatabase(previous: number | null, newMembers: number, usage: Usage, d: Scenario["database"]) {
  const value = sumKnown(previous, d.perNewMemberKB === null ? null : newMembers * d.perNewMemberKB / 1e6,
    d.perJobKB === null ? null : usage.jobs * d.perJobKB / 1e6, d.logGBMonthly, d.cleanupGBMonthly === null ? null : -d.cleanupGBMonthly);
  return value === null ? null : Math.max(0, value);
}
