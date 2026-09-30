import { describe, expect, it } from "vitest";
import { runPhotoTurn, type PhotoTurnDeps } from "../photo-turn";

const 사진들 = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, url: `https://x.test/${i + 1}.png` }));

/** 읽은 것. 글로만 주면 사람도 글자도 없는 사진으로 친다. */
type 읽음 = string | { description: string; hasPeople: boolean; hasText: boolean };

function 가짜(판단: unknown, 설명: Record<string, 읽음> = {}) {
  const 읽은것들 = Object.fromEntries(Object.entries(설명).map(([id, one]) =>
    [id, typeof one === "string" ? { description: one, hasPeople: false, hasText: false } : one]));
  const 읽은것: string[][] = [];
  const 받은글: string[] = [];
  const deps: PhotoTurnDeps = {
    read: async (photos) => { 읽은것.push(photos.map((photo) => photo.id)); return 읽은것들; },
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

  /**
   * **사람이 주인공이고 글자 디자인이 없는 그림은 말이 없으면 묻는다**(설계 §2-4 표).
   * 2026-09-30 사용자 사진으로 잰 가족 일러스트가 세 번 중 두 번 분위기로 갔다 —
   * 읽기 설명이 매번 달라 모델이 흔들린다. 읽기가 따로 주는 두 값으로 못 박는다.
   */
  it("사람이 있고 글자 디자인이 없으면 말 없이 style 을 줘도 묻는다", async () => {
    const { deps } = 가짜(
      { photos: [{ number: 1, role: "style", said: false }], conflicting: false },
      { p1: { description: "사람 2명: 웃는 두 사람의 만화풍 그림", hasPeople: true, hasText: false } },
    );
    const 결과 = await runPhotoTurn({ ...기본, photos: 사진들(1) }, deps);

    expect(결과).toEqual({ kind: "ask", reason: "unclear", rows: [{ id: "p1", role: "unclear" }] });
  });

  it("사람이 나와도 글자 디자인이 있는 포스터는 판단대로 간다", async () => {
    const { deps } = 가짜(
      { photos: [{ number: 1, role: "style", said: false }], conflicting: false },
      { p1: { description: "사람 1명: 모델 · 큰 제목 VOLUME", hasPeople: true, hasText: true } },
    );
    expect((await runPhotoTurn({ ...기본, photos: 사진들(1) }, deps)).kind).toBe("go");
  });

  it("사람 사진이어도 말이 쓰임을 말했으면 그대로 간다", async () => {
    const { deps } = 가짜(
      { photos: [{ number: 1, role: "style", said: true }], conflicting: false },
      { p1: { description: "사람 1명: 얼굴", hasPeople: true, hasText: false } },
    );
    expect((await runPhotoTurn({ ...기본, words: "이 느낌으로", photos: 사진들(1) }, deps)).kind).toBe("go");
  });

  describe("지난 역할 (설계 §2-4 차례 3)", () => {
    /**
     * **지난 역할이 있어도 읽는다**(2026-09-30 두 번째 독립 리뷰). 안 읽으면 사진이
     * 둘 이상일 때 「제품 그대로 크게」가 어느 사진인지 판단이 못 가려, 바로잡으려는
     * 말이 무시되거나 엉뚱한 사진이 뒤집힌다.
     */
    it("지난 역할이 있는 사진도 읽고, 말이 없으면 그 역할로 간다", async () => {
      const { deps, 읽은것 } = 가짜({ photos: [{ number: 1, role: "unclear", said: false }], conflicting: false });
      const 결과 = await runPhotoTurn({ ...기본, words: "좀 더 밝게", photos: 사진들(1), previous: { p1: "preserve_product" } }, deps);

      expect(읽은것).toEqual([["p1"]]);
      expect(결과.kind === "go" && 결과.rows).toEqual([{ id: "p1", role: "preserve_product" }]);
    });

    it("이어 만드는 턴이면 판단에게 그 사실을 알린다 — 지난 역할 자체는 안 준다", async () => {
      const { deps, 받은글 } = 가짜({ photos: [], conflicting: false });
      await runPhotoTurn({ ...기본, words: "좀 더 밝게", photos: 사진들(1), previous: { p1: "preserve_product" } }, deps);

      expect(받은글[0]).toContain("이미 이미지를 만든 적이 있습니다");
      expect(받은글[0]).not.toContain("preserve_product 로 정해");
    });

    it("처음 만드는 턴에는 그 말을 안 붙인다", async () => {
      const { deps, 받은글 } = 가짜({ photos: [], conflicting: false });
      await runPhotoTurn({ ...기본, photos: 사진들(1) }, deps);

      expect(받은글[0]).not.toContain("이미 이미지를 만든 적이 있습니다");
    });

    it("말이 쓰임을 말하면 지난 역할을 덮는다", async () => {
      const { deps } = 가짜({ photos: [{ number: 1, role: "style", said: true }], conflicting: false });
      const 결과 = await runPhotoTurn({ ...기본, words: "이번엔 느낌만", photos: 사진들(1), previous: { p1: "preserve_product" } }, deps);

      expect(결과.kind === "go" && 결과.rows).toEqual([{ id: "p1", role: "style" }]);
    });
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
