import type { LandingPageBlueprint, SectionBlueprint } from "./types";

/**
 * **그 심사가 지금 구성안을 본 것인가**(N-3, 설계 §9.3·§10.1).
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 *
 * 심사 결과는 한 번 받으면 그대로 남았다. 사용자가 섹션을 지우거나 제목을
 * 고쳐도 **「모두 통과했습니다」가 그대로 붙어 있었다.** 사용자는 고친
 * 구성안이 검사를 통과한 줄 안다.
 *
 * 설계 §9.3: 「변경 후 기존 심사 결과는 **stale 표시**. '이전 구성안 심사
 * 통과'를 새 구성안에 붙이지 않는다」.
 * 설계 §10.1: 「상태는 `pass|fail|weak|incomplete|unavailable|**stale**` 을
 * 구분한다」.
 *
 * ── 무엇으로 「바뀌었다」를 아는가 ─────────────────────────
 *
 * 심사가 본 것을 **그때 한 번 적어 둔다.** 지금 구성안과 다르면 낡은 것이다.
 *
 * 무엇을 적는가가 중요하다. **심사가 실제로 보는 것만** 적는다 —
 * `buildReviewPrompt` 는 구성안의 문구와 섹션 구성을 준다. 그래서 문구·섹션
 * 목록·차례가 바뀌면 낡고, **이미지나 레이어가 바뀌는 것은 심사와 무관**하다.
 * 무관한 변화로 낡았다고 하면 사용자는 이미지를 만들 때마다 심사를 다시
 * 받아야 한다.
 */

/** 심사가 본 구성안의 자국. 사람이 읽을 것이 아니라 대조용이다. */
export type ReviewStamp = string;

const 칸 = (section: SectionBlueprint): string =>
  [
    section.section_id ?? "",
    section.section_name ?? "",
    section.headline ?? "",
    section.subheadline ?? "",
    (section.bullets ?? []).join(""),
    section.trust_or_objection_line ?? "",
    section.CTA ?? "",
  ].join("");

/**
 * 지금 구성안의 자국을 찍는다.
 *
 * **차례도 센다.** 섹션을 옮기면 페이지가 읽히는 흐름이 바뀌고, 심사 항목에
 * 흐름(`flow`)이 있다.
 */
export function reviewStampOf(blueprint: LandingPageBlueprint | null | undefined): ReviewStamp {
  if (!blueprint) return "";
  const sections = Array.isArray(blueprint.sections) ? blueprint.sections : [];
  return [blueprint.executiveSummary ?? "", ...sections.map(칸)].join("");
}

/**
 * 그 심사가 지금 구성안에 대한 것인가.
 *
 * **자국이 없으면 낡았다고 하지 않는다.** 옛 초안에는 이 값이 없다. 없는
 * 것을 낡았다고 하면 멀쩡한 심사가 전부 경고를 달고 뜬다 — 그러면 사용자는
 * 경고 전체를 무시한다.
 */
export function isReviewStale(stamp: ReviewStamp | undefined, blueprint: LandingPageBlueprint | null | undefined): boolean {
  // 자국이 없으면 옛 심사다. 없는 것을 낡았다고 하지 않는다.
  if (!stamp) return false;
  // **지금 구성안을 모르면 판단하지 않는다.** 대조할 것이 없다.
  if (!blueprint) return false;
  return stamp !== reviewStampOf(blueprint);
}

/** 낡은 심사 옆에 붙일 말. */
export const REVIEW_STALE_NOTICE =
  "이 심사는 구성안을 고치기 전 결과입니다. 지금 구성안은 아직 검사하지 않았습니다.";
