import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import type { SectionBlueprint } from "./types";

/**
 * 제품 블록이 **실제로 fal 에 가는 프롬프트의 양 끝**에 있는가.
 * 모듈 시험만으로는 배선이 빠져도 통과한다(2026-09-08 카드뉴스에서 그랬다).
 */
const section = (): SectionBlueprint =>
  ({ section_id: "s1", section_name: "히어로", headline: "제목", subheadline: "부제",
     prompt_en: "a clean product photo on a table", layout_notes: "", bullets: [] }) as unknown as SectionBlueprint;

async function sent(options: Record<string, unknown>) {
  const captured: Array<{ prompt: string; systemPrompt: string }> = [];
  await (new PdpService() as never as { generateSectionImageInternal(input: unknown): Promise<unknown> })
    .generateSectionImageInternal({
      originalImageBase64: "iVBORw0KGgo=",
      section: section(),
      aspectRatio: "3:4",
      options: { style: "studio", withModel: false, outputMode: "editable", ...options },
      client: { llm: { generate: async () => ({ text: "{}" }) }, models: { generateContent: async () => ({ text: "{}" }) } },
      generateImage: async (_model: unknown, input: { prompt: string; systemPrompt: string }) => {
        captured.push(input);
        return { base64: "IMG", mimeType: "image/jpeg" };
      },
    });
  return captured[0]!;
}

describe("제품 블록 배선", () => {
  it("앞 블록은 장면 JSON 보다 앞, 마지막 확인은 역할 지시보다 뒤", async () => {
    const { prompt } = await sent({});
    const head = prompt.indexOf("PRODUCT FIDELITY");
    const json = prompt.indexOf('"task"');
    const roles = prompt.indexOf("Reference images (");
    const tail = prompt.indexOf("Final check:");
    expect(head).toBeGreaterThanOrEqual(0);
    expect(head).toBeLessThan(json);
    expect(roles).toBeGreaterThan(json);
    expect(tail).toBeGreaterThan(roles);
  });

  it("사용자 지시가 있으면 지시가 맨 앞·맨 뒤를 지킨다", async () => {
    const { prompt } = await sent({ userInstruction: "왼쪽에 놓아 주세요" });
    expect(prompt.indexOf("USER INSTRUCTION")).toBeLessThan(prompt.indexOf("PRODUCT FIDELITY"));
    expect(prompt.indexOf("Final check:")).toBeGreaterThanOrEqual(0);
    expect(prompt.indexOf("Final check:")).toBeLessThan(prompt.indexOf("Before drawing, re-read"));
  });

  it("시스템 문장에도 제품 한 줄이 있다 — Nano Banana Pro 는 이것을 system_prompt 로 받는다", async () => {
    const { systemPrompt } = await sent({});
    expect(systemPrompt).toMatch(/real product being sold/);
  });

  it("각도 자유 문장은 그대로 남는다(D3)", async () => {
    const { prompt, systemPrompt } = await sent({});
    expect(prompt).toMatch(/Do NOT copy the reference's camera angle/);
    expect(systemPrompt).toMatch(/Vary it between sections/);
  });

  it("글 경로의 대표 이미지(key-visual)에는 제품 블록이 없다", async () => {
    const { prompt, systemPrompt } = await sent({ anchorKind: "key-visual" });
    expect(prompt).not.toMatch(/PRODUCT FIDELITY|Final check:/);
    expect(systemPrompt).not.toMatch(/real product being sold/);
  });

  it("보존을 끄고 레퍼런스를 붙이면 색은 바꿔도 되는 쪽", async () => {
    const { prompt, systemPrompt } = await sent({
      preserveProductImage: false,
      styleReferenceImages: [{ base64: "REF", mimeType: "image/png" }],
    });
    const free = prompt.split("\n").find((line) => line.startsWith("Free to change:")) ?? "";
    expect(free).toMatch(/colour/);
    expect(systemPrompt).toMatch(/colour and finish follow the design reference/);
    expect(systemPrompt).not.toMatch(/exact product/);
  });

  it("읽어 둔 라벨 글자가 실린다", async () => {
    const { prompt } = await sent({ productFacts: { visibleFacts: [], labelText: ["FIXUP 500ml"] } });
    expect(prompt).toContain(JSON.stringify("FIXUP 500ml"));
  });

  it("캐릭터가 실제로 실릴 때만 둘 다 알아보게 하라는 줄", async () => {
    expect((await sent({})).prompt).not.toMatch(/both be clearly recognisable/);
    const { prompt } = await sent({
      withModel: true,
      characterReferences: [{ base64: "CH", mimeType: "image/png", identityPrompt: "흰 고양이", kind: "animal", look: "photoreal" }],
    });
    expect(prompt).toMatch(/both be clearly recognisable/);
  });

  it("제품 주소가 오면 첫 참조가 그 주소다", async () => {
    const refs: Array<{ url?: string; base64: string }> = [];
    await (new PdpService() as never as { generateSectionImageInternal(input: unknown): Promise<unknown> })
      .generateSectionImageInternal({
        productImageUrl: "https://v3.fal.media/files/a/b.jpg",
        section: section(),
        aspectRatio: "3:4",
        options: { style: "studio", withModel: false, outputMode: "editable" },
        client: { llm: { generate: async () => ({ text: "{}" }) }, models: { generateContent: async () => ({ text: "{}" }) } },
        generateImage: async (_m: unknown, input: { references: Array<{ url?: string; base64: string }> }) => {
          refs.push(...input.references);
          return { base64: "IMG", mimeType: "image/jpeg" };
        },
      });
    expect(refs[0]).toMatchObject({ url: "https://v3.fal.media/files/a/b.jpg" });
  });
});

/**
 * **섹션 제품 사진만, 제품 차례·사진 차례로, 상한에 맞춰**(설계 §6.1·§6.2).
 * fal 로 나가는 진짜 참조 배열과 결과를 붙잡는다.
 */
describe("여러 제품 배선", () => {
  const urls = (id: string, n: number) => Array.from({ length: n }, (_, i) => `https://v3.fal.media/files/${id}-${i}.jpg`);
  const character = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ base64: `CH${i}`, mimeType: "image/png", identityPrompt: "단발 여성", kind: "person", look: "photoreal" }));

  async function run(options: Record<string, unknown>) {
    const captured: Array<{ prompt: string; references: Array<{ kind: string; url?: string; base64: string }> }> = [];
    const result = await (new PdpService() as never as { generateSectionImageInternal(input: unknown): Promise<{ productPhotosDropped?: number }> })
      .generateSectionImageInternal({
        // 계획 R7: 여러 제품 요청도 대표 주소를 함께 싣는다. 그래도 참조는 products 에서 만든다.
        productImageUrl: "https://v3.fal.media/files/p1-0.jpg",
        section: section(),
        aspectRatio: "3:4",
        options: { style: "studio", withModel: false, outputMode: "editable", ...options },
        client: { llm: { generate: async () => ({ text: "{}" }) }, models: { generateContent: async () => ({ text: "{}" }) } },
        generateImage: async (_m: unknown, input: (typeof captured)[number]) => {
          captured.push(input);
          return { base64: "IMG", mimeType: "image/jpeg" };
        },
      });
    return { sent: captured[0]!, result };
  }

  it("섹션 제품 사진(제품 차례·사진 차례) → 인물 → 레퍼런스 순서로 보낸다", async () => {
    const { sent, result } = await run({
      withModel: true,
      characterReferences: character(1),
      styleReferenceImages: [{ base64: "REF", mimeType: "image/png" }],
      products: [
        { id: "p1", name: "레몬맛", imageUrls: urls("p1", 2) },
        { id: "p2", name: "자몽맛", imageUrls: urls("p2", 1) },
      ],
    });
    expect(sent.references.map((ref) => ref.url ?? `${ref.kind}:${ref.base64}`)).toEqual([
      ...urls("p1", 2),
      ...urls("p2", 1),
      "person:CH0",
      "style:REF",
    ]);
    expect(sent.prompt).toContain('[Image 3 — PRODUCT 2 "자몽맛", view 1 of 1]');
    expect(sent.prompt).toContain('PRODUCT 1 "레몬맛" — Images 1–2');
    expect(sent.prompt).toMatch(/each product must be the exact product in its own images/);
    expect(result.productPhotosDropped).toBeUndefined();
  });

  it("Nano Banana Pro 에 제품 3×4 + 캐릭터 4각도면 14장에 맞추고 뺀 장수를 알린다", async () => {
    const { sent, result } = await run({
      imageModel: "nano-banana-pro",
      withModel: true,
      characterReferences: character(4),
      products: [
        { id: "p1", imageUrls: urls("p1", 4) },
        { id: "p2", imageUrls: urls("p2", 4) },
        { id: "p3", imageUrls: urls("p3", 4) },
      ],
    });
    expect(sent.references.length).toBeLessThanOrEqual(14);
    expect(sent.references.filter((ref) => ref.kind === "person")).toHaveLength(4);
    expect(result.productPhotosDropped).toBe(2);
    const sentUrls = sent.references.map((ref) => ref.url);
    for (const id of ["p1", "p2", "p3"]) expect(sentUrls).toContain(`https://v3.fal.media/files/${id}-0.jpg`);
  });

  it("컨트롤러 응답에도 뺀 장수가 실리고, 안 뺐으면 칸이 없다", async () => {
    const { PdpController } = await import("./pdp.controller");
    const providers = {
      llm: { generate: async () => ({ text: "{}" }) },
      generateImage: async () => ({ base64: "IMG", mimeType: "image/jpeg" }),
    } as never;
    const body = (products: unknown) => ({
      section: section(),
      aspectRatio: "3:4",
      options: { imageModel: "nano-banana-pro", withModel: true, characterReferences: character(4), products },
    }) as never;
    const many = [
      { id: "p1", imageUrls: urls("p1", 4) },
      { id: "p2", imageUrls: urls("p2", 4) },
      { id: "p3", imageUrls: urls("p3", 4) },
    ];
    const dropped = await new PdpController().generateImage(body(many), providers);
    expect(dropped).toMatchObject({ ok: true, productPhotosDropped: 2 });
    const kept = await new PdpController().generateImage(body([{ id: "p1", imageUrls: urls("p1", 2) }]), providers);
    expect(kept.ok).toBe(true);
    expect("productPhotosDropped" in kept).toBe(false);
  });
});
