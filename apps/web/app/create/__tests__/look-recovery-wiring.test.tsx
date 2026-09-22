import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePdpDraft, deletePdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";
import { deletePdpDocument } from "../document-store";

/**
 * **레퍼런스를 끄면 그림체도 되돌아가는가**(A-10) · **새 레퍼런스는 켜진 채로
 * 시작하는가**(A-11).
 *
 * 소스로는 「같은 함수를 쓴다」밖에 못 잰다. 화면을 띄워 **실제로 토글을 눌러**
 * 본다.
 */
const captured = vi.hoisted(() => ({
  scenario: {} as Record<string, any>,
  card: {} as Record<string, any>,
  search: new URLSearchParams("draft=look-draft"),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => captured.search }));
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));
vi.mock("../PdpEditor", () => ({ PdpEditor: () => null }));
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));
vi.mock("../StyleReferenceCard", () => ({
  StyleReferenceCard: (props: Record<string, unknown>) => { captured.card = props; return null; },
}));
vi.mock("../ScenarioEditor", () => ({
  ScenarioEditor: (props: Record<string, unknown>) => { captured.scenario = props; return null; },
}));
import { PdpMakerClient } from "../PdpMakerClient";

let renderer: ReactTestRenderer;
const flush = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise<void>((r) => setImmediate(r)); });
};

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: () => true, scrollTo: vi.fn(),
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { queueMicrotask(cb); return 1; });
});
afterEach(async () => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
  await deletePdpDraft("look-draft");
  await deletePdpDocument("look-draft");
});

const 레퍼런스 = { id: "r1", name: "참조", imageBase64: "REF", mimeType: "image/png", description: "파랑" };

const 초안 = (over: Partial<PdpDraftInput> = {}): PdpDraftInput => ({
  id: "look-draft", appState: "scenario",
  preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
  modelImage: null, modelImageUsage: null,
  result: {
    originalImage: "AAAA",
    blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [createSectionFor([])] },
  },
  additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
  imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
  look: "auto", styleReference: 레퍼런스, styleReferenceEnabled: true,
  ...over,
} as PdpDraftInput);

/** 그 결의 단추가 눌려 있는가. **값으로 잰다** — 소스 대조는 변이를 통과시킨다. */
const 눌림 = (look: string) =>
  renderer.root
    .findAll((node) => node.type === "button" && node.props["data-look"] === look)[0]
    ?.props["aria-pressed"];

describe("레퍼런스를 끄면 그림체를 되돌린다", () => {
  it("**auto 가 안 눌려 있고 기본 결이 눌린다**", async () => {
    await savePdpDraft(초안({ appState: "upload", result: null }));
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();
    expect(눌림("auto")).toBe(true);

    await act(async () => { captured.card.onToggle(false); });
    await flush();

    // 되돌린 값을 안 쓰면 여기서 auto 가 계속 눌려 있다.
    expect(눌림("auto")).toBe(false);
    expect(눌림("photoreal")).toBe(true);
  });

  it("**레퍼런스를 빼도 되돌린다** — A-10 의 제목이 가리키는 길이다", async () => {
    await savePdpDraft(초안({ appState: "upload", result: null }));
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    /*
      글자로 찾으면 React 트리가 순환이라 직렬화가 터진다. 단추 안에 **문자열
      자식**이 있는지로 고른다.
    */
    const 빼기 = renderer.root
      .findAll((node) => node.type === "button")
      .find((node) =>
        (Array.isArray(node.props.children) ? node.props.children : [node.props.children])
          .some((child: unknown) => typeof child === "string" && child.includes("레퍼런스 빼기")),
      );
    expect(빼기).toBeTruthy();
    await act(async () => { 빼기!.props.onClick(); });
    await flush();

    expect(눌림("auto")).toBe(false);
    expect(눌림("photoreal")).toBe(true);
  });

  it("**되돌렸다고 알린다** — 조용히 바꾸면 고른 것이 혼자 사라진 것처럼 보인다", async () => {
    await savePdpDraft(초안({ appState: "upload", result: null }));
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    await act(async () => { captured.card.onToggle(false); });
    await flush();

    const 글 = renderer.root
      .findAll((node) => typeof node.props?.children === "string")
      .map((node) => String(node.props.children))
      .join(" ");
    expect(글).toContain("그림체를 기본값으로 되돌렸습니다");
  });

  it("**사람이 고른 결은 안 건드린다**", async () => {
    await savePdpDraft(초안({ appState: "upload", result: null, look: "illustration" }));
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    await act(async () => { captured.card.onToggle(false); });
    await flush();

    expect(눌림("illustration")).toBe(true);
  });

  it("**옛 초안의 깨진 짝도 되살리지 않는다** — auto 인데 레퍼런스가 없다", async () => {
    await savePdpDraft(초안({ appState: "upload", result: null, styleReference: undefined }));
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    expect(눌림("auto")).toBe(false);
    expect(눌림("photoreal")).toBe(true);
  });
});

describe("새 레퍼런스는 켜진 채로 시작한다", () => {
  it("**앞 레퍼런스에서 껐어도 새것은 켜진다**", async () => {
    await savePdpDraft(초안({ styleReferenceEnabled: false }));
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();
    expect(captured.scenario.styleReferenceEnabled).toBe(false);

    await act(async () => {
      captured.scenario.onStyleReferenceAttached({ ...레퍼런스, id: "r2", name: "새 참조" });
    });
    await flush();

    // 붙여 놓고 안 쓰이면 사용자는 왜 안 반영되는지 모른다.
    expect(captured.scenario.styleReferenceEnabled).toBe(true);
    expect(captured.scenario.styleReference.id).toBe("r2");
  });
});
