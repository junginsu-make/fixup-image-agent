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

const sceneInput = {
  role: "body" as const,
  copy: { index: 2, headline: "제목", body: "본문" },
  plan: { index: 2, role: "body" as const, intent: "핵심 설명", visualBrief: "설명을 돕는 장면" },
  grouped: groupAttachments(images),
  size: { width: 1088, height: 1360 },
  language: "ko" as const,
};

describe("첨부 이미지 설명", () => {
  it("번호와 역할을 문장으로 알린다", () => {
    const block = buildAttachmentBlock(images);
    expect(block).toContain("Image 1");
    expect(block).toContain("Image 2");
    expect(block).toContain("body");
  });

  it("따라 만들 카드뉴스는 꼴만 가져온다", () => {
    const block = buildAttachmentBlock([images[0]!]);
    expect(block).toMatch(/layout|typography/i);
    expect(block).toMatch(/3D|photographic|illustrated/i);
  });

  it("레퍼런스 안의 것은 가져오지 말라고 못 박는다", () => {
    // 3D 파란 배경과 서체는 지키되, 레퍼런스에 있던 아이콘·제품·글자는
    // 그대로 나오면 안 된다. 안 적으면 모델이 통째로 베낀다.
    const block = buildAttachmentBlock([images[0]!]);
    expect(block).toMatch(/Do NOT copy/i);
    expect(block).toMatch(/icons|illustrations/i);
  });

  it("아이콘은 같은 양식으로 새로 그리라고 한다", () => {
    // 지우기만 하면 아이콘 없는 허전한 카드가 나온다. 새로 그리라고 해야 한다.
    const block = buildAttachmentBlock([images[0]!]);
    expect(block).toMatch(/Draw new|same style/i);
  });

  it("색을 어디에 쓰는지까지 말한다", () => {
    // 실측(2026-07-30): colour palette 라고만 하면 모델이 색을 글자색으로만
    // 쓰고 면으로는 안 쓴다.
    const block = buildAttachmentBlock([images[0]!]);
    expect(block).toMatch(/how each colour is used|fill surfaces/i);
  });

  it("그대로 넣을 것은 정체성을 지키되 각도는 자유라고 한다", () => {
    const block = buildAttachmentBlock([images[1]!]);
    expect(block).toMatch(/identity|정체성/i);
    expect(block).toMatch(/angle|각도/i);
  });

  it("우선순위를 명시한다", () => {
    expect(buildAttachmentBlock(images)).toMatch(/Priority when instructions conflict/i);
  });

  /**
   * 첨부를 훑고 기억으로 비슷한 것을 그려내면 로고가 닮은 다른 로고가 된다.
   * 「진짜로 보라」를 먼저 못 박아야 한다.
   */
  it("첨부가 있으면 진짜로 보라고 먼저 말한다", () => {
    const block = buildAttachmentBlock(images);
    expect(block.split("\n")[0]).toMatch(/Study every attached image closely/i);
    expect(block).toMatch(/never substitute a generic stand-in/i);
  });

  it("첨부가 하나도 없으면 보라는 말을 넣지 않는다", () => {
    // 없는 것을 보라고 하면 모델이 지어낸다.
    expect(buildAttachmentBlock([])).not.toMatch(/Study every attached image/i);
  });

  it("사용자가 친 지시가 우선순위 맨 앞이다", () => {
    const line = buildAttachmentBlock(images, { userInstruction: "배경은 밤" })
      .split("\n").find((entry) => entry.startsWith("Priority when"))!;
    expect(line).toMatch(
      /USER INSTRUCTION.*PRESERVED SUBJECT.*REFERENCE image.*scene description/,
    );
  });

  it("지시를 안 적었으면 우선순위에서 그 자리를 빼 버린다", () => {
    expect(buildAttachmentBlock(images)).not.toMatch(/USER INSTRUCTION/);
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
    expect(frame).toMatch(/do not invent.*greeting.*CTA.*copyright/is);
    expect(frame).toMatch(/trademark.*date/is);
    expect(frame).toMatch(/incidental environmental text.*signs.*props/is);
  });

  it("긴 원고도 그대로 frame 에 넣는다", () => {
    const headline = "가".repeat(100);
    const body = "나".repeat(300);
    const frame = buildFrame({ copy: { index: 2, headline, body }, images, size: { width: 1088, height: 1360 }, language: "ko" });
    expect(frame).toContain(headline);
    expect(frame).toContain(body);
    expect(frame).not.toMatch(/60자|200자|maximum characters|max chars/i);
    expect(frame).toMatch(/reduce the font size|smaller text/i);
    expect(frame).toMatch(/every non-empty field.*in full/i);
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

  it("장면 프롬프트 LLM도 모든 원고 필드의 자리를 만들고 요약하지 않게 한다", () => {
    const request = buildSceneRequest(input);
    expect(request.prompt).toMatch(/every non-empty copy field/i);
    expect(request.prompt).toMatch(/smaller font|reduce the font/i);
    expect(request.prompt).toMatch(/do not omit|do not summarize/i);
    expect(request.prompt).toMatch(/do not invent.*copyright/is);
    expect(request.prompt).toMatch(/signs.*props.*allowed/is);
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

describe("사용자가 직접 친 지시", () => {
  /**
   * 두 번 넣는 이유: 2026-09-04 실측에서 프롬프트 뒤에 긴 문단을 붙였더니
   * 앞쪽 구도 지시가 밀려 무시됐다. 긴 프롬프트에서 가운데는 힘을 잃는다.
   */
  it("맨 앞과 맨 뒤 양쪽에 들어간다", () => {
    const composed = composePrompt("FRAME", "장면", { userInstruction: "배경은 밤, 창밖에 네온" });
    expect(composed.startsWith("USER INSTRUCTION")).toBe(true);
    expect(composed).toMatch(/re-read the USER INSTRUCTION[\s\S]*배경은 밤, 창밖에 네온\s*$/);
    expect(composed.match(/배경은 밤, 창밖에 네온/g)).toHaveLength(2);
  });

  it("안 적었으면 그 줄 자체가 없다", () => {
    // 완전일치로 보지 않는다 — 프롬프트에는 「누가 그리는가」처럼 늘 붙는
    // 것이 있다. 여기서 볼 것은 **사용자 지시 줄이 없다**는 것뿐이다.
    const composed = composePrompt("FRAME", "장면");
    expect(composed).not.toMatch(/USER INSTRUCTION/);
    expect(composed).toContain("장면");
    expect(composed).toContain("FRAME");
  });

  it("공백만 적은 것은 안 적은 것과 같다", () => {
    const composed = composePrompt("FRAME", "장면", { userInstruction: "   " });
    expect(composed).not.toMatch(/USER INSTRUCTION/);
    expect(composed).toBe(composePrompt("FRAME", "장면"));
  });

  it("장면을 쓰는 LLM 도 같은 지시를 받는다", () => {
    // 모르면 「밤」이라고 적은 사용자에게 낮 장면을 써 주고, 그 장면이 그대로
    // 이미지 모델에 간다.
    const request = buildSceneRequest({ ...sceneInput, userInstruction: "배경은 밤" });
    expect(request.prompt.startsWith("USER INSTRUCTION")).toBe(true);
    expect(request.prompt.trimEnd().endsWith("배경은 밤")).toBe(true);
    expect(buildSceneRequest(sceneInput).prompt).not.toMatch(/USER INSTRUCTION/);
  });
});

describe("이미지의 결", () => {
  it("auto 면 결에 대해 아무 말도 보태지 않는다", () => {
    // 지금까지의 동작(첨부 레퍼런스의 결을 따라감)이 유지돼야 쓰던 사람이 안 깨진다.
    const frame = buildFrame({ copy: { index: 1, headline: "제목" }, images, size: { width: 1088, height: 1360 }, language: "ko" });
    const auto = buildFrame({ copy: { index: 1, headline: "제목" }, images, size: { width: 1088, height: 1360 }, language: "ko", look: "auto" });
    expect(frame).toBe(auto);
    expect(frame).not.toMatch(/Rendering style for this card/i);
  });

  it("고른 결이 있으면 지시문이 들어간다", () => {
    const frame = buildFrame({ copy: { index: 1, headline: "제목" }, images, size: { width: 1088, height: 1360 }, language: "ko", look: "anime" });
    expect(frame).toMatch(/Rendering style for this card/i);
    expect(frame).toMatch(/cel-shaded/i);
    // 레퍼런스의 결을 따라 하라는 바로 위 지시와 부딪힌다. 어느 쪽이 이기는지 적어야 한다.
    expect(frame).toMatch(/overrides the rendering style/i);
  });

  it("장면을 쓰는 LLM 도 결을 안다", () => {
    expect(buildSceneRequest({ ...sceneInput, look: "3d" }).prompt).toMatch(/Rendering style for this card/i);
    expect(buildSceneRequest(sceneInput).prompt).not.toMatch(/Rendering style for this card/i);
  });
});
