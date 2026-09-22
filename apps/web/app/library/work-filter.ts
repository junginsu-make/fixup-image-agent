/**
 * 라이브러리 작업물을 **어떤 기능으로 만들었나**로 거른다(2026-09-22 사용자 요청).
 *
 * 쉽게와 다양하게는 같은 포스터 작업으로 저장된다 — 도구 칸만으로는 못 가른다. 쉽게 대화가
 * 자기가 만든 작업을 가리켜 두므로(`easy_messages.work_id`, `/api/easy/works`) 그 목록에
 * 있으면 쉽게다.
 *
 * 순수한 규칙이라 값으로 잰다(`__tests__/work-filter.test.ts`).
 */

export type WorkOrigin = "easy" | "poster" | "sns" | "character" | "ad" | "create" | "redesign";
export type WorkFilterId = "all" | WorkOrigin;

export interface FilterableWork {
  id: string;
  tool: "sns" | "poster" | "create" | "redesign";
  /** 도구 칸으로 못 가르는 것만 따로 적는다. 지금은 캐릭터 만들기 결과뿐이다. */
  origin?: "character";
}

export const WORK_FILTERS: { id: WorkFilterId; label: string; unavailable?: string }[] = [
  { id: "all", label: "전체" },
  { id: "easy", label: "쉽게" },
  { id: "poster", label: "다양하게" },
  { id: "sns", label: "카드뉴스" },
  { id: "character", label: "캐릭터" },
  /*
    광고소재는 결과를 ZIP 으로 내려받기만 하고 라이브러리에 저장하지 않는다(`api/ad/export`).
    버튼을 눌러 늘 비면 고장으로 보이므로, 저장을 붙이기 전까지는 눌리지 않고 까닭을 말한다.
  */
  { id: "ad", label: "광고소재", unavailable: "광고소재 결과는 아직 라이브러리에 저장되지 않습니다. 만들 때 내려받은 파일로 보관해 주세요." },
  { id: "create", label: "상세페이지" },
  { id: "redesign", label: "리디자인" },
];

/** 카드에 붙는 이름표. 거르기 단추와 같은 말을 쓴다 — 둘이 다르면 어느 단추로 찾을지 모른다. */
export function originLabel(origin: WorkOrigin): string {
  return WORK_FILTERS.find((filter) => filter.id === origin)!.label;
}

/**
 * 쉽게로 만든 작업 목록을 **못 읽었을 때**의 단추.
 *
 * 그대로 두면 쉽게 작업이 전부 「다양하게」로 들어가 틀린 것을 보여 준다. 두 단추를
 * 누를 수 없게 하고 까닭을 말한다. 나머지는 그 목록과 무관하니 그대로 쓴다.
 */
export function workFilters(easyKnown: boolean): typeof WORK_FILTERS {
  if (easyKnown) return WORK_FILTERS;
  const reason = "쉽게로 만든 작업 목록을 읽지 못해 지금은 쉽게와 다양하게를 가를 수 없습니다. 새로고침해 주세요.";
  return WORK_FILTERS.map((filter) => (
    filter.id === "easy" || filter.id === "poster" ? { ...filter, unavailable: reason } : filter
  ));
}

export function originOf(work: FilterableWork, easyWorkIds: ReadonlySet<string>): WorkOrigin {
  if (work.origin === "character") return "character";
  if (work.tool === "poster") return easyWorkIds.has(work.id) ? "easy" : "poster";
  return work.tool;
}

/**
 * **전체에는 캐릭터 결과를 넣지 않는다.** 캐릭터 만들기 결과는 캐릭터 탭에도 있다 —
 * 전체에 넣으면 두 곳에 같은 것이 보인다. 「캐릭터」를 고르면 그때 보인다.
 */
export function filterWorks<T extends FilterableWork>(works: readonly T[], filter: WorkFilterId, easyWorkIds: ReadonlySet<string>): T[] {
  if (filter === "all") return works.filter((work) => originOf(work, easyWorkIds) !== "character");
  return works.filter((work) => originOf(work, easyWorkIds) === filter);
}

export function countByOrigin(works: readonly FilterableWork[], easyWorkIds: ReadonlySet<string>): Record<WorkFilterId, number> {
  const counts = Object.fromEntries(WORK_FILTERS.map((filter) => [filter.id, 0])) as Record<WorkFilterId, number>;
  for (const work of works) {
    const origin = originOf(work, easyWorkIds);
    counts[origin] += 1;
    if (origin !== "character") counts.all += 1;
  }
  return counts;
}
