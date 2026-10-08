import React from "react";
import { act, create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpecPicker, type SnsSpec } from "../spec-picker";

/**
 * **카드뉴스 설정의 언어 · 이미지 모델 칸** (2026-10-08 사용자).
 *
 * 1. 언어 고르기가 화면 반을 차지할 만큼 넓을 까닭이 없다.
 * 2. 이미지 모델이 언어 옆에 끼어 잘 안 보였다 — 따로 한 칸으로 뺀다.
 * 3. 언어 고르기와 모델 버튼의 세로 높이를 맞춘다(버튼 h-8).
 */

const spec: SnsSpec = {
  ratio: "4:5",
  cardCountMode: "auto",
  language: "ko",
  modelId: "gpt-image-2.5-flare",
  look: "auto",
  userInstruction: "",
};

let renderer: ReactTestRenderer | null = null;
function mount() {
  act(() => {
    renderer = create(<SpecPicker spec={spec} onChange={() => {}} attachments={[]} />);
  });
  return renderer!.root;
}
const text = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const classes = (node: ReactTestInstance) => String(node.props.className).split(/\s+/);
const sectionOf = (node: ReactTestInstance) => {
  let at: ReactTestInstance | null = node;
  while (at && at.type !== "section") at = at.parent;
  return at;
};

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

describe("카드뉴스 언어 · 이미지 모델", () => {
  it("언어 고르기는 좁고, 모델 버튼과 높이가 같다", () => {
    const root = mount();
    const select = root.find((n) => n.type === "select" && n.props.id === "sns-language");
    expect(classes(select)).toContain("w-40");
    expect(classes(select)).toContain("h-8");
    expect(classes(select)).not.toContain("h-10");
  });

  it("이미지 모델은 언어와 다른 칸에, 자기 제목을 달고 있다", () => {
    const root = mount();
    const select = root.find((n) => n.type === "select" && n.props.id === "sns-language");
    const group = root.find((n) => n.type === "div" && n.props.role === "radiogroup");
    const modelSection = sectionOf(group);
    expect(modelSection).not.toBeNull();
    expect(modelSection).not.toBe(sectionOf(select));
    const heading = modelSection!.find((n) => n.type === "h3");
    expect(text(heading)).toBe("이미지 모델");
    // 같은 이름이 두 번 보이지 않게, 고르기 안의 작은 제목은 낭독기에만 남긴다.
    expect(classes(modelSection!.find((n) => n.type === "legend"))).toContain("sr-only");
  });
});
