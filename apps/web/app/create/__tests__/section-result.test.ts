import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SectionBlueprint } from "@fixup/pdp-core";
import { applyToSectionByKey } from "../section-result";

/**
 * **결과가 제 섹션에 붙는가**(A-16).
 *
 * 생성이 도는 동안 순서가 바뀌면 인덱스와 키의 짝이 달라진다. 오래된 키 배열로
 * 찾으면 **엉뚱한 섹션에 이미지가 박힌다.**
 */
const 섹션 = (id: string): SectionBlueprint => ({ section_id: id, headline: id } as SectionBlueprint);

describe("키로 찾아 붙인다", () => {
  const sections = [섹션("A"), 섹션("B"), 섹션("C")];
  const keys = ["k-a", "k-b", "k-c"];

  it("**그 섹션에만 붙는다**", () => {
    const 결과 = applyToSectionByKey(sections, keys, "k-b", { generatedImage: "IMG" });

    expect(결과[1]!.generatedImage).toBe("IMG");
    expect(결과[0]!.generatedImage).toBeUndefined();
    expect(결과[2]!.generatedImage).toBeUndefined();
  });

  it("**순서가 바뀌어도 제 섹션에 붙는다** — 둘을 함께 옮겼을 때", () => {
    const 바뀐섹션 = [섹션("C"), 섹션("A"), 섹션("B")];
    const 바뀐키 = ["k-c", "k-a", "k-b"];

    const 결과 = applyToSectionByKey(바뀐섹션, 바뀐키, "k-b", { generatedImage: "IMG" });

    expect(결과.find((section) => section.section_id === "B")!.generatedImage).toBe("IMG");
  });

  /**
   * **키가 겹치면 첫 번째만 고치면 안 된다.**
   *
   * `indexOf` 로 자리를 먼저 찾으면 같은 키가 둘일 때 앞엣것만 바뀐다. 키는
   * 겹치면 안 되는 값이지만(`createSectionFor` 가 그렇게 짓는다), 겹친 날에
   * **조용히 한 섹션만 바뀌는 것**보다는 둘 다 바뀌어 눈에 띄는 편이 낫다.
   */
  it("**겹친 키는 둘 다 본다** — 자리를 먼저 찾으면 앞엣것만 바뀐다", () => {
    const 겹친섹션 = [섹션("A"), 섹션("B")];
    const 겹친키 = ["같은키", "같은키"];

    const 결과 = applyToSectionByKey(겹친섹션, 겹친키, "같은키", { generatedImage: "IMG" });

    expect(결과[0]!.generatedImage).toBe("IMG");
    expect(결과[1]!.generatedImage).toBe("IMG");
  });

  it("모르는 키면 아무것도 안 바꾼다", () => {
    expect(applyToSectionByKey(sections, keys, "없는키", { generatedImage: "IMG" })).toEqual(sections);
  });

  it("**원본을 건드리지 않는다**", () => {
    applyToSectionByKey(sections, keys, "k-b", { generatedImage: "IMG" });

    expect(sections[1]!.generatedImage).toBeUndefined();
  });
});

describe("화면이 지금 배열을 넘긴다", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

  it("**오래된 클로저가 아니라 ref 를 넘긴다**", () => {
    // 잠금이 유일한 방어이면, 잠금을 안 거는 길이 하나 생길 때 조용히 되살아난다.
    expect(editor).toContain("applyToSectionByKey(current, sectionKeysRef.current");
  });

  it("**ref 가 실제로 따라간다** — 안 따라가면 늘 처음 값이다", () => {
    expect(editor).toContain("sectionKeysRef.current = sectionKeys");
  });

  /**
   * **긴 쪽이 더 급하다.**
   *
   * 일괄 생성은 묶음을 여러 번, 수 분 동안 돈다. 단건만 고치면 창이 더 넓은
   * 쪽이 그대로 남는다 — 처음에 그렇게 절반만 고쳤다.
   */
  it("**결과를 붙이는 자리가 모두 지금 배열을 본다**", () => {
    /*
      **동기로 읽는 자리는 클로저가 맞다.** 렌더 중에는 그 값이 지금 값이다.
      오래된 배열이 문제가 되는 것은 **비동기 결과를 붙일 때**뿐이라,
      `setSections` 업데이터 안만 본다.
    */
    const 업데이터패턴 = new RegExp(
      String.raw`setSections\(\(current\)[\s\S]{0,900}?generatedImage:[\s\S]{0,400}?\}\)`,
      "g",
    );
    const 업데이터 = [...editor.matchAll(업데이터패턴)].map((hit) => hit[0]);

    // 결과를 붙이는 자리가 둘이다 — 단건과 일괄.
    expect(업데이터).toHaveLength(2);
    for (const body of 업데이터) {
      expect(body).not.toMatch(new RegExp(String.raw`(?<!Ref\.current)sectionKeys\[`));
    }
  });
});
