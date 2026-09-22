import { readFileSync } from "node:fs";
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deletePdpDraft, getPdpDraft, savePdpDraft, preservePdpDraft, purgeExpiredPdpDrafts, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";

const ids: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await Promise.all(ids.splice(0).map(deletePdpDraft)); });

function fixture(): PdpDraftInput {
  const section = { ...createSectionFor([]), headline: "원고", generatedImage: "data:image/png;base64,AAAA" };
  const blueprint = { executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [section] };
  return {
    id: `roundtrip-${crypto.randomUUID()}`,
    appState: "scenario", preparedImage: null, modelImage: null, modelImageUsage: null,
    result: { originalImage: "AAAA", blueprint }, additionalInfo: "배경", desiredTone: "모던",
    look: "auto", userInstruction: "왼쪽 배치", aspectRatio: "3:4", notice: "알림",
    sellerBrief: { audience: "고객", emphasis: "필수 문구" }, copyIntensity: "strong", gapPolicy: "ask",
    attachmentIntents: { anchor: "제품은 그대로", style: "색만 참고" },
    styleReference: { id: "style-1", name: "참조", imageBase64: "BBBB", mimeType: "image/png", description: "파랑", reason: "선택" },
    styleReferenceEnabled: false,
    imageModel: "nano-banana", characterId: "character-1", characterAngles: ["front", "back"],
    preserveProduct: false, startMode: "text", analyzedBlueprint: blueprint,
    textDraft: { stage: "keyVisual", text: "작성 중인 원문", brief: null, blueprint, originalBlueprint: blueprint,
      imageModel: "nano-banana", keyVisual: { base64: "CCCC", mimeType: "image/png" },
      copyIntensity: "strong", gapPolicy: "ask", preserveProduct: false, characterId: "character-1",
      characterAngles: ["front"], styleReferenceEnabled: false },
    editorState: { currentSectionIndex: 0, sections: [section], sectionKeys: ["S1"], sectionOptions: {},
      overlaysBySection: { S1: [{ id: "shape", kind: "shape", x: 5, y: 9, width: 100, height: 30, fillColor: "#fff", fillOpacity: 1, borderRadius: 0 }] },
      defaultCopyLanguage: "ko", notice: "편집됨", workbenchTab: "image",
      workbenchState: { x: 1, y: 2, width: 200, height: 200, isOpen: true } },
  } as PdpDraftInput;
}

describe("T-SAVE: 화면 입력부터 IndexedDB 왕복", () => {
  it("지금 여는 초안은 오래됐어도 이관 전에 만료 삭제하지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    const input = fixture(); ids.push(input.id!); await savePdpDraft(input);
    await purgeExpiredPdpDrafts(new Date("2026-09-17T00:00:00Z"), [input.id!]);
    expect(await getPdpDraft(input.id!)).not.toBeNull();
  });
  it("구성안의 공통 디자인과 제품 판독도 이관 전에 보존한다", async () => {
    const input = fixture(); ids.push(input.id!);
    input.result!.blueprint.designSystem = { headlineFont: "굵게", bodyFont: "보통", palette: ["파랑"], cast: "없음" };
    await savePdpDraft(input);
    expect((await getPdpDraft(input.id!))?.result?.blueprint.designSystem).toEqual(input.result!.blueprint.designSystem);
  });
  it("참조·지시·꺼진 토글과 이미지·레이어를 보존한다", async () => {
    const input = fixture(); ids.push(input.id!);
    await savePdpDraft(input);
    const restored = await getPdpDraft(input.id!);
    expect(restored).toMatchObject({ attachmentIntents: input.attachmentIntents,
      styleReference: input.styleReference, styleReferenceEnabled: false,
      editorState: { sections: input.editorState!.sections, overlaysBySection: input.editorState!.overlaysBySection } });
  });
  it("모델·캐릭터·각도·제품 보존과 텍스트 중간 상태를 보존한다", async () => {
    const input = fixture(); ids.push(input.id!);
    await savePdpDraft(input);
    expect(await getPdpDraft(input.id!)).toMatchObject({ imageModel: "nano-banana", characterId: "character-1",
      characterAngles: ["front", "back"], preserveProduct: false, startMode: "text",
      analyzedBlueprint: input.result!.blueprint,
      textDraft: { stage: "keyVisual", text: "작성 중인 원문", keyVisual: { base64: "CCCC" } } });
  });
  it("쓰기 실패가 나면 기존 초안을 덮지 않고 오류를 돌려준다", async () => {
    const input = fixture(); ids.push(input.id!); await savePdpDraft(input);
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    await expect(savePdpDraft({ ...input, userInstruction: "잃으면 안 되는 수정" })).rejects.toThrow("full");
    expect((await getPdpDraft(input.id!))?.userInstruction).toBe("왼쪽 배치");
  });
  it("다시 만들기 전 사본은 원본 초안을 덮어도 이미지와 레이어를 보관한다", async () => {
    const input = fixture(); ids.push(input.id!); await savePdpDraft(input);
    const backup = await preservePdpDraft(input); ids.push(backup.id);
    await savePdpDraft({ ...input, result: null, editorState: null });
    const restored = await getPdpDraft(backup.id);
    expect(restored?.title).toContain("보관");
    expect(restored?.editorState?.sections[0].generatedImage).toBe("data:image/png;base64,AAAA");
    expect(restored?.editorState?.overlaysBySection.S1).toEqual(input.editorState!.overlaysBySection.S1);
  });
});

/**
 * **결과에 새로 붙은 것이 재적재에서 사라지지 않는다.**
 *
 * `normalizeGeneratedResult` 는 필드를 하나씩 나열한다. 새 필드가 생길 때마다
 * 그 목록에 넣지 않으면 조용히 버려진다 — 심사 결과(`review`)로 한 번 겪었고,
 * 같은 주 `normalizeSection` 의 근거(`evidence`)로 또 겪었다.
 */
describe("T-SAVE: 판독 상태도 왕복에서 살아남는다", () => {
  it("**초안을 다시 열어도 「제품을 읽지 못했다」가 남는다**", async () => {
    const input = fixture();
    ids.push(input.id!);
    input.result = { ...input.result!, productReadingStatus: "unfounded" };

    await savePdpDraft(input);
    const 되살린것 = await getPdpDraft(input.id!);

    // 사라지면 근거 없는 카피가 확인된 것처럼 보인다.
    expect(되살린것?.result?.productReadingStatus).toBe("unfounded");
  });

  it("없던 초안은 없는 채로 둔다", async () => {
    const input = fixture();
    ids.push(input.id!);

    await savePdpDraft(input);

    expect((await getPdpDraft(input.id!))?.result?.productReadingStatus).toBeUndefined();
  });
});

/**
 * **상품 종류와 목적이 초안 복원에서 사라졌다**(N-8, 설계 §6.3·§9.1).
 *
 * 설계 §9.1: 「이미지/텍스트는 입력 방식이다. 실물/서비스/디지털/기타와
 * 판매/문의/홍보 목적은 **별도로 받는다**」.
 * 설계 §6.3 표: 두 값의 기획 입력 범위가 「전체」다.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 *
 * `TextModeFlow` 는 두 값을 `useState(기본값)` 으로만 들고 있었다. 바로 옆
 * 줄들은 전부 `initialDraft?.X` 를 읽는데 이 둘만 빠져 있었다.
 *
 * 「실물 / 문의」를 골라 저장한 뒤 그 작업을 다시 열어 재기획하면, 화면
 * 버튼이 기본값으로 돌아간 채 서버로 간다 — **「기타 / 판매」로 조용히
 * 바뀐다.** K-08 이 고치려던 바로 그 증상이다.
 *
 * 개념 시안 판단(N-2)도 상품 종류를 보므로, 이 값이 사라지면 **사진 없이
 * 실물을 파는 경고도 함께 사라진다.**
 */
describe("상품 종류와 목적이 초안을 따라다닌다", () => {
  /**
   * **화면이 그 값을 읽고 쓰는가.**
   *
   * 저장소는 `textDraft` 를 통째로 넘기므로 저장 자체는 처음부터 됐다.
   * 빠진 것은 **화면이 안 읽고 안 쓰는 것**이었다 — 그러니 여기서 재야 한다.
   */
  it("**초안에 담는 칸과 화면이 읽는 칸이 같은 이름이다**", () => {
    const flow = readFileSync(new URL("../TextModeFlow.tsx", import.meta.url), "utf8");

    // 읽기: `initialDraft?.productKind` 가 있어야 다시 열 때 살아난다.
    expect(flow).toContain("initialDraft?.productKind");
    expect(flow).toContain("initialDraft?.pageGoal");
    // 쓰기: 저장 몸통에 실려야 다음에 읽을 것이 있다.
    const 저장 = flow.slice(flow.indexOf("onDraftChange?.({"), flow.indexOf("}, [onDraftChange"));
    expect(저장).toContain("productKind");
    expect(저장).toContain("pageGoal");
  });

  it("**저장하고 불러오면 그대로다**", async () => {
    const saved = await savePdpDraft({
      ...fixture(),
      textDraft: {
        stage: "input", text: "나무 도마를 팝니다", brief: null,
        blueprint: null, originalBlueprint: null,
        styleReferenceEnabled: true, preserveProduct: true, characterAngles: [],
        keyVisual: null, imageModel: "nano-banana", copyIntensity: "normal", gapPolicy: "ask",
        productKind: "physical", pageGoal: "inquiry",
      } as never,
    });

    const restored = await getPdpDraft(saved.id);

    expect(restored?.textDraft?.productKind).toBe("physical");
    expect(restored?.textDraft?.pageGoal).toBe("inquiry");
  });

  /**
   * **옛 초안에는 이 칸이 없다.** 없는 것을 기본값으로 채우되, 그 기본값이
   * 무엇인지는 코어 한 곳에서만 정한다.
   */
  it("**옛 초안은 빈 채로 와도 안 터진다**", async () => {
    const saved = await savePdpDraft({
      ...fixture(),
      textDraft: { stage: "input", text: "옛 초안", keyVisual: null } as never,
    });

    const restored = await getPdpDraft(saved.id);

    expect(restored?.textDraft).toBeTruthy();
    expect(restored?.textDraft?.productKind).toBeUndefined();
  });
});
