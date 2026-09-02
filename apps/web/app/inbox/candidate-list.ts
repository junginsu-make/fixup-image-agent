import type { CandidateRecord } from "../api/candidates/candidate-service";
import type { CandidateStatus } from "../api/candidates/schema";

/**
 * 수집함 표의 거르기·정렬.
 *
 * 기존 독립 시스템(instargram automation)의 candidate-list·candidate-presentation
 * 을 그대로 옮긴 것이다. 통합하면서 열이 11개에서 6개로 줄고 정렬·필터·검색이
 * 사라졌는데, 하루 수십 건이 쌓이는 화면에서 그건 기능을 잃은 것이다.
 *
 * 소스 종류는 기존과 달리 추측하지 않는다 — 새 구조는 후보가 소스를 직접
 * 가리키므로 그 종류를 그대로 쓴다.
 */

const SOURCE_LABELS: Record<string, string> = {
  rss: "뉴스·블로그",
  youtube_channel: "YouTube",
  youtube_video: "YouTube",
  community: "커뮤니티",
  naver_news: "네이버 뉴스",
  official_ai: "글로벌 AI 모델 소식",
};

export const SOURCE_TABS: Array<{ value: string; label: string }> = [
  { value: "all", label: "전체 콘텐츠" },
  { value: "youtube_channel", label: "유튜브" },
  { value: "naver_news", label: "네이버 뉴스" },
  { value: "official_ai", label: "글로벌 AI 모델 소식" },
  { value: "rss", label: "뉴스·블로그" },
  { value: "community", label: "커뮤니티" },
];

export function sourceKind(candidate: CandidateRecord): string | undefined {
  const kind = candidate.source?.kind;
  return kind && kind in SOURCE_LABELS ? kind : undefined;
}

export function sourceLabel(candidate: CandidateRecord): string {
  const kind = sourceKind(candidate);
  return kind ? SOURCE_LABELS[kind] : "웹 문서";
}

/** 본문이 무엇인지 소스마다 다르게 부른다. 자막과 기사 본문은 같은 물건이 아니다. */
export function bodyLabel(candidate: CandidateRecord): string {
  const kind = sourceKind(candidate);
  if (kind === "youtube_channel" || kind === "youtube_video") return "영상 자막";
  if (kind === "community") return "게시글 본문";
  if (kind === "official_ai") return "공식 발표 본문";
  if (kind === "rss" || kind === "naver_news") return "기사 본문";
  return "수집 본문";
}

export type CandidateSortKey =
  | "title" | "publishedAt" | "collectedAt" | "author"
  | "sourceKind" | "summary" | "status" | "url" | "body" | "thumbnail";
export type CandidateSortDirection = "asc" | "desc";

export interface CandidateColumnFilters {
  title?: string;
  publishedDate?: string;
  collectedDate?: string;
  author?: string;
  sourceKind?: string;
  summary?: string;
  status?: CandidateStatus | "all";
  url?: string;
  body?: string;
  thumbnail?: "all" | "yes" | "no";
}

export interface CandidateSort {
  key: CandidateSortKey;
  direction: CandidateSortDirection;
}

export const DEFAULT_CANDIDATE_SORT: CandidateSort = { key: "collectedAt", direction: "desc" };
export const EMPTY_CANDIDATE_FILTERS: CandidateColumnFilters = {
  sourceKind: "all", status: "all", thumbnail: "all",
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("ko");
}

/** 화면에 보이는 날짜와 같은 기준으로 자른다. UTC 로 자르면 하루가 어긋난다. */
function localDateKey(value: string): string {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function includes(value: string | null | undefined, query: string | undefined): boolean {
  const normalized = normalize(query);
  return !normalized || normalize(value).includes(normalized);
}

function sortValue(candidate: CandidateRecord, key: CandidateSortKey): string | number {
  switch (key) {
    case "collectedAt": return Date.parse(candidate.collectedAt) || 0;
    case "publishedAt": return candidate.publishedAt ? Date.parse(candidate.publishedAt) || 0 : 0;
    case "author": return normalize(candidate.author);
    case "sourceKind": return sourceLabel(candidate);
    case "summary": return normalize(candidate.summary);
    case "status": return candidate.status;
    case "url": return normalize(candidate.url);
    case "body": return normalize(candidate.body);
    case "thumbnail": return candidate.thumbnailUrl ? 1 : 0;
    default: return normalize(candidate.title);
  }
}

export function filterAndSortCandidates(
  items: CandidateRecord[],
  filters: CandidateColumnFilters = {},
  sort: CandidateSort = DEFAULT_CANDIDATE_SORT,
): CandidateRecord[] {
  const filtered = items.filter((candidate) => {
    const hasThumbnail = Boolean(candidate.thumbnailUrl);
    return includes(candidate.title, filters.title)
      && (!filters.publishedDate || Boolean(candidate.publishedAt && localDateKey(candidate.publishedAt) === filters.publishedDate))
      && (!filters.collectedDate || localDateKey(candidate.collectedAt) === filters.collectedDate)
      && includes(candidate.author, filters.author)
      && (!filters.sourceKind || filters.sourceKind === "all" || sourceKind(candidate) === filters.sourceKind)
      && includes(candidate.summary, filters.summary)
      && (!filters.status || filters.status === "all" || candidate.status === filters.status)
      && includes(candidate.url, filters.url)
      && includes(`${bodyLabel(candidate)} ${candidate.body ?? ""}`, filters.body)
      && (!filters.thumbnail || filters.thumbnail === "all" || (filters.thumbnail === "yes") === hasThumbnail);
  });

  const direction = sort.direction === "asc" ? 1 : -1;
  return filtered.sort((left, right) => {
    const leftValue = sortValue(left, sort.key);
    const rightValue = sortValue(right, sort.key);
    const compared = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), "ko");
    if (compared !== 0) return compared * direction;
    return right.collectedAt.localeCompare(left.collectedAt);
  });
}

/** 표 칸에 넣을 짧은 미리보기. 줄바꿈을 없애야 칸 높이가 흔들리지 않는다. */
export function preview(value: string | null | undefined, length = 240): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
}
