import { describe, expect, it } from "vitest";
import { NOTHING_TO_EDIT, easyChatPrompt, readEasyDecision } from "../chat";
import { editRowBody } from "../row-image";

/**
 * **만든 이미지를 이어서 고친다** (2026-10-06 사용자 보고).
 *
 * 이미지를 만든 뒤 「로고를 바꿔줘」라고 하면 판단 모델은 매번 `revise` 를
 * 골랐다(claude-sonnet-5 실측 6/6). 고치기는 카드뉴스 원고에만 붙어 있어서
 * 원고가 없으면 **빈 답의 `talk`** 가 되었고, 화면에는 「무엇을 만들어
 * 드릴까요?」만 되풀이됐다.
 */

const 결정 = (wants: string) => ({ wants, reply: "", ratio: "", look: "", card: 0, note: "" });

describe("판단 지시", () => {
  it("만든 이미지가 있을 때만 image_edit 을 알려 준다", () => {
    expect(easyChatPrompt([], "로고 바꿔줘", 0, false, false, true)).toContain("image_edit");
    expect(easyChatPrompt([], "로고 바꿔줘")).not.toContain("image_edit");
  });

  it("이미지만 있고 원고가 없으면 revise 는 여전히 안 알려 준다", () => {
    expect(easyChatPrompt([], "로고 바꿔줘", 0, false, false, true)).not.toContain("revise");
  });

  it("image_edit 이면 reply 를 비우라고 한다", () => {
    expect(easyChatPrompt([], "로고 바꿔줘", 0, false, false, true)).toMatch(/`image_edit`[^\n]*reply/);
  });

  it("고친 줄의 표시는 모델에게 가지 않는다", () => {
    const prompt = easyChatPrompt(
      [{ id: "i1", role: "image", body: editRowBody("req-secret") }], "더 밝게", 0, false, false, true,
    );
    expect(prompt).not.toContain("req-secret");
  });
});

describe("판단 읽기", () => {
  it("고칠 이미지가 있으면 image_edit 을 받는다", () => {
    expect(readEasyDecision(결정("image_edit"), { editableImage: true }).wants).toBe("image_edit");
  });

  it("원고 없이 고치라고 하면(revise · card_text) 만든 이미지를 고친다 — 실제로 난 일", () => {
    expect(readEasyDecision(결정("revise"), { editableImage: true }).wants).toBe("image_edit");
    expect(readEasyDecision(결정("card_text"), { editableImage: true }).wants).toBe("image_edit");
  });

  it("원고가 있으면 revise 는 원고를 고친다 — 카드뉴스 쪽은 그대로", () => {
    expect(readEasyDecision(결정("revise"), { canRevise: true, editableImage: true }).wants).toBe("revise");
  });

  it("고칠 이미지가 없으면 image_edit 은 원고 고치기로, 원고도 없으면 안내로", () => {
    expect(readEasyDecision(결정("image_edit"), { canRevise: true }).wants).toBe("revise");
    const 안내 = readEasyDecision(결정("image_edit"));
    expect(안내.wants).toBe("talk");
    expect(안내.reply).toBe(NOTHING_TO_EDIT);
  });

  it("고칠 것이 아무것도 없으면 빈 답이 아니라 안내를 한다 — 같은 말 되풀이를 막는다", () => {
    for (const wants of ["revise", "card_text"]) {
      const 읽은것 = readEasyDecision(결정(wants));
      expect(읽은것.wants).toBe("talk");
      expect(읽은것.reply).toBe(NOTHING_TO_EDIT);
    }
  });

  /**
   * 2차 최종 리뷰 b — 2차부터는 모든 갈래에서 reply 를 쓴다. 바꿔 읽은 일에 처음 갈래로 쓴 글
   * (「원고를 고치겠습니다」)이 머리말로 나가면 안 된다. 다른 일하는 갈래로 바꿔 읽으면 reply 를 비운다.
   */
  it("다른 일하는 갈래로 바꿔 읽으면 처음 갈래로 쓴 reply 를 버린다", () => {
    const 원고고치기 = { ...결정("revise"), reply: "카드뉴스 원고를 고치겠습니다." };
    expect(readEasyDecision(원고고치기, { editableImage: true })).toMatchObject({ wants: "image_edit", reply: "" });
    const 이미지고치기 = { ...결정("image_edit"), reply: "배경을 바꾸겠습니다." };
    expect(readEasyDecision(이미지고치기, { canRevise: true })).toMatchObject({ wants: "revise", reply: "" });
    expect(readEasyDecision({ ...결정("image"), reply: "만들겠습니다." })).toMatchObject({ wants: "image", reply: "만들겠습니다." });
  });

  /** 2차 최종 리뷰 c — AI 가 표시 머리로 시작하는 글을 쓰면 그 말 줄이 머리말 · 물음으로 읽힌다. */
  it("AI 가 쓴 reply 의 표시 머리를 푼다", () => {
    expect(readEasyDecision({ ...결정("talk"), reply: "say:안녕하세요" }).reply).toBe("say：안녕하세요");
    expect(readEasyDecision({ ...결정("talk"), reply: "ask:ratio:\n어떤 모양?" }).reply).toBe("ask：ratio:\n어떤 모양?");
  });
});

describe("판단 틀", () => {
  it("이미지가 있을 때만 틀에 image_edit 이 있다 — 틀에 없으면 아무리 시켜도 안 온다", async () => {
    const { easyChatSpec } = await import("../../../lib/easy/chat-provider");
    const { easyAvailableWants } = await import("../chat");
    const 선택지 = (madeImage: boolean) =>
      (easyChatSpec(easyAvailableWants({ hasDraft: false, made: false, madeImage })).schema as {
        properties: { wants: { enum: string[] } };
      }).properties.wants.enum;
    expect(선택지(true)).toContain("image_edit");
    expect(선택지(false)).not.toContain("image_edit");
  });
});

/* ── 독립 리뷰 반영(2026-10-06) ── */
describe("카드뉴스 원고와 이미지가 함께 있는 대화", () => {
  it("마지막으로 만든 것이 이미지라고 알려 준다 — 콕 집지 않은 고치기는 그 이미지", () => {
    const prompt = easyChatPrompt([], "로고 바꿔줘", 0, true, false, true);
    expect(prompt).toContain("마지막으로 만든 것은 이미지 한 장");
    expect(prompt).toContain("image_edit");
    expect(prompt).toContain("revise");
  });

  it("원고만 있으면 그 말은 없다", () => {
    expect(easyChatPrompt([], "더 짧게", 0, true, false, false)).not.toContain("마지막으로 만든 것은 이미지");
  });
});
