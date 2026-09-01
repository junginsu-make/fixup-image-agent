import { describe, expect, it, vi } from "vitest";
import { groupAttachments, type Attachment } from "../attachments";
import {
  buildAttachmentBlock,
  buildFrame,
  buildSceneRequest,
  composePrompt,
  referenceWarningsForRole,
  selectReferencesForRole,
  writeImagePrompt,
} from "../image-prompt";
import type { ScenePromptRequest } from "../image-prompt";

const attachment = (patch: Partial<Attachment>): Attachment => ({
  id: patch.id ?? crypto.randomUUID(),
  kind: patch.kind ?? "style_reference",
  assetPath: patch.assetPath ?? "path",
  url: patch.url ?? "https://example.com/image.png",
  ...patch,
});

const images = [
  attachment({ kind: "style_reference", role: "body", url: "https://example.com/body.png" }),
  attachment({ kind: "keep_identity", subject: "object", url: "https://example.com/product.png" }),
];

describe("첨부 이미지 설명", () => {
  it("번호와 역할을 문장으로 알린다", () => {
    const block = buildAttachmentBlock(images);
    expect(block).toContain("Image 1");
    expect(block).toContain("Image 2");
    expect(block).toContain("body");
  });

  it("따라 만들 카드뉴스는 내용만 바꾸라고 한다", () => {
    const block = buildAttachmentBlock([images[0]!]);
    expect(block).toMatch(/replace only the content|내용만/i);
    expect(block).not.toContain("specific illustrations");
  });

  it("그대로 넣을 것은 정체성을 지키되 각도는 자유라고 한다", () => {
    const block = buildAttachmentBlock([images[1]!]);
    expect(block).toMatch(/identity|정체성/i);
    expect(block).toMatch(/angle|각도/i);
  });

  it("우선순위를 명시한다", () => {
    expect(buildAttachmentBlock(images)).toMatch(/takes priority|우선/i);
  });
});

describe("역할별 레퍼런스", () => {
  const grouped = groupAttachments([
    attachment({ id: "cover", kind: "style_reference", role: "cover", url: "https://example.com/cover.png" }),
    attachment({ id: "body", kind: "style_reference", role: "body", url: "https://example.com/body.png" }),
    attachment({ id: "ending", kind: "style_reference", role: "ending", url: "https://example.com/ending.png" }),
    attachment({ id: "product", kind: "keep_identity", subject: "object", url: "https://example.com/product.png" }),
  ]);

  it("표지는 표지 레퍼런스와 보존 대상만 쓴다", () => {
    expect(selectReferencesForRole(grouped, "cover").map((image) => image.id)).toEqual(["cover", "product"]);
  });

  it("속지는 속지 레퍼런스와 보존 대상만 쓴다", () => {
    expect(selectReferencesForRole(grouped, "body").map((image) => image.id)).toEqual(["body", "product"]);
  });

  it("엔딩은 엔딩 레퍼런스와 보존 대상만 쓴다", () => {
    expect(selectReferencesForRole(grouped, "ending").map((image) => image.id)).toEqual(["ending", "product"]);
  });

  it("역할 레퍼런스가 없으면 막지 않고 역할별 경고를 남긴다", () => {
    const coverOnly = groupAttachments([
      attachment({ id: "cover", kind: "style_reference", role: "cover" }),
    ]);
    expect(referenceWarningsForRole(coverOnly, "cover")).toEqual([]);
    expect(referenceWarningsForRole(coverOnly, "body").join("\n")).toContain("속지 레퍼런스가 없습니다");
    expect(selectReferencesForRole(coverOnly, "body")).toEqual([]);
  });
});

describe("다국어와 글자", () => {
  it("언어 이름만 바뀐다", () => {
    const ko = buildFrame({ copy: { index: 1, headline: "제목" }, images: [], size: { width: 1088, height: 1360 }, language: "ko" });
    const en = buildFrame({ copy: { index: 1, headline: "Title" }, images: [], size: { width: 1088, height: 1360 }, language: "en" });
    expect(ko).toContain("Korean text");
    expect(en).toContain("English text");
  });

  it("확정 원고는 바꾸지 않고 배경 텍스트는 자제만 시킨다", () => {
    const frame = buildFrame({ copy: { index: 1, headline: "x" }, images: [], size: { width: 1088, height: 1088 }, language: "ko" });
    expect(frame).toContain("Do not translate, paraphrase, or shorten the text listed above.");
    expect(frame).toContain("Keep incidental background text sparse.");
    expect(frame).not.toMatch(/add any text that is not listed/i);
  });

  it("긴 원고도 그대로 frame 에 넣는다", () => {
    const headline = "가".repeat(100);
    const body = "나".repeat(300);
    const frame = buildFrame({ copy: { index: 2, headline, body }, images, size: { width: 1088, height: 1360 }, language: "ko" });
    expect(frame).toContain(headline);
    expect(frame).toContain(body);
    expect(frame).not.toMatch(/60자|200자|maximum characters|max chars/i);
  });
});

describe("코드가 씌우는 뼈대", () => {
  const frame = buildFrame({
    copy: { index: 2, headline: "제목입니다", body: "본문입니다", footnote: "출처" },
    images,
    size: { width: 1088, height: 1360 },
    language: "ko",
  });

  it("글자와 규격을 담는다", () => {
    expect(frame).toContain("제목입니다");
    expect(frame).toContain("본문입니다");
    expect(frame).toMatch(/exactly as written/i);
    expect(frame).toContain("1088");
    expect(frame).toContain("1360");
  });

  it("앵커와 목적·서사 규칙을 넣지 않는다", () => {
    expect(frame).not.toMatch(/card 1 of this same series/i);
    expect(frame).not.toMatch(/Only the content differs/i);
    expect(frame).not.toMatch(/Narrative rule|서사 규칙/);
  });
});

describe("LLM 장면 프롬프트", () => {
  const grouped = groupAttachments([
    attachment({ id: "cover", kind: "style_reference", role: "cover", url: "https://example.com/cover.png" }),
    attachment({ id: "body", kind: "style_reference", role: "body", url: "https://example.com/body.png" }),
  ]);
  const input = {
    role: "body" as const,
    copy: { index: 2, headline: "제목", body: "본문" },
    plan: { index: 2, role: "body" as const, intent: "핵심 설명", visualBrief: "설명을 돕는 장면" },
    grouped,
    size: { width: 1088, height: 1360 },
    language: "ko" as const,
  };

  it("LLM 에 원고·기획과 역할 레퍼런스 원본을 직접 준다", async () => {
    const generate = vi.fn(async (_request: ScenePromptRequest) => "LLM이 쓴 장면 프롬프트");
    const result = await writeImagePrompt(input, { generate });
    expect(result).toEqual({ body: "LLM이 쓴 장면 프롬프트", warnings: [] });
    expect(generate).toHaveBeenCalledOnce();
    const request = generate.mock.calls[0]![0];
    expect(request.imageUrls).toEqual(["https://example.com/body.png"]);
    expect(request.prompt).toContain("핵심 설명");
    expect(request.prompt).toContain("설명을 돕는 장면");
    expect(request.prompt).toContain("제목");
  });

  it("추가로 들어온 이전 카드 URL 도 무시한다", async () => {
    const sent: Array<{ prompt: string; imageUrls: string[] }> = [];
    await writeImagePrompt({ ...input, previousCardUrl: "https://example.com/previous-card.png" } as typeof input, {
      generate: async (request) => { sent.push(request); return "scene"; },
    });
    expect(sent[0]!.imageUrls).not.toContain("https://example.com/previous-card.png");
    expect(sent[0]!.prompt).not.toContain("previous-card.png");
  });

  it("코드는 장면을 만들지 않고 LLM 에 판단 자료만 준다", () => {
    const request = buildSceneRequest(input);
    expect(request.prompt).toContain("Write the visual scene prompt");
    expect(request.prompt).toContain("핵심 설명");
    expect(request.prompt).not.toMatch(/cinematic|dramatic lighting|close-up|wide shot/i);
  });

  it("LLM 실패는 밖으로 던지지 않고 빈 본문이다", async () => {
    await expect(writeImagePrompt(input, { generate: async () => { throw new Error("LLM 실패"); } }))
      .resolves.toEqual({ body: "", warnings: [] });
  });
});

describe("합치기", () => {
  it("LLM 이 쓴 본문이 뼈대 안에 들어간다", () => {
    const composed = composePrompt("FRAME", "LLM 이 쓴 장면 설명");
    expect(composed).toContain("FRAME");
    expect(composed).toContain("LLM 이 쓴 장면 설명");
  });

  it("LLM 본문이 비어도 프롬프트가 성립한다", () => {
    const composed = composePrompt("FRAME", "");
    expect(composed).toContain("FRAME");
    expect(composed).not.toContain("undefined");
  });
});
