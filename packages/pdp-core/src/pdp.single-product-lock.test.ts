import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";

/**
 * **제품 하나·사진 하나면 1·2단계와 글자 하나 다르지 않다**(3단계 계획 Global Constraints).
 *
 * `__fixtures__/single-product-prompts.json` 은 여러 제품을 넣기 **전** 커밋(94426905)이 같은
 * 입력으로 낸 프롬프트·시스템 문장·참조다. 새 코드끼리 비교하면 둘이 함께 바뀌어도 못 잡는다.
 * 입력도 고정본 안에 있다 — 시험과 고정본이 서로 다른 입력을 보는 일이 없게.
 */
type Captured = { prompt: string; systemPrompt: string; references: Array<{ kind: string; base64: string; url: string | null }> };
const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/single-product-prompts.json", import.meta.url), "utf8"),
) as { section: unknown; cases: Record<string, Captured & { request: Record<string, unknown> }> };

async function send(request: Record<string, unknown>): Promise<Captured> {
  let sent: { prompt: string; systemPrompt: string; references: Array<{ kind: string; base64: string; url?: string }> } | undefined;
  await (new PdpService() as never as { generateSectionImageInternal(input: unknown): Promise<unknown> })
    .generateSectionImageInternal({
      ...request,
      section: fixture.section,
      aspectRatio: "3:4",
      options: { style: "studio", withModel: false, outputMode: "editable", ...(request.options as object) },
      client: { llm: { generate: async () => ({ text: "{}" }) }, models: { generateContent: async () => ({ text: "{}" }) } },
      generateImage: async (_model: unknown, input: typeof sent) => {
        sent = input;
        return { base64: "IMG", mimeType: "image/jpeg" };
      },
    });
  return {
    prompt: sent!.prompt,
    systemPrompt: sent!.systemPrompt,
    references: sent!.references.map((ref) => ({ kind: ref.kind, base64: ref.base64, url: ref.url ?? null })),
  };
}

describe("제품 하나·사진 하나 — 1·2단계 출력 고정", () => {
  for (const [name, expected] of Object.entries(fixture.cases)) {
    it(`products 없이 부르면 그대로다: ${name}`, async () => {
      const got = await send(expected.request);
      expect(got.prompt).toBe(expected.prompt);
      expect(got.systemPrompt).toBe(expected.systemPrompt);
      expect(got.references).toEqual(expected.references);
    });
  }

  // 화면이 `products` 로 보내도 제품이 하나·사진이 하나면 옛 몸통(주소 + 사실)과 같아야 한다.
  for (const name of ["urlFacts", "everything"]) {
    it(`products 에 제품 하나·사진 하나를 실어도 그대로다: ${name}`, async () => {
      const expected = fixture.cases[name]!;
      const { productFacts, ...rest } = expected.request.options as Record<string, unknown>;
      const got = await send({
        productImageUrl: expected.request.productImageUrl,
        options: {
          ...rest,
          products: [{ id: "p1", name: "레몬맛", imageUrls: [expected.request.productImageUrl], facts: productFacts }],
        },
      });
      expect(got.prompt).toBe(expected.prompt);
      expect(got.systemPrompt).toBe(expected.systemPrompt);
      expect(got.references).toEqual(expected.references);
    });
  }
});
