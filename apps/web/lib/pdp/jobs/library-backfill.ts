/**
 * 서버에 남은 상세페이지 결과(`pdp_generation_items`)를 **문서별 페이지 차례**로 모은다.
 *
 * 2026-09-23 이전에 만든 상세페이지는 결과가 서버에 저장됐지만 라이브러리 작업으로
 * 등록되지 않았다 — 그때 저장 단추는 10MB 한도에 걸려 실패했고, 자동 저장은 그 뒤에
 * 생겼다(`scripts/backfill-pdp-jobs-to-library.ts`). 서버 기록에는 페이지 순서가
 * 따로 없어 **요청 순서 → 요청 안의 섹션 순서**로 되살린다. 일괄 생성은 묶음을
 * 앞에서부터 차례로 보내므로 이것이 페이지 순서다.
 *
 * 같은 섹션을 다시 만들었으면 **마지막 결과**를 쓰되 자리는 처음 나온 자리를 지킨다.
 */

export interface StoredJobRow {
  id: string;
  user_id: string;
  document_id: string | null;
  section_ids: string[];
  created_at: string;
}

export interface StoredItemRow {
  job_id: string;
  section_id: string;
  attempt: number;
  output_path: string | null;
  created_at: string;
}

export interface StoredPage {
  documentId: string;
  userId: string;
  /** 저장소 경로. 페이지 차례대로. */
  paths: string[];
  firstCreatedAt: string;
}

export function storedPagesByDocument(jobs: readonly StoredJobRow[], items: readonly StoredItemRow[]): StoredPage[] {
  const ordered = [...jobs]
    .filter((job) => Boolean(job.document_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const byDocument = new Map<string, { userId: string; firstCreatedAt: string; order: string[]; latest: Map<string, string> }>();

  for (const job of ordered) {
    const documentId = job.document_id as string;
    const page = byDocument.get(documentId) ?? {
      userId: job.user_id,
      firstCreatedAt: job.created_at,
      order: [] as string[],
      latest: new Map<string, string>(),
    };
    for (const sectionId of job.section_ids) {
      const attempts = items
        .filter((item) => item.job_id === job.id && item.section_id === sectionId && item.output_path)
        .sort((a, b) => a.attempt - b.attempt);
      const last = attempts.at(-1);
      if (!last) continue;
      if (!page.order.includes(sectionId)) page.order.push(sectionId);
      // 뒤 요청의 결과가 앞의 것을 덮는다 — 요청을 시간순으로 돌기 때문이다.
      page.latest.set(sectionId, last.output_path as string);
    }
    byDocument.set(documentId, page);
  }

  return [...byDocument.entries()]
    .map(([documentId, page]) => ({
      documentId,
      userId: page.userId,
      paths: page.order.map((sectionId) => page.latest.get(sectionId) as string),
      firstCreatedAt: page.firstCreatedAt,
    }))
    .filter((page) => page.paths.length > 0);
}
