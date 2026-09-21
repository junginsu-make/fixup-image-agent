import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePdpDraft, getPdpDraft, deletePdpDraft, listPdpDrafts, type PdpDraftInput, type PdpEditorDraftState } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";
import { deletePdpDocument } from "../document-store";

/**
 * **눌러 보고 잰다**(U-11).
 *
 * 소스 문자열로는 「전략이 요청에 실리는가」, 「되돌리면 옛 구성이 오는가」를
 * 못 잰다. 화면을 띄워 실제로 부른다.
 */
const captured = vi.hoisted(() => ({
  scenario: {} as Record<string, any>,
  editor: {} as Record<string, any>,
  text: {} as Record<string, any>,
  bodies: [] as string[],
  search: new URLSearchParams("draft=replan-draft"),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => captured.search }));
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));
vi.mock("../PdpEditor", () => ({
  PdpEditor: (props: Record<string, unknown>) => { captured.editor = props; return null; },
}));
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));
vi.mock("../StyleReferenceCard", () => ({ StyleReferenceCard: () => null }));
vi.mock("../TextModeFlow", () => ({
  TextModeFlow: (props: Record<string, unknown>) => { captured.text = props; return null; },
}));
vi.mock("../ScenarioEditor", () => ({
  ScenarioEditor: (props: Record<string, unknown>) => { captured.scenario = props; return null; },
}));
vi.mock("../pdp-utils", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../pdp-utils");
  return {
    ...actual,
    apiJson: async (_path: string, init?: RequestInit) => {
      captured.bodies.push(String(init?.body ?? ""));
      return {
        ok: true,
        result: {
          originalImage: "AAAA",
          blueprint: {
            executiveSummary: "다시 짠 전략", scorecard: [], blueprintList: [],
            sections: [{ ...createSectionFor([]), headline: "다시 짠 제목" }],
          },
          // 심사도 구성안마다 다르다. 되돌리면 이것도 함께 돌아와야 한다.
          review: { items: [], droppedCount: 2 },
        },
        usage: null,
      };
    },
  };
});
import { PdpMakerClient } from "../PdpMakerClient";

/** 되돌린 뒤 레이어가 이 섹션으로 돌아와야 한다. 열쇠가 같아야 대조가 된다. */
const 첫섹션 = createSectionFor([]);

let renderer: ReactTestRenderer;
const flush = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise<void>((r) => setImmediate(r)); });
};

beforeEach(() => {
  captured.bodies.length = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: () => true, scrollTo: vi.fn(),
    // 경과 시간 표시가 `window.setInterval` 을 쓴다. 없으면 마운트가 터진다.
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { queueMicrotask(cb); return 1; });
});
afterEach(async () => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
  await deletePdpDraft("replan-draft");
  await deletePdpDocument("replan-draft");
});

const 초안 = (): PdpDraftInput => ({
  id: "replan-draft", appState: "scenario",
  preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
  modelImage: null, modelImageUsage: null,
  result: {
    originalImage: "AAAA",
    blueprint: {
      executiveSummary: "처음 전략", scorecard: [], blueprintList: [],
      sections: [{ ...첫섹션, headline: "처음 제목" }],
    },
    review: { items: [], droppedCount: 1 },
  },
  additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
  imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
} as PdpDraftInput);

describe("고친 전략으로 구성만 다시 짠다", () => {
  it("**고친 전략이 요청에 실린다**", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    await act(async () => { captured.scenario.onReplanFromStrategy("아침 시간을 되찾아 주는 이야기"); });
    await flush();

    const 기획요청 = captured.bodies.find((body) => body.includes("strategyDirective"));
    expect(기획요청).toBeTruthy();
    expect(JSON.parse(기획요청!).strategyDirective).toBe("아침 시간을 되찾아 주는 이야기");
  });

  it("**되돌리면 처음 구성이 돌아온다** — 이전 revision 을 보존한다", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    expect(captured.scenario.blueprint.executiveSummary).toBe("처음 전략");
    // 처음 기획 상태에서는 되돌릴 것이 없다.
    expect(captured.scenario.onRestorePreviousPlan).toBeUndefined();

    await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기로 간다"); });
    await flush();
    expect(captured.scenario.blueprint.headline ?? captured.scenario.blueprint.executiveSummary).toBe("다시 짠 전략");

    await act(async () => { captured.scenario.onRestorePreviousPlan(); });
    await flush();

    expect(captured.scenario.blueprint.executiveSummary).toBe("처음 전략");
    expect(captured.scenario.blueprint.sections[0].headline).toBe("처음 제목");
  });

  it("**되돌린 뒤에는 또 되돌릴 것이 없다**", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기"); });
    await flush();
    await act(async () => { captured.scenario.onRestorePreviousPlan(); });
    await flush();

    expect(captured.scenario.onRestorePreviousPlan).toBeUndefined();
  });
});

describe("처음 기획에는 되돌릴 것이 없다", () => {
  it("**업로드에서 처음 만든 구성안에는 되돌리기가 없다**", async () => {
    // 재기획이 아니라 처음 기획이다. 되돌릴 「이전 구성」이란 것이 없는데
    // 단추가 뜨면, 눌렀을 때 무엇으로 돌아가는지 아무도 모른다.
    await savePdpDraft({ ...초안(), appState: "upload", result: null } as PdpDraftInput);
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    // 글자로 찾으면 React 트리가 순환 참조라 직렬화가 터진다. 속성으로 찾는다.
    const 분석단추 = renderer.root
      .findAll((node) => node.type === "button")
      .find((node) => node.props.disabled === false && String(node.props.className ?? "").includes("w-full"));
    expect(분석단추).toBeTruthy();

    // **실제 클릭처럼 이벤트를 넘긴다.** 인자 없이 부르면 `onClick={handleAnalyze}`
    // 같은 실수가 드러나지 않는다 — 브라우저는 늘 이벤트를 넘긴다.
    await act(async () => { 분석단추!.props.onClick({ type: "click" }); });
    await flush();

    expect(captured.scenario.blueprint.executiveSummary).toBe("다시 짠 전략");
    expect(captured.scenario.onRestorePreviousPlan).toBeUndefined();
    // 첫 기획이니 전략 지시도 안 실린다.
    expect(captured.bodies.some((body) => body.includes("strategyDirective"))).toBe(false);
  });

  it("**설정 바꿔 다시 만들기도 되돌리기를 안 띄운다**", async () => {
    /*
      구성안이 있는 상태에서 업로드로 돌아가 다시 만드는 길이다. 여기서는
      `result` 가 남아 있어서, 「재기획이면 들고 있는다」를 「늘 들고 있는다」로
      바꿔도 위 시험은 못 잡는다.

      이 길은 **전략 재기획이 아니다.** 옛 작업은 이미 별도 초안으로 보존되므로
      (`preserveBeforeReplacement`), 여기에 되돌리기를 또 두면 보존 경로가
      두 벌이 된다.
    */
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();
    expect(captured.scenario.blueprint.executiveSummary).toBe("처음 전략");

    await act(async () => { captured.scenario.onRegenerate(); });
    await flush();

    const 분석단추 = renderer.root
      .findAll((node) => node.type === "button")
      .find((node) => node.props.disabled === false && String(node.props.className ?? "").includes("w-full"));
    // **실제 클릭처럼 이벤트를 넘긴다.** 인자 없이 부르면 `onClick={handleAnalyze}`
    // 같은 실수가 드러나지 않는다 — 브라우저는 늘 이벤트를 넘긴다.
    await act(async () => { 분석단추!.props.onClick({ type: "click" }); });
    await flush();

    expect(captured.scenario.blueprint.executiveSummary).toBe("다시 짠 전략");
    expect(captured.scenario.onRestorePreviousPlan).toBeUndefined();
  });
});

describe("되돌릴 때 편집기도 새로 연다", () => {
  const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");

  it("**되돌리기가 편집기 세션 갱신을 남겨 둔다**", () => {
    /*
      **이 줄은 오늘 기준으로 효과가 없다.** 되돌리기는 구성안 화면에만 있고
      그때 편집기는 이미 내려가 있어, 다음에 열 때 어차피 새로 마운트된다.
      실제로 이 줄을 지워도 눌러 보는 시험은 아무것도 안 잡는다.

      그래도 남기는 까닭은 훗날 **편집기 위에서 되돌릴 수 있게 되면** 그때
      필요해지기 때문이다. 그 사실을 여기 적어 둔다 — 안 적어 두면 다음 사람이
      「아무도 안 재는 줄」로 보고 지운다.

      무엇이 편집기로 넘어가는지는 소스로 안 잰다. 「되돌리면 얹은 글자도
      돌아온다」 가 눌러 보고 양쪽을 잰다.
    */
    const 되돌리기 = client.slice(client.indexOf("onRestorePreviousPlan={"), client.indexOf("onConfirm="));

    expect(되돌리기).toContain("setEditorSessionKey");
  });

  it("**재기획도 기존 작업을 먼저 보관한다**", () => {
    // 되돌리기는 화면 안의 한 번짜리다. 유료 이미지의 유일한 저장본은 초안이
    // 지킨다(`preserveBeforeReplacement`).
    const 기획 = client.slice(client.indexOf("const handleAnalyze"), client.indexOf("/pdp/analyze"));

    expect(기획).toContain("preserveBeforeReplacement()");
  });
});

/**
 * **되돌리기는 이 작업의 것일 때만, 그리고 보관을 지나서.**
 *
 * 리뷰가 실측으로 두 구멍을 짚었다 — A 를 다시 짠 뒤 B 를 열면 A 의 되돌리기가
 * 살아 있어 **B 위에 A 의 유료 이미지가 앉았고**, 되돌리기만 보관본을 안 팠다.
 */
describe("되돌리기가 남의 작업을 덮지 않는다", () => {
  it("**다른 초안을 열면 되돌리기가 사라진다**", async () => {
    await savePdpDraft(초안());
    await savePdpDraft({
      ...초안(), id: "other-draft",
      result: {
        originalImage: "BBBB",
        blueprint: {
          executiveSummary: "다른 작업 전략", scorecard: [], blueprintList: [],
          sections: [{ ...createSectionFor([]), headline: "다른 작업 제목" }],
        },
      },
    } as PdpDraftInput);

    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();
    await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기"); });
    await flush();
    expect(captured.scenario.onRestorePreviousPlan).toBeTruthy();

    // 저장된 작업 목록에서 다른 것을 연다. 목록은 업로드 화면에 있다.
    await act(async () => { captured.scenario.onRegenerate(); });
    await flush();
    const 불러오기 = renderer.root.findAll(
      (node) => node.type === "button" && node.props["data-draft-id"] === "other-draft",
    );
    expect(불러오기.length).toBeGreaterThan(0);
    await act(async () => { 불러오기[0]!.props.onClick(); });
    await flush();

    expect(captured.scenario.blueprint.executiveSummary).toBe("다른 작업 전략");
    // 살아 있으면 누르는 순간 남의 구성 위에 앞 작업이 앉는다.
    expect(captured.scenario.onRestorePreviousPlan).toBeUndefined();

    await deletePdpDraft("other-draft");
  });

  it("**되돌리기가 보관본을 먼저 판다**", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();
    await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기"); });
    await flush();

    const 되돌리기전 = (await listPdpDrafts()).length;
    await act(async () => { await captured.scenario.onRestorePreviousPlan(); });
    await flush();

    // 다시 짠 뒤 만든 것이 통째로 사라지지 않게, 여기도 보관본을 판다.
    expect((await listPdpDrafts()).length).toBeGreaterThan(되돌리기전);
  });
});

/**
 * **입구가 둘인데 문지기가 하나였다**(U-08).
 *
 * 업로드 화면 단추는 `canAnalyze` 로 막히는데, 구성안 화면의 「이 전략으로
 * 구성 다시 만들기」는 그 문지기를 안 지났다. 501자를 담은 옛 초안을 열어
 * 거기서 누르면 **조용한 400** 이 난다.
 */
describe("넘친 입력은 재기획도 막는다", () => {
  it("**넘쳤으면 기획 요청을 아예 안 보낸다**", async () => {
    await savePdpDraft({ ...초안(), additionalInfo: "가".repeat(600) } as PdpDraftInput);
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기"); });
    await flush();

    // 보냈다면 조용한 400 이 났을 것이다.
    expect(captured.bodies.some((body) => body.includes("strategyDirective"))).toBe(false);
  });

  it("넘치지 않으면 평소대로 보낸다", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기"); });
    await flush();

    expect(captured.bodies.some((body) => body.includes("strategyDirective"))).toBe(true);
  });
});

/**
 * **화면에 적은 것이 서버까지 가는가**(U-06).
 *
 * `buildAnalyzeRequest` 는 따로 재고 라우트도 따로 재는데, **화면이 그 함수에
 * 넘기는 두 줄**은 아무도 안 봤다. 지우면 사용자는 적고 저장되고 새로고침해도
 * 보이는데 **서버로는 안 간다.** 두 인자 모두 optional 이라 타입도 안 잡는다.
 */
describe("구성 요청과 그림체가 요청 본문까지 간다", () => {
  it("**적은 말이 실려 나간다**", async () => {
    await savePdpDraft({ ...초안(), planInstruction: "섹션을 다섯 개로", look: "illustration" } as PdpDraftInput);
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    await act(async () => { captured.scenario.onReplanFromStrategy("다른 이야기"); });
    await flush();

    const 본문 = captured.bodies.find((body) => body.includes("strategyDirective"));
    expect(본문).toBeTruthy();
    const parsed = JSON.parse(본문!);
    expect(parsed.planInstruction).toBe("섹션을 다섯 개로");
    expect(parsed.look).toBe("illustration");
  });
});

/**
 * **되돌리기가 레이어까지 되돌린다**(A-2 의 잔가지).
 *
 * 설계 §4.2: 「섹션 삭제·재분석·재생성은 직전 revision/asset 을 보존하고
 * **되돌리기를 제공한다**」.
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────
 *
 * 구성안 A 로 이미지를 만들고 글자를 얹은 다음, 단계 막대로 구성안에 돌아가
 * 전략을 고쳐 다시 짜면 `handleAnalyze` 가 `setEditorDraftState(null)` 로
 * **A 의 레이어를 메모리에서 버린다.** 그 뒤 되돌리기를 눌러도 되돌아오는 것은
 * 구성안뿐이고, **손으로 얹은 글자는 안 돌아온다.**
 *
 * 보관 초안에는 남아 있다. 그러나 사용자는 저장된 작업 목록을 뒤져 그것을
 * 찾아 열어야 한다 — 그것은 되돌리기가 아니다.
 *
 * ── 왜 버렸었나, 왜 이제 안 버려도 되나 ─────────────────────
 *
 * 원래 주석의 걱정은 「레이어가 **남의 섹션**에 붙는다」였다. 맞는 걱정이지만
 * 방향이 반대다 — 위험한 것은 B 의 레이어를 A 에 붙이는 것이고, 여기서 돌려
 * 놓는 것은 **A 의 레이어를 A 에** 붙이는 것이다. 게다가 편집기로 넘길 때
 * `editorForSections` 가 섹션 열쇠로 한 번 더 거른다.
 */
describe("되돌리면 얹은 글자도 돌아온다", () => {
  const 레이어 = {
    id: "L1", kind: "shape" as const, x: 10, y: 20, width: 100, height: 40,
    fillColor: "#000000", fillOpacity: 1, borderRadius: 0,
  };

  const 편집기상태 = (): PdpEditorDraftState => ({
    currentSectionIndex: 0,
    sections: [{ ...첫섹션, headline: "처음 제목" }],
    sectionKeys: [첫섹션.section_id],
    sectionOptions: {},
    overlaysBySection: { [첫섹션.section_id]: [레이어] },
    defaultCopyLanguage: "ko" as const,
    notice: "",
    workbenchTab: "layer" as const,
    workbenchState: { x: 0, y: 0, width: 320, height: 400, isOpen: false },
  });

  it("**다시 짜고 되돌리면 얹은 글자가 편집기로 돌아온다**", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    // 편집기로 들어가 글자를 얹는다.
    await act(async () => { captured.scenario.onConfirm(); });
    await flush();
    await act(async () => { captured.editor.onDraftStateChange(편집기상태()); });
    await flush();

    // 단계 막대로 구성안에 돌아가 전략을 고쳐 다시 짠다.
    await act(async () => { captured.editor.onJumpStep("analyze"); });
    await flush();
    await act(async () => { captured.scenario.onReplanFromStrategy("아침 시간을 되찾아 주는 이야기"); });
    await flush();
    expect(captured.scenario.blueprint.executiveSummary).toBe("다시 짠 전략");

    // 되돌린다.
    expect(captured.scenario.onRestorePreviousPlan).toBeTruthy();
    await act(async () => { await captured.scenario.onRestorePreviousPlan(); });
    await flush();
    expect(captured.scenario.blueprint.executiveSummary).toBe("처음 전략");

    // 편집기를 열면 얹은 글자가 그 섹션에 그대로 있어야 한다.
    await act(async () => { captured.scenario.onConfirm(); });
    await flush();

    const 돌아온것 = captured.editor.initialDraftState;
    expect(돌아온것, "되돌렸는데 편집기 상태가 비었다").toBeTruthy();
    expect(돌아온것.overlaysBySection?.[첫섹션.section_id] ?? []).toHaveLength(1);
  });

  /**
   * **다시 짠 쪽의 레이어를 옛 구성에 붙이지 않는다.** 되돌리기가 되살리는
   * 것은 다시 짜기 **직전**의 것이어야 한다.
   */
  it("**다시 짠 뒤에 얹은 글자는 되돌리기로 안 따라온다**", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    /*
      **재기획 전에도 A 에 글자를 얹어 둔다.**

      안 얹으면 되돌린 뒤 편집기 상태가 통째로 `null` 이라, 마지막 단언이
      `?.` 에서 끊겨 **무엇을 하든 통과한다.** 게다가 섹션 열쇠는 매번 새로
      나므로 겹칠 일도 없어, 거르는 코드를 지워도 초록이었다.

      A 에 얹어 두면 되돌린 뒤 **양쪽을 다 잴 수 있다** — A 것은 오고, B 것은
      안 온다.
    */
    await act(async () => { captured.scenario.onConfirm(); });
    await flush();
    await act(async () => { captured.editor.onDraftStateChange(편집기상태()); });
    await flush();
    await act(async () => { captured.editor.onJumpStep("analyze"); });
    await flush();

    await act(async () => { captured.scenario.onReplanFromStrategy("아침 시간을 되찾아 주는 이야기"); });
    await flush();

    // 새 구성안으로 편집기에 들어가 글자를 얹는다. 이 섹션은 옛 구성에 없다.
    await act(async () => { captured.scenario.onConfirm(); });
    await flush();
    const 새섹션 = captured.editor.initialResult.blueprint.sections[0];
    await act(async () => {
      captured.editor.onDraftStateChange({
        ...편집기상태(),
        sections: [새섹션],
        sectionKeys: [새섹션.section_id],
        overlaysBySection: { [새섹션.section_id]: [레이어] },
      });
    });
    await flush();

    await act(async () => { captured.editor.onJumpStep("analyze"); });
    await flush();
    await act(async () => { await captured.scenario.onRestorePreviousPlan(); });
    await flush();
    await act(async () => { captured.scenario.onConfirm(); });
    await flush();

    const 돌아온것 = captured.editor.initialDraftState;
    expect(돌아온것, "되돌렸는데 편집기 상태가 비었다").toBeTruthy();
    // A 것은 돌아온다.
    expect(돌아온것.overlaysBySection?.[첫섹션.section_id] ?? []).toHaveLength(1);
    // B 것은 안 따라온다.
    expect(돌아온것.overlaysBySection?.[새섹션.section_id]).toBeUndefined();
  });
});

/**
 * **다시 짠 뒤 저장한 초안이 새 것을 담는가.**
 *
 * 재기획은 화면의 편집기 상태를 비운다(`handleAnalyze` 의
 * `setEditorDraftState(null)`). 그 한 줄을 지워도 시험이 안 빨개져서 무엇을
 * 지키는지 따져 보았다.
 *
 * **섹션은 그 줄이 아니라 `editorForSections` 가 지킨다.** 저장할 때도
 * (`buildDraftInput`) 편집기로 넘길 때도 새 구성안의 섹션이 정본이고, 열쇠가
 * 안 맞는 옛 레이어는 거기서 걸러진다. 그래서 섹션이 새는 경로는 없다.
 *
 * **남는 차이는 안내문 하나다.** `buildDraftInput` 은 편집기 상태의 안내문을
 * 먼저 쓴다. 안 비우면 다시 짠 초안에 **A 를 편집하던 시절의 안내문**이
 * 적히고, 나중에 그 초안을 연 사용자는 방금 무엇을 했는지 틀리게 읽는다.
 *
 * 값을 치른 그림이 사라지는 종류는 아니다. 그래서 이 한 건만 잰다.
 */
describe("다시 짠 뒤 저장한 초안", () => {
  it("**다시 짠 뒤의 안내문을 적는다** — 편집하던 시절의 말이 남지 않는다", async () => {
    const 편집기상태 = (): PdpEditorDraftState => ({
      currentSectionIndex: 0,
      sections: [{ ...첫섹션, headline: "처음 제목" }],
      sectionKeys: [첫섹션.section_id],
      sectionOptions: {},
      overlaysBySection: {},
      defaultCopyLanguage: "ko",
      notice: "편집기에서 만들던 중",
      workbenchTab: "image",
      workbenchState: { x: 0, y: 0, width: 320, height: 400, isOpen: false },
    });

    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    // 편집기에 들어가 상태를 만든 뒤 구성안으로 돌아가 다시 짠다.
    await act(async () => { captured.scenario.onConfirm(); });
    await flush();
    await act(async () => { captured.editor.onDraftStateChange(편집기상태()); });
    await flush();
    await act(async () => { captured.editor.onJumpStep("analyze"); });
    await flush();
    await act(async () => { captured.scenario.onReplanFromStrategy("아침 시간을 되찾아 주는 이야기"); });
    await flush();

    // 저장하고 다시 연다.
    await act(async () => { captured.scenario.onConfirm(); });
    await flush();
    await act(async () => { await captured.editor.onManualSave(); });
    await flush();

    const 저장된것 = await getPdpDraft("replan-draft");

    expect(저장된것?.result?.blueprint.executiveSummary).toBe("다시 짠 전략");
    expect(저장된것?.notice).not.toBe("편집기에서 만들던 중");
  });
});

/**
 * **되돌리기는 이 작업의 것일 때만 떠 있어야 한다.**
 *
 * 이미지 모드로 다시 짠 뒤 업로드로 돌아가 **글 모드로 갈아타면**, `result` 만
 * 새 것으로 바뀌고 되돌리기는 남아 있었다. 글로 만든 작업 화면에 앞 작업의
 * 되돌리기가 떠 있고, 누르면 통째로 앞 작업으로 바뀐다.
 */
describe("모드를 갈아타면 되돌리기가 사라진다", () => {
  it("**글 모드로 끝내면 앞 작업의 되돌리기가 없다**", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();

    // 다시 짜서 되돌리기를 만든다.
    await act(async () => { captured.scenario.onReplanFromStrategy("아침 시간을 되찾아 주는 이야기"); });
    await flush();
    expect(captured.scenario.onRestorePreviousPlan).toBeTruthy();

    // 업로드로 돌아가 글 모드로 갈아탄다.
    await act(async () => { captured.scenario.onRegenerate(); });
    await flush();
    // 글자만 훑는다. `children` 을 통째로 JSON 으로 만들면 순환 참조로 터진다.
    const 글자 = (node: { children?: unknown[] }): string =>
      (node.children ?? []).map((child) => typeof child === "string" ? child : 글자(child as never)).join("");
    const 글모드단추 = renderer.root
      .findAll((node) => node.type === "button")
      .find((node) => 글자(node as never).includes("텍스트로 시작"));
    expect(글모드단추, "글 모드 단추를 못 찾았다").toBeTruthy();
    await act(async () => { 글모드단추!.props.onClick({ type: "click" }); });
    await flush();

    // 글 흐름이 끝나 새 결과가 들어온다.
    expect(captured.text.onComplete, "글 흐름이 안 떴다").toBeTruthy();
    await act(async () => {
      captured.text.onComplete(
        {
          originalImage: "BBBB",
          blueprint: {
            executiveSummary: "글로 만든 전략", scorecard: [], blueprintList: [],
            sections: [{ ...createSectionFor([]), headline: "글로 만든 제목" }],
          },
        },
        "nano-banana",
      );
    });
    await flush();

    // 구성안으로 돌아가 본다.
    await act(async () => { captured.editor.onJumpStep("analyze"); });
    await flush();

    expect(captured.scenario.onRestorePreviousPlan).toBeUndefined();
  });
});

/**
 * **되돌리면 심사 결과도 함께 돌아온다.**
 *
 * 구성안과 심사는 짝이다. 구성만 되돌아오고 심사가 다시 짠 쪽 것으로 남으면,
 * 화면은 **옛 구성 옆에 새 구성의 지적**을 붙여 놓는다.
 *
 * 전에는 이것을 `replan-from-strategy.test.tsx` 가 `setReview(restoring.review)`
 * 라는 **소스 문자열로** 쟀다. 그 줄은 이름만 바꿔도 빨개지고, 정작 화면에 안
 * 실려도 통과한다. 눌러 보고 잰다.
 */
describe("되돌리면 심사도 돌아온다", () => {
  it("**다시 짠 심사가 옛 구성 옆에 남지 않는다**", async () => {
    await savePdpDraft(초안());
    await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
    await flush();
    expect(captured.scenario.review?.droppedCount).toBe(1);

    await act(async () => { captured.scenario.onReplanFromStrategy("아침 시간을 되찾아 주는 이야기"); });
    await flush();
    expect(captured.scenario.review?.droppedCount).toBe(2);

    await act(async () => { await captured.scenario.onRestorePreviousPlan(); });
    await flush();

    expect(captured.scenario.blueprint.executiveSummary).toBe("처음 전략");
    expect(captured.scenario.review?.droppedCount).toBe(1);
  });
});
