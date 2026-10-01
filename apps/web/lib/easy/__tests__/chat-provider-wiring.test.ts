import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **틀에 없는 칸은 아무리 시켜도 안 온다**(1단계 교훈 — `invented` · `hasText`).
 * 3단계 말 판단은 장 번호(`card`) · 바라는 점(`note`)을 받아야 하고, 한 장 글 고치기는
 * 제 틀이 있어야 한다.
 */
const 제공자 = readFileSync(new URL("../chat-provider.ts", import.meta.url), "utf8");

describe("3단계 판단 틀", () => {
  it("말 판단 틀에 새 갈래 넷과 장 번호 · 바라는 점이 있고, 둘 다 꼭 받는다", () => {
    for (const 갈래 of ["card_redo", "card_text", "caption", "download"]) expect(제공자).toContain(`"${갈래}"`);
    expect(제공자).toContain('card: { type: "integer" }');
    expect(제공자).toContain('note: { type: "string" }');
    expect(제공자).toMatch(/required: \["wants", "reply", "ratio", "look", "card", "note"\]/);
  });

  it("한 장 글 고치기 틀이 있고 두 업체 모두에 실린다", () => {
    expect(제공자).toContain("EASY_CARD_EDIT_SPEC");
    expect(제공자.match(/editCard: 부른다\(EASY_CARD_EDIT_SPEC\)/g)).toHaveLength(2);
  });
});
