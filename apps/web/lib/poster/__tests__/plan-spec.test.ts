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

  /**
   * **두 목록이 갈리면 조용히 다 버려진다.**
   *
   * `SLOT_PROPERTIES`(여기)와 `PosterSlotsSchema`(poster-core)가 손으로 적은
   * 두 벌이다. 갈라지면 응답 틀의 enum 과 `parseInvented` 의 허용 목록이
   * 어긋나, 모델이 옳게 신고해도 전부 걸러져 표가 하나도 안 붙는다. 그런데
   * 아무 데도 빨개지지 않는다(2026-09-17 리뷰).
   *
   * 「셀 칸이 있다」 같은 검사는 그 자리를 채우는 척만 한다. 실제로 맞대 본다.
   */
  it("칸 목록이 poster-core 와 같다", () => {
    const 틀 = source.slice(
      source.indexOf("const SLOT_PROPERTIES"),
      source.indexOf("const PLAN_SPEC"),
    );
    const 이름들 = [...틀.matchAll(/^\s{2}"?([A-Za-z]+)"?:/gm)].map((found) => found[1]);

    expect(이름들.length, "SLOT_PROPERTIES 를 못 읽었다").toBeGreaterThan(5);
    expect([...이름들].sort()).toEqual(Object.keys(EMPTY_SLOTS).sort());
  });
});
