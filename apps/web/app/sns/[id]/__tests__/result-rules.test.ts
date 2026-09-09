import { describe, expect, it } from "vitest";
import { cardPlaceholder, trimCardNote, CARD_NOTE_MAX } from "../result-rules";

describe("그림이 없는 칸", () => {
  /** 사용자 요청: 만드는 중임을 카드 한가운데서 알아볼 수 있어야 한다. */
  it("만드는 중이면 돌아가는 표시를 붙인다", () => {
    expect(cardPlaceholder("generating")).toEqual({ label: "만드는 중입니다", spinning: true });
  });

  /** **기다리는 칸은 안 돌린다** — 여덟 칸이 동시에 돌면 어디가 진행 중인지 못 읽는다. */
  it("차례를 기다리는 중에는 안 돌린다", () => {
    expect(cardPlaceholder("pending")).toEqual({ label: "차례를 기다리는 중입니다", spinning: false });
  });

  it("실패는 실패라고 적는다", () => {
    expect(cardPlaceholder("failed").label).toBe("만들지 못했습니다");
    expect(cardPlaceholder("failed").spinning).toBe(false);
  });

  it("모르는 상태는 지금까지대로 둔다", () => {
    expect(cardPlaceholder("done").label).toBe("이미지가 없습니다.");
    expect(cardPlaceholder("무엇").spinning).toBe(false);
  });
});

describe("다시 만들 때 적는 지시", () => {
  it("앞뒤 공백을 턴다", () => {
    expect(trimCardNote("  더 밝게  ")).toBe("더 밝게");
  });

  /** 공백만 적고 누르면 지시 없이 같은 것을 또 만든다 — 기대한 일이 아니다. */
  it("비어 있으면 없는 것으로 본다", () => {
    for (const value of ["", "   ", "\n\t", undefined, null]) {
      expect(trimCardNote(value)).toBeUndefined();
    }
  });

  it("너무 길면 자른다", () => {
    expect(trimCardNote("가".repeat(CARD_NOTE_MAX + 50))).toHaveLength(CARD_NOTE_MAX);
  });

  it("상한은 500 자다", () => {
    expect(CARD_NOTE_MAX).toBe(500);
  });
});
