import { describe, expect, it } from "vitest";
import { SEE_FAILED, easySeePrompt, seeLabel, seeTargets } from "../see-prompt";

/** **볼 것 고르기**(2026-10-07 2차 D5). 다 만든 이미지와 지금 붙은 사진만, 네 개까지. 카드뉴스 번호는 안 본다. */
const 목록 = [1, 2, 3, 4, 5].map((n) => ({
  n, rowId: `i${n}`, workId: "p", kind: n === 5 ? "cardnews" as const : "image" as const,
  state: n === 2 ? "making" as const : "done" as const, words: "",
}));

describe("볼 것 고르기", () => {
  it("다 만든 이미지 번호와 지금 붙은 사진만, 네 개까지", () => {
    expect(seeTargets(["2", "1", "p1", "p3", "3", "4", "5"], 목록, 2)).toEqual([
      { kind: "image", n: 1 }, { kind: "photo", index: 1 }, { kind: "image", n: 3 }, { kind: "image", n: 4 },
    ]);
    expect(seeTargets(["9", "p0"], 목록, 1)).toEqual([]);
    expect(seeTargets(["5"], 목록, 0)).toEqual([]);
  });

  /** 같은 것을 두 번 보내지 않는다 — 「1」 · 「01」, 「p1」 · 「p01」은 같은 그림이다(값 · 네 장 한도). */
  it("같은 이미지 · 같은 사진은 한 번만 고른다", () => {
    expect(seeTargets(["1", "01", "p1", "p01", "001"], 목록, 1)).toEqual([{ kind: "image", n: 1 }, { kind: "photo", index: 1 }]);
  });

  /** 못 읽은 것(`unknown`) · 지운 것은 볼 그림이 없다(Task 7 · 8). */
  it("못 읽은 결과 · 지운 결과 번호는 고르지 않는다", () => {
    const 섞인 = [
      { n: 1, rowId: "a", workId: "w1", kind: "unknown" as const, state: "unknown" as const, words: "" },
      { n: 2, rowId: "b", workId: "w2", kind: "deleted" as const, state: "deleted" as const, words: "" },
      { n: 3, rowId: "c", workId: "w3", kind: "image" as const, state: "failed" as const, words: "" },
    ];
    expect(seeTargets(["1", "2", "3"], 섞인, 0)).toEqual([]);
  });

  /** 2차 최종 리뷰 10 — 보기가 실패하면 판단의 짧은 답 대신 나가는 문장. 혼자서도 뜻이 통하고 줄표가 없다. */
  it("못 봤을 때 문장", () => {
    expect(SEE_FAILED).toBe("지금은 이미지를 볼 수 없었습니다. 잠시 뒤 다시 물어봐 주세요.");
    expect(SEE_FAILED).not.toContain("—");
  });

  it("이름표와 프롬프트는 보낸 차례 · 지난 대화 · 마지막 말을 싣는다", () => {
    expect(seeLabel({ kind: "image", n: 2 })).toBe("이 대화의 이미지 2번");
    expect(seeLabel({ kind: "photo", index: 1 })).toBe("사용자가 붙인 사진 1");
    const prompt = easySeePrompt({ history: ["사용자: 카페 포스터"], prompt: "방금 거 어때?", labels: ["이 대화의 이미지 1번"] });
    expect(prompt).toContain("1번째: 이 대화의 이미지 1번");
    expect(prompt).toContain("사용자: 카페 포스터");
    expect(prompt).toContain("방금 거 어때?");
    expect(prompt).not.toContain("—");
  });
});
