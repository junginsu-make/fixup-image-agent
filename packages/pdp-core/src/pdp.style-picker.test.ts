import { describe, expect, it } from "vitest";
import {
  LLM_PICK_THRESHOLD,
  buildStylePickPrompt,
  normalizeStylePick,
  resolvePickedReference,
} from "./pdp.style-picker";
import type { StyleReferenceMatch } from "./pdp.style-reference";
import type { ProductBrief } from "./types";

const brief: ProductBrief = {
  offeringName: "예천 들기름",
  offeringKind: "other",
  oneLiner: "3대째 저온압착",
  audience: "성분을 따지는 30대",
  problem: "향이 날아간다",
  outcome: "반찬의 격이 올라간다",
  differentiators: ["저온압착"],
  objections: ["비싸다"],
  pricePositioning: "프리미엄",
  tone: "진정성 있고 소박함",
  assumptions: [],
  sourceText: "원문",
};

const candidates: StyleReferenceMatch[] = [
  { id: "a", name: "흙빛 수공예", description: "팔레트: 크라프트 베이지\n어울리는 상품군: 전통 식품, 오가닉", imageBase64: "AAA", mimeType: "image/png", similarity: 0.31 },
  { id: "b", name: "산뜻한 파스텔", description: "팔레트: 민트\n어울리는 상품군: 비타민", imageBase64: "BBB", mimeType: "image/png", similarity: 0.44 },
  { id: "c", name: "어두운 럭셔리", description: "팔레트: 차콜과 금색\n어울리는 상품군: 주류", imageBase64: "CCC", mimeType: "image/png", similarity: 0.33 },
];

describe("고르기 프롬프트", () => {
  const prompt = buildStylePickPrompt(brief, candidates);

  it("후보를 번호와 서술로 늘어놓는다", () => {
    expect(prompt).toContain("흙빛 수공예");
    expect(prompt).toContain("전통 식품");
    expect(prompt).toContain("어두운 럭셔리");
  });

  it("무엇을 파는지 알려준다", () => {
    expect(prompt).toContain("예천 들기름");
    expect(prompt).toContain("진정성 있고 소박함");
  });

  // 유사도는 잡음이라는 것을 확인했다. 보여주면 모델이 그 순위에 끌려간다.
  it("유사도 점수를 보여주지 않는다", () => {
    expect(prompt).not.toContain("0.44");
    expect(prompt).not.toContain("유사도");
  });

  // 어울리는 것이 없는데 억지로 씌우면, 반영 강도가 "디자인 전체"라 해가 된다.
  it("고르지 않아도 된다고 알려준다", () => {
    expect(prompt).toMatch(/없으면|없다면|어울리는 것이 없/);
  });
});

describe("응답 해석", () => {
  it("고른 id 와 이유를 읽는다", () => {
    const pick = normalizeStylePick({ referenceId: "a", confidence: 0.8, reason: "전통 식품에 맞다" });
    expect(pick.referenceId).toBe("a");
    expect(pick.reason).toBe("전통 식품에 맞다");
  });

  it("아무것도 안 골랐으면 빈 값", () => {
    expect(normalizeStylePick({ referenceId: "", confidence: 0, reason: "어울리는 것이 없다" }).referenceId).toBe("");
    expect(normalizeStylePick({ referenceId: "none" }).referenceId).toBe("");
  });

  it("응답이 망가져도 죽지 않는다", () => {
    for (const broken of [null, undefined, "문자열", 42, []]) {
      expect(normalizeStylePick(broken).referenceId).toBe("");
    }
  });

  it("확신도는 0~1 로 눌러 담는다", () => {
    expect(normalizeStylePick({ referenceId: "a", confidence: 5 }).confidence).toBe(1);
    expect(normalizeStylePick({ referenceId: "a", confidence: -2 }).confidence).toBe(0);
    expect(normalizeStylePick({ referenceId: "a", confidence: "높음" }).confidence).toBe(0);
  });
});

describe("최종 결정", () => {
  it("고른 것을 후보에서 찾아 돌려준다", () => {
    const picked = resolvePickedReference(candidates, { referenceId: "a", confidence: 0.9, reason: "" });
    expect(picked?.name).toBe("흙빛 수공예");
  });

  it("없는 id 를 고르면 무시한다", () => {
    expect(resolvePickedReference(candidates, { referenceId: "zzz", confidence: 0.9, reason: "" })).toBeNull();
  });

  // 확신 없이 고른 것을 페이지 전체 디자인으로 삼으면 안 된다.
  it("확신이 낮으면 쓰지 않는다", () => {
    expect(resolvePickedReference(candidates, { referenceId: "a", confidence: 0.2, reason: "" })).toBeNull();
    expect(LLM_PICK_THRESHOLD).toBeGreaterThan(0.3);
  });

  it("아무것도 안 골랐으면 없음", () => {
    expect(resolvePickedReference(candidates, { referenceId: "", confidence: 0, reason: "" })).toBeNull();
  });
});
