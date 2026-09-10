import { describe, expect, it } from "vitest";
import { IMAGE_MODELS } from "@fixup/sns-core";
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

  it("안 보내면 sns-core 가 정한 기본 모델, 기본 장수는 AI 추천이다", () => {
    // 값을 손으로 박지 않는다. 기본을 정하는 곳은 `sns-core/models.ts` 한 군데고,
    // 여기서 볼 것은 **서버가 그 값을 따라가는가**다. 두 곳이 갈리면 화면은
    // 한 모델을 고르는데 모델 미지정 요청만 다른 모델로 나간다.
    const parsed = ProjectInputSchema.parse({
      title: base.title,
      source: base.source,
      attachments: base.attachments,
      ratio: "4:5",
      language: "ko",
    });
    expect(parsed.modelId).toBe(IMAGE_MODELS.find((model) => model.isDefault)!.id);
    expect(parsed.cardCountMode).toBe("auto");
    expect(parsed.cardCount).toBeUndefined();
  });

  it("sns-core 에 있는 모델은 전부 받는다", () => {
    // 손으로 적은 `z.enum` 목록이 `IMAGE_MODELS` 와 갈리는 것을 막는다.
    // 빠진 id 가 있으면 화면은 그 모델을 보여 주는데 저장이 400 으로 막힌다.
    for (const model of IMAGE_MODELS) {
      const result = ProjectInputSchema.safeParse({ ...base, modelId: model.id });
      expect(result.success, model.id).toBe(true);
    }
  });

  it("옛 작업이 들고 있는 id 를 계속 받는다", () => {
    // 저장된 작업은 만들 때의 id 를 들고 있고, 화면이 그 작업을 열면 그 값을
    // 그대로 되보낸다. 목록에서 id 를 빼면 **옛 작업을 못 여는 사고**가 된다 —
    // 기본을 되돌릴 때는 `.default` 만 옮긴다.
    expect(ProjectInputSchema.safeParse({ ...base, modelId: "gpt-image-2" }).success).toBe(true);
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
