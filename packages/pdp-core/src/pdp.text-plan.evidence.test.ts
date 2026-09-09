import { describe, expect, it } from "vitest";
import { REVIEW_CRITERIA } from "./pdp.review";
import {
  buildTextBlueprintPrompt,
  normalizeTextBlueprint,
  planFromText,
  type TextPlanDeps,
} from "./pdp.text-plan";
import type { ProductBrief } from "./types";

const brief: Omit<ProductBrief, "sourceText"> = {
  offeringName: "요가 클래스",
  offeringKind: "course",
  oneLiner: "집에서 하는 요가",
  audience: "처음 운동하는 직장인",
  problem: "운동을 시작하기 어렵다",
  outcome: "꾸준히 움직이는 습관",
  differentiators: ["장비 없이 진행"],
  objections: ["따라가기 어렵다"],
  pricePositioning: "입력 없음",
  tone: "차분함",
  assumptions: [],
};

function section(evidence: unknown[] = []) {
  return {
    section_id: "S1",
    section_name: "시작",
    headline: "오늘 가볍게 시작하세요",
    subheadline: "집에서 천천히 따라갑니다",
    bullets: ["장비 없이 시작"],
    CTA: "구성을 확인하세요",
    prompt_ko: "밝은 거실에서 요가를 시작하는 장면",
    prompt_en: "a Korean beginner starting yoga in a bright living room",
    evidence,
  };
}

function blueprint(evidence: unknown[] = []) {
  return { executiveSummary: "", scorecard: [], blueprintList: [], sections: [section(evidence)] };
}

const reviewPass = {
  items: REVIEW_CRITERIA.map((criterion) => ({
    criterion: criterion.id,
    rating: "pass",
    evidence: "통과 근거",
    fix: "",
  })),
};

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

describe("근거 정규화", () => {
  it("모델이 만든 user를 sample로 내린다", () => {
    const result = normalizeTextBlueprint(
      blueprint([
        { target: { slot: "headline" }, value: "오늘 가볍게 시작하세요", kind: "user" },
      ]),
    );
    expect(result.sections[0]?.evidence?.[0]?.kind).toBe("sample");
  });

  it("모델이 만든 acknowledgedAt을 지운다", () => {
    const result = normalizeTextBlueprint(
      blueprint([
        {
          target: { slot: "headline" },
          value: "오늘 가볍게 시작하세요",
          kind: "sample",
          note: "실제 헤드라인",
          acknowledgedAt: "2026-07-29T00:00:00.000Z",
        },
      ]),
    );
    expect(result.sections[0]?.evidence?.[0]?.acknowledgedAt).toBeUndefined();
  });

  it("evidenceVersion을 1로 찍는다", () => {
    expect(normalizeTextBlueprint(blueprint()).sections[0]?.evidenceVersion).toBe(1);
  });
});

describe("손잡이 프롬프트", () => {
  const normalizedBrief: ProductBrief = { ...brief, sourceText: "요가 클래스를 팝니다" };

  it("copyIntensity가 프롬프트에 실린다", () => {
    expect(buildTextBlueprintPrompt(normalizedBrief, undefined, "editable", "", "max")).toContain(
      "최대 후킹",
    );
  });

  it("gapPolicy가 프롬프트에 실린다", () => {
    expect(buildTextBlueprintPrompt(normalizedBrief, undefined, "editable", "", "normal", "omit")).toContain(
      "근거가 없으면 그 문장을 쓰지 않는다",
    );
  });

  it("손잡이를 안 주면 normal·ask로 동작한다", () => {
    const prompt = buildTextBlueprintPrompt(normalizedBrief);
    expect(prompt).toContain("표현 강도: 보통");
    expect(prompt).toContain("ask 딱지");
  });

  it("sample은 예시 값을 채우는 규칙으로 동작한다", () => {
    const prompt = buildTextBlueprintPrompt(normalizedBrief, undefined, "editable", "", "normal", "sample");
    expect(prompt).toContain("sample 딱지");
    expect(prompt).not.toContain("아직 예시 값을 채우지 않는다");
  });
});

describe("예시 채우기", () => {
  it("gapPolicy=sample이면 채운 값에 sample 딱지가 붙는다", async () => {
    const sample = blueprint([
      { target: { slot: "headline" }, value: "오늘 가볍게 시작하세요", kind: "sample", note: "예시 제목" },
    ]);
    const { deps } = scriptedDeps([brief, sample, reviewPass]);
    const result = await planFromText(
      { text: "요가 클래스", aspectRatio: "9:16", gapPolicy: "sample" },
      undefined,
      deps,
    );
    expect(result.blueprint.sections[0]?.evidence?.[0]?.kind).toBe("sample");
  });

  it("gapPolicy=omit이면 sample이 하나도 없다", async () => {
    const omitted = blueprint([
      { target: { slot: "headline" }, value: "오늘 가볍게 시작하세요", kind: "rhetoric" },
    ]);
    const { deps } = scriptedDeps([brief, omitted, reviewPass]);
    const result = await planFromText(
      { text: "요가 클래스", aspectRatio: "9:16", gapPolicy: "omit" },
      undefined,
      deps,
    );
    expect(result.blueprint.sections.flatMap((item) => item.evidence ?? []))
      .not.toContainEqual(expect.objectContaining({ kind: "sample" }));
  });

  it("금지 분류는 sample로 채우지 않고 ask로 남는다", async () => {
    const banned = {
      ...blueprint(),
      sections: [{
        ...section(),
        headline: "3개월이면 퇴사 가능",
        evidence: [{
          target: { slot: "headline" },
          value: "3개월이면 퇴사 가능",
          kind: "sample",
          note: "예시 성과",
        }],
      }],
    };
    const { deps } = scriptedDeps([brief, banned, reviewPass, banned, reviewPass, banned, reviewPass]);
    const result = await planFromText(
      { text: "요가 클래스", aspectRatio: "9:16", gapPolicy: "sample" },
      undefined,
      deps,
    );
    expect(result.blueprint.sections[0]?.headline).toBe("");
    expect(result.blueprint.sections[0]?.evidence?.[0]?.kind).toBe("ask");
  });
});

describe("구조 실패 재생성", () => {
  it("구조가 어긋나면 한 번 더 만든다", async () => {
    const bad = blueprint([
      { target: { slot: "headline" }, value: "오늘 가볍게 시작하세요", kind: "ask" },
    ]);
    const good = blueprint([
      { target: { slot: "headline" }, value: "오늘 가볍게 시작하세요", kind: "rhetoric" },
    ]);
    const { deps, prompts } = scriptedDeps([brief, bad, reviewPass, good, reviewPass]);
    const result = await planFromText({ text: "요가 클래스", aspectRatio: "9:16" }, undefined, deps);

    expect(prompts).toHaveLength(5);
    expect(prompts[3]).toContain("근거 구조");
    expect(result.blueprint.sections[0]?.evidence?.[0]?.kind).toBe("rhetoric");
  });

  it("재시도를 소진하면 그 자리를 ask로 내리고 결과는 돌려준다", async () => {
    const bad = blueprint([
      {
        target: { slot: "headline" },
        value: "오늘 가볍게 시작하세요",
        kind: "quoted",
        quote: "원문에 없는 말",
      },
    ]);
    const { deps } = scriptedDeps([brief, bad, reviewPass, bad, reviewPass, bad, reviewPass]);
    const result = await planFromText({ text: "요가 클래스", aspectRatio: "9:16" }, undefined, deps);

    expect(result.blueprint.sections[0]?.headline).toBe("");
    expect(result.blueprint.sections[0]?.evidence?.[0]).toMatchObject({ kind: "ask", value: "" });
  });
});
