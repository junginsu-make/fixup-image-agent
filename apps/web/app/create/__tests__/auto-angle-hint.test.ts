import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANGLE_KEYWORD_RULES, DEFAULT_SECTION_ANGLE } from "@fixup/pdp-core";
import { characterAngleLabel } from "../../../lib/character-library";
import { AUTO_ANGLE_HINT, REDESIGN_AUTO_ANGLE_HINT } from "../auto-angle-hint";

/**
 * **자동이 판단인 척하지 않는다**(U-05).
 *
 * 전에는 「섹션 설명을 **읽어** 어울리는 각도를 고릅니다」였다. 실제로는 낱말
 * 대조이고 아무것도 안 걸리면 한 각도로 굳는다.
 */
describe("자동 각도 안내", () => {
  it("**「읽어」라고 하지 않는다**", () => {
    expect(AUTO_ANGLE_HINT).not.toContain("읽어");
  });

  it("**무엇으로 고르는지 말한다**", () => {
    expect(AUTO_ANGLE_HINT).toContain("낱말");
  });

  it("**기본값이 있다는 것을 말한다** — 리디자인 경로는 언제나 이 자리다", () => {
    expect(AUTO_ANGLE_HINT).toContain("기본값");
    expect(AUTO_ANGLE_HINT).toContain(characterAngleLabel(DEFAULT_SECTION_ANGLE));
  });

  it("**규칙 표에서 짓는다** — 규칙이 늘면 문구도 따라 는다", () => {
    for (const rule of ANGLE_KEYWORD_RULES) {
      // 낱말 → 각도로 적는다. 규칙 이름을 쓰면 「뒷모습 → 뒷모습」처럼 헛돈다.
      for (const example of rule.examples) expect(AUTO_ANGLE_HINT).toContain(example);
      expect(AUTO_ANGLE_HINT).toContain(characterAngleLabel(rule.angle));
    }
  });

  it("**한 줄로 읽힌다** — 규칙을 다 나열해도 길어지면 아무도 안 읽는다", () => {
    expect(AUTO_ANGLE_HINT.length).toBeLessThan(160);
  });

  it("**화면이 이 문구를 쓴다** — 두 벌로 적으면 한쪽만 고치는 날이 온다", () => {
    const picker = readFileSync(new URL("../CharacterPicker.tsx", import.meta.url), "utf8");

    expect(picker).toContain("autoHint={AUTO_ANGLE_HINT}");
  });
});

/**
 * **리디자인 화면도 같은 상수에서 짓는다**(U-05).
 *
 * 거기서는 캐릭터를 섹션이 만들어지기 전에 정해서 읽을 설명이 늘 비어 있고,
 * 자동은 **언제나 기본값 한 장**이다. 전에는 「왼쪽 45도」를 손으로 적어 뒀다 —
 * 기본값을 바꾸면 그 줄만 거짓이 되고 잡는 시험이 없었다.
 */
describe("리디자인 안내", () => {
  it("**기본값 이름을 상수에서 가져온다**", () => {
    expect(REDESIGN_AUTO_ANGLE_HINT).toContain(characterAngleLabel(DEFAULT_SECTION_ANGLE));
  });

  it("화면이 그 문구를 쓴다", () => {
    const panels = readFileSync(new URL("../../redesign/redesign-panels.tsx", import.meta.url), "utf8");

    expect(panels).toContain("autoHint={REDESIGN_AUTO_ANGLE_HINT}");
    // 손으로 적은 옛 문구가 남아 있으면 안 된다.
    expect(panels).not.toContain("자동은 왼쪽 45도 한 장을 씁니다");
  });
});
