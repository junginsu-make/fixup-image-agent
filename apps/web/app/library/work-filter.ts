/**
 * 라이브러리 작업물을 **어떤 기능으로 만들었나**로 거른다(2026-09-22 사용자 요청).
 *
 * 쉽게와 다양하게는 같은 포스터 작업으로 저장된다 — 도구 칸만으로는 못 가른다. 쉽게 대화가
 * 자기가 만든 작업을 가리켜 두므로(`easy_messages.work_id`, `/api/easy/works`) 그 목록에
 * 있으면 쉽게다.
 *
 * 2026-10-08: 위 탭 [작업물·참고 이미지·캐릭터] 과 **한 줄로 합쳤다**(사용자 요청). 「캐릭터」는
 * 캐릭터 화면 단추 하나다 — 작업물 안의 캐릭터 거르기는 없앴다.
 *
 * 순수한 규칙이라 값으로 잰다(`__tests__/work-filter.test.ts`).
 */

export type WorkOrigin = "easy" | "poster" | "sns" | "character" | "ad" | "create" | "redesign";
export type WorkFilterId = "all" | Exclude<WorkOrigin, "character">;
/** 한 줄 거르기의 단추 하나. 작업물 거르기에 캐릭터·참고 이미지 화면이 붙는다. */
export type LibraryView = WorkFilterId | "characters" | "references";

export interface FilterableWork {
  id: string;
  tool: "sns" | "poster" | "create" | "redesign" | "ad";
  /** 도구 칸으로 못 가르는 것만 따로 적는다. 지금은 예전 캐릭터 만들기 결과뿐이다. */
  origin?: "character";
  /** 그림이 몇 장인가. 낱장을 미뤄 받는 작업은 0 이어도 표지가 있다. */
  imageCount: number;
  cover: string | null;
}

export const WORK_FILTERS: { id: WorkFilterId; label: string; unavailable?: string }[] = [
  { id: "all", label: "전체" },
  { id: "easy", label: "쉽게" },
  { id: "poster", label: "다양하게" },
  { id: "sns", label: "카드뉴스" },
  // 광고 내보내기가 뽑을 때마다 한 묶음을 라이브러리에 남긴다(2026-10-08, `api/ad/export`).
  { id: "ad", label: "광고소재" },
  { id: "create", label: "상세페이지" },
  { id: "redesign", label: "리디자인" },
];

/** 작업물 거르기 뒤에 붙는 다른 화면. 개수를 달지 않는다 — 작업물이 아니다. */
export const LIBRARY_VIEWS: { id: LibraryView; label: string; unavailable?: string }[] = [
  ...WORK_FILTERS,
  { id: "characters", label: "캐릭터" },
  { id: "references", label: "참고 이미지" },
];

/**
 * 카드에 붙는 이름표. 거르기 단추와 같은 말을 쓴다 — 둘이 다르면 어느 단추로 찾을지 모른다.
 *
 * 예전 캐릭터 결과는 거르기 단추가 없다. 「전체」에서만 보이고 이름표는 「캐릭터」다.
 */
export function originLabel(origin: WorkOrigin): string {
  if (origin === "character") return "캐릭터";
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
 * **그림 없는 작업은 라이브러리에 안 보인다**(2026-10-08 사용자 결정).
 *
 * 사진만 올리고 다시 시작한 상세페이지, 기획만 한 포스터, 원고만 쓴 카드뉴스다. 그림을 만들기
 * 전에 멈춰 크레딧이 나가지 않았다(운영 13건 모두 0). 크레딧 사용은 설정 › 사용 기록에 남고,
 * 이어서 하기는 각 기능 화면에서 한다. 작업을 지우는 것이 아니라 여기서 안 보일 뿐이다.
 */
function hasPicture(work: FilterableWork): boolean {
  return work.imageCount > 0 || Boolean(work.cover);
}

/**
 * **전체에는 예전 캐릭터 결과도 넣는다.** 「캐릭터」 단추가 캐릭터 화면이 되어, 빼면 어디서도
 * 안 보인다(운영 1건 — 원본 캐릭터는 이미 지워져 캐릭터 화면에 없다).
 */
export function filterWorks<T extends FilterableWork>(works: readonly T[], filter: WorkFilterId, easyWorkIds: ReadonlySet<string>): T[] {
  const shown = works.filter(hasPicture);
  if (filter === "all") return shown;
  return shown.filter((work) => originOf(work, easyWorkIds) === filter);
}

export function countByOrigin(works: readonly FilterableWork[], easyWorkIds: ReadonlySet<string>): Record<WorkFilterId, number> {
  const counts = Object.fromEntries(WORK_FILTERS.map((filter) => [filter.id, 0])) as Record<WorkFilterId, number>;
  for (const work of works.filter(hasPicture)) {
    const origin = originOf(work, easyWorkIds);
    if (origin !== "character") counts[origin] += 1;
    counts.all += 1;
  }
  return counts;
}
