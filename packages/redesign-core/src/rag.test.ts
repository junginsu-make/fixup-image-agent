import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_SIMILARITY,
  filterByRelevance,
  normalizeKnowledgeKind,
  type RetrievedKnowledge,
} from "./rag.js";

function chunk(similarity: number, sourceName = "문서"): RetrievedKnowledge {
  return { sourceName, chunkIndex: 0, content: "내용", similarity };
}

describe("지식 종류", () => {
  it("정해진 값만 통과한다", () => {
    expect(normalizeKnowledgeKind("sales")).toBe("sales");
    expect(normalizeKnowledgeKind("redesign")).toBe("redesign");
  });

  // 기존 문서는 전부 리디자인 전사본이다. 종류를 몰라서 판매 지식으로 분류되면
  // 남의 페이지 문구가 판매 원칙 행세를 하게 된다.
  it("모르는 값과 빈 값은 redesign 으로 떨어진다", () => {
    expect(normalizeKnowledgeKind(undefined)).toBe("redesign");
    expect(normalizeKnowledgeKind("")).toBe("redesign");
    expect(normalizeKnowledgeKind("판매")).toBe("redesign");
    expect(normalizeKnowledgeKind("SALES")).toBe("redesign");
  });
});

describe("유사도 하한", () => {
  it("하한 미만은 버린다", () => {
    const kept = filterByRelevance([chunk(0.71), chunk(0.42), chunk(0.12)], 0.4);
    expect(kept.map((item) => item.similarity)).toEqual([0.71, 0.42]);
  });

  it("경계값은 남긴다", () => {
    expect(filterByRelevance([chunk(0.4)], 0.4)).toHaveLength(1);
  });

  it("순서를 바꾸지 않는다", () => {
    const kept = filterByRelevance([chunk(0.9, "가"), chunk(0.8, "나"), chunk(0.7, "다")], 0.5);
    expect(kept.map((item) => item.sourceName)).toEqual(["가", "나", "다"]);
  });

  // 지식이 없는 것과 엉뚱한 지식이 있는 것은 다르다.
  // 전부 미달이면 빈 배열을 주고, 호출부는 지식 없이 진행한다.
  it("전부 미달이면 빈 배열", () => {
    expect(filterByRelevance([chunk(0.1), chunk(0.05)], 0.4)).toEqual([]);
  });

  it("하한이 0 이면 아무것도 버리지 않는다", () => {
    expect(filterByRelevance([chunk(0), chunk(0.5)], 0)).toHaveLength(2);
  });

  it("기본 하한은 무관한 조각을 걸러낼 만큼은 높다", () => {
    // 코사인 유사도는 무관한 문장 쌍에서도 0.1~0.25 언저리가 흔히 나온다.
    expect(DEFAULT_MIN_SIMILARITY).toBeGreaterThan(0.25);
    // 너무 높이면 지식이 있는데도 못 찾는다.
    expect(DEFAULT_MIN_SIMILARITY).toBeLessThan(0.6);
  });
});
