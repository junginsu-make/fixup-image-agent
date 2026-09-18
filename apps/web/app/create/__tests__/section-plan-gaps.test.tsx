import { readFileSync } from "node:fs";
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { DESIGN_SYSTEM_MARKER, applyDesignSystem } from "@fixup/pdp-core";
import type { DesignSystem, SectionBlueprint } from "@fixup/pdp-core";
import { SectionPlanGaps } from "../SectionPlanGaps";

/**
 * **빠진 것을 실제로 화면에 띄우는가.**
 *
 * 판단 함수를 만들어 두고 아무도 안 부르는 일을 바로 앞 단계(U-13)에서 겪었다.
 * 소스에 낱말이 있는지가 아니라 **그려진 것**을 본다.
 */
const 섹션 = (overrides: Partial<SectionBlueprint> = {}): SectionBlueprint =>
  ({
    section_id: "S1", section_name: "히어로", goal: "관심",
    headline: "제목", subheadline: "부제", bullets: ["하나"],
    trust_or_objection_line: "30일 환불됩니다", CTA: "",
    prompt_ko: "", prompt_en: "", layout_notes: "",
    ...overrides,
  }) as SectionBlueprint;

const 그린글 = (sections: SectionBlueprint[], designSystem?: DesignSystem) =>
  JSON.stringify(create(<SectionPlanGaps sections={sections} designSystem={designSystem} />).toJSON());

const 소스전체 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("빠진 것을 화면이 말한다", () => {
  it("**멀쩡하면 아무것도 안 그린다**", () => {
    // 모든 구성안에 상자가 뜨면 사용자는 그 상자를 넘긴다.
    expect(create(<SectionPlanGaps sections={[섹션()]} />).toJSON()).toBeNull();
  });

  it("**망설임을 다루는 문장이 없으면 말한다**", () => {
    const 글 = 그린글([섹션({ trust_or_objection_line: "" })]);

    expect(글).toContain("망설이는 이유");
  });

  it("제목이 하나도 없으면 말한다", () => {
    const 글 = 그린글([섹션({ headline: "" })]);

    expect(글).toContain("제목이 있는 섹션이 하나도 없습니다");
  });

  it("섹션이 없으면 말한다", () => {
    expect(그린글([])).toContain("섹션이 하나도 없습니다");
  });

  it("**한 장짜리 구성이라고 나무라지 않는다**", () => {
    // 할 말이 하나인 제품도 있다. 장수 자체는 문제가 아니다(설계 §9.1).
    expect(create(<SectionPlanGaps sections={[섹션()]} />).toJSON()).toBeNull();
  });

  it("고치면 사라진다 — 지금 화면의 구성안을 본다", () => {
    const 고치기전 = 그린글([섹션({ trust_or_objection_line: "" })]);
    const 고친뒤 = create(<SectionPlanGaps sections={[섹션()]} />).toJSON();

    expect(고치기전).toContain("망설이는 이유");
    expect(고친뒤).toBeNull();
  });
});

/**
 * **화면도 서버와 같은 상한을 쓴다**(설계 §9.1).
 *
 * 서버는 상한을 넘은 구성안을 자른다. 화면이 그것을 모르면 사용자는 열한 번째
 * 섹션을 만들어 문구까지 채운 뒤, 다시 기획할 때 그것이 사라지는 것을 본다.
 */
describe("화면이 상한을 안다", () => {
  const 소스 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  it("**두 화면 모두 상수를 쓴다 — 숫자를 직접 적지 않는다**", () => {
    for (const name of ["ScenarioEditor.tsx", "PdpEditor.tsx"]) {
      expect(소스(name)).toContain("MAX_PLANNED_SECTIONS");
    }
  });

  it("**상한에 닿으면 더 못 넣는다**", () => {
    const scenario = 소스("ScenarioEditor.tsx");

    expect(scenario).toContain("blueprint.sections.length < MAX_PLANNED_SECTIONS");
    expect(scenario).toContain("disabled={!canAddSection}");
  });

  it("편집기도 막는다 — 한 화면만 막으면 다른 쪽으로 넘는다", () => {
    expect(소스("PdpEditor.tsx")).toContain("sections.length >= MAX_PLANNED_SECTIONS");
  });

  it("**구성안 화면이 이 상자를 실제로 띄운다** — 컴포넌트만 있고 아무도 안 그리면 소용없다", () => {
    // 인자까지 한 문자열로 본다. 이름만 대조하면 빈 배선도 통과한다.
    expect(소스("ScenarioEditor.tsx")).toContain("<SectionPlanGaps");
    expect(소스("ScenarioEditor.tsx")).toContain("sections={blueprint.sections}");
  });
});

/**
 * **어느 섹션이 공용 디자인 없이 만들어질지 말한다**(U-15).
 *
 * 섹션 이미지는 서로를 모른 채 각각 생성된다. 한 섹션만 그 서술을 놓치면 그
 * 장면만 다른 서체·다른 인물로 나오고, **이미지가 나온 뒤에야** 보인다.
 */
describe("페이지 통일을 화면이 본다", () => {
  const 디자인: DesignSystem = {
    headlineFont: "굵은 산세리프", bodyFont: "가는 산세리프",
    palette: ["아이보리"], cast: "30대 여성",
  };
  const 받은섹션 = (id: string) => applyDesignSystem(섹션({ section_id: id }), 디자인);

  it("**하나라도 놓쳤으면 말한다**", () => {
    const 글 = 그린글([받은섹션("S1"), 섹션({ section_id: "S2", style_guide: "혼자 정한 것" })], 디자인);

    expect(글).toContain("공용 디자인");
    expect(글).toContain("1개 섹션");
  });

  it("모두 받았으면 아무것도 안 그린다", () => {
    expect(
      create(<SectionPlanGaps sections={[받은섹션("S1"), 받은섹션("S2")]} designSystem={디자인} />).toJSON(),
    ).toBeNull();
  });

  it("**공용 디자인을 정하지 않은 페이지는 나무라지 않는다**", () => {
    // 옛 초안에는 없다. 없는 것을 「안 따랐다」고 하면 모든 옛 작업에 경고가 뜬다.
    expect(create(<SectionPlanGaps sections={[섹션()]} />).toJSON()).toBeNull();
  });

  it("**구성안 화면이 공용 디자인을 넘긴다** — 안 넘기면 검사가 늘 빈손이다", () => {
    expect(소스전체("ScenarioEditor.tsx")).toContain("designSystem={blueprint.designSystem}");
  });
});

/**
 * **말만 하고 고칠 길을 안 주면 안 된다.**
 *
 * `style_guide` 는 화면 어디에서도 못 고친다. 그래서 「N개 섹션이 공용 디자인을
 * 받지 않았습니다」는 읽고 넘길 수밖에 없는 말이 된다.
 */
describe("놓친 섹션을 맞춰 준다", () => {
  const 디자인: DesignSystem = {
    headlineFont: "굵은 산세리프", bodyFont: "가는 산세리프",
    palette: ["아이보리"], cast: "30대 여성",
  };

  const 버튼찾기 = (tree: ReturnType<typeof create>) =>
    tree.root.findAll((node) => node.type === "button" && JSON.stringify(node.children).includes("페이지 디자인 적용"));

  it("**누르면 모든 섹션이 공용 디자인을 받는다**", () => {
    const 놓친것 = [섹션({ section_id: "S1", style_guide: "혼자 정한 것" })];
    let 바뀐것: SectionBlueprint[] = [];

    const tree = create(
      <SectionPlanGaps sections={놓친것} designSystem={디자인} onSectionsChange={(next) => { 바뀐것 = next; }} />,
    );
    버튼찾기(tree)[0]!.props.onClick();

    expect(바뀐것[0]!.style_guide).toContain(DESIGN_SYSTEM_MARKER);
    // 섹션이 원래 쓰던 지시는 남는다.
    expect(바뀐것[0]!.style_guide).toContain("혼자 정한 것");
  });

  it("고칠 길이 없으면 버튼을 안 띄운다", () => {
    const 놓친것 = [섹션({ section_id: "S1", style_guide: "혼자 정한 것" })];

    expect(버튼찾기(create(<SectionPlanGaps sections={놓친것} designSystem={디자인} />))).toHaveLength(0);
  });

  it("**놓친 섹션이 없으면 버튼도 없다**", () => {
    const 받은것 = [applyDesignSystem(섹션({ section_id: "S1" }), 디자인)];

    expect(create(<SectionPlanGaps sections={받은것} designSystem={디자인} onSectionsChange={() => {}} />).toJSON()).toBeNull();
  });

  it("**구성안 화면이 고칠 길을 넘긴다**", () => {
    expect(소스전체("ScenarioEditor.tsx")).toContain("onSectionsChange={(sections) => onChange({ ...blueprint, sections })}");
  });
});
