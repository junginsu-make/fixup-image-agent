import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePdpDraft, deletePdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";
import { deletePdpDocument } from "../document-store";

/**
 * **대기 화면과 요청이 같은 번호를 쓰는가**(2026-09-22).
 *
 * ── 왜 따로 재는가 ─────────────────────────────────────────
 *
 * 부품은 다 있어도 **번호가 어긋나면** 화면은 영원히 「모른다」를 받는다.
 * 사용자에게는 고치기 전과 똑같이 한 줄만 보인다.
 *
 * 그래서 재는 것은 둘이다 — **요청에 실린 번호**와 **대기 화면이 물어보는
 * 번호**가 같은가, 그리고 그 번호가 실제로 있는가.
 */

const captured = vi.hoisted(() => ({
  scenario: {} as Record<string, any>,
  progress: null as Record<string, any> | null,
  bodies: [] as string[],
  search: new URLSearchParams("draft=progress-draft"),
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
  PlanProgress: (props: Record<string, unknown>) => { captured.progress = props; return null; },
}));
vi.mock("../pdp-utils", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../pdp-utils");
  return {
    ...actual,
    // **끝나지 않는다.** 기다리는 화면을 그대로 세워 두고 본다.
    apiJson: async (_path: string, init?: RequestInit) => {
      captured.bodies.push(String(init?.body ?? ""));
      return new Promise(() => {});
    },
  };
});

import { PdpMakerClient } from "../PdpMakerClient";

const 첫섹션 = createSectionFor([]);

let renderer: ReactTestRenderer;
const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });
  }
};

beforeEach(() => {
  captured.bodies.length = 0;
  captured.progress = null;
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
  await deletePdpDraft("progress-draft");
  await deletePdpDocument("progress-draft");
});

const 초안 = (): PdpDraftInput => ({
  id: "progress-draft", appState: "scenario",
  preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
  modelImage: null, modelImageUsage: null,
  result: {
    originalImage: "AAAA",
    blueprint: {
      executiveSummary: "처음 전략", scorecard: [], blueprintList: [],
      sections: [{ ...첫섹션, headline: "처음 제목" }],
    },
  },
  additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
  imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
} as PdpDraftInput);

const 기획을건다 = async () => {
  await savePdpDraft(초안());
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
  await flush();
  await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기로 간다"); });
  await flush();
};

describe("대기 화면과 요청이 같은 번호를 쓴다", () => {
  it("**요청에 번호가 실린다**", async () => {
    await 기획을건다();

    const 기획요청 = captured.bodies.find((body) => body.includes("strategyDirective"));
    expect(기획요청, "기획 요청을 못 찾았다").toBeTruthy();

    const 번호 = JSON.parse(기획요청!).planProgressId;
    expect(typeof 번호, "번호가 요청에 없다").toBe("string");
    expect(String(번호).length, "번호가 비어 있다").toBeGreaterThan(7);
  });

  it("**기다리는 동안 대기 화면이 뜬다**", async () => {
    await 기획을건다();

    expect(captured.progress, "대기 화면이 안 떴다").toBeTruthy();
  });

  /**
   * **둘이 같아야 한다.** 다르면 화면은 영원히 「모른다」를 받고, 사용자에게는
   * 고치기 전과 똑같이 한 줄만 보인다.
   */
  it("**요청에 실은 번호로 물어본다**", async () => {
    await 기획을건다();

    const 실은번호 = JSON.parse(captured.bodies.find((body) => body.includes("strategyDirective"))!).planProgressId;

    expect(captured.progress?.progressId).toBe(실은번호);
  });

  /**
   * **모를 때 할 말도 함께 넘긴다.** 서버가 아직 첫 자리를 안 찍었으면 대기
   * 화면은 이 한 줄로 버틴다. 안 넘기면 그 순간 화면이 빈다.
   */
  it("**모를 때 쓸 한 줄을 함께 넘긴다**", async () => {
    await 기획을건다();

    expect(String(captured.progress?.fallback ?? "").trim().length).toBeGreaterThan(0);
  });
});
