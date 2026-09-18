import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESIGN_SYSTEM_MARKER } from "@fixup/pdp-core";
import type { DesignSystem } from "@fixup/pdp-core";
import { createEmptySection, createSectionFor } from "../scenario-sections";

/**
 * 사용자가 시나리오에서 「섹션 추가」를 하면 그 섹션도 생성 가능해야 한다.
 *
 * 2026-07-30 운영에서 `/api/pdp/images` 가 400 을 냈다.
 * "이미지 프롬프트가 없는 섹션입니다" — 추가된 섹션의 prompt_en 이 빈 문자열이었다.
 * 서버는 prompt_en 없이 이미지를 만들 수 없다(pdp.service.ts:360).
 */
describe("섹션 추가", () => {
  it("장면 지시가 비어 있지 않다", () => {
    const section = createEmptySection(3);
    expect(section.prompt_ko.trim()).not.toBe("");
    expect(section.prompt_en.trim()).not.toBe("");
  });

  it("섹션 번호가 이름과 id 에 반영된다", () => {
    const section = createEmptySection(3);
    expect(section.section_id).toBe("S4");
    expect(section.section_name).toContain("4");
  });

  it("근거 스키마 버전을 달고 나온다", () => {
    // 게이트가 구버전으로 오해하지 않도록. evidence 는 비어도 된다 —
    // 사실 표지가 없으면 근거를 요구하지 않는다.
    expect(createEmptySection(0).evidenceVersion).toBe(1);
  });
});

/**
 * **`section_id` 가 겹치면 안 된다.**
 *
 * 이 값은 시나리오 화면 뒤의 거의 모든 것이 쓰는 열쇠다. 겹치면 헤드라인·불릿
 * 수정이 원래 섹션까지 덮어쓰고(`applyUserEdit`), 배치 생성 결과가 엉뚱한
 * 섹션에 붙고, React `key` 도 중복된다. 배열 길이로 번호를 매기던 동안
 * S1~S6 에서 S2 를 지우고 추가하면 `S6` 가 다시 나왔다.
 */
describe("이미 있는 섹션과 겹치지 않게 추가", () => {
  const of = (...ids: string[]) => ids.map((id) => ({ ...createEmptySection(0), section_id: id }));

  it("중간을 지우고 추가해도 안 겹친다", () => {
    // S1~S6 에서 S2 를 지운 상태. 길이는 5 지만 S6 는 이미 쓰였다.
    const sections = of("S1", "S3", "S4", "S5", "S6");
    expect(sections.map((section) => section.section_id)).not.toContain(createSectionFor(sections).section_id);
  });

  it("빈 목록에서도 UUID를 발급한다", () => {
    expect(createSectionFor([]).section_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("끝까지 차 있으면 다음 번호로 간다", () => {
    const existing = of("S1", "S2", "S3");
    expect(existing.map((section) => section.section_id)).not.toContain(createSectionFor(existing).section_id);
  });

  it("이름과 이미지 id 도 그 번호를 따른다", () => {
    const section = createSectionFor(of("S1", "S3"));
    expect(section.section_name).toContain("3");
    expect(section.image_id).toBe(`IMG_${section.section_id}`);
  });
});

/**
 * **새로 추가한 섹션도 페이지 디자인을 따른다**(U-15).
 *
 * 전에는 형제의 `style_guide` 를 통째로 베꼈다. 그 형제를 사용자가 고치거나
 * 지우면 **계승이 조용히 끊긴다** — 새 섹션만 다른 서체·다른 인물로 만들어지고,
 * 그 사실은 이미지가 나온 뒤에야 보인다. 한 장에 값이 드는데 그때는 늦다.
 */
describe("새 섹션이 공용 디자인을 받는다", () => {
  const 디자인: DesignSystem = {
    headlineFont: "굵은 기하학적 산세리프",
    bodyFont: "가늘고 단정한 산세리프",
    palette: ["아이보리", "남색"],
    cast: "30대 한국인 여성, 단발",
  };

  it("**형제의 지시가 지워져 있어도 받는다**", () => {
    const 지워진형제 = [{ ...createEmptySection(0), style_guide: "" }];

    expect(createSectionFor(지워진형제, 디자인).style_guide).toContain(DESIGN_SYSTEM_MARKER);
    expect(createSectionFor(지워진형제, 디자인).style_guide).toContain("굵은 기하학적 산세리프");
  });

  it("**형제가 옛 디자인을 들고 있어도 지금 것을 받는다**", () => {
    const 옛형제 = [
      { ...createEmptySection(0), style_guide: `${DESIGN_SYSTEM_MARKER} 헤드라인 서체: 손글씨` },
    ];

    const 새섹션 = createSectionFor(옛형제, 디자인);

    expect(새섹션.style_guide).toContain("굵은 기하학적 산세리프");
    expect(새섹션.style_guide).not.toContain("손글씨");
  });

  it("공용 디자인이 없는 옛 초안은 전처럼 형제에게서 물려받는다", () => {
    const 형제 = [{ ...createEmptySection(0), style_guide: "정제된 스튜디오 세트" }];

    expect(createSectionFor(형제).style_guide).toBe("정제된 스튜디오 세트");
  });

  it("id 는 여전히 안 겹친다", () => {
    const 형제 = [createEmptySection(0)];

    expect(createSectionFor(형제, 디자인).section_id).not.toBe(형제[0]!.section_id);
  });
});

describe("두 화면이 공용 디자인을 물려준다", () => {
  const 소스 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  it("**구성안 화면이 넘긴다**", () => {
    expect(소스("ScenarioEditor.tsx")).toContain("createSectionFor(blueprint.sections, blueprint.designSystem)");
  });

  it("**편집기도 넘긴다** — 한쪽만 넘기면 다른 쪽으로 만든 섹션이 어긋난다", () => {
    expect(소스("PdpEditor.tsx")).toContain("createSectionFor(sections, designSystem)");
    expect(소스("PdpMakerClient.tsx")).toContain("designSystem={result.blueprint.designSystem}");
  });
});
