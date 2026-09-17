import type { SectionBlueprint } from "@fixup/pdp-core";

/**
 * 돌아온 사용자가 무엇을 되찾는가.
 *
 * ── 화면 밖에 두는 이유 ────────────────────────────────────────
 *
 * 「무엇을 덮고 무엇을 두는가」는 실제 판단이다. `.tsx` 안에 있으면 시험이
 * 값으로 못 재고, 한 줄을 지워도 전부 통과한다. 이 저장소가 이미 그렇게 겪었다
 * (`page-wire.ts`·`generation-run.ts` 머리말).
 *
 * ── 가장 조심할 것 ────────────────────────────────────────────
 *
 * **이미 있는 그림을 덮지 않는다.** 되찾기가 사용자가 그 뒤에 한 작업을
 * 지우면, 고치려던 손실을 다른 모양으로 다시 내는 셈이다.
 */

export interface RecoverableJobItem {
  sectionId: string;
  /** 저장된 그림의 주소. 못 올렸으면 `null` 이다. */
  url: string | null;
  errorCode?: string | null;
}

export interface RecoverableJob {
  id: string;
  outcome: string;
  items: RecoverableJobItem[];
}

export interface RecoveredImage {
  sectionId: string;
  url: string;
}

/**
 * 서버에 적힌 작업에서 **아직 화면에 없는 그림만** 고른다.
 *
 * 건너뛰는 것 셋:
 *   - 이미 그림이 있는 섹션 (그 뒤 편집이 날아간다)
 *   - 저장에 실패해 주소가 없는 섹션 (가리킬 자리가 없다)
 *   - 지금 구성안에 없는 섹션 (그 사이 구성을 바꿨을 수 있다)
 */
export function recoverableSections(
  job: RecoverableJob,
  sections: SectionBlueprint[],
): RecoveredImage[] {
  const 비어있는섹션 = new Set(
    sections.filter((section) => !section.generatedImage).map((section) => section.section_id),
  );

  return job.items
    .filter((item) => item.url && 비어있는섹션.has(item.sectionId))
    .map((item) => ({ sectionId: item.sectionId, url: item.url! }));
}

/**
 * 생성 요청에 실을 문서 표시.
 *
 * **아직 저장 안 한 작업은 아무것도 안 싣는다.** 서버가 예약 식별자로 대신하며,
 * 그때는 그 요청 한 건만 묶인다. 없는 id 를 지어내면 다음에 저장했을 때
 * 두 개로 갈린다.
 */
export function jobRequestFields(
  draftId: string | null,
  revision: number,
): { documentId?: string; revision?: number } {
  if (!draftId) return {};
  return { documentId: draftId, revision };
}
