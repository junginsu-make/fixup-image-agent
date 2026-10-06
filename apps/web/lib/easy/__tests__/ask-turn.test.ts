import { describe, expect, it } from "vitest";
import { askTurn, type AskTurnContext } from "../ask-turn";
import { readAsk, withPick } from "../../../app/easy/row-marks";

/**
 * **물음도 대화에 남긴다**(2026-10-07 2차 설계 D1). 사용자 줄 + 물음 줄 두 줄이다. 값도 예약도 없다.
 */
function 맥락(over: Partial<AskTurnContext> = {}) {
  const 남긴줄: Array<{ role: string; body?: string }> = [];
  const 이름: string[] = [];
  const ctx: AskTurnContext = {
    store: {
      appendMessage: async (row) => {
        남긴줄.push(row);
        return { id: `m${남긴줄.length}`, conversationId: row.conversationId, role: row.role, body: row.body ?? "", workId: null, createdAt: "" };
      },
      renameConversation: async (_id, title) => { 이름.push(title); },
    },
    conversation: { title: "" }, conversationId: "c1", prompt: "바다 포스터", userBody: "바다 포스터", textModel: "m", cont: false,
    ...over,
  };
  return { ctx, 남긴줄, 이름 };
}

describe("물음 턴 (2차 D1)", () => {
  it("사용자 줄 · 물음 줄을 차례로 남기고 물음 줄을 돌려준다", async () => {
    const { ctx, 남긴줄, 이름 } = 맥락();
    const json = await (await askTurn(ctx, { kind: "ratio", text: "어떤 모양?", data: { wants: "image" } }, { asked: true })).json();
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "ratio", data: { wants: "image" }, text: "어떤 모양?" });
    expect(json).toMatchObject({ ok: true, ask: { kind: "ratio" }, asked: true, message: { id: "m2" }, userMessage: { id: "m1" }, textModel: "m" });
    expect(이름).toEqual(["바다 포스터"]);
  });

  it("앞 물음의 답이었으면 물음 줄에 cont 를 적는다 — 다음 답이 사슬을 잇는다", async () => {
    const { ctx, 남긴줄 } = 맥락({ cont: true });
    await askTurn(ctx, { kind: "photo", text: "사진을 어떻게 쓸지 알려 주세요.", data: { ids: ["p1"] } });
    expect(readAsk(남긴줄[1] as never)?.data).toEqual({ cont: true, ids: ["p1"] });
  });

  it("단추 답이면 고른 값이 붙은 글을 사용자 줄에 남기고, 제목이 있으면 안 바꾼다", async () => {
    const { ctx, 남긴줄, 이름 } = 맥락({ prompt: "이미지 한 장", userBody: withPick("이미지 한 장", { kind: "image" }), conversation: { title: "있음" } });
    await askTurn(ctx, { kind: "ratio", text: "어떤 모양?" });
    expect(남긴줄[0]!.body).toBe(withPick("이미지 한 장", { kind: "image" }));
    expect(이름).toEqual([]);
  });
});
