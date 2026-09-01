import { describe, expect, it } from "vitest";
import { ProjectInputSchema } from "../projects/schema";
import { ProjectValidationError, createProjectService, type SnsProjectRepository } from "../projects/project-service";

const base = {
  title: "AI 자동화 카드뉴스",
  source: { kind: "text" as const, text: "AI 자동화는 한 업무부터 시작한다." },
  toneNote: "친구에게 말하듯",
  attachments: [{
    id: "reference-1", kind: "style_reference" as const, role: "cover" as const,
    assetPath: "user/references/reference-1.jpg", url: "/api/reference-images/reference-1/file",
  }],
  ratio: "4:5" as const,
  cardCountMode: "auto" as const,
  language: "ko" as const,
  modelId: "gpt-image-2" as const,
};

describe("SNS 프로젝트 입력", () => {
  it("네 내용 입력 경로를 받는다", () => {
    const sources = [
      { kind: "text", text: "직접 쓴 글" },
      { kind: "youtube", url: "https://youtube.com/watch?v=abc" },
      { kind: "web", url: "https://example.com/article" },
      { kind: "question", question: "AI 자동화는 어디부터 시작해야 하나요?" },
    ];
    for (const source of sources) {
      expect(ProjectInputSchema.safeParse({ ...base, source }).success).toBe(true);
    }
  });

  it("기본 모델은 GPT Image 2, 기본 장수는 AI 추천이다", () => {
    const parsed = ProjectInputSchema.parse({
      title: base.title,
      source: base.source,
      attachments: base.attachments,
      ratio: "4:5",
      language: "ko",
    });
    expect(parsed.modelId).toBe("gpt-image-2");
    expect(parsed.cardCountMode).toBe("auto");
    expect(parsed.cardCount).toBeUndefined();
  });

  it("해상도와 픽셀 입력을 받지 않는다", () => {
    expect(ProjectInputSchema.safeParse({ ...base, resolution: "4K" }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, width: 1088, height: 1360 }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, userId: "attacker" }).success).toBe(false);
  });
});

describe("SNS 프로젝트 서비스", () => {
  it("고정 장수를 validateAttachments 의 totalCards 로 넘긴다", async () => {
    const repository: SnsProjectRepository = {
      create: async () => { throw new Error("저장되면 안 됩니다."); },
      list: async () => [],
    };
    const input = ProjectInputSchema.parse({
      ...base,
      cardCountMode: "fixed",
      cardCount: 4,
      attachments: [
        ...Array.from({ length: 6 }, (_unused, index) => ({
          id: `original-${index}`, kind: "place_as_is", assetPath: `p${index}`, url: `u${index}`,
        })),
        base.attachments[0],
      ],
    });

    await expect(createProjectService(repository).create("session-user", input))
      .rejects.toThrow("원본 그대로 쓸 장은 6장이지만 속지 자리는 2자리뿐입니다");
  });

  it("인증 사용자와 자리 계획을 저장한다", async () => {
    const rows: unknown[] = [];
    const repository: SnsProjectRepository = {
      create: async (row) => {
        rows.push(row);
        return { id: "project-1", ...row, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
      },
      list: async () => [],
    };
    const input = ProjectInputSchema.parse(base);
    const project = await createProjectService(repository).create("session-user", input);

    expect(project.userId).toBe("session-user");
    expect(rows[0]).toMatchObject({
      userId: "session-user",
      modelId: "gpt-image-2",
      cardCountMode: "auto",
      data: { attachments: base.attachments },
      slotPlan: { total: "auto" },
    });
  });
});
