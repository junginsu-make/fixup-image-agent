import { describe, expect, it } from "vitest";
import { readCopyTarget, spliceBullet, targetKey, writeCopyTarget } from "./pdp.copy-target";
import type { SectionBlueprint } from "./types";

function makeSection(overrides: Partial<SectionBlueprint> = {}): SectionBlueprint {
  return {
    section_id: "S1",
    section_name: "히어로",
    goal: "",
    headline: "촉촉함이 오래 갑니다",
    headline_en: "",
    subheadline: "하루 종일",
    subheadline_en: "",
    bullets: ["무향 처방", "12시간 보습"],
    bullets_en: [],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: "IMG_S1",
    purpose: "",
    prompt_ko: "제품 클로즈업",
    prompt_en: "product close-up",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
    ...overrides,
  };
}

describe("문장 지시자", () => {
  it("모든 slot을 읽고 쓴 값이 그대로 돌아온다", () => {
    const section = makeSection();
    for (const target of [
      { slot: "headline" } as const,
      { slot: "subheadline" } as const,
      { slot: "trust_or_objection_line" } as const,
      { slot: "CTA" } as const,
      { slot: "prompt_ko" } as const,
      { slot: "bullet", index: 1 } as const,
    ]) {
      const next = writeCopyTarget(section, target, "바뀐 값");
      expect(readCopyTarget(next, target)).toBe("바뀐 값");
    }
  });

  it("원본을 바꾸지 않는다", () => {
    const section = makeSection();
    writeCopyTarget(section, { slot: "headline" }, "다른 문구");
    expect(section.headline).toBe("촉촉함이 오래 갑니다");
  });

  it("없는 불릿을 읽으면 undefined", () => {
    expect(readCopyTarget(makeSection(), { slot: "bullet", index: 9 })).toBeUndefined();
  });

  it("불릿을 지우면 뒤 근거의 인덱스가 당겨진다", () => {
    const section = makeSection({
      evidenceVersion: 1,
      evidence: [
        { target: { slot: "bullet", index: 0 }, value: "무향 처방", kind: "quoted", quote: "무향" },
        { target: { slot: "bullet", index: 1 }, value: "12시간 보습", kind: "sample", note: "예시" },
      ],
    });
    const next = spliceBullet(section, 0);
    expect(next.bullets).toEqual(["12시간 보습"]);
    expect(next.evidence).toHaveLength(1);
    expect(next.evidence?.[0]).toMatchObject({ target: { slot: "bullet", index: 0 }, kind: "sample" });
  });

  it("불릿을 끼우면 뒤 근거의 인덱스가 밀린다", () => {
    const section = makeSection({
      evidenceVersion: 1,
      evidence: [
        { target: { slot: "bullet", index: 1 }, value: "12시간 보습", kind: "sample", note: "예시" },
      ],
    });
    const next = spliceBullet(section, 1, "새 불릿");
    expect(next.bullets).toEqual(["무향 처방", "새 불릿", "12시간 보습"]);
    expect(next.evidence?.[0]).toMatchObject({ target: { slot: "bullet", index: 2 } });
  });

  it("targetKey는 slot과 인덱스를 구분한다", () => {
    expect(targetKey({ slot: "headline" })).toBe("headline");
    expect(targetKey({ slot: "bullet", index: 2 })).toBe("bullet:2");
  });
});
