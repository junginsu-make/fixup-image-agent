import { describe, expect, it } from "vitest";
import { EASY_DEFAULT_RATIO, easyAsk } from "../ask";
import { KIND_REPLY_TEXT, kindReply, photoReply, photoTypedReply, ratioReply, referenceReply } from "../ask-answers";
import { pickPhoto, startPhotoAsk } from "../photo-ask-state";

/**
 * **단추 답**(2026-10-07 2차 설계 D1). 화면은 처음 말을 다시 보내지 않는다 — 단추 글 · 물음 줄 id ·
 * 고른 값만 보낸다. 서버가 물음 줄의 판단으로 바로 간다(판단 모델 생략).
 */
describe("단추 답", () => {
  it("갈래 단추는 그 글과 갈래를 싣는다", () => {
    expect(kindReply("q1", "image")).toEqual({ text: KIND_REPLY_TEXT.image, answersRowId: "q1", pick: { kind: "image" } });
    expect(kindReply("q1", "cardnews").text).toBe("카드뉴스 여러 장");
  });

  /** 1차 B1 — 아무것도 안 골랐으면 기본 비율을 고른 값으로 싣는다. 그래야 서버가 또 묻지 않는다. */
  it("「이대로 만들기」는 기본 비율을 고른 값으로 싣는다", () => {
    const reply = ratioReply("q1", { ratio: "", look: "" });
    expect(reply).toEqual({ text: "이대로 만들기", answersRowId: "q1", pick: { ratio: EASY_DEFAULT_RATIO } });
    expect(easyAsk({ attachmentCount: 0, chosenRatio: reply.pick.ratio }).asks).toBe(false);
  });

  it("고른 비율 · 그림체는 글에 보이고 그대로 싣는다", () => {
    const reply = ratioReply("q1", { ratio: "9:16", look: "" });
    expect(reply.text).toMatch(/^이걸로 만들기 \(.+\)$/);
    expect(reply.pick).toEqual({ ratio: "9:16" });
  });

  it("사진 단추는 모든 줄의 고른 쓰임을 싣는다", () => {
    const state = pickPhoto(startPhotoAsk("", "unclear", [{ id: "a", role: "unclear" }, { id: "b", role: "style" }]), "a", "preserve_product");
    expect(photoReply("q1", state).pick).toEqual({ photoRoles: [{ id: "a", role: "preserve_product" }, { id: "b", role: "style" }] });
  });

  /**
   * 2차 최종 리뷰 8 — 사진 고르기가 열린 채 말로 치면 그 말 + 손댄 줄의 쓰임을 그 물음의 답으로 보낸다
   * (1차 `photoAnswer(state, 말)` 그대로). `typed` 라 서버가 그 말을 처음 말 뒤에 잇는다.
   */
  it("사진 고르기 중 말로 친 답은 그 말과 손댄 줄의 쓰임을 typed 로 싣는다", () => {
    const state = pickPhoto(startPhotoAsk("", "unclear", [{ id: "a", role: "unclear" }, { id: "b", role: "style" }]), "a", "preserve_product");
    expect(photoTypedReply("q1", state, "1번은 우리 원두 봉투야")).toEqual({
      text: "1번은 우리 원두 봉투야", answersRowId: "q1", pick: { photoRoles: [{ id: "a", role: "preserve_product" }], typed: true },
    });
  });

  it("레퍼런스 답은 카드뉴스 갈래와 분위기 참고 · 자리를 싣는다", () => {
    expect(referenceReply("q1", { photoRoles: [{ id: "a", role: "style" }], photoSlots: [] })).toEqual({
      text: "이걸로 만들기", answersRowId: "q1", pick: { kind: "cardnews", photoRoles: [{ id: "a", role: "style" }] },
    });
  });

  it("단추 글에 줄표가 없다", () => {
    for (const text of [KIND_REPLY_TEXT.image, KIND_REPLY_TEXT.cardnews, ratioReply("q", { ratio: "4:5", look: "" }).text]) {
      expect(text).not.toContain("—");
    }
  });
});
