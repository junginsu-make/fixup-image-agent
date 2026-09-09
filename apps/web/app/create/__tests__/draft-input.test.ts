import { describe, expect, it } from "vitest";
import { buildDraftInput } from "../draft-input";
import type { DraftInputState } from "../draft-input";

/**
 * 초안에서 한 칸이 빠지면 조용히 잃는다.
 *
 * 실제로 겪었다 — 첨부 자리별 지시를 안 담아서, 다른 작업을 불러오면 앞 제품에
 * 대해 적은 말이 새 제품에 붙고 그 제품의 보호 문구가 빠졌다. 독립 리뷰가
 * 잡기 전까지 시험 1,885건이 전부 통과하고 있었다.
 */

const editorState = { notice: "편집기 알림" } as never;

const 상태: DraftInputState = {
  id: "d1",
  createdAt: "2026-09-09T00:00:00.000Z",
  appState: "editor",
  preparedImage: { base64: "PRODUCT" } as never,
  modelImage: { base64: "PERSON" } as never,
  modelImageUsage: "hero-only",
  result: { originalImage: "PRODUCT" } as never,
  additionalInfo: "추가 정보",
  sellerBrief: { audience: "30대" } as never,
  copyIntensity: "strong",
  gapPolicy: "omit",
  desiredTone: "프리미엄",
  look: "anime",
  userInstruction: "밤 장면으로",
  attachmentIntents: { anchor: "라벨 그대로", style: "색만 가져와" },
  styleReference: { id: "r1", name: "레퍼런스", imageBase64: "REF", mimeType: "image/png", description: "서술", reason: "" },
  styleReferenceEnabled: false,
  aspectRatio: "9:16",
  notice: "화면 알림",
  editorDraftState: editorState,
  defaultEditorState: () => ({ notice: "기본값" }) as never,
};

describe("담아야 할 칸이 하나도 안 빠진다", () => {
  const draft = buildDraftInput(상태, true)!;

  it("첨부 자리별 지시", () => {
    expect(draft.attachmentIntents).toEqual({ anchor: "라벨 그대로", style: "색만 가져와" });
  });

  it("디자인 레퍼런스와 그 토글 — 지시와 짝이 맞아야 한다", () => {
    expect(draft.styleReference?.imageBase64).toBe("REF");
    expect(draft.styleReferenceEnabled).toBe(false);
  });

  it("그림 둘과 인물 쓰임", () => {
    expect(draft.preparedImage).toEqual({ base64: "PRODUCT" });
    expect(draft.modelImage).toEqual({ base64: "PERSON" });
    expect(draft.modelImageUsage).toBe("hero-only");
  });

  it("글로 적은 것들", () => {
    expect(draft.additionalInfo).toBe("추가 정보");
    expect(draft.desiredTone).toBe("프리미엄");
    expect(draft.userInstruction).toBe("밤 장면으로");
    expect(draft.sellerBrief).toEqual({ audience: "30대" });
  });

  it("설정들", () => {
    expect(draft.look).toBe("anime");
    expect(draft.aspectRatio).toBe("9:16");
    expect(draft.copyIntensity).toBe("strong");
    expect(draft.gapPolicy).toBe("omit");
  });

  it("식별자", () => {
    expect(draft.id).toBe("d1");
    expect(draft.createdAt).toBe("2026-09-09T00:00:00.000Z");
  });

  /**
   * 새 칸이 늘 때 조용히 사라지는 것을 막는 시험이다. 담는 칸의 개수를 못 박아
   * 두면, 상태에 칸을 더하고 여기 안 담으면 이 시험이 깨진다.
   */
  it("담는 칸의 개수가 정해져 있다", () => {
    expect(Object.keys(draft).sort()).toEqual(
      [
        "additionalInfo",
        "appState",
        "aspectRatio",
        "attachmentIntents",
        "copyIntensity",
        "createdAt",
        "desiredTone",
        "editorState",
        "gapPolicy",
        "id",
        "look",
        "modelImage",
        "modelImageUsage",
        "notice",
        "preparedImage",
        "result",
        "sellerBrief",
        "styleReference",
        "styleReferenceEnabled",
        "userInstruction",
      ].sort(),
    );
  });
});

describe("단계와 알림", () => {
  it("분석 중에 저장하면 업로드 단계로 되돌린다 — 되불렀을 때 갇히지 않게", () => {
    const draft = buildDraftInput({ ...상태, appState: "processing", result: null }, true)!;
    expect(draft.appState).toBe("upload");
  });

  it("되살릴 단계가 아니면 결과가 있을 때 편집기로 연다", () => {
    const draft = buildDraftInput({ ...상태, appState: "upload" }, true)!;
    expect(draft.appState).toBe("editor");
  });

  it("**시나리오를 보던 중이면 그 단계를 지킨다**", () => {
    // 시나리오 화면에도 결과는 이미 있다. 결과만 보고 편집기로 적으면 자동
    // 저장이 도는 순간 그 단계가 사라지고, 되불렀을 때 시나리오 화면에만 있는
    // 심사 지적이 통째로 안 보였다.
    const draft = buildDraftInput({ ...상태, appState: "scenario" }, true)!;
    expect(draft.appState).toBe("scenario");
  });

  it("편집기 알림이 화면 알림보다 앞선다", () => {
    expect(buildDraftInput(상태, true)!.notice).toBe("편집기 알림");
  });

  it("편집기 알림이 없으면 화면 알림을 쓴다", () => {
    const draft = buildDraftInput({ ...상태, editorDraftState: null }, true)!;
    expect(draft.notice).toBe("화면 알림");
  });
});

describe("편집기 상태", () => {
  it("결과가 없으면 안 담는다", () => {
    expect(buildDraftInput({ ...상태, result: null }, true)!.editorState).toBeNull();
  });

  it("결과가 있는데 상태가 없으면 기본값을 만든다", () => {
    const draft = buildDraftInput({ ...상태, editorDraftState: null }, true)!;
    expect(draft.editorState).toEqual({ notice: "기본값" });
  });
});

describe("담을 것이 없으면", () => {
  it("빈 초안을 만들지 않는다", () => {
    expect(buildDraftInput(상태, false)).toBeNull();
  });
});
