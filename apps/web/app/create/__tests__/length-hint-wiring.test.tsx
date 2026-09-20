import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTACHMENT_INTENT_MAX_LENGTH, MAX_STRATEGY_LENGTH } from "@fixup/pdp-core";
import { savePdpDraft, deletePdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { deletePdpDocument } from "../document-store";
import { AttachmentIntentField } from "../AttachmentIntentField";

/**
 * **상한 안내가 실제로 그 칸에 붙어 있는가.**
 *
 * 소스에 `limit={…}` 이라는 글자가 있는지만 보던 시험은 변이 셋을 통과시켰다
 * (리뷰 실측) — 속성을 **같은 글자의 주석**으로 바꾸기, 안내를 **삭제**하기,
 * `limit` 을 **다른 상수**로 바꾸기. 셋 다 화면에서는 안내가 사라지거나 틀린
 * 수를 말하는데 시험은 초록이었다.
 *
 * 그래서 **띄워서 값으로 잰다.**
 */

const captured = vi.hoisted(() => ({
  scenario: {} as Record<string, any>,
  search: new URLSearchParams("draft=hint-draft"),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => captured.search }));
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));
vi.mock("../PdpEditor", () => ({ PdpEditor: () => null }));
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));
vi.mock("../StyleReferenceCard", () => ({ StyleReferenceCard: () => null }));
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
  await deletePdpDraft("hint-draft");
  await deletePdpDocument("hint-draft");
});

const 초안 = (over: Partial<PdpDraftInput> = {}): PdpDraftInput => ({
  id: "hint-draft", appState: "upload",
  preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
  modelImage: null, modelImageUsage: null, result: null,
  additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
  imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
  look: "photoreal", styleReference: null, styleReferenceEnabled: false,
  ...over,
} as PdpDraftInput);

/** 화면에 뜬 글. React 트리가 순환이라 문자열 자식만 모은다. */
const 화면글 = () => {
  const 모음: string[] = [];
  const 훑기 = (node: unknown): void => {
    if (typeof node === "string") { 모음.push(node); return; }
    if (Array.isArray(node)) { node.forEach(훑기); return; }
    if (node && typeof node === "object" && "children" in (node as Record<string, unknown>)) {
      훑기((node as { children: unknown }).children);
    }
  };
  훑기(renderer.toJSON());
  return 모음.join(" ");
};

const 띄우기 = async (draft: PdpDraftInput) => {
  await savePdpDraft(draft);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
  await flush();
};

/**
 * **상한이 늦게 붙은 칸은 옛 초안을 만난다**(D-8).
 *
 * 그 전에 저장된 값이 복원되면 화면 칸은 멀쩡해 보이고, 만들기를 누를 때
 * 설명 없는 400 이 난다. U-08 에서 한 번 당한 함정이다.
 */
describe("연출 요청 칸", () => {
  it("**넘친 옛 초안을 복원하면 얼마나 줄일지 말한다**", async () => {
    await 띄우기(초안({ userInstruction: "가".repeat(MAX_STRATEGY_LENGTH + 12) } as never));

    expect(화면글()).toContain("12자를 줄여");
  });

  it("**짧으면 아무 말도 안 한다** — 모든 칸에 숫자가 뜨면 아무도 안 읽는다", async () => {
    await 띄우기(초안({ userInstruction: "배경은 밤" } as never));

    expect(화면글()).not.toContain("줄여");
  });

  /**
   * **옆 칸의 상한을 빌려 쓰면 안 된다.** 배경 칸은 500, 이 칸은 2000 이다.
   * 500 으로 재면 멀쩡한 값에 경고가 뜨고, 사용자는 그 경고를 넘기게 된다.
   */
  it("**제 상한으로 잰다**", async () => {
    await 띄우기(초안({ userInstruction: "가".repeat(600) } as never));

    expect(화면글()).not.toContain("줄여");
  });
});

/**
 * 첨부 지시 칸은 작은 부품이라 그대로 띄운다.
 */
describe("첨부 지시 칸", () => {
  const 띄운글 = (value: string) =>
    JSON.stringify(create(
      <AttachmentIntentField id="t" value={value} onChange={() => {}} placeholder="예시" />,
    ).toJSON());

  it("**넘치면 얼마나 줄일지 말한다**", () => {
    expect(띄운글("가".repeat(ATTACHMENT_INTENT_MAX_LENGTH + 3))).toContain("3자를 줄여");
  });

  it("**제 상한으로 잰다** — 긴 지시 칸(2000)의 상한을 빌리면 안 막힌다", () => {
    const 넘침 = "가".repeat(ATTACHMENT_INTENT_MAX_LENGTH + 1);

    expect(넘침.length).toBeLessThan(MAX_STRATEGY_LENGTH);
    expect(띄운글(넘침)).toContain("줄여");
  });

  it("짧으면 아무 말도 안 한다", () => {
    expect(띄운글("각도만 바꿔 주세요")).not.toContain("줄여");
  });
});
