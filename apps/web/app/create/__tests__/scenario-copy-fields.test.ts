import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **그림에 그려지는 글자는 전부 고칠 수 있어야 한다.**
 *
 * 신뢰문구(`trust_or_objection_line`)는 그림에 그린다 — 「허리가 약해도 부담
 * 없이」처럼 망설임을 덮는 한 줄이다. 그런데 **구성 확인 화면에 그 칸이
 * 없었다.** 사용자는 자기 페이지에 뭐라고 적힐지 보지도, 고치지도 못한 채
 * 생성 버튼을 누른다.
 *
 * 설계 §10.2 의 `ApprovedCopy` 는 「제목·부제·불릿·**신뢰문구**·실제로 사용할
 * 기타 문구를 모두 포함한다」고 적고 있다. 보여 주지 않으면 승인이 아니다.
 */
const editor = readFileSync(new URL("../ScenarioEditor.tsx", import.meta.url), "utf8");

describe("구성 확인 화면의 편집 칸", () => {
  it.each([
    ["헤드라인", "headline"],
    ["서브헤드라인", "subheadline"],
    ["이미지 방향", "prompt_ko"],
  ])("%s 는 고칠 수 있다", (_label, slot) => {
    expect(editor).toContain(`{ slot: "${slot}" }`);
  });

  it("**신뢰문구도 고칠 수 있다** — 그림에 그려지는 글자다", () => {
    expect(editor).toContain('{ slot: "trust_or_objection_line" }');
  });

  it("불릿도 고칠 수 있다", () => {
    expect(editor).toContain("BulletList");
  });

  it("**CTA 칸은 없다** — 두 모드 모두 안 만들고 그리지도 않는다", () => {
    // 채울 수 있는데 쓰이지 않는 칸은 거짓말이다(2026-07-30 결정).
    expect(editor).not.toContain('{ slot: "CTA" }');
  });
});
