import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { usedAttachments } from "../attachments-after";

/**
 * **쓴 사진은 입력창에서 내린다**(2026-10-07 2차 설계 D3 · §3-3, ChatGPT 처럼). 만들기 · 고치기 ·
 * 카드뉴스 원고에 쓴 턴만 비운다. 물음 · 대화 · 실패에는 그대로 둔다(아직 안 썼거나 다시 보낸다).
 */
describe("쓴 사진은 내린다 (2차 D3)", () => {
  it("이미지 만들기 · 고치기 · 카드뉴스 원고 턴이면 내린다", () => {
    expect(usedAttachments({ ok: true, projectId: "p1", submission: { requestRowId: "r" } })).toBe(true);
    expect(usedAttachments({ ok: true, cardnews: { rowId: "r", project: {} } })).toBe(true);
  });

  it("물음 · 대화 · 실패 · 손보기면 그대로 둔다", () => {
    expect(usedAttachments({ ok: true, ask: { kind: "photo" }, message: {} })).toBe(false);
    expect(usedAttachments({ ok: true, talked: true, message: {} })).toBe(false);
    expect(usedAttachments({ ok: false, message: "x" })).toBe(false);
    expect(usedAttachments({ ok: true, cardEdited: {} })).toBe(false);
  });

  it("화면은 답을 받자마자 이 판단으로 첨부를 비운다", () => {
    const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");
    expect(화면).toContain("if (usedAttachments(body)) setAttachments([]);");
  });
});
