import { describe, expect, it } from "vitest";
import { endingPrompt, endingToFill, fallbackEnding, readEnding } from "../cardnews-ending";

/**
 * **마지막 장 원고를 채운다**(2026-09-30 사용자 결정 B — 「쉽게 안에서만 고치세요」).
 *
 * 기존 카드뉴스 흐름은 마지막 장에 「핵심 내용을 기억해 주세요」만 넣는다
 * (`lib/sns/actual-flow.ts:92-100`). 카드뉴스 화면은 만들기 전에 사람이 고치지만
 * 「쉽게」에는 그 단계가 없어, 실제로 만들어 보니 마지막 장이 비어 나왔다.
 */

const 카드 = (over: Record<string, unknown>) => ({ index: 1, role: "body", kind: "generated", copy: { headline: "h" }, status: "pending", ...over });
const 작업 = (cards: unknown[], language = "ko") => ({ language, data: { flow: { cards } } }) as never;

const 원고 = [
  카드({ index: 1, role: "cover", copy: { headline: "건강기능식품, 이렇게 고르세요", body: "고르는 법" } }),
  카드({ index: 2, copy: { headline: "제품보다 ‘내 건강 목표’부터", body: "목표부터 정하세요" } }),
  카드({ index: 3, kind: "place_as_is", copy: { headline: "사용자 원본" } }),
  카드({ index: 4, copy: { headline: "가격표 말고 ‘하루 비용’", body: "하루 비용을 비교" } }),
  카드({ index: 5, role: "ending", copy: { headline: "핵심 내용을 기억해 주세요" } }),
];

describe("채울 마지막 장", () => {
  it("AI 가 만드는 빈 마지막 장이면 그 번호", () => {
    expect(endingToFill(작업(원고))).toBe(5);
  });

  it("끝 장 그림을 붙였으면(원본 그대로 끝 장) 안 채운다", () => {
    expect(endingToFill(작업([...원고.slice(0, 4), 카드({ index: 5, role: "ending", kind: "ending_image", copy: { headline: "x" } })]))).toBeUndefined();
  });

  it("이미 본문이 있으면 안 채운다", () => {
    expect(endingToFill(작업([...원고.slice(0, 4), 카드({ index: 5, role: "ending", copy: { headline: "정리", body: "있음" } })]))).toBeUndefined();
  });

  it("원고가 없으면 안 채운다", () => {
    expect(endingToFill(작업([]))).toBeUndefined();
  });
});

describe("정리 문장 부탁", () => {
  it("앞 장의 제목 · 본문을 주고, 원본 그대로 장은 빼고, 원고 언어로 쓰게 한다", () => {
    const prompt = endingPrompt(작업(원고, "en"));
    expect(prompt).toContain("제품보다 ‘내 건강 목표’부터");
    expect(prompt).toContain("하루 비용을 비교");
    expect(prompt).not.toContain("사용자 원본");
    expect(prompt).not.toContain("핵심 내용을 기억해 주세요");
    expect(prompt).toContain("영어");
  });
});

describe("받은 정리 문장", () => {
  it("제목과 본문을 다듬어 받는다", () => {
    expect(readEnding({ headline: "  핵심만 다시 정리해요 ", body: "· 목표부터\n· 하루 비용 비교" }))
      .toEqual({ headline: "핵심만 다시 정리해요", body: "· 목표부터\n· 하루 비용 비교" });
  });

  it("비었거나 모양이 틀리면 버린다", () => {
    expect(readEnding({ headline: "", body: "x" })).toBeUndefined();
    expect(readEnding({ headline: "x", body: "  " })).toBeUndefined();
    expect(readEnding(null)).toBeUndefined();
  });

  it("너무 길면 자른다", () => {
    const got = readEnding({ headline: "가".repeat(80), body: "나".repeat(500) })!;
    expect(got.headline.length).toBeLessThanOrEqual(40);
    expect(got.body.length).toBeLessThanOrEqual(220);
  });
});

describe("AI 가 못 쓰면", () => {
  it("앞 장 제목으로 목록을 만든다, 원본 그대로 장과 표지는 뺀다", () => {
    expect(fallbackEnding(작업(원고))).toEqual({
      headline: "오늘의 핵심 정리",
      body: "· 제품보다 ‘내 건강 목표’부터\n· 가격표 말고 ‘하루 비용’",
    });
  });

  it("원고 언어에 맞춘 제목", () => {
    expect(fallbackEnding(작업(원고, "en")).headline).toBe("Key takeaways");
  });

  it("다섯 줄까지만", () => {
    const 많은 = [원고[0], ...Array.from({ length: 7 }, (_, i) => 카드({ index: i + 2, copy: { headline: `h${i}` } })), 카드({ index: 9, role: "ending", copy: { headline: "x" } })];
    expect(fallbackEnding(작업(많은)).body.split("\n")).toHaveLength(5);
  });
});
