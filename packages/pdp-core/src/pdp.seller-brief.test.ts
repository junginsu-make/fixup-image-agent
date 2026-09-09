import { describe, expect, it } from "vitest";
import {
  buildSellerBriefPrompt,
  hasSellerBrief,
  normalizeSellerBrief,
} from "./pdp.seller-brief";
import { buildAnalyzePrompt } from "./pdp.service";

/**
 * 사진으로는 대상·불편·차별점을 알 수 없다. 판매 원칙이 요구하는 것이 정확히
 * 그 셋이라, 모르면 모델이 그럴듯한 일반론으로 메운다.
 *
 * 전부 선택 입력이다 — 다 채워야 시작할 수 있으면 사진 경로의 미덕인 '빠름'이 사라진다.
 */

describe("판매자 입력 정리", () => {
  it("공백만 있는 값은 없는 것으로 본다", () => {
    const brief = normalizeSellerBrief({ audience: "   ", problem: "", differentiator: "\n" });
    expect(brief.audience).toBeUndefined();
    expect(brief.problem).toBeUndefined();
    expect(brief.differentiator).toBeUndefined();
  });

  it("앞뒤 공백을 다듬는다", () => {
    expect(normalizeSellerBrief({ audience: "  30대 직장인  " }).audience).toBe("30대 직장인");
  });

  it("지나치게 길면 자른다", () => {
    // 한 칸이 프롬프트를 밀어내면 정작 규칙이 묻힌다.
    const long = "가".repeat(900);
    expect(normalizeSellerBrief({ problem: long }).problem).toHaveLength(500);
  });

  it("아무것도 안 주면 빈 객체", () => {
    expect(normalizeSellerBrief(undefined)).toEqual({});
    expect(hasSellerBrief(normalizeSellerBrief(undefined))).toBe(false);
  });
});

describe("프롬프트 문장", () => {
  it("채운 칸만 넣는다", () => {
    // 빈 칸을 "(없음)"으로 채워 보내면 모델이 그 자리를 채워야 할 곳으로 읽고 지어낸다.
    const prompt = buildSellerBriefPrompt({ audience: "30대 직장인" });
    expect(prompt).toContain("30대 직장인");
    expect(prompt).not.toContain("겪는 불편");
    expect(prompt).not.toContain("남과 다른 점");
  });

  it("사진보다 우선한다고 말한다", () => {
    const prompt = buildSellerBriefPrompt({ audience: "30대 직장인" });
    expect(prompt).toContain("판매자가 직접 적은 사실");
    expect(prompt).toContain("우선한다");
  });

  it("각 칸을 어디에 쓰는지 알려준다", () => {
    // 값만 던지면 모델이 어느 섹션에 쓸지 스스로 정한다.
    const prompt = buildSellerBriefPrompt({
      audience: "30대 직장인",
      problem: "손이 끈적인다",
      differentiator: "점증제를 안 넣는다",
    });
    expect(prompt).toContain("대상을 넓히지 않는다");
    expect(prompt).toContain("문제 섹션은 이 장면에서 출발한다");
    expect(prompt).toContain("다른 우위를 지어내지 않는다");
  });

  it("전부 비면 아무 말도 하지 않는다", () => {
    expect(buildSellerBriefPrompt(undefined)).toBe("");
    expect(buildSellerBriefPrompt({})).toBe("");
    expect(buildSellerBriefPrompt({ audience: "  " })).toBe("");
  });
});

describe("분석 프롬프트에 실린다", () => {
  it("채운 값이 프롬프트에 닿는다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image", {
      audience: "아침에 화장이 밀리는 30대 직장인",
    });
    expect(prompt).toContain("아침에 화장이 밀리는 30대 직장인");
  });

  it("제품 읽기보다 앞에 온다", () => {
    // 판매자가 적은 것은 사진보다 우선하는 사실이라 먼저 읽어야 한다.
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image", {
      audience: "30대 직장인",
    });
    expect(prompt.indexOf("# 파는 사람이 알려준 것")).toBeLessThan(
      prompt.indexOf("먼저 제품을 읽는다"),
    );
  });

  it("안 주면 그 블록이 없다", () => {
    // 머리글로 정확히 본다. "파는 사람이 알려준 것" 이라는 표현은 빈칸 규칙도
    // 쓴다(근거의 기준을 설명하면서) — 느슨하게 보면 엉뚱한 데서 걸린다.
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt).not.toContain("# 파는 사람이 알려준 것");
  });
});

/**
 * **제품의 특징을 적을 칸이 없었다.**
 *
 * 「남과 다른 점」 한 칸에 성분·소재·규격·사용법을 다 몰아넣어야 했다. 사진은
 * 형태·색·재질만 말해 주므로, 성분표나 시험 수치는 파는 사람이 적어야 나온다.
 *
 * 반대로 `extra`(그 밖에)는 화면의 「그 밖에」(`additionalInfo`)와 하는 일이
 * 겹쳤다 — 둘 다 채널·시즌이다. 화면은 `extra` 를 채운 적이 없었다.
 */
describe("제품의 특징과 꼭 넣을 말", () => {
  it("특징이 프롬프트에 실린다", () => {
    const prompt = buildSellerBriefPrompt({ features: "히알루론산 5종, 무향" });
    expect(prompt).toContain("히알루론산 5종, 무향");
    expect(prompt).toMatch(/특징/);
  });

  it("꼭 넣을 말이 프롬프트에 실린다", () => {
    const prompt = buildSellerBriefPrompt({ emphasis: "3대째 같은 방식" });
    expect(prompt).toContain("3대째 같은 방식");
  });

  /** 사진으로 알 수 없는 사실이라 지어낸 것이 아니라고 못 박아야 한다. */
  it("판매자가 적은 사실이라는 용도가 함께 간다", () => {
    const prompt = buildSellerBriefPrompt({ features: "무향" });
    const 특징줄 = prompt.split("\n").findIndex((line) => line.includes("무향"));
    expect(prompt.split("\n")[특징줄 + 1]).toMatch(/→/);
  });

  it("겹치던 「그 밖에」 칸은 없앴다 — 화면의 그 칸은 다른 자리로 간다", () => {
    const brief = normalizeSellerBrief({ extra: "여름 시즌" } as never);
    expect((brief as Record<string, unknown>).extra).toBeUndefined();
  });

  it("새 칸도 비우면 아무 말도 안 한다", () => {
    expect(buildSellerBriefPrompt({ features: "  ", emphasis: "" })).toBe("");
  });

  it("순서는 대상 → 불편 → 특징 → 차별점 → 꼭 넣을 말", () => {
    const prompt = buildSellerBriefPrompt({
      audience: "A",
      problem: "B",
      features: "C",
      differentiator: "D",
      emphasis: "E",
    });
    const at = (value: string) => prompt.indexOf(`: ${value}`);
    expect(at("A")).toBeLessThan(at("B"));
    expect(at("B")).toBeLessThan(at("C"));
    expect(at("C")).toBeLessThan(at("D"));
    expect(at("D")).toBeLessThan(at("E"));
  });
});
