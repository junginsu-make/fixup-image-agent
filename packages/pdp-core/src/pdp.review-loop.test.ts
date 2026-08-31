import { describe, expect, it } from "vitest";
import {
  MAX_BLUEPRINT_REVISIONS,
  REVISION_TIME_BUDGET_MS,
  planFromText,
  type TextPlanDeps,
} from "./pdp.text-plan";
import { REVIEW_CRITERIA } from "./pdp.review";

const brief = {
  offeringName: "저녁 요가 클래스",
  offeringKind: "course",
  oneLiner: "퇴근 후 30분 홈 요가",
  audience: "앉아서 일하는 직장인",
  problem: "시간이 없어 운동을 못 한다",
  outcome: "몸이 가벼워진다",
  differentiators: ["장비 불필요"],
  objections: ["시간이 없다"],
  pricePositioning: "월 3만원대",
  tone: "차분함",
  assumptions: [],
};

function blueprintPayload(label: string) {
  const headline = `퇴근 후 30분 ${label}`;
  return {
    executiveSummary: label,
    scorecard: [],
    blueprintList: [],
    sections: [
      {
        section_id: "S1",
        section_name: "히어로",
        goal: "대상 특정",
        headline,
        subheadline: "집에서 장비 없이",
        bullets: ["매트 하나면 충분"],
        CTA: "체험 신청",
        prompt_en: "warm living room at dusk",
        evidence: [
          { target: { slot: "headline" }, value: headline, kind: "sample", note: "실제 제목 확인" },
          { target: { slot: "subheadline" }, value: "집에서 장비 없이", kind: "sample", note: "실제 설명 확인" },
          { target: { slot: "bullet", index: 0 }, value: "매트 하나면 충분", kind: "sample", note: "준비물 확인" },
          { target: { slot: "CTA" }, value: "체험 신청", kind: "rhetoric" },
        ],
      },
    ],
  };
}

function reviewPayload(ratings: Record<string, string>) {
  return {
    items: REVIEW_CRITERIA.map((criterion) => ({
      criterion: criterion.id,
      rating: ratings[criterion.id] ?? "pass",
      evidence: `${criterion.label} 근거`,
      fix: ratings[criterion.id] === "pass" ? "" : `${criterion.label} 를 고쳐라`,
    })),
  };
}

/** generateJson 호출 순서대로 응답을 돌려준다. 프롬프트도 함께 기록한다. */
function scriptedDeps(responses: unknown[]) {
  const prompts: string[] = [];
  const deps: TextPlanDeps = {
    generateJson: async (prompt) => {
      prompts.push(prompt);
      return responses[prompts.length - 1] ?? {};
    },
    generateImage: async () => ({ base64: "AAAA", mimeType: "image/jpeg" }),
  };
  return { deps, prompts };
}

const 통과 = reviewPayload({});
const 미달 = reviewPayload({ objection: "fail" });

describe("심사 루프", () => {
  it("한 번에 통과하면 다시 만들지 않는다", async () => {
    const { deps, prompts } = scriptedDeps([brief, blueprintPayload("첫판"), 통과]);
    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps);

    expect(prompts).toHaveLength(3); // 브리프 · 구성안 · 심사
    expect(result.blueprint.executiveSummary).toBe("첫판");
    expect(result.review?.items.every((item) => item.rating === "pass")).toBe(true);
  });

  it("미달이면 지적사항을 담아 다시 만든다", async () => {
    const { deps, prompts } = scriptedDeps([
      brief,
      blueprintPayload("첫판"),
      미달,
      blueprintPayload("두번째"),
      통과,
    ]);
    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps);

    expect(prompts).toHaveLength(5);
    expect(result.blueprint.executiveSummary).toBe("두번째");
    // 재생성 프롬프트에 심사 지적이 실려야 한다
    expect(prompts[3]).toContain("반론");
    expect(prompts[3]).toContain("고쳐라");
  });

  // 계속 미달이어도 무한히 돌면 안 된다. 시간과 비용이 그대로 나간다.
  it("최대 횟수를 넘기지 않는다", async () => {
    const { deps, prompts } = scriptedDeps([
      brief,
      blueprintPayload("1"),
      미달,
      blueprintPayload("2"),
      미달,
      blueprintPayload("3"),
      미달,
      blueprintPayload("4"), // 여기까지 오면 안 된다
    ]);
    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps);

    expect(MAX_BLUEPRINT_REVISIONS).toBe(2);
    expect(prompts).toHaveLength(1 + 1 + 2 * MAX_BLUEPRINT_REVISIONS + 1);
    expect(result.blueprint.executiveSummary).toBe("3");
  });

  // 통과한 척하는 것이 가장 나쁘다. 끝까지 남은 지적은 그대로 돌려준다.
  it("끝까지 미달이면 지적을 숨기지 않고 돌려준다", async () => {
    const { deps } = scriptedDeps([
      brief,
      blueprintPayload("1"),
      미달,
      blueprintPayload("2"),
      미달,
      blueprintPayload("3"),
      미달,
    ]);
    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps);

    expect(result.review?.items.some((item) => item.rating === "fail")).toBe(true);
  });

  it("weak 만 있으면 다시 만들지 않는다", async () => {
    const { deps, prompts } = scriptedDeps([
      brief,
      blueprintPayload("첫판"),
      reviewPayload({ flow: "weak", problem: "weak" }),
    ]);
    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps);

    expect(prompts).toHaveLength(3);
    expect(result.blueprint.executiveSummary).toBe("첫판");
  });
});

describe("시간 예산", () => {
  // 함수 상한이 300초다. 재생성을 밀어붙이다 상한에 걸리면 4분 기다린 사용자가
  // 아무것도 못 받는다. 미달인 채로 돌려주는 편이 낫다.
  it("예산을 넘기면 미달이어도 그만 만든다", async () => {
    const { deps, prompts } = scriptedDeps([
      brief,
      blueprintPayload("1"),
      미달,
      blueprintPayload("2"), // 예산 초과로 여기까지 오면 안 된다
    ]);

    // 시작은 0, 그 뒤로는 예산을 넘긴 시각. 첫 심사를 마친 시점에 이미 초과한 상황이다.
    let reads = 0;
    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps, {
      now: () => (reads++ === 0 ? 0 : REVISION_TIME_BUDGET_MS + 1),
    });

    expect(prompts).toHaveLength(3);
    expect(result.blueprint.executiveSummary).toBe("1");
    expect(result.review?.items.some((item) => item.rating === "fail")).toBe(true);
  });

  it("예산 안이면 정상적으로 다시 만든다", async () => {
    const { deps, prompts } = scriptedDeps([
      brief,
      blueprintPayload("1"),
      미달,
      blueprintPayload("2"),
      통과,
    ]);

    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps, {
      now: () => 0,
    });

    expect(prompts).toHaveLength(5);
    expect(result.blueprint.executiveSummary).toBe("2");
  });

  it("예산은 함수 상한보다 넉넉히 아래다", () => {
    expect(REVISION_TIME_BUDGET_MS).toBeLessThan(300_000 * 0.7);
  });
});

describe("심사가 실패해도 생성은 살린다", () => {
  // 심사는 품질을 올리려는 장치다. 그것 때문에 생성 자체가 죽으면 손해가 더 크다.
  it("심사 호출이 터져도 구성안을 돌려준다", async () => {
    let call = 0;
    const deps: TextPlanDeps = {
      generateJson: async () => {
        call += 1;
        if (call === 1) return brief;
        if (call === 2) return blueprintPayload("첫판");
        throw new Error("심사 모델 장애");
      },
      generateImage: async () => ({ base64: "AAAA", mimeType: "image/jpeg" }),
    };

    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps);
    expect(result.blueprint.executiveSummary).toBe("첫판");
    expect(result.review).toBeUndefined();
  });

  it("심사 응답이 엉뚱해도 구성안을 돌려준다", async () => {
    const { deps, prompts } = scriptedDeps([brief, blueprintPayload("첫판"), { 이상한: "응답" }]);
    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps);

    expect(prompts).toHaveLength(3);
    expect(result.blueprint.executiveSummary).toBe("첫판");
  });
});

describe("심사자에게 주는 것", () => {
  it("판매 원칙을 통째로 싣는다", async () => {
    const { deps, prompts } = scriptedDeps([brief, blueprintPayload("첫판"), 통과]);
    await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, "key", deps);

    expect(prompts[2]).toContain("경쟁 상품 페이지에 그대로 붙여도");
  });

  // 브리프를 주면 "이 브리프로는 이 정도면 잘 쓴 것"이라는 변호를 하게 된다.
  it("사용자 원문을 주지 않는다", async () => {
    const { deps, prompts } = scriptedDeps([brief, blueprintPayload("첫판"), 통과]);
    await planFromText(
      { text: "이 문장은 심사자에게 가면 안 된다", aspectRatio: "9:16" },
      "key",
      deps,
    );

    expect(prompts[2]).not.toContain("이 문장은 심사자에게 가면 안 된다");
  });
});
