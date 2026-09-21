import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePdpDraft, deletePdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";
import { deletePdpDocument } from "../document-store";

/**
 * **만들어 둔 그림을 화면이 실제로 되찾는가**(K-04).
 *
 * 설계 §8: 「지금은 그림이 브라우저로만 간다. 탭을 닫으면 이미 값을 치른
 * 그림이 사라지고 사용자는 다시 눌러 두 번 낸다」.
 *
 * ── 무엇이 막혀 있었나 ─────────────────────────────────────
 *
 * 서버 쪽은 다 있었다. 기록기가 그림을 저장소에 올리고, 조회하는 문도 있고,
 * `recoverableSections` 도 있었다. 그런데 **그 조립기를 부르는 화면이 없었다** —
 * 저장소 전체에서 부르는 것은 자기 시험뿐이었다(2026-09-21 조사).
 *
 * 즉 **서버가 그림을 들고 있는데 아무도 가지러 가지 않았다.**
 *
 * ── 왜 화면을 띄워 재나 ────────────────────────────────────
 *
 * 「배선이 있는가」를 소스 문자열로 재면 넘기는 시늉만 해도 통과한다. 실제로
 * 초안을 열어 보고, 빠진 섹션에 그림이 들어오는지 **값으로** 본다.
 */

const captured = vi.hoisted(() => ({
  editor: {} as Record<string, any>,
  asked: [] as string[],
  job: null as unknown,
  holdAsk: null as null | Promise<void>,
  fetched: [] as string[],
  fetchFails: false,
  askFails: false,
  search: new URLSearchParams("draft=recover-draft"),
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
vi.mock("../ScenarioEditor", () => ({ ScenarioEditor: () => null }));
vi.mock("../pdp-utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    apiJson: async (path: string) => {
      captured.asked.push(path);
      // 답을 **붙잡아 둘** 수 있게 한다. 묻는 사이에 화면이 바뀌는 경우를 만든다.
      if (captured.holdAsk) await captured.holdAsk;
      if (captured.askFails) throw new Error("401 이 HTML 로 왔다");
      return captured.job ?? { ok: false, code: "NOT_FOUND" };
    },
  };
});

import { PdpMakerClient } from "../PdpMakerClient";

let renderer: ReactTestRenderer;
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await act(async () => { await new Promise<void>((r) => setImmediate(r)); });
};

const 첫섹션 = createSectionFor([]);
const 둘째섹션 = createSectionFor([]);

const 초안 = (sections: unknown[]): PdpDraftInput => ({
  id: "recover-draft", appState: "editor",
  preparedImage: { base64: "AAAA", mimeType: "image/png", fileName: "p.png", previewUrl: "data:image/png;base64,AAAA" },
  modelImage: null, modelImageUsage: null,
  result: {
    originalImage: "AAAA",
    blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [], sections },
  },
  additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
  imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: false,
} as PdpDraftInput);

const 빈장두개 = () => 초안([{ ...첫섹션, headline: "첫 장" }, { ...둘째섹션, headline: "둘째 장" }]);

const 서버가들고있는것 = (items: Array<{ sectionId: string; url: string | null }>) => ({
  ok: true,
  job: {
    id: "job-1", documentId: "recover-draft", revision: 0, operation: "pdp_image",
    outcome: "done", state: {}, createdAt: "", updatedAt: "",
    items: items.map((item) => ({ ...item, attempt: 1, errorCode: null })),
  },
});

beforeEach(() => {
  captured.asked.length = 0;
  captured.job = null;
  captured.holdAsk = null;
  captured.fetched.length = 0;
  captured.fetchFails = false;
  captured.askFails = false;
  captured.editor = {};
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: () => true, scrollTo: vi.fn(),
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { queueMicrotask(cb); return 1; });
  /*
    **되찾은 그림은 그 자리에서 구워 들인다.** 서버가 주는 서명 주소는 한
    시간이면 죽는다. 여기서도 진짜로 받아 오게 두고, 화면에 들어간 값이
    data URL 인지 값으로 잰다.
  */
  vi.stubGlobal("fetch", async (url: string) => {
    captured.fetched.push(String(url));
    if (captured.fetchFails) throw new Error("끊겼다");
    return { ok: true, blob: async () => ({ type: "image/png", arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }) };
  });
});
afterEach(async () => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
  await deletePdpDraft("recover-draft");
  await deletePdpDocument("recover-draft");
});

const 띄운다 = async () => {
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
  await flush();
};

const 섹션들 = () => (captured.editor.initialResult?.blueprint?.sections ?? []) as Array<Record<string, unknown>>;

describe("돌아오면 만들어 둔 그림을 되찾는다", () => {
  it("**빠진 섹션에 서버가 들고 있던 그림이 들어온다**", async () => {
    captured.job = 서버가들고있는것([{ sectionId: 첫섹션.section_id, url: "https://signed/s1" }]);
    await savePdpDraft(빈장두개());

    await 띄운다();

    /*
      **주소가 아니라 그림이 들어와야 한다**(리뷰 HIGH).

      서명 주소는 한 시간이면 죽는다. 그대로 넣으면 자동 저장이 그것을 초안에
      적고, 한 시간 뒤 그 초안은 깨진 그림으로 열린다 — 그때는 칸이 차 있어
      되찾을 수도 없다.
    */
    expect(String(섹션들()[0]!.generatedImage).startsWith("data:image/png;base64,")).toBe(true);
    expect(captured.fetched).toContain("https://signed/s1");
    /*
      **한 번만 묻는다.** 되찾아 넣으면 `result` 가 바뀌어 효과가 다시 돈다.
      안 막으면 두 번 나간다(둘째 장이 비어 있어 조건은 여전히 참이다).
    */
    expect(captured.asked.filter((path) => path.includes("/pdp/jobs"))).toHaveLength(1);
  });

  it("**받지 못한 그림은 안 넣는다** — 주소만 넣으면 한 시간 뒤 깨진다", async () => {
    captured.job = 서버가들고있는것([{ sectionId: 첫섹션.section_id, url: "https://signed/s1" }]);
    captured.fetchFails = true;
    await savePdpDraft(빈장두개());

    await 띄운다();

    expect(섹션들()[0]!.generatedImage).toBeUndefined();
    // 못 넣었으면 되찾았다고 말하지도 않는다.
    expect(captured.editor.recoveredNotice ?? "").toBe("");
  });

  it("**묻다가 터져도 화면은 멀쩡하다** — 401 이 HTML 로 오는 일이 있다", async () => {
    captured.askFails = true;
    await savePdpDraft(빈장두개());

    await 띄운다();

    expect(섹션들()).toHaveLength(2);
    expect(captured.editor.onSectionsChange, "편집기가 안 떴다").toBeTruthy();
  });

  it("**초안 번호로 묻는다** — 작업 번호는 탭을 닫은 사용자가 모른다", async () => {
    captured.job = 서버가들고있는것([]);
    await savePdpDraft(빈장두개());

    await 띄운다();

    expect(captured.asked.some((path) => path.includes("documentId=recover-draft"))).toBe(true);
    // **생성 요청과 같은 개정판으로 묻는다.** 갈리면 만든 것을 못 찾는다.
    expect(captured.asked.some((path) => path.includes("revision=0"))).toBe(true);
  });

  /**
   * **이미 있는 그림을 덮지 않는다.** 되찾기가 그 뒤에 한 작업을 지우면,
   * 고치려던 손실을 다른 모양으로 다시 내는 셈이다.
   */
  it("**이미 있는 그림은 그대로 둔다**", async () => {
    /*
      **빈 장을 하나 끼워 둔다.** 다 채워져 있으면 애초에 묻지를 않아
      (`shouldAskForRecovery`) 이 시험이 **공짜로 통과한다** — 덮어쓰기를
      막는 코드를 통째로 지워도 초록이었다.

      그래서 「물어볼 까닭은 있고, 그중 한 장은 이미 있다」로 만든다.
    */
    captured.job = 서버가들고있는것([
      { sectionId: 첫섹션.section_id, url: "https://signed/새것" },
      { sectionId: 둘째섹션.section_id, url: "https://signed/s2" },
    ]);
    await savePdpDraft(초안([
      { ...첫섹션, headline: "첫 장", generatedImage: "data:image/png;base64,이미있음" },
      { ...둘째섹션, headline: "둘째 장" },
    ]));

    await 띄운다();

    expect(섹션들()[0]!.generatedImage).toBe("data:image/png;base64,이미있음");
    // 빈 장에는 들어온다. 안 그러면 「아무것도 안 했다」로도 통과한다.
    expect(String(섹션들()[1]!.generatedImage).startsWith("data:")).toBe(true);
  });

  /**
   * **묻는 사이에 그림이 생겼으면 덮지 않는다.**
   *
   * 물어보는 동안에도 사용자는 만들 수 있다. 되찾기는 물을 때의 섹션 목록을
   * 들고 있으므로, 답이 왔을 때는 그 목록이 이미 낡았을 수 있다. 그때 덮으면
   * **방금 만든 유료 그림이 서버의 옛 그림으로 바뀐다.**
   *
   * 이 경우는 `recoverableSections` 가 못 막는다. 그 함수는 **물을 때**의
   * 목록으로 고르기 때문이다. 넣는 자리에서 한 번 더 본다.
   */
  it("**묻는 사이에 그림이 생기면 그것을 지킨다**", async () => {
    // 두 장을 들고 있다. 그 사이에 **한 장만** 생기면 고른 수와 넣은 수가 갈린다.
    captured.job = 서버가들고있는것([
      { sectionId: 첫섹션.section_id, url: "https://signed/서버것" },
      { sectionId: 둘째섹션.section_id, url: "https://signed/s2" },
    ]);
    await savePdpDraft(빈장두개());

    // 답을 붙잡아 둔다. 그 사이에 화면에서 그림이 만들어지는 상황을 만든다.
    let 답을준다: () => void = () => {};
    captured.holdAsk = new Promise<void>((resolve) => { 답을준다 = resolve; });

    await 띄운다();
    expect(captured.editor.onSectionsChange, "편집기가 안 떴다").toBeTruthy();

    // 물어보는 동안 그 섹션을 만들었다.
    await act(async () => {
      captured.editor.onSectionsChange((sections: Array<Record<string, unknown>>) =>
        sections.map((section) =>
          section.section_id === 첫섹션.section_id
            ? { ...section, generatedImage: "data:image/png;base64,방금만든것" }
            : section,
        ),
      );
    });

    답을준다();
    await flush();

    expect(섹션들()[0]!.generatedImage).toBe("data:image/png;base64,방금만든것");
    // 안 차 있던 둘째 장에는 들어온다.
    expect(String(섹션들()[1]!.generatedImage).startsWith("data:")).toBe(true);
    /*
      **세어 말한 장수가 실제로 넣은 장수와 같아야 한다.**

      고른 것은 **물을 때**의 섹션으로 셌으므로 두 장이다. 그 수로 말하면
      한 장만 넣고 「2장을 되찾았습니다」가 된다.
    */
    expect(String(captured.editor.recoveredNotice ?? "")).toContain("1장");
  });

  /**
   * **세어 말한 장수가 실제로 넣은 장수와 같아야 한다.**
   *
   * 서버의 작업은 **그때의 구성안**으로 만들어졌다. 그 뒤 구성을 바꿨으면
   * 지금 없는 섹션이 섞여 온다. 그것까지 세어 「3장 되찾았습니다」라고 하면
   * 사용자는 없는 그림을 찾아 헤맨다.
   *
   * 이것이 `recoverableSections` 가 「지금 구성안에 없는 섹션」을 거르는 까닭이다
   * — 넣는 자리의 가드만으로는 **넣지 않으면서 세기만** 한다.
   */
  it("**지금 구성에 없는 섹션은 세지도 넣지도 않는다**", async () => {
    captured.job = 서버가들고있는것([
      { sectionId: 첫섹션.section_id, url: "https://signed/s1" },
      { sectionId: "지금은없는섹션", url: "https://signed/옛것" },
    ]);
    await savePdpDraft(빈장두개());

    await 띄운다();

    expect(String(섹션들()[0]!.generatedImage).startsWith("data:")).toBe(true);
    expect(섹션들()).toHaveLength(2);
    // 실제로 들어간 것은 한 장이다.
    expect(String(captured.editor.recoveredNotice ?? "")).toContain("1장");
  });

  it("**다 채워져 있으면 묻지도 않는다** — 초안을 열 때마다 질의가 늘면 안 된다", async () => {
    await savePdpDraft(초안([{ ...첫섹션, headline: "첫 장", generatedImage: "data:image/png;base64,있음" }]));

    await 띄운다();

    expect(captured.asked.filter((path) => path.includes("/pdp/jobs"))).toEqual([]);
  });

  /**
   * **작업이 없어도 화면이 멀쩡해야 한다.** 스위치가 꺼져 있으면 서버는 늘
   * 404 다. 그때 화면이 터지면 만들기 자체를 못 한다.
   */
  it("**작업이 없으면 아무 일도 없다**", async () => {
    captured.job = { ok: false, code: "NOT_FOUND" };
    await savePdpDraft(빈장두개());

    await 띄운다();

    expect(섹션들()[0]!.generatedImage).toBeUndefined();
    expect(섹션들()).toHaveLength(2);
  });

  /**
   * **알림은 그 작업의 것이다.**
   *
   * 되찾고 나서 새로 시작하면, 아무것도 안 되찾은 화면에 「2장을
   * 되찾았습니다」가 그대로 떠 있었다. 사용자는 없는 그림을 찾는다.
   */
  it("**새로 시작하면 되찾기 알림이 사라진다**", async () => {
    captured.job = 서버가들고있는것([{ sectionId: 첫섹션.section_id, url: "https://signed/s1" }]);
    await savePdpDraft(빈장두개());

    await 띄운다();
    expect(String(captured.editor.recoveredNotice ?? "")).toContain("되찾");

    await act(async () => { await captured.editor.onReset(); });
    await flush();

    // 새 작업으로 편집기에 다시 들어가도 앞 작업의 말이 없어야 한다.
    expect(String(captured.editor.recoveredNotice ?? "")).toBe("");
  });

  it("**되찾았으면 말한다** — 말없이 바꾸면 무엇이 달라졌는지 모른다", async () => {
    captured.job = 서버가들고있는것([{ sectionId: 첫섹션.section_id, url: "https://signed/s1" }]);
    await savePdpDraft(빈장두개());

    await 띄운다();

    const 알림 = String(captured.editor.recoveredNotice ?? "");
    expect(알림).toContain("되찾");
    // 사용자에게 보이는 말에 줄표를 안 쓴다.
    expect(알림).not.toContain("—");
  });
});
