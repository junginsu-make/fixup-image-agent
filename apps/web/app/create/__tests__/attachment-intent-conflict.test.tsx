import { readFileSync } from "node:fs";
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { AttachmentIntentField } from "../AttachmentIntentField";

/**
 * **바꿔 달라고 적었는데 조용히 무시됐다**(U-18).
 *
 * 제품·인물 자리에 「색을 바꿔 주세요」를 적으면 역할 규칙이 그것을 막는다.
 * 맞는 설계지만 **아무도 그 사실을 말하지 않아서**, 사용자는 적었는데 안 바뀐
 * 이유를 모른 채 다시 적고 이미지 값을 또 치른다.
 */
const 글 = (props: Record<string, unknown>) =>
  JSON.stringify(
    create(
      <AttachmentIntentField id="t" value="" onChange={() => {}} placeholder="" {...props} />,
    ).toJSON(),
  );

describe("충돌을 그 자리에서 알린다", () => {
  it("**제품 색을 바꿔 달라면 알린다**", () => {
    const text = 글({ role: "anchor", value: "제품 색을 파란색으로 바꿔 주세요" });

    expect(text).toContain("반영되지 않습니다");
    expect(text).toContain("「색」");
  });

  it("**인물 얼굴을 바꿔 달라면 알린다**", () => {
    expect(글({ role: "person", value: "얼굴을 갸름하게 바꿔 주세요" })).toContain("같은 사람으로");
  });

  it("**연출 지시는 조용하다** — 각도·배경은 여기서 바꿀 수 있다", () => {
    expect(글({ role: "anchor", value: "왼쪽에 놓아 주세요" })).not.toContain("반영되지 않습니다");
  });

  it("**레퍼런스 자리는 지킬 것이 없다**", () => {
    expect(글({ role: "style", value: "색을 파란색으로 바꿔 주세요" })).not.toContain("반영되지 않습니다");
  });

  it("**역할을 안 주면 아무 말도 안 한다** — 옛 호출자가 엉뚱한 경고를 띄우지 않게", () => {
    expect(글({ value: "제품 색을 바꿔 주세요" })).not.toContain("반영되지 않습니다");
  });

  it("**무엇을 하면 되는지 말한다** — 막기만 하면 같은 결함이다", () => {
    const text = 글({ role: "anchor", value: "로고를 지워 주세요" });

    expect(text).toContain("사진을 올려 주세요");
  });
});

describe("지켜야 할 자리마다 붙어 있다", () => {
  const 소스 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  /**
   * **칸과 역할을 한 덩이로 본다.**
   *
   * 따로 찾으면 anchor 와 person 을 **맞바꿔도 통과**한다 — 제품 칸에 「같은
   * 사람으로 그리기로 한 자리」라는 딴 경고가 뜨는데도.
   */
  const 칸의역할 = (source: string, id: string) => {
    const at = source.indexOf(`id="${id}"`);
    return at === -1 ? "" : source.slice(at, source.indexOf("/>", at));
  };

  it.each([
    ["PdpMakerClient.tsx", "intent-anchor", "anchor"],
    ["PdpMakerClient.tsx", "intent-person", "person"],
    ["PdpMakerClient.tsx", "intent-style", "style"],
    ["ScenarioEditor.tsx", "scenario-intent-person", "person"],
    ["ScenarioEditor.tsx", "scenario-intent-style", "style"],
  ])("%s 의 %s 는 %s 자리다", (file, id, role) => {
    const 블록 = 칸의역할(소스(file), id);

    expect(블록).not.toBe("");
    expect(블록).toContain(`role="${role}"`);
  });

  it("**PDP 의 지시 칸은 다섯이다** — 새 칸이 생기면 여기가 먼저 빨개진다", () => {
    const 칸 = [소스("PdpMakerClient.tsx"), 소스("ScenarioEditor.tsx")]
      .join(" ")
      .match(/id="(?:scenario-)?intent-[a-z]+"/g) ?? [];

    expect(칸).toHaveLength(5);
  });
});

/**
 * **제품 지시의 충돌은 구성안에도 남는다**(U-18).
 *
 * 그 칸은 업로드 화면에 있고 구성안으로 넘어오면 화면째 사라진다. 그런데
 * **지시는 그대로 실려** 이미지 생성까지 간다 — 인물·레퍼런스는 여기에도 칸이
 * 있어 경고가 따라오는데 제품만 안 따라왔다. 설계의 「수정하도록 한다」가
 * 거기서 끊긴다.
 */
describe("생성 직전에도 제품 충돌을 말한다", () => {
  const scenario = readFileSync(new URL("../ScenarioEditor.tsx", import.meta.url), "utf8");

  it("**구성안 화면이 제품 지시를 다시 본다**", () => {
    expect(scenario).toContain('identityConflictOf(attachmentIntents.anchor, "anchor")');
  });

  it("**무엇이 걸렸는지와 할 일을 함께 말한다**", () => {
    expect(scenario).toContain("anchorConflict.matched");
    expect(scenario).toContain("anchorConflict.message");
  });
});
