import type { JobItemRecord, JobRecord } from "./repository";

/**
 * 한 문서의 작업 전부를 **되찾기용 작업 하나**로 합친다(독립 리뷰 HIGH-3).
 *
 * 전에는 가장 최근 작업 하나만 돌려줬다. 한 장 다시 만들기가 작업을 남기기 시작하자
 * (2026-09-28) 그 한 장짜리가 「가장 최근」이 되어 앞선 묶음의 섹션을 되찾지 못했다.
 * 일괄 생성은 원래도 묶음마다 작업이 따로라 같은 한계가 있었다.
 *
 * - 바탕(상태·id)은 가장 최근 작업이다 — 사용자가 기억하는 화면이다
 * - 섹션마다 **그림이 있는 가장 최근 결과**(최근 작업 → 같은 작업 안에서는 마지막 시도)
 * - 그림이 한 번도 없던 섹션은 가장 최근의 실패 까닭을 남긴다
 */
export function mergeDocumentJobs(jobs: readonly JobRecord[]): JobRecord | null {
  if (jobs.length === 0) return null;
  const newestFirst = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const chosen = new Map<string, JobItemRecord>();
  const lastAttempt = (items: readonly JobItemRecord[], sectionId: string, withOutput: boolean) =>
    items
      .filter((item) => item.sectionId === sectionId && (withOutput ? Boolean(item.outputPath) : true))
      .sort((a, b) => b.attempt - a.attempt)[0];

  for (const job of newestFirst) {
    for (const sectionId of new Set(job.items.map((item) => item.sectionId))) {
      const current = chosen.get(sectionId);
      if (current?.outputPath) continue;
      const withOutput = lastAttempt(job.items, sectionId, true);
      if (withOutput) chosen.set(sectionId, withOutput);
      else if (!current) chosen.set(sectionId, lastAttempt(job.items, sectionId, false)!);
    }
  }

  // 섹션 차례는 페이지에서 처음 만든 차례다(오래된 작업부터).
  const oldestFirst = [...newestFirst].reverse().flatMap((job) => job.items.map((item) => item.sectionId));
  const sectionOrder = [...new Set(oldestFirst)];
  const newest = newestFirst[0]!;
  return {
    ...newest,
    sectionIds: sectionOrder,
    items: sectionOrder.map((sectionId) => chosen.get(sectionId)!).filter(Boolean),
  };
}
