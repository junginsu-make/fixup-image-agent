import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { savePdpDraft, getPdpDraft, deletePdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";

const captured = vi.hoisted(() => ({ editor: {} as Record<string, any>, search: new URLSearchParams("draft=ui-draft") }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => captured.search }));
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));
vi.mock("../PdpEditor", () => ({ PdpEditor: (props: Record<string, unknown>) => { captured.editor = props; return null; } }));
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));
vi.mock("../StyleReferenceCard", () => ({ StyleReferenceCard: () => null }));
import { PdpMakerClient } from "../PdpMakerClient";

let renderer: ReactTestRenderer;
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); }); };
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: () => true, scrollTo: vi.fn() });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { queueMicrotask(callback); return 1; });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(async () => {
  if (renderer) act(() => renderer.unmount());
  vi.useRealTimers(); vi.unstubAllGlobals(); await deletePdpDraft("ui-draft");
});

it("T-SAVE UI: 불러온 모델·캐릭터가 편집기에 전달되고 브리프 연속 입력이 저장된다", async () => {
  const input: PdpDraftInput = { id: "ui-draft", appState: "editor", preparedImage: null, modelImage: null, modelImageUsage: null,
    result: { originalImage: "AAAA", blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [createSectionFor([])] } },
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    imageModel: "nano-banana", characterId: "chosen-character", characterAngles: ["back"], preserveProduct: false,
  };
  await savePdpDraft(input);
  await act(async () => { renderer = create(<PdpMakerClient />); });
  await flush();
  expect(captured.editor.imageModel).toBe("nano-banana");
  expect(captured.editor.characterId).toBe("chosen-character");
  expect(captured.editor.characterAngles).toEqual(["back"]);
  expect(captured.editor.preserveProduct).toBe(false);
  await act(async () => captured.editor.onJumpStep("upload"));
  await flush();
  for (let i = 1; i <= 6; i++) {
    act(() => renderer.root.findByProps({ id: "brief-audience" }).props.onChange({ target: { value: `고객 ${i}` } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await flush();
  }
  expect((await getPdpDraft("ui-draft"))?.sellerBrief?.audience).toBe("고객 6");
});
