import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { easyChatSpec } from "../chat-provider";
import { easyAvailableWants } from "../../../app/easy/chat";

/**
 * **틀에 없는 칸은 아무리 시켜도 안 온다**(1단계 교훈 — `invented` · `hasText`).
 * 3단계 말 판단은 장 번호(`card`) · 바라는 점(`note`)을 받아야 하고, 한 장 글 고치기는
 * 제 틀이 있어야 한다.
 */
const 제공자 = readFileSync(new URL("../chat-provider.ts", import.meta.url), "utf8");

describe("3단계 판단 틀", () => {
  it("말 판단 틀은 부를 때 받은 갈래만 선택지로 두고, 장 번호 · 바라는 점을 꼭 받는다", () => {
    const wants = easyAvailableWants({ hasDraft: true, made: true, madeImage: false });
    const schema = easyChatSpec(wants).schema as {
      properties: Record<string, { type: string; enum?: string[] }>;
      required: string[];
    };
    for (const 갈래 of ["card_redo", "card_text", "caption", "download"]) expect(schema.properties.wants!.enum).toContain(갈래);
    expect(schema.properties.card).toEqual({ type: "integer" });
    expect(schema.properties.note).toEqual({ type: "string" });
    expect(schema.required).toEqual(["wants", "reply", "ratio", "look", "card", "note"]);
  });

  it("한 장 글 고치기 틀이 있고 두 업체 모두에 실린다", () => {
    expect(제공자).toContain("EASY_CARD_EDIT_SPEC");
    expect(제공자.match(/editCard: 부른다\(EASY_CARD_EDIT_SPEC\)/g)).toHaveLength(2);
  });
});
