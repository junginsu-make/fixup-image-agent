import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ImageModelPicker } from "../../_components/image-model-picker";
import { ImageModelMenu } from "../_components/model-bar";

beforeAll(() => { vi.stubGlobal("React", React); });

const models = [
  { id: "gpt-image-2.5-flare", label: "표준형" },
  { id: "nano-banana-pro", label: "디테일형" },
];

let view: ReactTestRenderer;
afterEach(() => { act(() => view?.unmount()); });

const trigger = () => view.root.findAll((n) => n.props["aria-controls"] !== undefined && n.type === "button")[0]!;
const panelOpen = () => view.root.findAllByType(ImageModelPicker).length > 0;

function mount(onChange = vi.fn()) {
  act(() => { view = create(<ImageModelMenu models={models} value="gpt-image-2.5-flare" onChange={onChange} />); });
  return onChange;
}

describe("쉽게 모드 그림 모델 펼침 칸", () => {
  it("버튼은 aria-expanded 로 열림을 알린다", () => {
    mount();
    expect(trigger().props["aria-expanded"]).toBe(false);
    expect(panelOpen()).toBe(false);
    act(() => { trigger().props.onClick(); });
    expect(trigger().props["aria-expanded"]).toBe(true);
    expect(panelOpen()).toBe(true);
    act(() => { trigger().props.onClick(); });
    expect(panelOpen()).toBe(false);
  });

  it("고르면 값을 알리고 닫는다", () => {
    const onChange = mount();
    act(() => { trigger().props.onClick(); });
    act(() => { view.root.findByType(ImageModelPicker).props.onChange("nano-banana-pro"); });
    expect(onChange).toHaveBeenCalledWith("nano-banana-pro");
    expect(panelOpen()).toBe(false);
  });

  it("Escape 로 닫는다", () => {
    mount();
    act(() => { trigger().props.onClick(); });
    const wrap = view.root.findAll((n) => n.type === "div" && typeof n.props.onKeyDown === "function")[0]!;
    act(() => { wrap.props.onKeyDown({ key: "Escape" }); });
    expect(panelOpen()).toBe(false);
  });

  it("글 모델 메뉴가 아닌 이 칸은 Radix 메뉴를 쓰지 않는다", () => {
    const src = readFileSync(new URL("../_components/model-bar.tsx", import.meta.url), "utf8");
    const image = src.slice(src.indexOf("export function ImageModelMenu"), src.indexOf("export function EasyModelBar"));
    expect(image).not.toContain("DropdownMenu");
  });
});

describe("카드뉴스 카드의 모델 고르기 자리", () => {
  it("알약 줄 밖, 바로 아래 블록이다", () => {
    const src = readFileSync(new URL("../_components/cardnews-card.tsx", import.meta.url), "utf8");
    const row = src.indexOf('<div className="flex flex-wrap gap-1.5 text-meta">');
    const rowEnd = src.indexOf("</div>", row);
    const picker = src.indexOf("<ImageModelPicker");
    expect(picker).toBeGreaterThan(rowEnd);
    expect(src.slice(picker, picker + 300)).toContain("disabled={busy}");
  });
});
