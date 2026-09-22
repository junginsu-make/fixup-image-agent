import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DESIGN_SYSTEM_MARKER,
  DESIGN_SYSTEM_RULES,
  applyDesignSystem,
  describeDesignSystem,
  normalizeDesignSystem,
  sectionsMissingDesignSystem,
} from "./pdp.design-system";
import { PdpService, buildAnalyzePrompt, buildImagePrompt } from "./pdp.service";
import type { DesignSystem, SectionBlueprint } from "./types";

/**
 * **페이지 전체가 같은 디자인을 따르는가**(U-15).
 *
 * 섹션 이미지는 서로를 모른 채 각각 생성된다. 그래서 무엇을 공유할지 한 번
 * 정해 모든 섹션에 실어 보내야 한다 — 안 그러면 섹션마다 서체가 바뀌고 색이
 * 바뀌고 등장인물이 바뀐다.
 *
 * 그 장치(`designSystem`)가 **글 경로에만 있었다.** 사진 경로는 섹션마다
 * `style_guide` 를 제각각 적었고, 새로 추가한 섹션은 형제 것을 통째로
 * 베꼈다 — 그 형제를 사용자가 고치면 계승이 끊긴다.
 *
 * 설계 §9.1·U-15: 「공통 designSystem과 페이지 확인」.
 */

const 디자인 = (overrides: Partial<DesignSystem> = {}): DesignSystem => ({
  headlineFont: "굵은 기하학적 산세리프",
  bodyFont: "가늘고 단정한 산세리프",
  palette: ["따뜻한 아이보리", "짙은 남색", "선명한 주황"],
  cast: "30대 초반 한국인 여성, 단발, 베이지 니트",
  ...overrides,
});

const 섹션 = (overrides: Partial<SectionBlueprint> = {}): SectionBlueprint =>
  ({
    section_id: "S1", section_name: "히어로", goal: "관심",
    headline: "제목", subheadline: "부제", bullets: [],
    trust_or_objection_line: "", CTA: "",
    prompt_ko: "", prompt_en: "a scene", layout_notes: "",
    style_guide: "",
    ...overrides,
  }) as SectionBlueprint;

describe("공용 디자인을 섹션에 싣는다", () => {
  it("**빈 섹션에 공용 서술이 붙는다**", () => {
    const 결과 = applyDesignSystem(섹션(), 디자인());

    expect(결과.style_guide).toContain(DESIGN_SYSTEM_MARKER);
    expect(결과.style_guide).toContain("굵은 기하학적 산세리프");
  });

  it("섹션이 원래 쓰던 지시를 지우지 않는다", () => {
    const 결과 = applyDesignSystem(섹션({ style_guide: "정제된 스튜디오 세트" }), 디자인());

    expect(결과.style_guide).toContain("정제된 스튜디오 세트");
    expect(결과.style_guide).toContain(DESIGN_SYSTEM_MARKER);
  });

  it("**두 번 실어도 한 번만 붙는다** — 다시 기획할 때마다 같은 문장이 쌓이면 안 된다", () => {
    const 한번 = applyDesignSystem(섹션(), 디자인());
    const 두번 = applyDesignSystem(한번, 디자인());

    expect(두번.style_guide.split(DESIGN_SYSTEM_MARKER)).toHaveLength(2);
  });

  it("**디자인이 바뀌면 옛 서술을 갈아 끼운다** — 두 벌이 남으면 모델이 어느 쪽을 볼지 모른다", () => {
    const 처음 = applyDesignSystem(섹션(), 디자인());
    const 바뀜 = applyDesignSystem(처음, 디자인({ headlineFont: "손글씨풍 제목 서체" }));

    expect(바뀜.style_guide).toContain("손글씨풍 제목 서체");
    expect(바뀜.style_guide).not.toContain("굵은 기하학적 산세리프");
  });

  it("디자인이 없으면 손대지 않는다", () => {
    const 원본 = 섹션({ style_guide: "정제된 스튜디오 세트" });

    expect(applyDesignSystem(원본, undefined)).toEqual(원본);
  });
});

describe("빈 값은 없는 것으로 본다", () => {
  it("전부 비면 undefined", () => {
    expect(normalizeDesignSystem({ headlineFont: "", palette: [] })).toBeUndefined();
    expect(normalizeDesignSystem(undefined)).toBeUndefined();
  });

  it("하나라도 있으면 살린다", () => {
    expect(normalizeDesignSystem({ cast: "30대 여성" })?.cast).toBe("30대 여성");
  });

  it("서술에 정한 값이 다 들어간다", () => {
    const 서술 = describeDesignSystem(디자인());

    for (const 값 of ["굵은 기하학적 산세리프", "가늘고 단정한 산세리프", "짙은 남색", "단발"]) {
      expect(서술).toContain(값);
    }
  });
});

describe("페이지가 실제로 통일돼 있는가", () => {
  it("**공용 디자인을 안 받은 섹션을 찾는다**", () => {
    const 있는것 = applyDesignSystem(섹션({ section_id: "S1" }), 디자인());
    const 없는것 = 섹션({ section_id: "S2", style_guide: "혼자 정한 스타일" });

    expect(sectionsMissingDesignSystem([있는것, 없는것], 디자인())).toEqual(["S2"]);
  });

  it("모두 받았으면 아무것도 안 낸다", () => {
    const sections = [섹션({ section_id: "S1" }), 섹션({ section_id: "S2" })].map((section) =>
      applyDesignSystem(section, 디자인()),
    );

    expect(sectionsMissingDesignSystem(sections, 디자인())).toEqual([]);
  });

  it("**디자인을 정하지 않은 페이지는 어긋날 것이 없다**", () => {
    // 공용 디자인이 없으면 「안 따랐다」고 말할 근거도 없다.
    expect(sectionsMissingDesignSystem([섹션()], undefined)).toEqual([]);
  });

  it("**옛 디자인만 든 섹션도 잡는다** — 겉보기엔 표지가 있다", () => {
    const 옛것 = applyDesignSystem(섹션({ section_id: "S9" }), 디자인());

    expect(sectionsMissingDesignSystem([옛것], 디자인({ cast: "다른 사람" }))).toEqual(["S9"]);
  });
});

/*
  새로 추가한 섹션이 공용 디자인을 받는지는 웹 쪽 시험이 본다
  (`apps/web/app/create/__tests__/scenario-sections.test.ts`). `createSectionFor`
  가 화면 코드라서다.
*/

describe("사진 경로도 공용 디자인을 만든다", () => {
  const service = readFileSync(new URL("./pdp.service.ts", import.meta.url), "utf8");
  const textPlan = readFileSync(new URL("./pdp.text-plan.ts", import.meta.url), "utf8");

  it("두 경로가 같은 모듈을 쓴다 — 두 벌로 적으면 한쪽만 고치는 날이 온다", () => {
    for (const source of [service, textPlan]) {
      expect(source).toContain("pdp.design-system");
    }
  });

  it("**사진 경로 응답에 자리가 있다**", () => {
    expect(service).toContain("DESIGN_SYSTEM_SCHEMA");
  });

  it("**실제로 돌리면 공용 디자인이 모든 섹션에 실린다**", async () => {
    const 응답 = {
      executiveSummary: "전략",
      scorecard: [],
      blueprintList: [],
      designSystem: 디자인(),
      sections: [
        { section_id: "S1", headline: "제목1", prompt_en: "a", style_guide: "스튜디오" },
        { section_id: "S2", headline: "제목2", prompt_en: "b", style_guide: "" },
      ],
    };
    const llm = { generate: async () => ({ text: JSON.stringify(응답) }) };

    const 결과 = await new PdpService().analyzeProduct(
      { imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "3:4" } as never,
      { llm, generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) } as never,
      { skipFirstImage: true },
    );

    expect(결과.blueprint.designSystem?.cast).toContain("단발");
    for (const section of 결과.blueprint.sections) {
      expect(section.style_guide).toContain(DESIGN_SYSTEM_MARKER);
    }
    // 섹션이 원래 쓰던 지시도 남는다.
    expect(결과.blueprint.sections[0]!.style_guide).toContain("스튜디오");
  });
});

/**
 * **규칙 문구는 한 벌이다.** 두 벌로 적으면 한쪽만 고치는 날이 온다 — 실제로
 * 사진 경로에만 「사람이 안 나오는 페이지면 cast 는 빈 문자열」이 있었다.
 */
describe("규칙 문구", () => {
  it("네 가지를 모두 말한다", () => {
    for (const 값 of ["headlineFont", "bodyFont", "palette", "cast"]) {
      expect(DESIGN_SYSTEM_RULES).toContain(값);
    }
  });

  it("한 번만 정하고 전 섹션이 공유한다고 말한다", () => {
    expect(DESIGN_SYSTEM_RULES).toContain("모든 섹션");
  });

  it("**사람이 안 나오는 페이지를 허용한다** — 모든 상품에 사람이 나오지는 않는다(U-14)", () => {
    expect(DESIGN_SYSTEM_RULES).toContain("빈 문자열");
  });

  it("**섹션별 style_guide 에 서체를 다시 적지 말라고 말한다**", () => {
    // 이걸 안 말하면 섹션마다 서체를 또 정하고, 그 제각각인 글이 공용 서술
    // 앞에 남는다.
    expect(DESIGN_SYSTEM_RULES).toContain("다시 정하지 않는다");
  });
});

/**
 * **한 프롬프트에 `style_guide` 정의가 두 벌이면 안 된다.**
 *
 * 이 저장소가 같은 함정에 두 번 걸렸다 — 뒤에 있는 쪽이 이기므로, 앞에서
 * 「서체는 designSystem 이 정한다」고 해 놓고 뒤에서 「서체 인상을 적을 것」이라
 * 말하면 **통일하려고 만든 장치가 통일을 못 시킨다.**
 */
describe("style_guide 정의는 한 벌이다", () => {
  it("섹션 필드 설명이 서체·색·인물을 다시 정하라고 하지 않는다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    const 필드설명 = prompt.split("\n").filter((line) => line.startsWith("- style_guide:"));

    expect(필드설명).toHaveLength(1);
    expect(필드설명[0]).toContain("designSystem");
    expect(필드설명[0]).not.toContain("전체 통일 스타일");
  });

  it("레퍼런스를 붙여도 마찬가지다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image", undefined, undefined, {
      styleReference: { description: "파란 톤", intent: "색만 참고", sliceCount: 1 },
    } as never);
    const 필드설명 = prompt.split("\n").filter((line) => line.startsWith("- style_guide:"));

    expect(필드설명).toHaveLength(1);
    expect(필드설명[0]).toContain("designSystem");
  });
});

/**
 * **컷 타입이 이겨도 페이지 정체성은 안 바뀐다**(U-15).
 *
 * 컷 타입 우선(`style-first`)은 섹션의 연출 지시를 버리고 장면을 새로 짠다.
 * 그런데 `style_guide` 를 통째로 버리면 **페이지 공용 디자인까지 사라져** 그
 * 섹션만 다른 서체·다른 사람으로 만들어진다. 토글은 섹션마다 따로라 한 섹션만
 * 켜도 그렇게 된다.
 */
describe("컷 타입 우선에서도 공용 디자인은 남는다", () => {
  const 공용받은섹션 = applyDesignSystem(
    섹션({ style_guide: "정제된 스튜디오 세트, 측면 조명" }),
    디자인(),
  );

  it("**공용 서술이 살아남는다**", () => {
    const prompt = buildImagePrompt(공용받은섹션, undefined, {
      guidePriorityMode: "style-first",
      style: "studio",
    } as never);

    expect(prompt).toContain("30대 초반 한국인 여성");
    expect(prompt).toContain("굵은 기하학적 산세리프");
  });

  it("**그 섹션만의 연출은 버린다** — 컷 타입이 이기는 것은 구도다", () => {
    const prompt = buildImagePrompt(공용받은섹션, undefined, {
      guidePriorityMode: "style-first",
      style: "studio",
    } as never);

    expect(prompt).not.toContain("측면 조명");
  });

  it("가이드 우선이면 둘 다 간다", () => {
    const prompt = buildImagePrompt(공용받은섹션, undefined, {
      guidePriorityMode: "guide-first",
      style: "studio",
    } as never);

    expect(prompt).toContain("측면 조명");
    expect(prompt).toContain("30대 초반 한국인 여성");
  });

  it("공용 디자인이 없는 섹션은 전과 같다", () => {
    const prompt = buildImagePrompt(섹션({ style_guide: "정제된 스튜디오 세트" }), undefined, {
      guidePriorityMode: "style-first",
      style: "studio",
    } as never);

    expect(prompt).not.toContain(DESIGN_SYSTEM_MARKER);
  });
});
