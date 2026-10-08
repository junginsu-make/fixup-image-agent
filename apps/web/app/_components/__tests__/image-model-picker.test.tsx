import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageModelPicker, type ImageModelPickerProps } from "../image-model-picker";

let renderer: ReactTestRenderer | null = null;

function mount(props: Partial<ImageModelPickerProps> & { value: string }) {
  act(() => {
    renderer = create(<ImageModelPicker onChange={() => {}} {...props} />);
  });
  return renderer!.root;
}
const text = (node: { children: unknown[] }): string =>
  node.children.map((c) => (typeof c === "string" ? c : text(c as { children: unknown[] }))).join("");

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

describe("공용 그림 모델 고르기", () => {
  it("세 버튼과 고른 모델의 설명이 늘 보인다", () => {
    const root = mount({ value: "nano-banana-pro" });
    const radios = root.findAll((n) => n.type === "button" && n.props.role === "radio");
    const labels = radios.map((r) => text(r));
    expect(labels).toHaveLength(3);
    expect(labels.join("|")).toContain("표준형");
    expect(labels.join("|")).toContain("디테일형");
    expect(labels.join("|")).toContain("속도형");
    const summary = root.findByProps({ "data-testid": "model-summary" });
    expect(text(summary)).toContain("질감과 인물 표현이 섬세합니다");
  });

  it("버튼마다 설명 말풍선이 붙어 있다", () => {
    const root = mount({ value: "gpt-image-2.5-flare" });
    const radios = root.findAll((n) => n.type === "button" && n.props.role === "radio");
    for (const r of radios) {
      const id = r.props["aria-describedby"];
      expect(id).toBeTruthy();
      const tip = root.find((n) => n.type === "span" && n.props.id === id);
      expect(tip.props.role).toBe("tooltip");
      expect(text(tip).length).toBeGreaterThan(0);
    }
  });

  it("누르면 그 id 를 알린다", () => {
    const onChange = vi.fn();
    const root = mount({ value: "gpt-image-2.5-flare", onChange });
    const speed = root.find((n) => n.type === "button" && n.props.role === "radio" && text(n).includes("속도형"));
    act(() => speed.props.onClick());
    expect(onChange).toHaveBeenCalledWith("nano-banana-2.1");
  });

  it("기본 모델에는 「기본」 표시", () => {
    const root = mount({ value: "nano-banana-pro" });
    const std = root.find((n) => n.type === "button" && n.props.role === "radio" && text(n).includes("표준형"));
    expect(text(std)).toContain("기본");
    const detail = root.find((n) => n.type === "button" && n.props.role === "radio" && text(n).includes("디테일형"));
    expect(text(detail)).not.toContain("기본");
  });

  it("숨긴 id 가 와도 켜진 버튼이 없고 죽지 않는다", () => {
    const root = mount({ value: "nano-banana" });
    const radios = root.findAll((n) => n.type === "button" && n.props.role === "radio");
    expect(radios.every((r) => r.props["aria-checked"] === false)).toBe(true);
    expect(text(root.findByProps({ "data-testid": "model-summary" }))).toBe("");
  });

  it("자동 선택지는 맨 앞에 나오고 켜짐·누름이 된다", () => {
    const onPick = vi.fn();
    const root = mount({ value: "nano-banana-pro", auto: { label: "자동", hint: "알아서 고릅니다", active: true, onPick } });
    const radios = root.findAll((n) => n.type === "button" && n.props.role === "radio");
    expect(radios).toHaveLength(4);
    expect(text(radios[0]!)).toContain("자동");
    expect(radios[0]!.props["aria-checked"]).toBe(true);
    act(() => radios[0]!.props.onClick());
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("말풍선은 버튼의 줄바꿈 금지를 물려받지 않는다", () => {
    const root = mount({ value: "nano-banana-pro" });
    const tips = root.findAll((n) => n.type === "span" && n.props.role === "tooltip");
    expect(tips.length).toBe(3);
    for (const t of tips) expect(t.props.className).toContain("whitespace-normal");
  });
});
