import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_SLOTS } from "@fixup/poster-core";

/**
 * **응답 틀에 없는 칸은 프롬프트로 시켜도 안 온다.**
 *
 * 구조화 응답은 틀에 없는 칸을 버린다. 「근거 없이 채운 칸을 `invented` 에
 * 적으세요」를 프롬프트에만 써 뒀더니 실제 호출 **여섯 번 모두 빈 목록**이
 * 왔다(2026-09-17 실측). 모델이 안 따른 것이 아니라 틀이 막고 있었다.
 *
 * **조용히 틀린다.** 값이 안 오는 것이 아니라 **빈 값이** 오므로, 화면은 「지어낸
 * 칸이 없구나」로 읽고 아무 표도 안 붙인다. 시험도 다 통과한다. 그래서 여기서
 * 값으로 재 둔다.
 */

const source = readFileSync(new URL("../providers.ts", import.meta.url), "utf8");

/** `PLAN_SPEC` 선언만 떼어 본다. 파일 전체에서 찾으면 남의 틀을 잡는다. */
const planSpec = source.slice(
  source.indexOf("const PLAN_SPEC"),
  source.indexOf("const GRAMMAR_SPEC"),
);

describe("기획 응답 틀", () => {
  it("떼어 낸 자리가 맞다", () => {
    expect(planSpec).toContain("poster_plan");
    expect(planSpec.length).toBeGreaterThan(100);
  });

  it("지어낸 칸을 받는다", () => {
    expect(planSpec).toContain("invented");
  });

  /** 안 받아도 되는 칸으로 두면 모델이 빼먹는다. 여섯 번 모두 빠졌었다. */
  it("반드시 받는 칸으로 둔다", () => {
    expect(planSpec).toContain('required: ["slots", "invented"]');
  });

  /**
   * **칸 이름을 손으로 적지 않는다.** 이름이 어긋나면 `parseInvented` 가
   * 걸러 내 조용히 빈 목록이 된다.
   */
  it("칸 이름을 코드에서 가져온다", () => {
    expect(planSpec).toContain("enum: Object.keys(SLOT_PROPERTIES)");
  });

  /** 슬롯 목록 자체가 비면 위 검사가 무의미해진다. */
  it("셀 칸이 있다", () => {
    expect(Object.keys(EMPTY_SLOTS).length).toBeGreaterThan(5);
  });
});
