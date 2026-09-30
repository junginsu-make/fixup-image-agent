import { describe, expect, it } from "vitest";
import { ProjectInputSchema } from "../../api/sns/projects/schema";
import { redraftInput } from "../cardnews-redraft";

const 옛것 = {
  title: "건강", ratio: "4:5", language: "ko", modelId: "gpt-image-2.5-flare",
  cardCountMode: "auto", cardCount: null, toneNote: "친근하게",
  data: {
    source: { kind: "question" as const, question: "q" },
    attachments: [{ id: "a", kind: "style_reference" as const, role: "body" as const, assetPath: "u1/a.png", url: "u" }],
    look: "auto", userInstruction: "밝게",
    attachmentIntents: { cover: "", body: "", ending: "" },
  },
};

describe("다시 쓰기 (2단계 설계 §7)", () => {
  /**
   * 말투 칸은 글에만, 추가 지시는 그림에만 간다(`sns-core/copy.ts:59` · `image-prompt.ts:297`).
   * 「더 짧게」와 「더 밝게」가 둘 다 먹히려면 두 칸 모두에 더한다(설계 §7 「추가 지시에 더해」).
   */
  it("말은 말투 칸과 추가 지시에 더하고 나머지는 그대로", () => {
    expect(redraftInput(옛것, { words: "더 짧게" })).toEqual({
      title: "건강", source: 옛것.data.source, toneNote: "친근하게\n더 짧게",
      attachments: 옛것.data.attachments, attachmentIntents: 옛것.data.attachmentIntents,
      ratio: "4:5", cardCountMode: "auto", language: "ko", modelId: "gpt-image-2.5-flare", look: "auto",
      userInstruction: "밝게\n더 짧게",
    });
  });

  it("만든 뒤 「더 밝게」도 그림 지시로 간다", () => {
    const 없던것 = { ...옛것, data: { ...옛것.data, userInstruction: undefined } };
    expect(redraftInput(없던것, { words: "더 밝게" }).userInstruction).toBe("더 밝게");
  });

  it("추가 지시가 길어지면 새 말을 남기고 앞을 자른다, 입력 검사를 통과한다", () => {
    const 긴것 = { ...옛것, data: { ...옛것.data, userInstruction: "가".repeat(1995) } };
    const input = redraftInput(긴것, { words: "배경 파랗게" });
    expect(input.userInstruction!.length).toBe(2000);
    expect(input.userInstruction!.endsWith("배경 파랗게")).toBe(true);
    expect(ProjectInputSchema.safeParse(input).success).toBe(true);
  });

  it("조건을 바꾸면 그 조건으로", () => {
    expect(redraftInput(옛것, { options: { count: 6, ratio: "1:1" } }))
      .toMatchObject({ ratio: "1:1", cardCountMode: "fixed", cardCount: 6, toneNote: "친근하게" });
  });
});
