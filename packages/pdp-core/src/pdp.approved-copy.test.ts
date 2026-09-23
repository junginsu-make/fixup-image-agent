import { describe, expect, it } from "vitest";
import { approvedCopyOf } from "./pdp.approved-copy";
import { buildQaPrompt } from "./pdp.qa";
import { buildImageJson } from "./pdp.image-prompt";
import type { SectionBlueprint } from "./types";

/**
 * **그린 것과 검사한 것이 같아야 한다.**
 *
 * 생성과 QA 가 각자 다른 목록을 보고 있었다.
 *
 *   신뢰문구(`trust_or_objection_line`) — 그림에 **안 그린다**(2026-09-23 사용자:
 *     완성본 밑에 설명 한 줄이 박혀 나왔다). QA 도 **안 본다**
 *   CTA — 그림에는 **안 그린다**(2026-07-30 결정). QA 는 **승인 원고로 본다**
 *     → 없는 문구를 기준으로 삼는다
 *
 * 설계 §10.2: 「생성과 QA 는 동일 `ApprovedCopy` 를 사용한다. 제목·부제·불릿·
 * 신뢰문구·실제로 사용할 기타 문구를 모두 포함한다.」
 */
const 섹션 = (patch: Partial<SectionBlueprint> = {}) =>
  ({
    section_id: "S1",
    headline: "무릎이 편한 의자",
    subheadline: "오래 앉아도 배기지 않습니다",
    bullets: ["3단 높이 조절", "통기성 메시"],
    trust_or_objection_line: "허리가 약해도 부담 없이",
    CTA: "지금 확인하기",
    prompt_en: "a chair in a studio",
    layout_notes: "",
    ...patch,
  }) as SectionBlueprint;

describe("승인 원고에 무엇이 들어가나", () => {
  it("제목·부제·불릿이 들어간다", () => {
    const 원고 = approvedCopyOf(섹션());

    expect(원고.headline).toBe("무릎이 편한 의자");
    expect(원고.subheadline).toBe("오래 앉아도 배기지 않습니다");
    expect(원고.bullets).toEqual(["3단 높이 조절", "통기성 메시"]);
  });

  it("**신뢰문구는 안 들어간다** — 그림에 안 그리기로 했다(2026-09-23)", () => {
    expect(JSON.stringify(approvedCopyOf(섹션()))).not.toContain("허리가 약해도 부담 없이");
  });

  it("**CTA 는 안 들어간다** — 그림에 안 그리기로 했다(2026-07-30)", () => {
    const 원고 = approvedCopyOf(섹션());

    expect(JSON.stringify(원고)).not.toContain("지금 확인하기");
  });

  it("빈 칸은 버린다", () => {
    const 원고 = approvedCopyOf(섹션({ bullets: ["", "값"] }));

    expect(원고.bullets).toEqual(["값"]);
  });

  it("**글자 없는 그림에는 원고가 없다** — 카피는 편집기에서 얹는다", () => {
    const 원고 = approvedCopyOf(섹션(), { outputMode: "editable" });

    expect(원고.headline).toBeUndefined();
    expect(원고.bullets).toEqual([]);
  });
});

describe("QA 가 보는 것과 그림에 그리는 것이 같다", () => {
  it("**신뢰문구는 QA 프롬프트에 없다** — 그리지 않는 글자를 기준으로 삼지 않는다", () => {
    expect(buildQaPrompt(섹션())).not.toContain("허리가 약해도 부담 없이");
  });

  it("**CTA 는 QA 프롬프트에 없다** — 그리지 않는 글자를 기준으로 삼지 않는다", () => {
    expect(buildQaPrompt(섹션())).not.toContain("지금 확인하기");
  });

  it("그림 프롬프트와 QA 프롬프트가 같은 문구를 싣는다", () => {
    const section = 섹션();
    const 그림 = buildImageJson(section, { style: "studio", withModel: false, outputMode: "full-image" });
    const qa = buildQaPrompt(section);

    for (const 문구 of ["무릎이 편한 의자", "3단 높이 조절"]) {
      expect(그림, `그림 프롬프트에 「${문구}」가 없다`).toContain(문구);
      expect(qa, `QA 프롬프트에 「${문구}」가 없다`).toContain(문구);
    }
    // 안 그리는 글자는 **양쪽 다** 없어야 한다. 한쪽만 있으면 QA 가 오탐한다.
    expect(그림).not.toContain("허리가 약해도 부담 없이");
    expect(qa).not.toContain("허리가 약해도 부담 없이");
  });

  it("**글자 없는 그림은 QA 도 원고를 안 본다**", () => {
    const qa = buildQaPrompt(섹션(), { outputMode: "editable" });

    expect(qa).not.toContain("무릎이 편한 의자");
  });
});
