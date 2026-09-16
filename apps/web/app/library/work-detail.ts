import type { WorkProcess } from "../api/library/work-process";

/**
 * 「과정 보기」 화면이 **무엇을 어떤 이름으로** 보여주나.
 *
 * 카드뉴스·포스터는 단계 막대가 있지만 상세페이지는 한 번에 만들어져 단계가
 * 없다. 그래서 캐릭터 화면과 같은 모양을 쓴다 — 「무엇을 하려 했나 → 어떤
 * 섹션으로 짰나 → 만들어진 그림」.
 *
 * **남의 작업에서 오는 값이라 모양을 믿지 않는다.** 과정은 json 한 칸이라
 * 무엇이든 들어 있을 수 있다(`library_items.data`).
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 값으로 잰다.
 */

export interface DetailRow { label: string; value: string }

export interface SectionRow { no: number; title: string; role: string; copy: string }

/** 심사 항목이 몇 개인가. 모양이 다르면 `0` 이다. */
function reviewCount(review: unknown): number {
  if (!review || typeof review !== "object") return 0;
  const items = (review as { items?: unknown }).items;
  return Array.isArray(items) ? items.length : 0;
}

/**
 * 과정의 머리말 — 무엇을 하려던 것인가, 어떤 값으로 만들었나.
 *
 * **빈 값은 줄을 만들지 않는다.** 빈 줄이 서면 화면이 고장난 것처럼 보인다.
 * 하나도 없으면 빈 배열이고, 화면은 「과정이 남아 있지 않습니다」라고 **말해야**
 * 한다 — 빈 화면만 내면 사라진 것으로 읽힌다.
 */
export function processRows(process: WorkProcess | null | undefined): DetailRow[] {
  if (!process) return [];
  const reviewed = reviewCount(process.review);

  return [
    { label: "무엇을 하려던 것인가", value: process.summary ?? "" },
    { label: "비율", value: process.aspectRatio ?? "" },
    // 심사는 항목마다 근거와 고칠 점이 붙어 길다. 여기서는 몇 개를 봤는지만
    // 말한다.
    { label: "구성안 심사", value: reviewed ? `${reviewed}개 항목을 봤습니다` : "" },
  ].filter((row) => row.value);
}

/** 섹션을 번호 붙여 차례로 편다. */
export function sectionRows(process: WorkProcess | null | undefined): SectionRow[] {
  const sections = process?.sections;
  if (!Array.isArray(sections)) return [];

  return sections
    .filter((section) => section && typeof section === "object")
    .map((section, index) => ({
      no: index + 1,
      title: typeof section.title === "string" ? section.title : "",
      role: typeof section.role === "string" ? section.role : "",
      copy: typeof section.copy === "string" ? section.copy : "",
    }));
}
