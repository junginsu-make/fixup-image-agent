/**
 * 검수 결과를 사람 말로.
 *
 * 검수 스키마의 값(extraCopy, uncertain, changed, missing, accent…)이 화면에
 * 그대로 나오고 있었다. 만든 사람에게는 뜻이 있지만 쓰는 사람에게는 암호다.
 *
 * 그리고 걸린 것이 많을수록 카드가 길어진다. 먼저 한 줄로 몇 가지인지 알리고,
 * 자세한 것은 접어 둔다.
 */

/** 긴 것부터 바꾼다 — 짧은 말이 먼저 걸리면 긴 말이 안 바뀐다. */
const TERMS: Array<[RegExp, string]> = [
  [/extraCopy(\.status)?/g, "원고에 없는 글자"],
  [/textFidelity/g, "원고와 맞는지"],
  [/not_applicable/g, "해당 없음"],
  [/uncertain/g, "확실하지 않음"],
  [/\bchanged\b/g, "원고와 다르게 쓰임"],
  [/\bmissing\b/g, "빠짐"],
  [/\bpresent\b/g, "있음"],
  [/\bexact\b/g, "원고 그대로"],
  [/\bheadline\b/g, "제목 문구"],
  [/\bfootnote\b/g, "각주 문구"],
  [/\baccent\b/g, "강조 문구"],
  [/\bbody\b/g, "본문 문구"],
  [/\bnone\b/g, "없음"],
  [/\bpass\b/g, "통과"],
  [/\bfail\b/g, "걸림"],
];

export function plainReviewLine(line: string): string {
  return TERMS.reduce((text, [pattern, korean]) => text.replace(pattern, korean), line);
}

const MAX_HEADLINE = 90;

/**
 * 접었을 때 보일 한 줄.
 *
 * 몇 가지가 걸렸는지가 가장 먼저 알아야 할 것이다. 펼치기 전에 그것만 준다.
 */
export function reviewHeadline(decision: "pass" | "fail", summary: string, issues: string[]): string {
  const base = plainReviewLine(summary).trim()
    || (decision === "pass" ? "검수를 통과했습니다" : "사람이 확인해야 할 곳이 있습니다");
  const withCount = issues.length ? `${base} · ${issues.length}가지` : base;
  return withCount.length > MAX_HEADLINE ? `${withCount.slice(0, MAX_HEADLINE - 1)}…` : withCount;
}
