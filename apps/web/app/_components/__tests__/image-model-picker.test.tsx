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
  it("세 버튼이 보이고, 설명은 말풍선에만 있다", () => {
    const root = mount({ value: "nano-banana-pro" });
    const radios = root.findAll((n) => n.type === "button" && n.props.role === "radio");
    const names = radios.map((r) => text(r).replace(text(r.find((n) => n.props.role === "tooltip")), ""));
    expect(names).toEqual(["표준형", "디테일형", "속도형"]);
    // 2026-10-08 사용자 지시: 버튼 아래에 늘 보이던 설명 줄은 말풍선과 겹쳐 지운다.
    expect(root.findAll((n) => n.props["data-testid"] === "model-summary")).toHaveLength(0);
    expect(root.findAll((n) => n.type === "p")).toHaveLength(0);
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

  it("버튼에 「기본」 표시를 붙이지 않는다", () => {
    const root = mount({ value: "nano-banana-pro" });
    const radios = root.findAll((n) => n.type === "button" && n.props.role === "radio");
    for (const r of radios) {
      const tip = text(r.find((n) => n.props.role === "tooltip"));
      expect(text(r).replace(tip, "")).not.toContain("기본");
    }
  });

  it("숨긴 id 가 와도 켜진 버튼이 없고 죽지 않는다", () => {
    const root = mount({ value: "nano-banana" });
    const radios = root.findAll((n) => n.type === "button" && n.props.role === "radio");
    expect(radios.every((r) => r.props["aria-checked"] === false)).toBe(true);
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

  it("말풍선은 넓고 글자가 읽히는 크기다", () => {
    const root = mount({ value: "nano-banana-pro" });
    const tips = root.findAll((n) => n.type === "span" && n.props.role === "tooltip");
    for (const t of tips) {
      const classes = String(t.props.className).split(/\s+/);
      expect(classes).toContain("w-80");
      expect(classes).toContain("text-sm");
      expect(classes).not.toContain("w-56");
      expect(classes).not.toContain("text-meta");
    }
  });

  it("좁은 화면에서 말풍선이 화면 밖으로 나가지 않는다 — 맨 끝 것은 오른쪽에 붙는다", () => {
    const root = mount({ value: "nano-banana-pro", auto: { label: "자동", hint: "알아서 고릅니다", active: false, onPick: () => {} } });
    const tips = root.findAll((n) => n.type === "span" && n.props.role === "tooltip");
    expect(tips.length).toBe(4);
    const classes = (t: (typeof tips)[number]) => String(t.props.className).split(/\s+/);
    for (const t of tips) expect(classes(t)).toContain("max-w-[calc(100vw-2rem)]");
    for (const t of tips.slice(0, -1)) {
      expect(classes(t)).toContain("left-0");
      expect(classes(t)).not.toContain("right-0");
    }
    const last = classes(tips[tips.length - 1]!);
    expect(last).toContain("right-0");
    expect(last).toContain("left-auto");
    expect(last).not.toContain("left-0");
  });
});
