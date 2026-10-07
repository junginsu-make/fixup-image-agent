import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePdpDraft, deletePdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";
import { deletePdpDocument } from "../document-store";
import { WorkingStatus } from "../../_components/working-status";

/**
 * **AI 분석을 기다리는 화면도 공통 띠 하나로 말한다**(2026-10-08 사용자).
 *
 * 전에는 가운데 큰 원·제목·왕복 막대로 따로 그렸다. 이제 위쪽 띠(`WorkingStatus`)
 * 안에 분석 단계 목록(`PlanProgress`)을 담는다 — 단계 목록은 버리지 않는다.
 *
 * 띄우는 법은 `plan-progress-wiring.test.tsx` 와 같다.
 */

const captured = vi.hoisted(() => ({
  scenario: {} as Record<string, any>,
  search: new URLSearchParams("draft=loading-draft"),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => captured.search }));
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));
vi.mock("../PdpEditor", () => ({ PdpEditor: () => null }));
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));
vi.mock("../StyleReferenceCard", () => ({ StyleReferenceCard: () => null }));
vi.mock("../TextModeFlow", () => ({ TextModeFlow: () => null }));
vi.mock("../ScenarioEditor", () => ({
  ScenarioEditor: (props: Record<string, unknown>) => { captured.scenario = props; return null; },
}));
vi.mock("../PlanProgress", () => ({
  PlanProgress: (props: { progressId: string }) => <span data-plan-progress={props.progressId} />,
}));
vi.mock("../pdp-utils", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../pdp-utils");
  // **끝나지 않는다.** 기다리는 화면을 그대로 세워 두고 본다.
  return { ...actual, apiJson: async () => new Promise(() => {}) };
});

import { PdpMakerClient } from "../PdpMakerClient";

let renderer: ReactTestRenderer;
const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });
  }
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
  await deletePdpDraft("loading-draft");
  await deletePdpDocument("loading-draft");
});

const 초안 = (): PdpDraftInput => ({
  id: "loading-draft", appState: "scenario",
  preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
  modelImage: null, modelImageUsage: null,
  result: {
    originalImage: "AAAA",
    blueprint: { executiveSummary: "처음 전략", scorecard: [], blueprintList: [], sections: [{ ...createSectionFor([]), headline: "처음 제목" }] },
  },
  additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
  imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
} as PdpDraftInput);

describe("AI 분석 대기 화면", () => {
  it("**띠 하나가 분석 중이라고 말하고, 단계 목록을 그 안에 담는다**", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();
    await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기로 간다"); });
    await flush();

    const 띠 = renderer.root.findAllByType(WorkingStatus);
    expect(띠.map((node) => node.props.label)).toEqual(["AI 분석 중입니다"]);
    expect(typeof 띠[0].props.startedAt).toBe("number");
    // 이미지 크레딧이 안 나간다는 안내는 남긴다.
    expect(String(띠[0].props.hint)).toContain("이미지 크레딧 0장");
    expect(띠[0].findAll((node) => node.props["data-plan-progress"] !== undefined)).toHaveLength(1);

    // 옛 큰 제목은 없다 — 같은 말을 두 번 하지 않는다.
    expect(JSON.stringify(renderer.toJSON())).not.toContain("AI가 상세페이지 구조를 만드는 중입니다");
  });
});
