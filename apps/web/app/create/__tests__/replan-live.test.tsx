import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePdpDraft, deletePdpDraft, listPdpDrafts, type PdpDraftInput } from "../pdp-drafts";
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
  bodies: [] as string[],
  search: new URLSearchParams("draft=replan-draft"),
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
        },
        usage: null,
      };
    },
  };
});
import { PdpMakerClient } from "../PdpMakerClient";

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
      sections: [{ ...createSectionFor([]), headline: "처음 제목" }],
    },
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

  it("**되돌리기가 편집기 세션을 갱신한다**", () => {
    /*
      되돌리면 섹션 묶음이 통째로 바뀐다. 편집기가 옛 세션을 들고 있으면
      레이어가 남의 섹션에 붙는다 — 이 저장소가 섹션 키 어긋남으로 겪은 일이다.
    */
    const 되돌리기 = client.slice(client.indexOf("onRestorePreviousPlan={"), client.indexOf("onConfirm="));

    expect(되돌리기).toContain("setEditorDraftState(null)");
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
