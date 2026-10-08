import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryViewBar } from "../library-view-bar";

/**
 * **라이브러리 한 줄 거르기**(2026-10-08 사용자 요청).
 *
 * 위 탭 [작업물·참고 이미지·캐릭터] 과 아래 거르기 [전체…리디자인] 을 합쳤다. 작업물 거르기는
 * 개수를 단다 — 눌러 보기 전에 비었는지 안다. 캐릭터·참고 이미지는 다른 화면이라 개수가 없다.
 */
let view: ReactTestRenderer;
afterEach(() => { act(() => view?.unmount()); });

const counts = { all: 7, easy: 1, poster: 2, sns: 1, ad: 0, create: 1, redesign: 0, character: 2 };
type Node = ReactTestRenderer["root"];
/** 단추 안의 글자를 이어 붙인다(이름 + 개수). */
const textOf = (node: Node): string => node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
const buttons = () => view.root.findAll((node) => node.type === "button");
const button = (label: string) => buttons().find((node) => textOf(node).startsWith(label))!;
const text = () => JSON.stringify(view.toJSON());

function render(props: Partial<React.ComponentProps<typeof LibraryViewBar>> = {}) {
  const onChange = vi.fn();
  act(() => {
    view = create(<LibraryViewBar value="all" summary={{ counts, easyKnown: true }} onChange={onChange} {...props} />);
  });
  return onChange;
}

describe("한 줄 거르기", () => {
  it("작업물 거르기 뒤에 캐릭터·참고 이미지가 한 줄에 있다", () => {
    render();
    expect(buttons()).toHaveLength(9);
    const labels = buttons().map(textOf);
    expect(labels[7]).toContain("캐릭터");
    expect(labels[8]).toContain("참고 이미지");
  });

  it("작업물 거르기는 개수를 단다", () => {
    render();
    expect(textOf(button("다양하게"))).toBe("다양하게2");
  });

  /** 「캐릭터」도 작업물 거르기다 — 같은 목록에서 캐릭터만 걸러 보인다(2026-10-08 사용자 보고). */
  it("캐릭터를 누르면 캐릭터만 거른다", () => {
    const onChange = render();
    act(() => { button("캐릭터").props.onClick(); });
    expect(onChange).toHaveBeenCalledWith("character");
  });

  it("참고 이미지를 누르면 참고 이미지 화면으로", () => {
    const onChange = render();
    act(() => { button("참고 이미지").props.onClick(); });
    expect(onChange).toHaveBeenCalledWith("references");
  });

  it("고른 것은 눌린 상태로 보인다", () => {
    render({ value: "references" });
    expect(button("참고 이미지").props["aria-pressed"]).toBe(true);
    expect(button("전체").props["aria-pressed"]).toBe(false);
  });

  it("광고소재를 누르면 광고소재 작업물로", () => {
    const onChange = render();
    act(() => { button("광고소재").props.onClick(); });
    expect(onChange).toHaveBeenCalledWith("ad");
  });

  /** `disabled` 로 막으면 눌러도 아무 반응이 없어 고장으로 읽힌다. 까닭은 다른 단추를 누르면 사라진다. */
  it("다른 단추를 누르면 그 까닭은 사라진다", () => {
    const onChange = render({ summary: { counts, easyKnown: false } });
    act(() => { button("쉽게").props.onClick(); });
    act(() => { button("카드뉴스").props.onClick(); });
    expect(onChange).toHaveBeenCalledWith("sns");
    expect(text()).not.toContain("쉽게와 다양하게를 가를 수 없습니다");
  });

  /** 「캐릭터」 옆 숫자는 다른 단추처럼 목록에서 센다. 참고 이미지는 아직 숫자가 없다. */
  it("캐릭터 개수도 목록에서 센 숫자다", () => {
    render();
    expect(textOf(button("캐릭터"))).toBe("캐릭터2");
    expect(textOf(button("참고 이미지"))).toBe("참고 이미지");
  });

  /** 캐릭터는 나중에 온다. 오기 전에는 숫자를 달지 않는다 — 0 이었다가 바뀌면 없는 줄 안다. */
  it("캐릭터가 아직 안 왔으면 캐릭터에만 숫자가 없다", () => {
    render({ summary: { counts, easyKnown: true, charactersReady: false } });
    expect(textOf(button("캐릭터"))).toBe("캐릭터");
    expect(textOf(button("다양하게"))).toBe("다양하게2");
  });

  it("작업물을 아직 못 읽었으면 개수 없이 단추만", () => {
    render({ summary: null });
    expect(textOf(button("다양하게"))).toBe("다양하게");
    expect(buttons()).toHaveLength(9);
  });

  /**
   * 쉽게를 고른 채 쉽게 목록을 다시 못 읽으면 작업물 화면은 전체를 보인다. 단추도 전체가 눌려
   * 있어야 한다 — 아래는 전체인데 위에 흐린 「쉽게」가 눌려 있으면 무엇을 보는지 모른다(독립 리뷰).
   */
  it("고른 단추를 못 쓰게 되면 전체가 눌린 것으로 보인다", () => {
    render({ value: "easy", summary: { counts, easyKnown: false } });
    expect(button("전체").props["aria-pressed"]).toBe(true);
    expect(button("쉽게").props["aria-pressed"]).toBe(false);
  });

  it("쉽게 목록을 못 읽었으면 쉽게·다양하게가 까닭을 말한다", () => {
    const onChange = render({ summary: { counts, easyKnown: false } });
    act(() => { button("쉽게").props.onClick(); });
    expect(onChange).not.toHaveBeenCalled();
    expect(text()).toContain("쉽게와 다양하게를 가를 수 없습니다");
  });
});
