import { describe, expect, it } from "vitest";
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
    expect(createSectionFor(sections).section_id).toBe("S2");
  });

  it("빈 목록에서는 S1 이다", () => {
    expect(createSectionFor([]).section_id).toBe("S1");
  });

  it("끝까지 차 있으면 다음 번호로 간다", () => {
    expect(createSectionFor(of("S1", "S2", "S3")).section_id).toBe("S4");
  });

  it("이름과 이미지 id 도 그 번호를 따른다", () => {
    const section = createSectionFor(of("S1", "S3"));
    expect(section.section_id).toBe("S2");
    expect(section.section_name).toContain("2");
    expect(section.image_id).toBe("IMG_S2");
  });
});
