import { describe, expect, it } from "vitest";
import {
  DEFAULT_CANDIDATE_SORT,
  bodyLabel,
  filterAndSortCandidates,
  sourceLabel,
} from "../candidate-list";
import type { CandidateRecord } from "../../api/candidates/candidate-service";

function candidate(patch: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    id: "c1",
    sourceId: "s1",
    title: "제목",
    url: "https://example.com/a",
    author: "작성자",
    keyPoints: [],
    body: "본문",
    summary: "요약",
    thumbnailUrl: null,
    publishedAt: "2026-08-28T00:47:59.000Z",
    collectedAt: "2026-08-28T10:10:38.000Z",
    status: "new",
    source: { id: "s1", name: "조코딩", kind: "youtube_channel" },
    ...patch,
  };
}

describe("소스 이름표", () => {
  it("원시 종류 대신 사람이 읽는 말을 쓴다", () => {
    // 화면에 youtube_channel 이 그대로 보이면 기존 시스템보다 나빠진 것이다.
    expect(sourceLabel(candidate())).toBe("YouTube");
    expect(sourceLabel(candidate({ source: { id: "s", name: "n", kind: "naver_news" } }))).toBe("네이버 뉴스");
    expect(sourceLabel(candidate({ source: { id: "s", name: "n", kind: "official_ai" } }))).toBe("글로벌 AI 모델 소식");
    expect(sourceLabel(candidate({ source: { id: "s", name: "n", kind: "rss" } }))).toBe("뉴스·블로그");
    expect(sourceLabel(candidate({ source: { id: "s", name: "n", kind: "community" } }))).toBe("커뮤니티");
  });

  it("모르는 종류나 지워진 소스는 웹 문서로 둔다", () => {
    expect(sourceLabel(candidate({ source: { id: "s", name: "n", kind: "무언가" } }))).toBe("웹 문서");
    expect(sourceLabel(candidate({ source: null }))).toBe("웹 문서");
  });
});

describe("본문 이름표", () => {
  it("소스마다 본문이 무엇인지 다르게 부른다", () => {
    expect(bodyLabel(candidate())).toBe("영상 자막");
    expect(bodyLabel(candidate({ source: { id: "s", name: "n", kind: "community" } }))).toBe("게시글 본문");
    expect(bodyLabel(candidate({ source: { id: "s", name: "n", kind: "official_ai" } }))).toBe("공식 발표 본문");
    expect(bodyLabel(candidate({ source: { id: "s", name: "n", kind: "rss" } }))).toBe("기사 본문");
    expect(bodyLabel(candidate({ source: null }))).toBe("수집 본문");
  });
});

describe("열 필터와 정렬", () => {
  const items = [
    candidate({ id: "a", title: "가나다", collectedAt: "2026-08-26T00:00:00.000Z" }),
    candidate({ id: "b", title: "라마바", collectedAt: "2026-08-28T00:00:00.000Z", author: "다른 사람" }),
    candidate({ id: "c", title: "사아자", collectedAt: "2026-08-27T00:00:00.000Z", thumbnailUrl: "https://img", status: "picked" }),
  ];

  it("기본은 수집일 최신순이다", () => {
    expect(filterAndSortCandidates(items).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("제목 오름차순으로 뒤집을 수 있다", () => {
    const sorted = filterAndSortCandidates(items, {}, { key: "title", direction: "asc" });
    expect(sorted.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("제목·작성자로 걸러낸다", () => {
    expect(filterAndSortCandidates(items, { title: "라마" }).map((item) => item.id)).toEqual(["b"]);
    expect(filterAndSortCandidates(items, { author: "다른" }).map((item) => item.id)).toEqual(["b"]);
  });

  it("첨부 이미지 있음·없음으로 걸러낸다", () => {
    expect(filterAndSortCandidates(items, { thumbnail: "yes" }).map((item) => item.id)).toEqual(["c"]);
    expect(filterAndSortCandidates(items, { thumbnail: "no" }).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("상태와 소스 종류로 걸러낸다", () => {
    expect(filterAndSortCandidates(items, { status: "picked" }).map((item) => item.id)).toEqual(["c"]);
    expect(filterAndSortCandidates(items, { sourceKind: "rss" })).toEqual([]);
    expect(filterAndSortCandidates(items, { sourceKind: "youtube_channel" })).toHaveLength(3);
  });

  it("수집일을 그 지역 날짜로 맞춰 거른다", () => {
    // 화면에 보이는 날짜와 필터가 어긋나면 사용자는 항목이 사라졌다고 생각한다.
    const day = filterAndSortCandidates(items, {})[0].collectedAt;
    const local = new Date(day);
    const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    expect(filterAndSortCandidates(items, { collectedDate: key }).map((item) => item.id)).toEqual(["b"]);
  });

  it("기본 정렬은 수집일 내림차순이다", () => {
    expect(DEFAULT_CANDIDATE_SORT).toEqual({ key: "collectedAt", direction: "desc" });
  });
});
