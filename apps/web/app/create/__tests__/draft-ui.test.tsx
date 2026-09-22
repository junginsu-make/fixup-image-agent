import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
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

/**
 * **공용 디자인이 초안을 다시 열어도 화면까지 닿는가**(U-15).
 *
 * 문서 왕복은 지금 펼치기(`...doc.blueprint`)로 옮기므로 살아남는다. 그런데 이
 * 세션에서 **필드를 하나씩 나열하는 자리에 세 번 걸렸다**(심사 결과·근거·판독
 * 상태). 누군가 이 자리도 나열로 바꾸는 날, 새 섹션이 조용히 다른 서체로
 * 만들어지기 시작한다.
 */
it.each([false, true])("T-SAVE UI(v3=%s): 페이지 공용 디자인이 재적재에서 살아남는다", async (documentV3Enabled) => {
  const designSystem = {
    headlineFont: "굵은 기하학적 산세리프", bodyFont: "가늘고 단정한 산세리프",
    palette: ["아이보리", "남색"], cast: "30대 한국인 여성, 단발",
  };
  const input: PdpDraftInput = {
    id: "ui-draft", appState: "scenario",
    preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
    modelImage: null, modelImageUsage: null,
    result: {
      originalImage: "AAAA",
      blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [], designSystem, sections: [createSectionFor([])] },
    },
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
  };
  await savePdpDraft(input);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={documentV3Enabled} />); });
  await flush();

  // 사라지면 여기서 더한 섹션만 다른 서체·다른 인물로 만들어진다.
  expect(captured.scenario.blueprint.designSystem).toEqual(designSystem);
});

/**
 * **둘 다 골랐을 때의 선택이 살아남는가**(U-04).
 *
 * 이 세션에서 필드를 하나씩 나열하는 자리에 세 번 걸렸다. 사라지면 서버가
 * 말없이 업로드를 쓰고, 사용자는 이미지가 나온 뒤에야 안다.
 */
it.each([false, true])("T-SAVE UI(v3=%s): 인물 선택이 재적재에서 살아남는다", async (documentV3Enabled) => {
  const input: PdpDraftInput = {
    id: "ui-draft", appState: "scenario",
    preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
    // 인물 사진까지 실으면 초안 적용이 8틱을 넘겨 unmount 뒤에 콜백이 깨어난다.
    // 여기서 재는 것은 선택값의 왕복이라 `characterId` 만으로 충분하다.
    modelImage: null, modelImageUsage: null,
    result: {
      originalImage: "AAAA",
      blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [createSectionFor([])] },
    },
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    imageModel: "nano-banana", characterId: "chosen-character", characterAngles: ["front"],
    preserveProduct: false, personSource: "character",
  };
  await savePdpDraft(input);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={documentV3Enabled} />); });
  await flush();

  expect(captured.scenario.personSource).toBe("character");
});


/**
 * **고른 값이 편집기까지 닿는가**(U-04).
 *
 * 섹션 이미지는 **편집기에서만** 만들어진다. 이 칸이 빠지면 구성안에서 골라도
 * 아무것도 안 바뀐다 — 그런데 시험 3,014건이 전부 통과했다.
 */
it.each([false, true])("T-SAVE UI(v3=%s): 인물 선택이 편집기까지 간다", async (documentV3Enabled) => {
  const input: PdpDraftInput = {
    id: "ui-draft", appState: "editor", preparedImage: null, modelImage: null, modelImageUsage: null,
    result: {
      originalImage: "AAAA",
      blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [createSectionFor([])] },
    },
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    imageModel: "nano-banana", characterId: "chosen-character", characterAngles: ["front"],
    preserveProduct: false, personSource: "character",
  };
  await savePdpDraft(input);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={documentV3Enabled} />); });
  await flush();

  expect(captured.editor.personSource).toBe("character");
});

/**
 * **구성 요청이 재적재에서 살아남는다**(U-06).
 *
 * 사라지면 다시 기획할 때 그 요청이 빠진 채로 나간다 — 사용자는 적어 둔 말이
 * 왜 안 먹는지 모른다.
 */
it.each([false, true])("T-SAVE UI(v3=%s): 구성·문구 요청이 재적재에서 살아남는다", async (documentV3Enabled) => {
  const input: PdpDraftInput = {
    id: "ui-draft", appState: "upload",
    preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
    modelImage: null, modelImageUsage: null, result: null,
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
    userInstruction: "배경은 밤", planInstruction: "섹션을 다섯 개로",
  };
  await savePdpDraft(input);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={documentV3Enabled} />); });
  await flush();

  const 구성요청 = renderer.root.findAll((node) => node.props?.id === "planInstruction");
  const 연출요청 = renderer.root.findAll((node) => node.props?.id === "userInstruction");

  expect(구성요청[0]!.props.value).toBe("섹션을 다섯 개로");
  // 옛 초안의 말이 구성 요청으로 둔갑하지 않는다.
  expect(연출요청[0]!.props.value).toBe("배경은 밤");
});

/**
 * **새로 시작하면 앞 작업의 구성 요청이 안 남는다**(U-06).
 *
 * 이 값은 이제 **유료 기획 결과**를 바꾼다. 스크롤 아래에 있어 사용자가 못 보는
 * 채로 실려 나가면, B 제품이 A 제품의 요청대로 기획된다. 이 저장소가
 * `attachmentIntents`·`previousPlan` 에서 이미 두 번 겪은 자리다.
 */
it("T-STATE: 새로 시작하면 두 지시 칸이 모두 빈다", async () => {
  await savePdpDraft({
    id: "ui-draft", appState: "upload",
    preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
    modelImage: null, modelImageUsage: null, result: null,
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
    userInstruction: "배경은 밤", planInstruction: "섹션을 다섯 개로",
  } as PdpDraftInput);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
  await flush();
  expect(renderer.root.findAll((node) => node.props?.id === "planInstruction")[0]!.props.value).toBe("섹션을 다섯 개로");

  /*
    초기화 함수는 화면에서 부르는 길이 여럿이라(새 작업·모드 전환) 단추 하나로
    재기 어렵다. **두 칸을 함께 비우는지**를 그 함수 안에서 본다 — 하나만
    비우면 앞 작업의 구성 요청이 다음 제품 기획에 실려 나간다.
  */
  const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");
  const 시작 = client.indexOf("const resetWorkspace");
  const 초기화 = client.slice(시작, 시작 + 3000);
  expect(초기화).toContain('setUserInstruction("")');
  expect(초기화).toContain('setPlanInstruction("")');
});
