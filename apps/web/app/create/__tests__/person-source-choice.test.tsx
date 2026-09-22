import { readFileSync } from "node:fs";
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { PersonSourceChoice } from "../PersonSourceChoice";

/**
 * **둘 다 골랐으면 물어본다**(U-04).
 *
 * 전에는 서버가 말없이 업로드 쪽을 쓰고 캐릭터를 버렸다. 사용자는 이미지가
 * 나온 뒤에야 안다 — 한 장에 값이 든다.
 */
const 그리기 = (props: Record<string, unknown> = {}) =>
  create(
    <PersonSourceChoice
      uploadedName="face.png"
      characterId="c1"
      onSelect={() => {}}
      {...props}
    />,
  );

describe("충돌일 때만 묻는다", () => {
  it("**둘 다 있으면 묻는다**", () => {
    expect(JSON.stringify(그리기().toJSON())).toContain("누가 나오나요");
  });

  it("**사진만 있으면 안 묻는다**", () => {
    expect(그리기({ characterId: undefined }).toJSON()).toBeNull();
  });

  it("**캐릭터만 있으면 안 묻는다**", () => {
    expect(그리기({ uploadedName: undefined }).toJSON()).toBeNull();
  });

  it("둘 다 없으면 안 묻는다", () => {
    expect(그리기({ uploadedName: undefined, characterId: undefined }).toJSON()).toBeNull();
  });
});

describe("무엇이 빠지는지 말한다", () => {
  it("**안 골랐으면 업로드가 쓰인다고 말한다** — 서버 동작과 같다", () => {
    expect(JSON.stringify(그리기().toJSON())).toContain("고른 캐릭터는 나오지 않습니다");
  });

  it("캐릭터를 고르면 반대로 말한다", () => {
    const 글 = JSON.stringify(그리기({ value: "character" }).toJSON());

    expect(글).toContain("올린 인물 사진은 나오지 않습니다");
  });

  it("**대표컷에만 쓰는 사진이면 그렇게 말한다** — 「나오지 않습니다」는 거짓이다", () => {
    // 올린 사진은 대표컷에만 붙고, 나머지 섹션에는 캐릭터 각도가 실린다.
    const 글 = JSON.stringify(그리기({ uploadedUsage: "hero-only" }).toJSON());

    expect(글).toContain("대표컷에는 올린 사진이 나오고, 나머지 섹션에는 캐릭터가 나옵니다");
  });

  it("모든 섹션에 쓰면 캐릭터는 안 나온다고 말한다", () => {
    const 글 = JSON.stringify(그리기({ uploadedUsage: "all-sections" }).toJSON());

    expect(글).toContain("고른 캐릭터는 나오지 않습니다");
  });

  it("**누르면 알린다**", () => {
    const onSelect = vi.fn();
    const tree = 그리기({ onSelect });
    const 캐릭터단추 = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => JSON.stringify(node.children).includes("저장한 캐릭터"));

    캐릭터단추!.props.onClick();

    expect(onSelect).toHaveBeenCalledWith("character");
  });
});

describe("구성안 화면이 실제로 띄운다", () => {
  it("**컴포넌트만 있고 아무도 안 그리면 소용없다**", () => {
    const scenario = readFileSync(new URL("../ScenarioEditor.tsx", import.meta.url), "utf8");

    // **한 덩이로 본다.** 따로 찾으면 `value={undefined}` 로 바꿔도 통과한다 —
    // 그러면 화면이 저장된 선택을 안 비추고 늘 「올린 사진」이 눌린 것처럼 보인다.
    const 배선 = scenario.slice(scenario.indexOf("<PersonSourceChoice"), scenario.indexOf("/>", scenario.indexOf("<PersonSourceChoice")));

    expect(배선).toContain("characterId={characterId}");
    expect(배선).toContain("value={personSource}");
    expect(배선).toContain("onSelect={onPersonSourceChange}");
  });
});
