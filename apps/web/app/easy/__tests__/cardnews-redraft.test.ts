import { describe, expect, it } from "vitest";
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
  it("말은 말투 칸에 더하고 나머지는 그대로", () => {
    expect(redraftInput(옛것, { words: "더 짧게" })).toEqual({
      title: "건강", source: 옛것.data.source, toneNote: "친근하게\n더 짧게",
      attachments: 옛것.data.attachments, attachmentIntents: 옛것.data.attachmentIntents,
      ratio: "4:5", cardCountMode: "auto", language: "ko", modelId: "gpt-image-2.5-flare", look: "auto",
      userInstruction: "밝게",
    });
  });

  it("조건을 바꾸면 그 조건으로", () => {
    expect(redraftInput(옛것, { options: { count: 6, ratio: "1:1" } }))
      .toMatchObject({ ratio: "1:1", cardCountMode: "fixed", cardCount: 6, toneNote: "친근하게" });
  });
});
