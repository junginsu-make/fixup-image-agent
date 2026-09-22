import { describe, expect, it } from "vitest";
import { photoGapPolicyRules } from "./pdp.product-reading";
import { intensityRules } from "./pdp.copy-intensity";
import { buildAnalyzePrompt } from "./pdp.service";
import { sectionPlanGaps } from "./pdp.section-plan";

/**
 * 표현 강도와 빈칸 처리는 텍스트 경로에만 있었다. 같은 사람이 같은 제품을 파는데
 * **어느 길로 들어왔느냐에 따라 조절기가 사라지는** 상태였다.
 *
 * 빈칸 규칙은 문구를 따로 쓴다. 텍스트 경로는 "원문에 있는가"를 묻는데 사진
 * 경로에는 원문이 없다 — 그 규칙을 그대로 가져오면 모델이 없는 원문을 찾다가
 * 아무 근거나 원문이라고 부른다.
 */

describe("사진 경로 빈칸 규칙", () => {
  it("근거의 기준이 사진과 판매자 입력이라고 말한다", () => {
    for (const policy of ["omit", "ask", "sample"] as const) {
      const rules = photoGapPolicyRules(policy);
      expect(rules, policy).toContain("visibleFacts");
      expect(rules, policy).toContain("파는 사람이 알려준 것");
    }
  });

  it("원문을 근거로 삼으라고 말하지 않는다", () => {
    // 사진 경로에는 원문이 없다.
    for (const policy of ["omit", "ask", "sample"] as const) {
      expect(photoGapPolicyRules(policy), policy).not.toContain("원문에");
    }
  });

  it("빼기는 문장 수가 줄어도 된다고 말한다", () => {
    expect(photoGapPolicyRules("omit")).toContain("문장 수가 줄어도 괜찮다");
  });

  it("예시로 채우기도 배송·인증·효능은 막는다", () => {
    // 지어내면 표시광고법 문제가 되는 것들이다.
    const rules = photoGapPolicyRules("sample");
    expect(rules).toContain("배송·재고·마감 조건");
    expect(rules).toContain("인증");
    expect(rules).toContain("의학적 효능");
  });

  it("물어보기는 확인 가능한 것으로 바꿔 쓰라고 말한다", () => {
    // 빈칸으로만 두면 카피가 앙상해진다. 대안을 줘야 한다.
    expect(photoGapPolicyRules("ask")).toContain("확인 가능한 것");
  });
});

describe("사진 경로 프롬프트에 실린다", () => {
  it("고른 강도가 실린다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image", undefined, "max");
    expect(prompt).toContain("최대 후킹");
    expect(prompt).not.toContain("표현 강도: 담백");
  });

  it("고른 빈칸 처리가 실린다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image", undefined, "normal", "omit");
    expect(prompt).toContain("근거가 부족한 자리: 빼기");
  });

  it("안 고르면 보통·물어보기로 간다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt).toContain(intensityRules("normal"));
    expect(prompt).toContain("근거가 부족한 자리: 물어보기");
  });

  it("제품 읽기보다 앞에 온다", () => {
    // 어떻게 쓸지를 먼저 정해야 무엇을 적을지가 그에 맞춰진다.
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image", undefined, "strong");
    expect(prompt.indexOf("표현 강도")).toBeLessThan(prompt.indexOf("먼저 제품을 읽는다"));
  });
});

/**
 * 실측(2026-07-31)에서 찾은 것: **최대 후킹으로 두면 섹션이 6개에서 4개로 줄고
 * 반론 섹션이 통째로 빠졌다.** 그 회차의 심사는 objection fail 이었다.
 *
 * 프롬프트에 반론 섹션을 요구하는 문장이 한 줄도 없었다. 판매 원칙은
 * "반론을 피하면 그 자리에서 이탈한다"고 말하는데 구성 규칙이 강제하지 않았다.
 */
describe("반론 섹션은 빠지지 않는다", () => {
  it("구성 규칙이 반론 섹션을 요구한다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt).toContain("반론 섹션은 반드시 넣는다");
  });

  it("최대 후킹이 섹션을 줄이지 못하게 막는다", () => {
    // 강하게 쓰라고만 하면 모델은 짧게 만드는 쪽으로 간다.
    expect(intensityRules("max")).toContain("섹션을 줄여서 강해지려 하지 않는다");
    expect(intensityRules("max")).toContain("반론 섹션을 빼지 않는다");
  });

  /*
    **장수 하한으로 지키던 것을 이름으로 지킨다**(U-14, 2026-09-18).

    전에는 「5~6개」로 하한을 올려 반론이 빠지는 것을 막았다. 그런데 장수는
    **반론이 있는지 확인하지 않는다** — 다섯 장을 만들되 전부 자랑인 페이지도
    통과한다. 늘어난 것은 길이뿐이었고, 할 말이 적은 제품에는 빈 장을 채우려고
    지어낸 문장이 들어갔다(설계 §9.1).

    그래서 보호를 두 겹으로 옮겼다.
    - 프롬프트가 **반론 섹션을 이름으로** 요구한다(바로 위 시험)
    - `sectionPlanGaps` 가 **결과물에 망설임을 다루는 문장이 있는지** 실제로
      본다. 없으면 화면이 말한다
  */
  it("**장수가 아니라 이름으로 요구한다**", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");

    expect(prompt).toContain("반론 섹션은 반드시 넣는다");
    // 고정 장수는 더 이상 없다. 있으면 할 말 적은 제품에 빈 장이 붙는다.
    expect(prompt).not.toContain("5~6개의 핵심 섹션");
  });

  it("**결과물에 망설임을 다루는 문장이 없으면 잡힌다** — 장수는 그것을 못 본다", () => {
    const 자랑만 = [
      { section_id: "S1", trust_or_objection_line: "" },
      { section_id: "S2", trust_or_objection_line: "" },
      { section_id: "S3", trust_or_objection_line: "" },
      { section_id: "S4", trust_or_objection_line: "" },
      { section_id: "S5", trust_or_objection_line: "" },
    ] as never[];

    // 다섯 장이지만 반론이 없다. 옛 하한은 이것을 통과시켰다.
    expect(sectionPlanGaps(자랑만).map((gap) => gap.kind)).toContain("no_reassurance");
  });
});

