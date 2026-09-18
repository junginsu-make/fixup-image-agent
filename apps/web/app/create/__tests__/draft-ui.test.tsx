import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { savePdpDraft, getPdpDraft, deletePdpDraft, listPdpDrafts, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";
import { deletePdpDocument } from "../document-store";

const captured = vi.hoisted(() => ({ editor: {} as Record<string, any>, scenario: {} as Record<string, any>, search: new URLSearchParams("draft=ui-draft") }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => captured.search }));
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));
vi.mock("../PdpEditor", () => ({ PdpEditor: (props: Record<string, unknown>) => { captured.editor = props; return null; } }));
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));
vi.mock("../StyleReferenceCard", () => ({ StyleReferenceCard: () => null }));
vi.mock("../ScenarioEditor", () => ({ ScenarioEditor: (props: Record<string, unknown>) => { captured.scenario = props; return null; } }));
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
  vi.useRealTimers(); vi.unstubAllGlobals(); await deletePdpDraft("ui-draft"); await deletePdpDocument("ui-draft");
});

it.each([false, true])("T-SAVE UI(v3=%s): 모델·캐릭터 복원과 브리프 연속 입력 저장", async (documentV3Enabled) => {
  const input: PdpDraftInput = { id: "ui-draft", appState: "editor", preparedImage: null, modelImage: null, modelImageUsage: null,
    result: { originalImage: "AAAA", blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [createSectionFor([])] } },
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    imageModel: "nano-banana", characterId: "chosen-character", characterAngles: ["back"], preserveProduct: false,
  };
  await savePdpDraft(input);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={documentV3Enabled} />); });
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
  const { createDraftRepository } = await import("../draft-repository");
  expect((await createDraftRepository(documentV3Enabled).get("ui-draft"))?.sellerBrief?.audience).toBe("고객 6");
});

it("T-STATE: 편집기에서 돌아가 수정한 구성안을 다시 편집할 때 옛 섹션이 덮지 않는다", async () => {
  const section = { ...createSectionFor([]), headline: "옛 제목" };
  const blueprint = { executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [section] };
  await savePdpDraft({ id: "ui-draft", appState: "editor", preparedImage: null, modelImage: null, modelImageUsage: null,
    result: { originalImage: "AAAA", blueprint }, additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null });
  await act(async () => { renderer = create(<PdpMakerClient />); }); await flush();
  await act(async () => captured.editor.onDraftStateChange({ ...captured.editor.initialDraftState, sections: [section] }));
  await act(async () => captured.editor.onJumpStep("analyze"));
  await act(async () => captured.scenario.onChange({ ...blueprint, sections: [{ ...section, headline: "수정한 제목", prompt_ko: "산 위의 제품" }] }));
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); }); await flush();
  const savedScenario = await getPdpDraft("ui-draft");
  expect(savedScenario?.editorState?.sections[0].headline).toBe("수정한 제목");
  await act(async () => captured.scenario.onConfirm());
  expect(captured.editor.initialResult.blueprint.sections[0].headline).toBe("수정한 제목");
  expect(captured.editor.initialResult.blueprint.sections[0].prompt_en).toContain("산 위의 제품");
  expect(captured.editor.initialDraftState?.sections[0].headline).toBe("수정한 제목");
});

it("T-STATE: 구성안에서 생성된 섹션을 삭제할 때도 이전 이미지를 보관한다", async () => {
  const blueprint = { executiveSummary: "", scorecard: [], blueprintList: [], sections: [
    { ...createSectionFor([]), generatedImage: "data:image/png;base64,AAAA" }, createSectionFor([])] };
  await savePdpDraft({ id: "ui-draft", appState: "scenario", preparedImage: null, modelImage: null, modelImageUsage: null,
    result: { originalImage: "AAAA", blueprint }, additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null });
  await act(async () => { renderer = create(<PdpMakerClient />); }); await flush();
  await act(async () => captured.scenario.onChange({ ...captured.scenario.blueprint, sections: captured.scenario.blueprint.sections.slice(1) }));
  const drafts = await Promise.all((await listPdpDrafts()).map((draft) => getPdpDraft(draft.id)));
  const backup = drafts.find((draft) => draft?.snapshotOf === "ui-draft");
  expect(backup?.editorState?.sections[0].generatedImage).toBe("data:image/png;base64,AAAA");
  if (backup) await deletePdpDraft(backup.id);
});

/**
 * **판독 경고가 초안을 다시 열어도 화면까지 닿는가.**
 *
 * 저장소를 직접 부르는 시험은 이것을 못 잡았다. 화면은 초안을 늘 문서로
 * 바꿨다가 되돌려 읽는데(`draft-repository`), 그 길에 `productReadingStatus`
 * 자리가 없어 **조용히 사라졌다.** 값을 보존하는 코드는 아무도 지나지 않는
 * 길에 있었다.
 *
 * 그래서 화면이 실제로 받는 값을 본다 — 소스에 그 낱말이 있는지가 아니라.
 */
it.each([false, true])("T-SAVE UI(v3=%s): 「제품을 읽지 못했다」가 재적재에서 살아남는다", async (documentV3Enabled) => {
  const input: PdpDraftInput = {
    id: "ui-draft", appState: "scenario",
    preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
    modelImage: null, modelImageUsage: null,
    result: {
      originalImage: "AAAA",
      blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [createSectionFor([])] },
      productReadingStatus: "unfounded",
      copyGapOutcome: { requested: "sample", applied: "ask", cleared: 2 },
    },
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
  };
  await savePdpDraft(input);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={documentV3Enabled} />); });
  await flush();

  // 사라지면 근거 없는 카피가 확인된 것처럼 보인다.
  expect(captured.scenario.productReadingStatus).toBe("unfounded");
  // 화면 토글값이 아니라 **그 실행에 실제로 쓰인 것**이 와야 한다.
  expect(captured.scenario.gapOutcome).toEqual({ requested: "sample", applied: "ask", cleared: 2 });
});
