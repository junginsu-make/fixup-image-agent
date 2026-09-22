import type { WorkEstimate } from "./work-profiles";

export interface Usage {
  jobs: number; credits: number; requiredStart: number; images: number; providerOutputs: number; apiUsd: number;
  savedMB: number | null; uploadMB: number | null; responseMB: number | null; savedImages: number; originalMB: number | null; previewMB: number | null;
  byWork: Record<string, number>;
}
export function emptyUsage(): Usage { return { jobs: 0, credits: 0, requiredStart: 0, images: 0, providerOutputs: 0, apiUsd: 0, savedMB: 0, uploadMB: 0, responseMB: 0, savedImages: 0, originalMB: 0, previewMB: 0, byWork: {} }; }
export function addUsage(a: Usage, b: Usage, multiplier = 1): Usage {
  if (multiplier === 0) return a;
  for (const k of ["jobs", "credits", "images", "providerOutputs", "apiUsd", "savedImages"] as const) a[k] += b[k] * multiplier;
  for (const k of ["savedMB", "uploadMB", "responseMB", "originalMB", "previewMB"] as const) a[k] = a[k] === null || b[k] === null ? null : a[k]! + b[k]! * multiplier;
  for (const [key, count] of Object.entries(b.byWork)) a.byWork[key] = (a.byWork[key] ?? 0) + count * multiplier;
  return a;
}

function addWork(out: Usage, work: WorkEstimate, count: number) {
  if (count > 0) out.requiredStart = Math.max(out.requiredStart, out.credits + (count - 1) * work.charged + work.required);
  return addUsage(out, { jobs: count, credits: work.charged * count, requiredStart: 0, images: work.images * count, providerOutputs: work.providerOutputs * count,
    apiUsd: work.apiUsd * count, savedMB: work.savedMB === null ? null : work.savedMB * count, savedImages: work.savedImages * count,
    uploadMB: work.uploadMB === null ? null : work.uploadMB * count, responseMB: work.responseMB === null ? null : work.responseMB * count,
    originalMB: work.originalMB === null ? null : work.images * work.originalMB * count,
    previewMB: work.previewMB === null ? null : work.images * work.previewMB * count, byWork: { [work.id]: count } });
}

/** No member's remainder is lent to another. Target budget is not the starting balance. */
export function simulateMember(quota: number, target: number, works: WorkEstimate[]): Usage {
  const out = emptyUsage();
  const available = works.filter(w => w.weight > 0).sort((a, b) => a.id.localeCompare(b.id));
  if (!available.length || target <= 0) return out;
  if (available.some(w => w.charged <= 0)) throw new Error("무료 활동은 유한 횟수로 계산해야 합니다.");
  if (available.length === 1) {
    const w = available[0]!;
    const count = quota + 1e-9 < w.required ? 0 : Math.max(0, Math.min(Math.floor((target + 1e-9) / w.charged), Math.floor((quota - w.required + 1e-9) / w.charged) + 1));
    return addWork(out, w, count);
  }
  // Profiles are at most 20. Chunk identical allocations once all profiles have a common ratio.
  const hardLimit = 100000;
  for (let i = 0; i < hardLimit; i++) {
    const candidates = available.filter(w => out.credits + w.charged <= target + 1e-8 && quota - out.credits + 1e-8 >= w.required);
    if (!candidates.length) return out;
    candidates.sort((a, b) => (out.byWork[a.id] ?? 0) / a.weight - (out.byWork[b.id] ?? 0) / b.weight || a.id.localeCompare(b.id));
    addWork(out, candidates[0]!, 1);
  }
  throw new Error("혼합 작업이 10만 회를 넘습니다. 제공량을 줄이거나 단일 작업으로 비교하세요.");
}
