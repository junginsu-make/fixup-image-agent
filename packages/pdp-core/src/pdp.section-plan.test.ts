import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_PLANNED_SECTIONS,
  clampSections,
  sectionCountRules,
  sectionPlanGaps,
} from "./pdp.section-plan";
import { PdpService } from "./pdp.service";
import { normalizeTextBlueprint } from "./pdp.text-plan";
import type { SectionBlueprint } from "./types";

/**
 * **몇 장인지는 상품이 정한다**(U-14).
 *
 * 프롬프트가 「5~6개」(사진), 「4~7개」(글)를 못 박고 있었다. 할 말이 세 가지인
 * 제품에도 여섯 장을 만들게 하면 나머지는 채우려고 지어낸 것이 된다.
 *
 * 설계 §9.1: 「고정 5~6/4~7장 강제가 아니라 전달해야 할 사실과 구매자 질문으로
 * 선택한다. 초기 기술 상한은 현행 전체 요청 상한 이하로 유지하고 UI/서버가 같은
 * 상수를 사용한다.」
 */

const 섹션 = (id: string, overrides: Partial<SectionBlueprint> = {}): SectionBlueprint =>
  ({
    section_id: id,
    section_name: "섹션",
    goal: "역할",
    headline: "제목",
    subheadline: "부제",
    bullets: ["하나"],
    trust_or_objection_line: "",
    CTA: "",
    prompt_ko: "",
    prompt_en: "",
    layout_notes: "",
    ...overrides,
  }) as SectionBlueprint;

describe("상한은 코드가 지킨다", () => {
  it("**상한을 넘으면 자른다**", () => {
    const 많음 = Array.from({ length: MAX_PLANNED_SECTIONS + 4 }, (_, i) => 섹션(`S${i}`));

    expect(clampSections(많음)).toHaveLength(MAX_PLANNED_SECTIONS);
  });

  it("앞에서부터 남긴다 — 뒤가 아니라", () => {
    const 많음 = Array.from({ length: MAX_PLANNED_SECTIONS + 2 }, (_, i) => 섹션(`S${i}`));

    expect(clampSections(많음)[0]!.section_id).toBe("S0");
  });

  it("상한 안이면 그대로 둔다", () => {
    const 셋 = [섹션("S1"), 섹션("S2"), 섹션("S3")];

    expect(clampSections(셋)).toEqual(셋);
  });

  it("**한 장도 의도된 구성이면 허용한다**", () => {
    // 설계 §9.1. 최소 장수를 강제하면 할 말이 하나인 제품에 빈 장이 붙는다.
    expect(clampSections([섹션("S1")])).toHaveLength(1);
  });
});

describe("몇 장인지 정하는 기준을 말한다", () => {
  const 규칙 = sectionCountRules();

  it("**고정 장수를 말하지 않는다**", () => {
    expect(규칙).not.toContain("5~6");
    expect(규칙).not.toContain("4~7");
  });

  it("무엇으로 정하는지 말한다", () => {
    expect(규칙).toContain("사실");
    expect(규칙).toContain("질문");
  });

  it("상한은 상수에서 온다 — 두 벌로 적으면 갈린다", () => {
    expect(규칙).toContain(String(MAX_PLANNED_SECTIONS));
  });
});

/**
 * 장수를 풀면 **모자란 구성도 통과한다.** 그래서 무엇이 빠졌는지는 따로 본다
 * (설계 §9.1: 「최소 1섹션도 의도된 구성이라면 허용하되 필수 정보 부족을 검사한다」).
 */
describe("빠진 것을 찾는다", () => {
  it("멀쩡하면 아무것도 안 낸다", () => {
    const gaps = sectionPlanGaps([
      섹션("S1", { trust_or_objection_line: "30일 환불됩니다" }),
      섹션("S2"),
    ]);

    expect(gaps).toEqual([]);
  });

  it("**섹션이 없으면 그것부터 말한다**", () => {
    expect(sectionPlanGaps([]).map((gap) => gap.kind)).toContain("no_sections");
  });

  it("**제목이 하나도 없으면 페이지가 아무 말도 안 한다**", () => {
    const gaps = sectionPlanGaps([섹션("S1", { headline: "" }), 섹션("S2", { headline: "  " })]);

    expect(gaps.map((gap) => gap.kind)).toContain("no_headline");
  });

  it("제목이 하나라도 있으면 넘어간다", () => {
    const gaps = sectionPlanGaps([
      섹션("S1", { headline: "" }),
      섹션("S2", { headline: "제목", trust_or_objection_line: "환불됩니다" }),
    ]);

    expect(gaps.map((gap) => gap.kind)).not.toContain("no_headline");
  });

  it("**망설임을 다루는 문장이 하나도 없으면 말한다**", () => {
    // 좋은 점만 나열하면 읽는 사람은 속으로 반박하며 읽는다.
    const gaps = sectionPlanGaps([섹션("S1"), 섹션("S2")]);

    expect(gaps.map((gap) => gap.kind)).toContain("no_reassurance");
  });

  it("한 섹션에만 있어도 된다 — 모든 섹션에 요구하지 않는다", () => {
    const gaps = sectionPlanGaps([섹션("S1"), 섹션("S2", { trust_or_objection_line: "환불됩니다" })]);

    expect(gaps.map((gap) => gap.kind)).not.toContain("no_reassurance");
  });

  it("빠진 것마다 사용자가 읽을 말이 붙는다", () => {
    for (const gap of sectionPlanGaps([])) {
      expect(gap.message.length).toBeGreaterThan(5);
    }
  });
});

describe("두 경로가 고정 장수를 말하지 않는다", () => {
  const service = readFileSync(new URL("./pdp.service.ts", import.meta.url), "utf8");
  const textPlan = readFileSync(new URL("./pdp.text-plan.ts", import.meta.url), "utf8");

  /** 설명하는 주석이 아니라 **모델에게 가는 지시문**만 본다. */
  const 지시문만 = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

  it("**사진 경로가 5~6개를 강요하지 않는다**", () => {
    expect(지시문만(service)).not.toContain("5~6개의 핵심 섹션");
  });

  it("**글 경로가 4~7개를 강요하지 않는다**", () => {
    expect(지시문만(textPlan)).not.toContain("섹션은 4~7개");
  });

  it("두 경로가 같은 규칙을 쓴다", () => {
    expect(service).toContain("sectionCountRules(");
    expect(textPlan).toContain("sectionCountRules(");
  });

  it("**모든 상품에 사람을 강요하지 않는다**", () => {
    // 설계 §9.1: 「인물 필수·후기 카드·베네핏 3개는 모든 상품의 고정 조건에서 제거한다」
    expect(지시문만(service)).not.toContain("반드시 매력적인 모델이 제품과 함께 연출된 컷");
  });

  it("**베네핏 3개를 못 박지 않는다**", () => {
    expect(지시문만(service)).not.toContain("베네핏은 3개 고정");
  });

  it("**근거 없는 후기를 만들라고 하지 않는다**", () => {
    // 「후기 카드 6~12개 우선」은 바로 아래 「근거 없는 후기 개수를 만들지 말 것」과
    // 정면으로 부딪혔다. 한 프롬프트 안에서 서로 반대말을 하고 있었다.
    expect(지시문만(service)).not.toContain("후기 카드 6~12개");
  });

  it("두 경로가 자르기를 부른다", () => {
    expect(service).toContain("clampSections(");
    expect(textPlan).toContain("clampSections(");
  });
});

/**
 * **부르는 것과 결과를 쓰는 것은 다르다.**
 *
 * 위 문자열 대조는 그 낱말이 파일 어딘가에 있다는 것만 말한다. 부르고 결과를
 * 버려도 통과한다 — 이 저장소에서 이미 두 번 겪었다. 실제로 넘치는 응답을
 * 넣어 **몇 장이 나오는지** 본다.
 */
describe("넘치는 응답을 실제로 자른다", () => {
  const 많은섹션 = Array.from({ length: MAX_PLANNED_SECTIONS + 4 }, (_, i) => ({
    section_id: `S${i + 1}`,
    section_name: `섹션 ${i + 1}`,
    goal: "역할",
    headline: `제목 ${i + 1}`,
    subheadline: "부제",
    bullets: ["하나"],
    trust_or_objection_line: "환불됩니다",
    CTA: "",
    prompt_ko: "장면",
    prompt_en: "a scene",
    layout_notes: "구성",
  }));

  it("**글 경로가 상한까지만 만든다**", () => {
    const blueprint = normalizeTextBlueprint({
      executiveSummary: "전략",
      scorecard: [],
      blueprintList: [],
      sections: 많은섹션,
    });

    expect(blueprint.sections).toHaveLength(MAX_PLANNED_SECTIONS);
  });

  it("**사진 경로가 상한까지만 만든다**", async () => {
    const llm = {
      generate: async () => ({
        text: JSON.stringify({
          executiveSummary: "전략",
          scorecard: [],
          blueprintList: [],
          sections: 많은섹션,
        }),
      }),
    };

    const 결과 = await new PdpService().analyzeProduct(
      { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4" } as never,
      { llm, generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) } as never,
      { skipFirstImage: true },
    );

    expect(결과.blueprint.sections).toHaveLength(MAX_PLANNED_SECTIONS);
  });
});
