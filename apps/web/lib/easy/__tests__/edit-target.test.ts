import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **고칠 번호 검증 — 줄 단위**(2026-10-07 2차 설계 D2 · §3-2). 고칠 수 있는 것은 이 대화에서
 * 만든, 지워지지 않은, 다 만들어진 포스터 이미지뿐이다. 결과물 번호는 카드뉴스 · 지운 결과도 함께
 * 세므로(2차 최종 리뷰 5) 그 번호면 값 없이 사실대로 답한다. 없는 번호 · 못 만듦도 같고, 만드는 중이면
 * 기다리라고 한다.
 */
vi.mock("server-only", () => ({}));

let 마지막: unknown;
// 진짜 모듈은 포스터 고치기 라우트까지 불러온다 — 여기서 쓰는 셋만 가짜로 준다.
vi.mock("../image-edit-turn", () => ({
  IMAGE_NOT_READY: "아직 만드는 중입니다.",
  lastEasyImage: async () => 마지막,
  projectTarget: async (_userId: string, projectId: string | undefined) =>
    (projectId ? { projectId, ratio: "1:1", keptIds: new Set<string>() } : null),
}));

const { NO_DONE_IMAGE, TARGET_BY_NUMBER, pickEditTarget, targetAskNumbers } = await import("../edit-target");
const { IMAGE_NOT_READY } = await import("../image-edit-turn");

type 항목 = {
  n: number; rowId: string; workId: string; fromRowId?: string; fromN?: number;
  kind: "image" | "cardnews" | "deleted" | "unknown"; state: "done" | "making" | "failed" | "deleted" | "unknown"; words: string;
};
const 목록: 항목[] = [
  { n: 1, rowId: "i1", workId: "p1", kind: "image", state: "done", words: "카페" },
  { n: 2, rowId: "i2", workId: "p2", kind: "image", state: "making", words: "배너" },
  { n: 3, rowId: "i3", workId: "p1", fromRowId: "i1", fromN: 1, kind: "image", state: "done", words: "배경" },
  { n: 4, rowId: "i4", workId: "gone", kind: "deleted", state: "deleted", words: "옛것" },
  { n: 5, rowId: "i5", workId: "p2", kind: "image", state: "failed", words: "실패" },
  { n: 6, rowId: "c6", workId: "card-1", kind: "cardnews", state: "done", words: "건강 카드뉴스" },
];
const 사실 = (entries: 항목[] = 목록) =>
  ({ entries, posters: new Set(["p1", "p2"]), pictures: new Map(), madeImage: true, lastIsImage: true });

beforeEach(() => { 마지막 = { projectId: "last", ratio: "1:1", keptIds: new Set() }; });

describe("고칠 번호 (2차 D2)", () => {
  /** Review Focus 4 — 같은 작업의 마지막 줄이 아니라 그 번호의 줄이다. */
  it("번호를 주면 그 줄을 고칠 대상으로 준다", async () => {
    expect(await pickEditTarget("me", [], 사실(), 1)).toMatchObject({ ok: true, target: { projectId: "p1" }, rowId: "i1", n: 1 });
    expect(await pickEditTarget("me", [], 사실(), 3)).toMatchObject({ ok: true, target: { projectId: "p1" }, rowId: "i3", n: 3 });
  });

  it("없는 번호 · 지운 결과 · 못 만든 이미지는 값 없이 사실대로 답한다", async () => {
    expect(await pickEditTarget("me", [], 사실(), 9))
      .toEqual({ ok: false, message: "9번은 이 대화에 없습니다. 고칠 수 있는 것은 이미지 1 · 이미지 3 입니다." });
    expect(await pickEditTarget("me", [], 사실(), 4)).toMatchObject({ ok: false, message: expect.stringContaining("지운 결과") });
    expect(await pickEditTarget("me", [], 사실(), 5)).toMatchObject({ ok: false, message: expect.stringContaining("만들지 못한") });
  });

  /** 2차 최종 리뷰 5 · Review Focus 4 — 결과물 번호는 카드뉴스도 센다. 그 번호를 이미지 고치기로 고치지 않는다. */
  it("카드뉴스 번호는 이미지 고치기로 안 고치고 값 없이 사실대로 답한다", async () => {
    const 답 = await pickEditTarget("me", [], 사실(), 6);
    expect(답).toMatchObject({ ok: false, message: expect.stringContaining("6번은 카드뉴스") });
    expect(답).toMatchObject({ message: expect.stringContaining("고칠 수 있는 것은 이미지 1 · 이미지 3 입니다.") });
  });

  it("만드는 중이면 기다리라고 한다", async () => {
    expect(await pickEditTarget("me", [], 사실(), 2)).toEqual({ ok: false, message: IMAGE_NOT_READY });
  });

  it("번호가 없으면 지금처럼 마지막 결과, 마지막이 카드뉴스면 이 대화의 마지막 이미지(지운 것 · 카드뉴스는 건너뜀)", async () => {
    expect(await pickEditTarget("me", [], 사실(), undefined)).toMatchObject({ ok: true, target: { projectId: "last" } });
    마지막 = null;
    expect(await pickEditTarget("me", [], 사실(), undefined)).toMatchObject({ ok: true, target: { projectId: "p2" } });
  });
});

/**
 * 리뷰 1차 수정 2 — 저장소를 못 읽은 결과물(`unknown`)은 지운 것도 이미지도 아니다. 그림이 있다고 보고 고치면
 * 다른 그림에 값이 나갈 수 있고, 지웠다고 말하면 거짓이다. 지금은 확인할 수 없다고만 답한다.
 */
describe("확인 못 한 결과물 (2차 D2 · 리뷰 1차 수정 2)", () => {
  const 모름: 항목 = { n: 7, rowId: "u7", workId: "p9", kind: "unknown", state: "unknown", words: "모름" };

  it("확인 못 한 번호면 값 없이 지금은 확인할 수 없다고 답한다", async () => {
    expect(await pickEditTarget("me", [], 사실([...목록, 모름]), 7))
      .toEqual({ ok: false, message: "지금은 결과물 7 을 확인할 수 없습니다. 잠시 뒤 다시 말씀해 주세요." });
  });

  it("번호 없이 고쳐 달라는데 마지막 결과물을 확인 못 했으면 앞의 이미지로 가지 않는다", async () => {
    expect(await pickEditTarget("me", [], 사실([...목록, 모름]), undefined))
      .toEqual({ ok: false, message: "지금은 결과물 7 을 확인할 수 없습니다. 잠시 뒤 다시 말씀해 주세요." });
  });

  it("확인 못 한 것 뒤에 지운 결과만 있어도 마지막 결과물은 확인 못 한 것이다", async () => {
    const 지움: 항목 = { n: 8, rowId: "g8", workId: "gone2", kind: "deleted", state: "deleted", words: "" };
    expect(await pickEditTarget("me", [], 사실([...목록, 모름, 지움]), undefined)).toMatchObject({ ok: false });
  });
});

/**
 * 후속 Task 2 — 최근 100개 밖이라 읽지 않은 결과물(`unreadOld`)은 기다려도 확인할 수 없다. 「잠시 뒤 다시」가 아니라
 * 오래되어 이 대화에서는 못 고친다고, 실제로 고칠 수 있는 곳(「다양하게」의 지난 작업 → 「이 장만 고치기」)을 말한다.
 */
describe("100개 밖의 옛 결과물 (후속 Task 2)", () => {
  const 옛것: 항목 = { n: 7, rowId: "u7", workId: "p9", kind: "unknown", state: "unknown", words: "옛것" };
  const 오래된사실 = (entries: 항목[]) => ({ ...사실(entries), unreadOld: new Set([7]) });
  const 오래됨 = "결과물 7 은 오래되어 이 대화에서는 고칠 수 없습니다. 지우지 않았다면 이미지는 「다양하게」 화면의 지난 작업에서 열어 「이 장만 고치기」로, 카드뉴스는 「카드뉴스」 화면의 지난 작업에서 열어 「다시 만들기」로 고쳐 주세요.";

  it("그 번호를 고쳐 달라면 값 없이 오래되었다고 사실대로 답한다", async () => {
    expect(await pickEditTarget("me", [], 오래된사실([...목록, 옛것]), 7)).toEqual({ ok: false, message: 오래됨 });
  });

  it("번호 없이 고쳐 달라는데 마지막 결과물이 그것이어도 같다", async () => {
    const 지움: 항목 = { n: 8, rowId: "g8", workId: "gone2", kind: "deleted", state: "deleted", words: "" };
    expect(await pickEditTarget("me", [], 오래된사실([...목록, 옛것, 지움]), undefined)).toEqual({ ok: false, message: 오래됨 });
  });

  it("오래된 번호가 아닌 못 읽은 번호는 지금처럼 「잠시 뒤 다시」다", async () => {
    const 모름: 항목 = { ...옛것, n: 8, rowId: "u8" };
    expect(await pickEditTarget("me", [], 오래된사실([...목록, 옛것, 모름]), 8))
      .toEqual({ ok: false, message: "지금은 결과물 8 을 확인할 수 없습니다. 잠시 뒤 다시 말씀해 주세요." });
  });
});

describe("어느 이미지인지 묻기 (2차 D2)", () => {
  it("판단 모델이 talk + ask_target 이고 다 만든 이미지가 둘 이상이면 그 번호들", () => {
    expect(targetAskNumbers({ wants: "talk", note: "ask_target" }, 사실())).toEqual([1, 3]);
  });

  it("다 만든 이미지가 하나뿐이거나 표시가 없으면 묻지 않는다 — 카드뉴스 번호는 세지 않는다", () => {
    expect(targetAskNumbers({ wants: "talk", note: "ask_target" }, 사실(목록.slice(0, 2)))).toBeUndefined();
    expect(targetAskNumbers({ wants: "talk", note: "ask_target" }, 사실([목록[0]!, 목록[5]!]))).toBeUndefined();
    expect(targetAskNumbers({ wants: "talk", note: "" }, 사실())).toBeUndefined();
    expect(targetAskNumbers({ wants: "image_edit", note: "ask_target" }, 사실())).toBeUndefined();
  });

  /** 컨트롤러 결정 3 — 번호 물음 뒤 번호 없는 고치기를 마지막 이미지로 몰래 떨어뜨리지 않는다. 다시 묻는다. */
  it("번호 물음 바로 뒤 번호 없는 image_edit 이면 다시 묻는다 — 번호가 있으면 안 묻는다", () => {
    expect(targetAskNumbers({ wants: "image_edit" }, 사실(), { afterTargetAsk: true })).toEqual([1, 3]);
    expect(targetAskNumbers({ wants: "image_edit", target: 3 }, 사실(), { afterTargetAsk: true })).toBeUndefined();
    expect(targetAskNumbers({ wants: "image_edit" }, 사실())).toBeUndefined();
    expect(targetAskNumbers({ wants: "image" }, 사실(), { afterTargetAsk: true })).toBeUndefined();
  });
});

/**
 * Task 8 고침 2 — 번호 물음에 번호 없이 답했는데 다 만든 이미지가 둘이 안 되면(그 사이 지움 · 만드는 중) 다시 묻지
 * 않는다. 다 만든 것이 하나면 **그 줄**을 고친다 — 「마지막 이미지」는 만드는 중 · 못 만든 것일 수 있다. 하나도 없으면
 * 값 없이 사실대로 답한다.
 */
describe("번호 물음 뒤 번호 없는 고치기 (Task 8 고침 2)", () => {
  it("다 만든 이미지가 하나면 마지막 결과가 아니라 그 줄을 고친다", async () => {
    expect(await pickEditTarget("me", [], 사실([목록[0]!, 목록[1]!]), undefined, { afterTargetAsk: true }))
      .toMatchObject({ ok: true, target: { projectId: "p1" }, rowId: "i1", n: 1 });
  });

  it("다 만든 이미지가 없으면 값 없이 사실대로 답한다", async () => {
    expect(await pickEditTarget("me", [], 사실([목록[1]!, 목록[4]!]), undefined, { afterTargetAsk: true }))
      .toEqual({ ok: false, message: NO_DONE_IMAGE });
  });

  it("다 만든 것이 둘 이상이면 아무것도 고르지 않고 번호로 말해 달라고 한다", async () => {
    expect(await pickEditTarget("me", [], 사실(), undefined, { afterTargetAsk: true }))
      .toEqual({ ok: false, message: TARGET_BY_NUMBER });
  });

  it("번호 물음 뒤가 아니면 예전처럼 마지막 결과다", async () => {
    expect(await pickEditTarget("me", [], 사실([목록[0]!, 목록[1]!]), undefined)).toMatchObject({ ok: true, target: { projectId: "last" } });
  });
});
