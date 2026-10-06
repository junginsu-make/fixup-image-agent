import { describe, expect, it, vi } from "vitest";
import { judgeEasyTurn } from "../judge";

/**
 * **한 턴의 판단**(2026-10-06 설계 A1 · A3).
 *
 * `talk` 인데 답이 빈 채로 오면 「무엇을 만들어 드릴까요?」가 되풀이됐다. 한 번 더 묻고,
 * 그래도 비면 그때만 기본 문장이다(기본 문장은 라우트가 쓴다).
 */
const 결정 = (over: Record<string, unknown> = {}) =>
  ({ wants: "talk", reply: "", ratio: "", look: "", card: 0, note: "", ...over });
const 없음 = { hasDraft: false, made: false, madeImage: false };

function 판단기(...answers: unknown[]) {
  return vi.fn(async (_prompt: string, _wants: readonly string[]) => answers.shift());
}
const 묻는다 = (decide: ReturnType<typeof 판단기>, over: Partial<Parameters<typeof judgeEasyTurn>[0]> = {}) =>
  judgeEasyTurn({ decide, history: [], prompt: "안녕", attachmentCount: 0, choices: 없음, ...over });

describe("선택지 (A1)", () => {
  it("만든 것이 없으면 고치기 갈래를 선택지에 안 넣는다", async () => {
    const decide = 판단기(결정({ wants: "image" }));
    await 묻는다(decide);
    expect(decide.mock.calls[0]![1]).not.toContain("image_edit");
    expect(decide.mock.calls[0]![1]).not.toContain("revise");
  });

  it("이미지가 있으면 image_edit 을 넣고 그대로 받는다", async () => {
    const decide = 판단기(결정({ wants: "image_edit" }));
    expect((await 묻는다(decide, { choices: { ...없음, madeImage: true } })).wants).toBe("image_edit");
    expect(decide.mock.calls[0]![1]).toContain("image_edit");
  });
});

describe("빈 답이면 한 번 더 묻는다 (A3)", () => {
  it("talk 인데 답이 비면 다시 묻고, 그 답을 쓴다", async () => {
    const decide = 판단기(결정(), 결정({ reply: "네, 무엇을 만들까요? 예: 「카페 포스터 만들어줘」" }));
    const 읽은것 = await 묻는다(decide);
    expect(decide).toHaveBeenCalledTimes(2);
    expect(decide.mock.calls[1]![0]).toContain("reply 에 꼭 답을 쓰세요");
    expect(읽은것).toMatchObject({ wants: "talk", reply: "네, 무엇을 만들까요? 예: 「카페 포스터 만들어줘」" });
  });

  it("다시 물어도 비면 빈 답 그대로 돌려준다 — 기본 문장은 라우트가 쓴다", async () => {
    const decide = 판단기(결정(), 결정());
    expect(await 묻는다(decide)).toMatchObject({ wants: "talk", reply: "" });
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("다시 물었는데 다른 갈래가 오면 처음 답을 쓴다 — 값이 드는 갈래로 몰래 바뀌지 않는다", async () => {
    const decide = 판단기(결정(), 결정({ wants: "image" }));
    expect(await 묻는다(decide)).toMatchObject({ wants: "talk", reply: "" });
  });

  it("답이 있으면 한 번만 묻는다", async () => {
    const decide = 판단기(결정({ reply: "안녕하세요!" }));
    await 묻는다(decide);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  /** Review Focus 2 — 원래 답이 빈 갈래에서 다시 물으면 턴마다 값이 두 번 나간다. */
  it("말로 끝나지 않는 갈래(상세페이지 · 이미지)는 답이 비어도 다시 묻지 않는다", async () => {
    for (const wants of ["detail_page", "image"]) {
      const decide = 판단기(결정({ wants }));
      await 묻는다(decide);
      expect(decide).toHaveBeenCalledTimes(1);
    }
  });

  /**
   * 최종 리뷰(2026-10-06): 단추로 갈래를 골랐으면 라우트가 판단의 갈래를 버린다(A2).
   * 그때 다시 물으면 버릴 답에 값만 한 번 더 나간다.
   */
  it("갈래를 단추로 골랐으면 talk 답이 비어도 다시 묻지 않는다", async () => {
    const decide = 판단기(결정());
    expect(await 묻는다(decide, { kindPicked: true })).toMatchObject({ wants: "talk", reply: "" });
    expect(decide).toHaveBeenCalledTimes(1);
  });
});
