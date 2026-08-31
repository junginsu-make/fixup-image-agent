import { describe, expect, it } from "vitest";
import { createEmptySection } from "../scenario-sections";

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
