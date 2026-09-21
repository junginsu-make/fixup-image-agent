import { readFileSync } from "node:fs";
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { characterAngleLabel } from "../../../lib/character-library";
import { SectionAngleNote } from "../SectionAngleNote";

/**
 * **어느 낱말을 보고 골랐는지 보여준다**(U-05).
 *
 * 자동은 낱말 대조인데 어느 낱말이 걸렸는지 아무 데도 안 보였다. 사용자는
 * 「AI 가 알아서 골랐겠지」 하고 넘기다가, 이미지가 나온 뒤에야 뒷모습이
 * 나온 것을 보고 놀란다.
 */
const 글 = (props: Record<string, unknown> = {}) =>
  JSON.stringify(
    create(<SectionAngleNote characterId="c1" layoutNotes="" {...props} />).toJSON(),
  );

describe("어느 각도가 갈지 말한다", () => {
  it("**어느 칸에서 찾았는지 못 박는다** — 그냥 「설명」이면 위 칸을 고치러 간다", () => {
    expect(글({ layoutNotes: "뒷모습" })).toContain("레이아웃 메모");
  });

  it("**기본값일 때 할 일을 알려준다** — 사실만 말하면 출구가 없다", () => {
    const text = 글({ layoutNotes: "밝은 스튜디오" });

    expect(text).toContain("직접 고르세요");
  });

  it("**걸린 낱말을 보여준다**", () => {
    const text = 글({ layoutNotes: "뒷모습으로 걸어가는 장면" });

    // 각도 이름은 라이브러리가 정한다. 여기서 또 적으면 두 벌이 된다.
    expect(text).toContain(characterAngleLabel("back"));
    expect(text).toContain("「뒷모습」");
  });

  it("**아무 낱말도 안 걸리면 기본값이라고 말한다** — 설명을 고쳐도 안 바뀐다는 뜻이다", () => {
    const text = 글({ layoutNotes: "밝은 스튜디오" });

    expect(text).toContain("기본값");
    expect(text).toContain("낱말이 없어");
  });

  it("설명이 비어도 말한다 — 리디자인 경로가 늘 이 자리다", () => {
    expect(글({ layoutNotes: "" })).toContain("기본값");
  });
});

describe("말할 것이 없으면 안 그린다", () => {
  it("**캐릭터를 안 골랐으면 각도 이야기가 없다**", () => {
    expect(
      create(<SectionAngleNote characterId={undefined} layoutNotes="뒷모습" />).toJSON(),
    ).toBeNull();
  });

  it("**직접 고른 각도가 있으면 자동이 안 돈다**", () => {
    expect(
      create(<SectionAngleNote characterId="c1" layoutNotes="뒷모습" pickedAngles={["front"]} />).toJSON(),
    ).toBeNull();
  });
});

describe("구성안 화면이 실제로 띄운다", () => {
  const scenario = readFileSync(new URL("../ScenarioEditor.tsx", import.meta.url), "utf8");

  it("**컴포넌트만 있고 아무도 안 그리면 소용없다**", () => {
    const 배선 = scenario.slice(scenario.indexOf("<SectionAngleNote"), scenario.indexOf("/>", scenario.indexOf("<SectionAngleNote")));

    expect(배선).toContain("layoutNotes={section.layout_notes}");
    expect(배선).toContain("characterId={characterId}");
    expect(배선).toContain("pickedAngles={characterAngles}");
  });

  /*
    **바깥에서 안 넘기면 기능이 통째로 죽는다.** 안쪽 JSX 만 재면 그 구멍이
    안 보인다 — 프로퍼티를 필수로 둬서 컴파일러가 잡게 했고, 그 사실을 여기
    적어 둔다.
  */
  it("**바깥 전달을 선택으로 두지 않는다** — 안 넘겨도 통과하면 안 된다", () => {
    expect(scenario).toContain("characterId: string | undefined;");
    expect(scenario).toContain("characterAngles: string[];");
  });

  it("**자동이 읽는 칸이 화면에 있다** — 없으면 고칠 길이 없다", () => {
    expect(scenario).toContain("레이아웃 메모 (각도 자동이 읽는 칸)");
    expect(scenario).toContain("value={section.layout_notes ?? \"\"}");
  });
});
