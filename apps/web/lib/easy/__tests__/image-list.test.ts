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
let 읽은수 = 0;

vi.mock("../../poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async (id: string) => { 읽은수 += 1; return 작업들[id]; } },
    images: { byProjects: async () => { if (실패) throw new Error("db"); return 그림들; } },
  }),
}));
vi.mock("../cardnews-steps", () => ({
  cardnewsProjectIds: async (_userId: string, ids: readonly string[]) => new Set(ids.filter((id) => 카드뉴스.has(id))),
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
  읽은수 = 0;
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

  it("저장소가 실패해도 턴을 깨지 않는다 — 빈 사실", async () => {
    실패 = true;
    const facts = await loadEasyImages("me", [줄("i1", "p1", 일감("r1"), 5)], 지금);
    expect(facts).toMatchObject({ entries: [], madeImage: false });
  });
});
