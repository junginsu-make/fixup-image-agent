import { describe, expect, it } from "vitest";
import {
  acknowledgeAll,
  applyUserEdit,
  collectUnverified,
  resolveStructureFailures,
  findUncoveredFactTargets,
  removeTarget,
  validateEvidenceBinding,
  verifyEvidenceStructure,
} from "./pdp.evidence";
import type { CopyEvidence, LandingPageBlueprint, SectionBlueprint } from "./types";

const SOURCE = "요가 강의를 팝니다. 8주 과정이고 초보자도 할 수 있어요.";

function section(
  evidence: CopyEvidence[],
  overrides: Partial<SectionBlueprint> = {},
): SectionBlueprint {
  return {
    section_id: "S1",
    section_name: "히어로",
    goal: "",
    headline: "8주면 충분합니다",
    headline_en: "",
    subheadline: "수강생 3,000명이 선택했습니다",
    subheadline_en: "",
    bullets: ["초보자도 가능"],
    bullets_en: [],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: "IMG_S1",
    purpose: "",
    prompt_ko: "요가 수업 장면",
    prompt_en: "yoga class",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
    evidenceVersion: 1,
    evidence,
    ...overrides,
  };
}

function plan(...sections: SectionBlueprint[]): LandingPageBlueprint {
  return { executiveSummary: "", scorecard: [], blueprintList: [], sections };
}

const quotedHeadline: CopyEvidence = {
  target: { slot: "headline" },
  value: "8주면 충분합니다",
  kind: "quoted",
  quote: "8주 과정",
};
const sampleSub: CopyEvidence = {
  target: { slot: "subheadline" },
  value: "수강생 3,000명이 선택했습니다",
  kind: "sample",
  note: "실제 수강생 수",
};

describe("근거 유효성", () => {
  it("문구가 그대로면 fresh", () => {
    expect(validateEvidenceBinding(section([quotedHeadline]), quotedHeadline)).toBe("fresh");
  });

  it("문구를 고치면 stale", () => {
    const edited = section([quotedHeadline], { headline: "12주 과정입니다" });
    expect(validateEvidenceBinding(edited, quotedHeadline)).toBe("stale");
  });

  it("target이 사라지면 dangling", () => {
    const evidence: CopyEvidence = {
      target: { slot: "bullet", index: 3 },
      value: "x",
      kind: "rhetoric",
    };
    expect(validateEvidenceBinding(section([evidence]), evidence)).toBe("dangling");
  });
});

describe("미확인 수집", () => {
  it("확인하지 않은 sample을 모은다", () => {
    const items = collectUnverified(plan(section([quotedHeadline, sampleSub])));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sectionId: "S1",
      target: { slot: "subheadline" },
      kind: "sample",
      note: "실제 수강생 수",
    });
  });

  it("acknowledgedAt이 찍힌 fresh sample은 빠진다", () => {
    const acknowledged = { ...sampleSub, acknowledgedAt: "2026-07-29T00:00:00.000Z" };
    expect(collectUnverified(plan(section([acknowledged])))).toHaveLength(0);
  });

  it("문구가 바뀌면 확인 시각이 있어도 다시 모인다", () => {
    const acknowledged = { ...sampleSub, acknowledgedAt: "2026-07-29T00:00:00.000Z" };
    const edited = section([acknowledged], { subheadline: "수강생 9,000명이 선택했습니다" });
    expect(collectUnverified(plan(edited))).toMatchObject([
      { kind: "sample", value: "수강생 9,000명이 선택했습니다" },
    ]);
  });

  it("ask는 항상 모으고 quoted·rhetoric·user는 모으지 않는다", () => {
    const evidence: CopyEvidence[] = [
      quotedHeadline,
      { target: { slot: "subheadline" }, value: "", kind: "ask", note: "실제 수강생 수" },
      { target: { slot: "CTA" }, value: "지금 시작하세요", kind: "rhetoric" },
      { target: { slot: "prompt_ko" }, value: "사용자가 쓴 장면", kind: "user" },
    ];
    const items = collectUnverified(
      plan(
        section(evidence, {
          subheadline: "",
          CTA: "지금 시작하세요",
          prompt_ko: "사용자가 쓴 장면",
        }),
      ),
    );
    expect(items).toMatchObject([{ kind: "ask", note: "실제 수강생 수" }]);
  });

  it("evidenceVersion이 없는 섹션은 건너뛴다", () => {
    const old = section([sampleSub], { evidenceVersion: undefined });
    expect(collectUnverified(plan(old))).toHaveLength(0);
  });
});

describe("구조 검증", () => {
  it("quote가 원문에 없으면 bad_quote", () => {
    const fake = { ...quotedHeadline, quote: "원문에 없는 문장" };
    expect(verifyEvidenceStructure(plan(section([fake, sampleSub])), SOURCE)).toContainEqual({
      sectionId: "S1",
      target: { slot: "headline" },
      reason: "bad_quote",
    });
  });

  it("사실 표지가 있는데 근거가 없으면 missing", () => {
    const failures = verifyEvidenceStructure(plan(section([quotedHeadline])), SOURCE);
    expect(failures).toContainEqual({
      sectionId: "S1",
      target: { slot: "subheadline" },
      reason: "missing",
    });
  });

  it("숫자가 든 rhetoric은 rhetoric_with_fact", () => {
    const disguised: CopyEvidence = {
      target: { slot: "subheadline" },
      value: "수강생 3,000명이 선택했습니다",
      kind: "rhetoric",
    };
    expect(verifyEvidenceStructure(plan(section([quotedHeadline, disguised])), SOURCE)).toContainEqual({
      sectionId: "S1",
      target: { slot: "subheadline" },
      reason: "rhetoric_with_fact",
    });
  });

  it("같은 target이 둘이면 duplicate", () => {
    const duplicate = { ...quotedHeadline, kind: "rhetoric" as const, quote: undefined };
    expect(verifyEvidenceStructure(plan(section([quotedHeadline, duplicate, sampleSub])), SOURCE)).toContainEqual({
      sectionId: "S1",
      target: { slot: "headline" },
      reason: "duplicate",
    });
  });

  it("없는 target은 unknown_target", () => {
    const ghost: CopyEvidence = {
      target: { slot: "bullet", index: 7 },
      value: "x",
      kind: "sample",
      note: "실제 값",
    };
    expect(verifyEvidenceStructure(plan(section([quotedHeadline, sampleSub, ghost])), SOURCE)).toContainEqual({
      sectionId: "S1",
      target: { slot: "bullet", index: 7 },
      reason: "unknown_target",
    });
  });

  it("금지 분류 sample은 banned", () => {
    const banned = { ...sampleSub, value: "월 500만 원을 보장합니다" };
    const blueprint = plan(section([quotedHeadline, banned], { subheadline: banned.value }));
    expect(verifyEvidenceStructure(blueprint, SOURCE)).toContainEqual({
      sectionId: "S1",
      target: { slot: "subheadline" },
      reason: "banned",
    });
  });

  it("note 없는 ask는 missing", () => {
    const ask: CopyEvidence = { target: { slot: "subheadline" }, value: "", kind: "ask" };
    const failures = verifyEvidenceStructure(
      plan(section([quotedHeadline, ask], { subheadline: "" })),
      SOURCE,
    );
    expect(failures).toContainEqual({
      sectionId: "S1",
      target: { slot: "subheadline" },
      reason: "missing",
    });
  });
});

describe("강등", () => {
  it("bad_quote는 그 target을 ask로 내린다", () => {
    const fake = { ...quotedHeadline, quote: "원문에 없는 문장" };
    const before = plan(section([fake, sampleSub]));
    const after = resolveStructureFailures(before, verifyEvidenceStructure(before, SOURCE));
    expect(after.sections[0]?.headline).toBe("");
    expect(after.sections[0]?.evidence?.find((entry) => entry.target.slot === "headline")).toMatchObject({
      kind: "ask",
      value: "",
    });
  });

  // 실측에서 드러난 것: 입력이 짧으면 인용할 원문이 없어 모델이 자기가 쓴 문장에
  // quoted 를 달고, bad_quote 가 무더기로 난다. 그걸 전부 지우면 빈 페이지가 된다.
  it("예시로 채우기를 골랐으면 문구를 지우지 않고 sample 로 표시한다", () => {
    const fake = { ...quotedHeadline, quote: "원문에 없는 문장" };
    const before = plan(section([fake, sampleSub]));
    const after = resolveStructureFailures(before, verifyEvidenceStructure(before, SOURCE), "sample");

    expect(after.sections[0]?.headline).toBe("8주면 충분합니다");
    expect(after.sections[0]?.evidence?.find((entry) => entry.target.slot === "headline")).toMatchObject({
      kind: "sample",
      value: "8주면 충분합니다",
    });
    // 표시만 하고 넘어가지 않는다 — 확인 화면이 반드시 잡는다.
    expect(collectUnverified(after).some((item) => item.target.slot === "headline")).toBe(true);
  });

  it("예시로 채우기여도 금지 분류는 지운다", () => {
    const banned = { ...sampleSub, value: "월 500만 원을 보장합니다" };
    const before = plan(section([quotedHeadline, banned], { subheadline: banned.value }));
    const after = resolveStructureFailures(before, verifyEvidenceStructure(before, SOURCE), "sample");

    expect(after.sections[0]?.subheadline).toBe("");
    expect(after.sections[0]?.evidence?.find((entry) => entry.target.slot === "subheadline")).toMatchObject({
      kind: "ask",
    });
  });

  it("예시로 채우기여도 원래 비어 있던 자리는 ask 로 남는다", () => {
    const ask: CopyEvidence = { target: { slot: "subheadline" }, value: "", kind: "ask" };
    const before = plan(section([quotedHeadline, ask], { subheadline: "" }));
    const after = resolveStructureFailures(before, verifyEvidenceStructure(before, SOURCE), "sample");

    expect(after.sections[0]?.evidence?.find((entry) => entry.target.slot === "subheadline")).toMatchObject({
      kind: "ask",
    });
  });

  it("unknown_target은 근거만 버리고 실제 필드를 건드리지 않는다", () => {
    const ghost: CopyEvidence = {
      target: { slot: "bullet", index: 7 },
      value: "x",
      kind: "sample",
      note: "실제 값",
    };
    const before = plan(section([quotedHeadline, sampleSub, ghost]));
    const after = resolveStructureFailures(before, verifyEvidenceStructure(before, SOURCE));
    expect(after.sections[0]?.bullets).toEqual(["초보자도 가능"]);
    expect(after.sections[0]?.evidence?.some((entry) => entry.target.slot === "bullet")).toBe(false);
  });
});

// 게이트는 '근거를 지우고 보내기'를 막아야 하지만, 근거가 애초에 필요 없는
// 섹션(숫자가 하나도 없는 카피, 사용자가 방금 추가한 빈 섹션)까지 막으면 안 된다.
describe("근거 커버리지", () => {
  it("사실 표지가 있는데 근거가 없으면 잡는다", () => {
    const stripped = section([], { evidence: [] });
    const gaps = findUncoveredFactTargets(stripped);
    expect(gaps).toContainEqual({ slot: "subheadline" }); // "수강생 3,000명"
  });

  it("근거가 있으면 잡지 않는다", () => {
    expect(findUncoveredFactTargets(section([quotedHeadline, sampleSub]))).toHaveLength(0);
  });

  it("사실 표지가 없는 섹션은 근거가 비어도 잡지 않는다", () => {
    const plainSection = section([], {
      evidence: [],
      headline: "오늘 시작해 보세요",
      subheadline: "매트 위에서 뵙겠습니다",
      bullets: [],
      prompt_ko: "요가 수업 장면",
    });
    expect(findUncoveredFactTargets(plainSection)).toHaveLength(0);
  });

  it("장면 지시(prompt_ko)는 근거 대상이 아니다", () => {
    const scene = section([], {
      evidence: [],
      headline: "오늘 시작해 보세요",
      subheadline: "매트 위에서 뵙겠습니다",
      bullets: [],
      prompt_ko: "20대 여성이 3인용 매트 위에 앉아 있다",
    });
    expect(findUncoveredFactTargets(scene)).toHaveLength(0);
  });
});

describe("확인 화면 동작", () => {
  it("고치면 user가 되고 value가 새 문구로 바뀐다", () => {
    const after = applyUserEdit(
      plan(section([sampleSub])),
      "S1",
      { slot: "subheadline" },
      "수강생 42명",
    );
    expect(after.sections[0]?.subheadline).toBe("수강생 42명");
    expect(after.sections[0]?.evidence?.[0]).toMatchObject({ kind: "user", value: "수강생 42명" });
    expect(collectUnverified(after)).toHaveLength(0);
  });

  it("확인하면 sample에 전달한 시각을 찍는다", () => {
    const after = acknowledgeAll(
      plan(section([sampleSub])),
      "2026-07-29T01:00:00.000Z",
    );
    expect(after.sections[0]?.evidence?.[0]).toMatchObject({
      kind: "sample",
      acknowledgedAt: "2026-07-29T01:00:00.000Z",
    });
    expect(collectUnverified(after)).toHaveLength(0);
  });

  // 확인 화면은 '지금 화면에 보이는 문구'를 보여주고 확인을 받는다. 그 문구가
  // 딱지를 붙일 때와 달라졌다면 그건 더 이상 우리가 채운 값이 아니다.
  // sample 로 남겨 두면 "우리가 지어낸 값을 사용자가 확인했다"는 거짓 기록이 된다.
  it("문구가 바뀐 근거는 확인하면 user 가 된다", () => {
    const drifted = plan(
      section([sampleSub], { subheadline: "수강생 42명이 선택했습니다" }),
    );
    expect(collectUnverified(drifted)).toHaveLength(1);

    const after = acknowledgeAll(drifted, "2026-07-29T01:00:00.000Z");

    expect(after.sections[0]?.evidence?.[0]).toMatchObject({
      kind: "user",
      value: "수강생 42명이 선택했습니다",
    });
    expect(collectUnverified(after)).toHaveLength(0);
  });

  // quoted·rhetoric 도 문구가 바뀌면 미확인으로 잡히는데, 예전에는 확인할 방법이
  // 없어 「이대로 진행」 버튼이 영영 비활성으로 굳었다.
  it("문구가 바뀐 quoted 도 확인으로 풀린다", () => {
    const drifted = plan(
      section([quotedHeadline], { headline: "12주 과정입니다" }),
    );
    expect(collectUnverified(drifted)).toHaveLength(1);

    const after = acknowledgeAll(drifted, "2026-07-29T01:00:00.000Z");

    expect(after.sections[0]?.evidence?.[0]).toMatchObject({
      kind: "user",
      value: "12주 과정입니다",
    });
    expect(collectUnverified(after)).toHaveLength(0);
  });

  it("사라진 target의 근거는 확인하지 않는다", () => {
    const ghost: CopyEvidence = {
      target: { slot: "bullet", index: 7 },
      value: "없는 항목",
      kind: "sample",
      note: "확인 필요",
    };
    const after = acknowledgeAll(plan(section([ghost])), "2026-07-29T01:00:00.000Z");
    expect(after.sections[0]?.evidence?.[0].acknowledgedAt).toBeUndefined();
  });

  it("빼면 스칼라는 빈 문자열이 되고 근거가 사라진다", () => {
    const after = removeTarget(
      plan(section([quotedHeadline, sampleSub])),
      "S1",
      { slot: "subheadline" },
    );
    expect(after.sections[0]?.subheadline).toBe("");
    expect(after.sections[0]?.evidence?.some((entry) => entry.target.slot === "subheadline")).toBe(false);
  });

  it("불릿을 빼면 뒤 불릿 근거의 인덱스가 당겨진다", () => {
    const first: CopyEvidence = {
      target: { slot: "bullet", index: 0 },
      value: "첫째",
      kind: "sample",
      note: "첫째 값",
    };
    const second: CopyEvidence = {
      target: { slot: "bullet", index: 1 },
      value: "둘째",
      kind: "sample",
      note: "둘째 값",
    };
    const after = removeTarget(
      plan(section([first, second], { bullets: ["첫째", "둘째"] })),
      "S1",
      { slot: "bullet", index: 0 },
    );
    expect(after.sections[0]?.bullets).toEqual(["둘째"]);
    expect(after.sections[0]?.evidence?.[0]?.target).toEqual({ slot: "bullet", index: 0 });
  });
});
