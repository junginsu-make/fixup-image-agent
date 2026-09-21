import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deletePdpDraft, getPdpDraft, listPdpDrafts, savePdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";
import { deletePdpDocument } from "../document-store";

/**
 * **삭제·재생성 되돌리기에 시험이 하나도 없었다**(B-7).
 *
 * 설계 §14.2: 「삭제/재생성 되돌리기 없음 | 수정 | W1 보존→W2 undo / T-STATE」.
 *
 * 소스는 들어가 있었다 — 재생성 전 보관, 삭제 전 보관, 「변경 전으로
 * 되돌리기」 단추. 그런데 **`onBeforeReplace`·`onUndo`·`undoDraftId` 를
 * 참조하는 시험이 저장소 전체에 0건**이었다(2026-09-21 조사).
 *
 * 즉 **배선이 끊겨도 전부 통과한다.** 그 상태로 지우거나 다시 만들면 유료
 * 이미지가 되돌릴 길 없이 사라진다.
 *
 * ── 왜 화면을 띄워 재나 ─────────────────────────────────────
 *
 * 이 배선은 부모가 만들어 자식에게 넘기는 것이라, 소스 문자열로는 「넘기는
 * 시늉을 했는가」까지밖에 못 본다. **실제로 눌러 본다.**
 */

const captured = vi.hoisted(() => ({
  editor: {} as Record<string, any>,
  search: new URLSearchParams("draft=preserve-draft"),
}));

const mocks = vi.hoisted(() => ({ preserve: null as null | (() => Promise<never>) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => captured.search,
}));
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));
vi.mock("../PdpEditor", () => ({
  PdpEditor: (props: Record<string, unknown>) => {
    captured.editor = props;
    return null;
  },
}));
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));
vi.mock("../StyleReferenceCard", () => ({ StyleReferenceCard: () => null }));
vi.mock("../ScenarioEditor", () => ({ ScenarioEditor: () => null }));

/**
 * 보관은 **진짜 구현**을 돌린다(가짜 IndexedDB). 실패 경로만 바꿔 끼운다 —
 * 「보관 못 하면 변경을 중단한다」는 성질을 재려면 실패를 만들어야 한다.
 */
vi.mock("../pdp-drafts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pdp-drafts")>();
  return {
    ...actual,
    preservePdpDraft: (input: PdpDraftInput) =>
      mocks.preserve ? mocks.preserve() : actual.preservePdpDraft(input),
  };
});

import { PdpMakerClient } from "../PdpMakerClient";

let renderer: ReactTestRenderer;

const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }
};

const 그림 = "data:image/png;base64,AAAA";

/**
 * **섹션은 하나를 나눠 쓴다.**
 *
 * `createSectionFor` 는 부를 때마다 새 `section_id` 를 만든다. 구성안과
 * 편집기 상태가 따로 부르면 id 가 어긋나고, `editorForSections` 가 옛 키를
 * 못 찾아 **얹은 레이어를 버린다.** 실제로 그 함정에 한 번 빠졌다.
 */
const 섹션 = { ...createSectionFor([]), headline: "처음 제목" };
const 섹션키 = (섹션 as { section_id: string }).section_id;

const 초안 = (): PdpDraftInput => ({
  id: "preserve-draft",
  appState: "editor",
  preparedImage: {
    base64: "AAAA",
    mimeType: "image/png",
    fileName: "p.png",
    previewUrl: 그림,
  },
  modelImage: null,
  modelImageUsage: null,
  result: {
    originalImage: "AAAA",
    blueprint: {
      executiveSummary: "전략",
      scorecard: [],
      blueprintList: [],
      sections: [섹션],
    },
  },
  additionalInfo: "",
  desiredTone: "",
  aspectRatio: "3:4",
  notice: "",
  editorState: {
    currentSectionIndex: 0,
    sections: [{ ...섹션, generatedImage: 그림 }],
    sectionKeys: [섹션키],
    sectionOptions: {},
    overlaysBySection: {
      [섹션키]: [{ id: "layer-1", type: "text", text: "얹은 글자", x: 10, y: 20, width: 320, height: 92, fontSize: 32 }],
    },
    defaultCopyLanguage: "ko",
    notice: "",
    workbenchTab: "layer",
    workbenchState: { isOpen: true, x: 0, y: 0 },
  },
  imageModel: "nano-banana",
  characterId: undefined,
  characterAngles: [],
  preserveProduct: false,
} as unknown as PdpDraftInput);

const 띄운다 = async () => {
  await savePdpDraft(초안());
  await act(async () => {
    renderer = create(<PdpMakerClient />);
  });
  await flush();
};

beforeEach(() => {
  captured.editor = {};
  mocks.preserve = null;
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    confirm: () => true,
    scrollTo: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    queueMicrotask(cb);
    return 1;
  });
});

afterEach(async () => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
  for (const draft of await listPdpDrafts()) await deletePdpDraft(draft.id);
  await deletePdpDocument("preserve-draft");
});

describe("바꾸기 전에 보관한다", () => {
  it("**편집기에 보관 손잡이가 붙어 있다** — 없으면 삭제·재생성이 부를 것이 없다", async () => {
    await 띄운다();

    expect(captured.editor.onBeforeReplace).toBeTypeOf("function");
  });

  it("**부르면 보관본이 하나 생긴다**", async () => {
    await 띄운다();
    const 전 = (await listPdpDrafts()).length;

    let 결과: boolean | undefined;
    await act(async () => {
      결과 = await captured.editor.onBeforeReplace();
    });
    await flush();

    expect(결과).toBe(true);
    expect((await listPdpDrafts()).length).toBe(전 + 1);
  });

  /**
   * **보관본에 유료 결과가 들어 있어야 한다.** 껍데기만 남기면 되돌려도
   * 그림이 없다.
   */
  it("**보관본이 그림과 얹은 글자를 들고 있다**", async () => {
    await 띄운다();

    await act(async () => {
      await captured.editor.onBeforeReplace();
    });
    await flush();

    // 목록은 **요약만** 준다. 보관본의 알맹이는 따로 읽어야 한다.
    const 요약 = (await listPdpDrafts()).find((draft) => draft.id !== "preserve-draft");
    expect(요약, "보관본을 못 찾았다").toBeTruthy();
    const 보관본 = await getPdpDraft(요약!.id);

    const state = 보관본!.editorState as { sections?: Array<{ generatedImage?: string }>; overlaysBySection?: Record<string, unknown[]> };
    expect(state?.sections?.[0]?.generatedImage).toBe(그림);
    expect(state?.overlaysBySection?.[섹션키]).toHaveLength(1);
  });

  it("**어느 작업에서 나온 것인지 적힌다** — 목록에서 못 가리면 되돌릴 수 없다", async () => {
    await 띄운다();

    await act(async () => {
      await captured.editor.onBeforeReplace();
    });
    await flush();

    const 요약 = (await listPdpDrafts()).find((draft) => draft.id !== "preserve-draft");
    const 보관본 = await getPdpDraft(요약!.id);

    expect((보관본 as { snapshotOf?: string } | null)?.snapshotOf).toBe("preserve-draft");
  });
});

describe("보관에 실패하면 바꾸지 않는다", () => {
  it("**거짓을 돌려준다** — 부르는 쪽이 이것을 보고 중단한다", async () => {
    await 띄운다();
    mocks.preserve = async () => {
      throw new Error("보관 실패");
    };

    let 결과: boolean | undefined;
    await act(async () => {
      결과 = await captured.editor.onBeforeReplace();
    });
    await flush();

    expect(결과).toBe(false);
  });

  it("**보관본이 안 생긴다**", async () => {
    await 띄운다();
    const 전 = (await listPdpDrafts()).length;
    mocks.preserve = async () => {
      throw new Error("보관 실패");
    };

    await act(async () => {
      await captured.editor.onBeforeReplace();
    });
    await flush();

    expect((await listPdpDrafts()).length).toBe(전);
  });
});

describe("보관한 뒤에만 되돌릴 수 있다", () => {
  it("**보관 전에는 되돌리기 단추가 없다**", async () => {
    await 띄운다();

    expect(captured.editor.onUndo).toBeUndefined();
  });

  it("**보관하면 되돌리기 단추가 생긴다**", async () => {
    await 띄운다();

    await act(async () => {
      await captured.editor.onBeforeReplace();
    });
    await flush();

    expect(captured.editor.onUndo).toBeTypeOf("function");
  });

  /**
   * **되돌리면 보관본을 연다.** 단추만 생기고 아무 일도 안 하면 사용자는
   * 되돌아간 줄 안다.
   */
  it("**되돌리면 보관본의 내용이 돌아온다**", async () => {
    await 띄운다();

    await act(async () => {
      await captured.editor.onBeforeReplace();
    });
    await flush();

    // 보관 뒤에 화면 내용을 바꾼다. 되돌리기가 그것을 덮어야 한다.
    await act(async () => {
      captured.editor.onSectionsChange?.([
        { ...createSectionFor([]), headline: "바뀐 제목" },
      ]);
    });
    await flush();

    await act(async () => {
      captured.editor.onUndo();
    });
    await flush();

    const sections = captured.editor.initialResult?.blueprint?.sections as Array<{ headline?: string }>;
    expect(sections?.[0]?.headline).toBe("처음 제목");
  });
});

/**
 * **부르는 자리가 넷이다.**
 *
 * 부모가 손잡이를 넘겨도 **편집기가 안 부르면** 아무것도 안 보관된다. 편집기는
 * 렌더 시험 틀이 없다(react-rnd·캔버스). **글로 잠근다** — 다른 방법이 없어서
 * 이지 이것이 더 나아서가 아니다.
 */
describe("바꾸는 자리마다 보관을 먼저 부른다", () => {
  const 읽기 = (name: string) =>
    readFileSync(new URL(`../${name}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  const editor = 읽기("PdpEditor.tsx");
  const textFlow = 읽기("TextModeFlow.tsx");

  it("**섹션을 다시 만들기 전에 보관한다**", () => {
    expect(editor).toMatch(/if \(section\.generatedImage && onBeforeReplace\)/);
  });

  it("**섹션을 지우기 전에 보관한다**", () => {
    expect(editor).toMatch(/onBeforeReplace && !\(await onBeforeReplace\(\)\)/);
  });

  /**
   * **보관 못 하면 멈춘다.** 거짓을 받고도 진행하면 보관 장치가 있으나 마나다.
   */
  it("**보관에 실패하면 바꾸지 않는다**", () => {
    const 지우는자리 = editor.slice(editor.indexOf("onBeforeReplace && !(await onBeforeReplace())"));

    expect(지우는자리.slice(0, 200)).toContain("return");
  });

  it("**글 경로도 바꾸기 전에 보관한다**", () => {
    const 부른횟수 = [...textFlow.matchAll(/await onBeforeReplace\(\)/g)].length;

    // 구성안 다시 짜기와 대표 이미지 다시 만들기. 둘 다 유료 결과를 덮는다.
    expect(부른횟수).toBeGreaterThanOrEqual(2);
  });

  it("**되돌리기 단추가 화면에 있다**", () => {
    expect(editor).toContain("변경 전으로 되돌리기");
    expect(editor).toMatch(/onClick=\{onUndo\}/);
  });
});

