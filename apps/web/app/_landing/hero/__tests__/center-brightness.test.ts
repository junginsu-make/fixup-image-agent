import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRAGMENT_SHADER } from "../shaders";

/**
 * **가운데 판은 원본 밝기로 보인다**(2026-09-17 사용자 보고).
 *
 * 「뒤로 물러난 판일수록 어둡게」를 **카메라로부터의 깊이**로 쟀다. 그런데
 * 카메라가 7 만큼 물러나 있어서, 맨 앞에 선 가운데 판도 65% 밝기로 깎였다 —
 * 원본보다 잿빛으로 보였다. 이제 가운데 판이 서는 깊이에서부터 잰다.
 *
 * 셰이더는 GPU 에서 돌아 값으로 못 잰다. 아래는 셰이더와 같은 식을 옮겨 적어
 * **두 곳이 같은 식인지**부터 확인한 뒤, 그 식으로 밝기를 잰다.
 */
const carousel = readFileSync(new URL("../HeroCarousel.tsx", import.meta.url), "utf8");

const DEPTH_LINE = "float depthFade = clamp(1.0 + (vDepth - uCenterDepth) * 0.05, 0.62, 1.0);";
const FOCUS_LINE = "float focus = mix(0.35, 1.0, uFocus);";

/** 셰이더와 같은 식. 위 두 줄이 셰이더에 그대로 있을 때만 뜻이 있다. */
function shade(depth: number, centerDepth: number, focusAmount: number) {
  const depthFade = Math.min(1, Math.max(0.62, 1 + (depth - centerDepth) * 0.05));
  const focus = 0.35 + (1 - 0.35) * focusAmount;
  return depthFade * focus;
}

describe("히어로 가운데 판의 밝기", () => {
  it("셰이더가 이 식을 그대로 쓴다", () => {
    expect(FRAGMENT_SHADER).toContain("uniform float uCenterDepth;");
    expect(FRAGMENT_SHADER).toContain(DEPTH_LINE);
    expect(FRAGMENT_SHADER).toContain(FOCUS_LINE);
    // 카메라 기준으로 돌아가면 가운데 판이 다시 잿빛이 된다.
    expect(FRAGMENT_SHADER).not.toContain("1.0 + vDepth * 0.05");
  });

  it("기준 깊이를 카메라 거리로 넘긴다 — 가운데 판은 z = 0 에 선다", () => {
    expect(carousel).toContain('centerDepth: gl.getUniformLocation(program, "uCenterDepth")');
    expect(carousel).toContain("gl.uniform1f(uniform.centerDepth, -distance);");
  });

  it("**가운데 판은 원본 밝기다** — 넓은 화면·좁은 화면 둘 다", () => {
    for (const distance of [7.0, 9.2]) {
      expect(shade(-distance, -distance, 1)).toBe(1);
    }
  });

  it("양옆은 여전히 물러나 있다 — 가운데의 절반 남짓", () => {
    // 첫 이웃: 호 길이 약 2.5 뒤, 조금 뒤로 물러나고 초점은 약 0.375.
    const neighbor = shade(-7.27, -7.0, 0.375);
    expect(neighbor).toBeLessThan(0.65);
    expect(neighbor).toBeGreaterThan(0.45);
  });
});
