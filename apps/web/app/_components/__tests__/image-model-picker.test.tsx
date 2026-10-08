import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageModelSummary } from "@fixup/shared";
import { ImageModelPicker, tipPosition, type ImageModelPickerProps } from "../image-model-picker";

const portalTargets: unknown[] = [];
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createPortal: (node: unknown, container: unknown) => {
    portalTargets.push(container);
    return node;
  },
}));

let renderer: ReactTestRenderer | null = null;

function mount(props: Partial<ImageModelPickerProps> & { value: string }) {
  act(() => {
    renderer = create(<ImageModelPicker onChange={() => {}} {...props} />);
  });
  return renderer!.root;
}
const text = (node: { children: unknown[] }): string =>
  node.children.map((c) => (typeof c === "string" ? c : text(c as { children: unknown[] }))).join("");

const body = { tag: "body" };
const listeners = { add: vi.fn(), remove: vi.fn() };
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { innerWidth: 1400, innerHeight: 900, addEventListener: listeners.add, removeEventListener: listeners.remove });
  vi.stubGlobal("document", { body });
  portalTargets.length = 0;
  listeners.add.mockClear();
  listeners.remove.mockClear();
});
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

  /*
    **말풍선은 버튼 안이 아니라 화면 맨 위에 띄운다** (2026-10-08 사용자 — 캐릭터 만들기에서
    속도형 말풍선이 왼쪽으로 펴지며 잘림). 버튼 안에 absolute 로 두면 스크롤 칸이 잘라 낸다.
  */
  const rect = (left: number, top: number) => ({ left, top, bottom: top + 32 });
  const floating = (root: ReturnType<typeof mount>) => root.findAll((n) => n.props["data-testid"] === "model-tip");
  const speedButton = (root: ReturnType<typeof mount>) =>
    root.find((n) => n.type === "button" && n.props.role === "radio" && text(n).startsWith("속도형"));

  it("말풍선은 버튼 왼쪽 끝에서 오른쪽으로 펴진다", () => {
    expect(tipPosition(rect(200, 100), { width: 1400, height: 900 })).toEqual({ left: 200, top: 136 });
  });

  it("오른쪽 화면 끝에 닿으면 화면 안으로 당긴다", () => {
    expect(tipPosition(rect(1300, 100), { width: 1400, height: 900 }).left).toBe(1400 - 320 - 16);
  });

  it("휴대폰처럼 좁으면 양쪽 16px 을 남긴다", () => {
    expect(tipPosition(rect(100, 100), { width: 340, height: 700 }).left).toBe(16);
  });

  it("화면 아래 끝이면 버튼 위로 띄운다", () => {
    expect(tipPosition(rect(200, 800), { width: 1400, height: 900 })).toEqual({ left: 200, bottom: 104 });
  });

  it("마우스를 올리기 전에는 말풍선이 없다", () => {
    expect(floating(mount({ value: "nano-banana-pro" }))).toHaveLength(0);
  });

  it("마우스를 올리면 그 모델 설명이 화면 맨 위 층에 뜨고, 떼면 사라진다", () => {
    const root = mount({ value: "nano-banana-pro" });
    act(() => speedButton(root).props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => rect(1300, 100) } }));
    const tips = floating(root);
    expect(tips).toHaveLength(1);
    expect(text(tips[0]!)).toBe(imageModelSummary("nano-banana-2.1"));
    expect(portalTargets).toContain(body);
    expect(tips[0]!.props.style).toEqual({ left: 1064, top: 136 });
    const classes = String(tips[0]!.props.className).split(/\s+/);
    for (const c of ["fixed", "w-80", "max-w-[calc(100vw-2rem)]", "text-sm", "whitespace-normal", "pointer-events-none"]) {
      expect(classes).toContain(c);
    }
    act(() => speedButton(root).props.onMouseLeave());
    expect(floating(root)).toHaveLength(0);
  });

  it("키보드로 옮겨 가도 뜨고, 떠나면 사라진다", () => {
    const root = mount({ value: "nano-banana-pro" });
    act(() => speedButton(root).props.onFocus({ currentTarget: { getBoundingClientRect: () => rect(200, 100) } }));
    expect(floating(root)).toHaveLength(1);
    act(() => speedButton(root).props.onBlur());
    expect(floating(root)).toHaveLength(0);
  });

  it("떠 있는 동안 화면을 굴리면 닫힌다", () => {
    const root = mount({ value: "nano-banana-pro" });
    act(() => speedButton(root).props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => rect(200, 100) } }));
    const scroll = listeners.add.mock.calls.find((call) => call[0] === "scroll");
    expect(scroll).toBeTruthy();
    act(() => (scroll![1] as () => void)());
    expect(floating(root)).toHaveLength(0);
  });

  it("「자동」에 올려도 그 설명이 뜬다", () => {
    const root = mount({ value: "nano-banana-pro", auto: { label: "자동", hint: "알아서 고릅니다", active: false, onPick: () => {} } });
    const autoButton = root.findAll((n) => n.type === "button" && n.props.role === "radio")[0]!;
    act(() => autoButton.props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => rect(200, 100) } }));
    expect(text(floating(root)[0]!)).toBe("알아서 고릅니다");
  });

  it("제목을 숨기라 하면 낭독기에만 남긴다", () => {
    const root = mount({ value: "nano-banana-pro", legend: "이미지 모델", legendHidden: true });
    const legend = root.find((n) => n.type === "legend");
    expect(String(legend.props.className).split(/\s+/)).toContain("sr-only");
    expect(text(legend)).toBe("이미지 모델");
  });
});
