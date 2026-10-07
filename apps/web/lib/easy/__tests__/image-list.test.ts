import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **이 대화의 결과물 사실**(2026-10-07 2차 D2). 번호마다 이미지 · 카드뉴스 · 지운 것, 이미지면 다 만들었나 ·
 * 만드는 중인가 · 못 만들었나와 그 줄에 보이는 그림. 판단 모델의 목록 · 고칠 번호 검증 · 이미지 보기가 쓴다.
 */
vi.mock("server-only", () => ({}));

type 그림 = { id: string; projectId: string; generationRequestId: string; selected: boolean; assetPath: string; thumbPath: string | null };
let 작업들: Record<string, { id: string; ratio: string; data: Record<string, unknown> }>;
let 그림들: 그림[];
let 카드뉴스: Set<string>;
let 실패 = false;
let 카드실패 = false;
let 읽은수 = 0;
let 읽는중 = 0;
let 가장많이 = 0;
let 읽은작업: string[] = [];
let 카드로물은것: string[] = [];

vi.mock("../../poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async (id: string) => {
        읽은수 += 1;
        읽은작업.push(id);
        읽는중 += 1;
        가장많이 = Math.max(가장많이, 읽는중);
        await Promise.resolve();
        읽는중 -= 1;
        if (id === "boom") throw new Error("잠깐 끊김");
        return 작업들[id];
      },
    },
    images: { byProjects: async () => { if (실패) throw new Error("db"); return 그림들; } },
  }),
}));
vi.mock("../cardnews-steps", () => ({
  cardnewsProjectIds: async (_userId: string, ids: readonly string[]) => {
    카드로물은것.push(...ids);
    return 카드실패 ? null : new Set(ids.filter((id) => 카드뉴스.has(id)));
  },
}));

const { loadEasyImages } = await import("../image-list");
const { withRowJob } = await import("../../../app/easy/row-image");

const 지금 = Date.parse("2026-10-07T12:00:00Z");
const 일감 = (r: string) => withRowJob("", { requestRowId: r, falRequestId: "f", endpoint: "e" });
const 줄 = (id: string, workId: string, body: string, 몇분전: number) =>
  ({ id, role: "image", body, workId, createdAt: new Date(지금 - 몇분전 * 60_000).toISOString() });

beforeEach(() => {
  작업들 = {
    p1: { id: "p1", ratio: "1:1", data: {} }, p2: { id: "p2", ratio: "1:1", data: {} }, p3: { id: "p3", ratio: "1:1", data: {} },
  };
  그림들 = [{ id: "img-1", projectId: "p1", generationRequestId: "r1", selected: false, assetPath: "me/1.png", thumbPath: null }];
  카드뉴스 = new Set(["card-1"]);
  실패 = false;
  카드실패 = false;
  읽은수 = 0;
  읽는중 = 0;
  가장많이 = 0;
  읽은작업 = [];
  카드로물은것 = [];
});

describe("이 대화의 결과물 사실", () => {
  it("결과물 줄이 없으면 저장소를 안 읽고 비어 있다", async () => {
    const facts = await loadEasyImages("me", [{ id: "u1", role: "user", body: "안녕", workId: null }], 지금);
    expect(facts).toMatchObject({ entries: [], madeImage: false, lastIsImage: false });
    expect(읽은수).toBe(0);
  });

  it("이미지는 다 만든 것 · 만드는 중 · 못 만듦, 그 밖은 카드뉴스 · 지운 것으로 가르고, 다 만든 번호의 그림을 든다", async () => {
    const rows = [
      { id: "u1", role: "user", body: "카페 포스터", workId: null },
      줄("i1", "p1", 일감("r1"), 30), 줄("i2", "p2", 일감("r2"), 1), 줄("i3", "p3", 일감("r3"), 20),
      줄("c1", "card-1", "", 15), 줄("i4", "gone", 일감("r4"), 40),
    ];
    const facts = await loadEasyImages("me", rows, 지금);
    expect(facts.entries.map((one) => [one.n, one.kind, one.state])).toEqual([
      [1, "image", "done"], [2, "image", "making"], [3, "image", "failed"], [4, "cardnews", "done"], [5, "deleted", "deleted"],
    ]);
    expect(facts.entries[0]!.words).toBe("카페 포스터");
    expect(facts.madeImage).toBe(true);
    expect(facts.pictures.get(1)?.id).toBe("img-1");
    expect(facts.pictures.has(2)).toBe(false);
  });

  /** Review Focus 4 · 6 — 2차 최종 리뷰 5 */
  it("지운 카드뉴스 앞에 있어도 이미지 번호가 안 바뀐다 — 표시 없는 옛 포스터 줄도 그 번호의 그림을 든다", async () => {
    카드뉴스 = new Set();
    const facts = await loadEasyImages("me", [줄("c1", "card-gone", "", 9), 줄("i1", "p1", "", 5)], 지금);
    expect(facts.entries.map((one) => [one.n, one.kind])).toEqual([[1, "deleted"], [2, "image"]]);
    expect(facts.pictures.get(2)?.id).toBe("img-1");
  });

  /** 2차 최종 리뷰 a — 만드는 중에 「글자 크게」면 「고칠 것이 없다」가 아니라 「아직 준비 안 됨」이어야 한다. */
  it("만드는 중 · 못 만든 이미지만 있어도 고칠 수 있는 이미지로 본다 — 지운 것만 있으면 아니다", async () => {
    그림들 = [];
    expect((await loadEasyImages("me", [줄("i2", "p2", 일감("r2"), 1)], 지금)).madeImage).toBe(true);
    expect((await loadEasyImages("me", [줄("i3", "p3", 일감("r3"), 20)], 지금)).madeImage).toBe(true);
    expect((await loadEasyImages("me", [줄("i4", "gone", 일감("r4"), 1)], 지금)).madeImage).toBe(false);
  });

  it("지운 것을 뺀 마지막 결과물이 카드뉴스면 lastIsImage 는 false, 이미지면 true", async () => {
    expect((await loadEasyImages("me", [줄("i1", "p1", 일감("r1"), 5), 줄("c1", "card-1", "", 1)], 지금)).lastIsImage).toBe(false);
    expect((await loadEasyImages("me", [줄("c1", "card-1", "", 9), 줄("i1", "p1", 일감("r1"), 5), 줄("i4", "gone", "", 1)], 지금)).lastIsImage)
      .toBe(true);
  });

  /** 리뷰 1차 수정 2 — 잠깐 못 읽은 것을 「지운 결과」로 말하면 사용자에게 거짓을 말한다. */
  it("포스터 작업을 못 읽으면 지운 것이 아니라 모름 — 고칠 수 있는 이미지에서도 빼지 않는다", async () => {
    그림들 = [];
    const facts = await loadEasyImages("me", [줄("i9", "boom", 일감("r9"), 5)], 지금);
    expect(facts.entries.map((one) => [one.n, one.kind, one.state])).toEqual([[1, "unknown", "unknown"]]);
    expect(facts.madeImage).toBe(true);
  });

  it("카드뉴스 저장소를 못 읽으면 포스터가 아닌 작업은 지운 것이 아니라 모름", async () => {
    카드실패 = true;
    const facts = await loadEasyImages("me", [줄("i1", "p1", 일감("r1"), 30), 줄("c1", "card-1", "", 15), 줄("x1", "gone", "", 9)], 지금);
    expect(facts.entries.map((one) => one.kind)).toEqual(["image", "unknown", "unknown"]);
  });

  /**
   * 최종 수정 7 — 통째로 못 읽으면 빈 사실이 아니라 번호마다 「모름」이다. 빈 사실이면 고치기 갈래가 빠져 「고쳐줘」가 새
   * 이미지 만들기로 새거나(값), 번호 단추가 「고칠 것이 없다」로 끝난다. 번호는 그대로다.
   */
  it("저장소가 실패해도 턴을 깨지 않는다 — 번호는 그대로, 모두 모름", async () => {
    실패 = true;
    const facts = await loadEasyImages("me", [줄("i1", "p1", 일감("r1"), 5), 줄("c1", "card-1", "", 1)], 지금);
    expect(facts.entries.map((one) => [one.n, one.kind, one.state])).toEqual([[1, "unknown", "unknown"], [2, "unknown", "unknown"]]);
    expect(facts).toMatchObject({ madeImage: true, lastIsImage: true });
    expect(facts.pictures.size).toBe(0);
  });
});

/**
 * 최종 수정 10(보안 리뷰) — 결과물이 아주 많은 대화도 한 턴에 저장소를 끝없이 읽지 않는다. 같은 작업은 한 번, 최근 100개
 * 작업만, 한꺼번에 몇 개씩만 읽는다. 오래된 것은 번호를 그대로 두고 「모름」이다(고치기 · 보기는 지금 확인할 수 없다고 답한다).
 */
describe("한 턴에 읽는 결과물 수 (최종 수정 10)", () => {
  const 많은줄 = (n: number) => Array.from({ length: n }, (_, at) => 줄(`i${at + 1}`, `w${at + 1}`, "", 60 - at / 10));

  it("최근 100개 작업만 읽고, 오래된 것은 번호 그대로 모름이다", async () => {
    const facts = await loadEasyImages("me", 많은줄(105), 지금);
    expect(facts.entries.map((one) => one.n)).toEqual(Array.from({ length: 105 }, (_, at) => at + 1));
    expect(facts.entries.slice(0, 5).map((one) => one.kind)).toEqual(Array(5).fill("unknown"));
    expect(facts.entries.slice(5).every((one) => one.kind === "deleted")).toBe(true);
    expect(읽은수).toBe(100);
    expect(읽은작업).not.toContain("w1");
    expect(카드로물은것).not.toContain("w5");
    expect(카드로물은것).toContain("w6");
  });

  it("같은 작업(고친 줄)은 한 번만 읽고, 한꺼번에 읽는 수를 묶는다", async () => {
    const rows = [...많은줄(30), 줄("e1", "w1", "", 1), 줄("e2", "w1", "", 1)];
    await loadEasyImages("me", rows, 지금);
    expect(읽은수).toBe(30);
    expect(가장많이).toBeLessThanOrEqual(10);
  });
});
