import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **방문 통계 쿠키 동의 띠**(계획 2026-10-06 site-analytics).
 * 정한 적 없으면 뜬다 / 정했으면 안 뜬다 / 두 단추는 같은 모양 / 실패하면 남아서 다시 누르게 한다 /
 * 「방문 통계 설정」으로 다시 연다.
 *
 * jsdom 없이 전역값을 흉내 낸다. `document.cookie` 는 평범한 문자열, `window` 는 Node 의 EventTarget
 * (다시 열기 신호를 실제로 주고받는다).
 */
const fetchMock = vi.fn();
// `@fixup/ui` 를 불러오면 sonner 가 import 시점에 스타일 태그를 문서 머리에 끼운다 — 그 자리만 비어 있는 흉내로 둔다.
const fakeDocument = {
  cookie: "",
  head: { appendChild: vi.fn(), insertBefore: vi.fn(), firstChild: null },
  createElement: () => ({ appendChild: vi.fn(), setAttribute: vi.fn() }),
  createTextNode: () => ({}),
};
const fakeWindow = new EventTarget();
vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("fetch", fetchMock);
vi.stubGlobal("document", fakeDocument);
vi.stubGlobal("window", fakeWindow);
const { ConsentBanner, ConsentSettingsButton } = await import("../consent-banner");

const buttons = (tree: ReactTestRenderer) => tree.root.findAllByType("button");
const button = (tree: ReactTestRenderer, label: string) => buttons(tree).find((b) => b.children.includes(label))!;
// onClick 은 기다릴 수 없는 비동기(`void choose(…)`)라, 누른 뒤 한 박자 쉬어 fetch·상태 변경을 끝낸다.
const click = (tree: ReactTestRenderer, label: string) =>
  act(async () => {
    button(tree, label).props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const mount = async () => {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConsentBanner />); });
  return tree;
};

beforeEach(() => {
  fakeDocument.cookie = "";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 204 });
});

describe("ConsentBanner", () => {
  it("정한 적 없으면 뜨고, 동의를 누르면 보내고 닫힌다", async () => {
    const tree = await mount();
    expect(JSON.stringify(tree.toJSON())).toContain("거부해도 모든 기능");
    await click(tree, "동의");
    expect(fetchMock).toHaveBeenCalledWith("/api/track/consent", expect.objectContaining({ method: "POST", body: JSON.stringify({ consent: true }) }));
    expect(tree.toJSON()).toBeNull();
  });

  it("거부도 같은 모양의 단추다", async () => {
    const tree = await mount();
    expect(button(tree, "거부").props.className).toBe(button(tree, "동의").props.className);
  });

  it("이미 정했으면 안 뜬다", async () => {
    fakeDocument.cookie = "fx_consent=0";
    expect((await mount()).toJSON()).toBeNull();
  });

  it("저장에 실패하면 남아서 다시 누르게 한다", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const tree = await mount();
    await click(tree, "거부");
    expect(JSON.stringify(tree.toJSON())).toContain("저장하지 못했습니다");
  });

  it("「방문 통계 설정」을 누르면 다시 뜬다", async () => {
    fakeDocument.cookie = "fx_consent=1";
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<><ConsentBanner /><ConsentSettingsButton /></>); });
    expect(buttons(tree)).toHaveLength(1);
    await click(tree, "방문 통계 설정");
    expect(JSON.stringify(tree.toJSON())).toContain("거부해도 모든 기능");
  });
});
