import { describe, expect, it } from "vitest";
import { runPhotoTurn, type PhotoTurnDeps } from "../photo-turn";

const 사진들 = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, url: `https://x.test/${i + 1}.png` }));

function 가짜(판단: unknown, 설명: Record<string, string> = {}) {
  const 읽은것: string[][] = [];
  const 받은글: string[] = [];
  const deps: PhotoTurnDeps = {
    read: async (photos) => { 읽은것.push(photos.map((photo) => photo.id)); return 설명; },
    judge: async (prompt) => { 받은글.push(prompt); return 판단; },
  };
  return { deps, 읽은것, 받은글 };
}

const 기본 = { words: "카페 포스터", chosen: {}, ratio: "1:1", imageModel: "gpt-image-2.5-flare" };

describe("그림 턴 (설계 §2-3)", () => {
  it("장수가 넘치면 읽지도 묻지도 않고 멈춘다", async () => {
    const { deps, 읽은것, 받은글 } = 가짜({});
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(8), imageModel: "nano-banana" }, deps);

    expect(결과.kind).toBe("stop");
    expect(읽은것).toEqual([]);
    expect(받은글).toEqual([]);
  });

  it("단추로 고른 사진은 읽지 않는다", async () => {
    const { deps, 읽은것 } = 가짜({ photos: [{ number: 2, role: "style", said: false }], conflicting: false });
    await runPhotoTurn({ ...기본, photos: 사진들(2), chosen: { p1: "preserve_product" } }, deps);

    expect(읽은것).toEqual([["p2"]]);
  });

  it("모두 골랐으면 읽기를 통째로 건너뛰고 판단은 말만 본다", async () => {
    const { deps, 읽은것, 받은글 } = 가짜({ photos: [], conflicting: false });
    await runPhotoTurn({ ...기본, photos: 사진들(1), chosen: { p1: "style" } }, deps);

    expect(읽은것).toEqual([]);
    expect(받은글[0]).toMatch(/1번: \(설명 없음/);
  });

  it("판단 모델에는 id 가 아니라 번호와 설명을 준다", async () => {
    const { deps, 받은글 } = 가짜({ photos: [], conflicting: false }, { p1: "원두 봉투" });
    await runPhotoTurn({ ...기본, photos: 사진들(1) }, deps);

    expect(받은글[0]).toContain("1번: 원두 봉투");
    expect(받은글[0]).not.toContain("p1");
  });

  /** Review Focus 3 — 읽기가 전부 실패해도 분위기로 떨어지지 않는다. */
  it("읽기가 전부 실패하고 판단이 비면 묻는다", async () => {
    const { deps } = 가짜({});
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(2) }, deps);

    expect(결과).toEqual({ kind: "ask", reason: "unclear", rows: [{ id: "p1", role: "unclear" }, { id: "p2", role: "unclear" }] });
  });

  /**
   * **설명 없는 사진이 분위기로 떨어지는 것을 코드가 막는다**(설계 §2-3, 독립 리뷰).
   * 프롬프트 한 문장에만 기대면 모델이 `style` 을 줄 때 제품이 다시 그려진다.
   */
  it("설명 없는 사진에 판단이 말 없이 style 을 줘도 묻는다", async () => {
    const { deps } = 가짜({ photos: [{ number: 1, role: "style", said: false }], conflicting: false });
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(1) }, deps);

    expect(결과).toEqual({ kind: "ask", reason: "unclear", rows: [{ id: "p1", role: "unclear" }] });
  });

  it("설명이 없어도 말이 쓰임을 말했으면 그대로 간다", async () => {
    const { deps } = 가짜({ photos: [{ number: 1, role: "style", said: true }], conflicting: false });
    const 결과 = await runPhotoTurn({ ...기본, words: "이 느낌으로", photos: 사진들(1) }, deps);

    expect(결과.kind).toBe("go");
  });

  it("설명이 있는 사진의 판단은 건드리지 않는다", async () => {
    const { deps } = 가짜({ photos: [{ number: 1, role: "style", said: false }], conflicting: false }, { p1: "포스터" });
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(1) }, deps);

    expect(결과.kind).toBe("go");
  });

  it("인물 역할이 둘이면 한 장만 되도록 묻는다", async () => {
    const { deps } = 가짜({
      photos: [{ number: 1, role: "preserve_person", said: true }, { number: 2, role: "preserve_person", said: true }],
      conflicting: false,
    });
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(2) }, deps);

    expect(결과.kind === "ask" && 결과.reason).toBe("people");
  });

  it("다 정해지면 칸과 말을 돌려준다", async () => {
    const { deps } = 가짜({
      photos: [{ number: 1, role: "preserve_product", said: true }, { number: 2, role: "style", said: false }],
      conflicting: false,
    }, { p1: "원두 봉투", p2: "카페 포스터" });
    const 결과 = await runPhotoTurn({ ...기본, words: "1번 제품 그대로", photos: 사진들(2) }, deps);

    expect(결과).toEqual({
      kind: "go",
      rows: [{ id: "p1", role: "preserve_product" }, { id: "p2", role: "style" }],
      fields: { referenceIds: ["p2"], preservedIds: ["p1"], personIds: [], restyledIds: [], attachmentOrder: ["p1", "p2"] },
      attachmentIntent: "1번 제품 그대로",
    });
  });

  it("판단이 실패하면 그대로 던진다 — 라우트가 받는다", async () => {
    const deps: PhotoTurnDeps = { read: async () => ({}), judge: async () => { throw new Error("판단 실패"); } };
    await expect(runPhotoTurn({ ...기본, photos: 사진들(1) }, deps)).rejects.toThrow("판단 실패");
  });
});
