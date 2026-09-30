import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * **이 꾸러미가 업체를 부르는 자리는 모두 부르는 쪽에 알린다**(설계 2026-09-30 §3.4).
 *
 * 꾸러미는 DB 를 모른다. 그래서 값은 콜백으로 넘기고, 어디에 적을지는 앱이 정한다.
 * 콜백은 **필수 인자**다 — 선택이면 안 넘긴 자리가 조용히 0원이 된다. 여기서는 콜백이
 * 실제로 불리는지를 본다(필수인지는 앱의 타입 시험이 본다).
 */

vi.mock("@neondatabase/serverless", () => ({
  // 태그 템플릿으로 불린다. 문서 한 줄(id)을 돌려준다 — 넣기가 그 id 를 읽는다.
  neon: () => async () => [{ id: "doc-1" }],
}));
vi.mock("openai", () => ({
  default: class {
    embeddings = {
      create: async () => ({ data: [{ embedding: [0.1, 0.2] }], usage: { prompt_tokens: 7, total_tokens: 7 } }),
    };
  },
}));

const { editSection } = await import("./edit-section");
const { retrieveKnowledge, indexKnowledgeDocument } = await import("./rag");

const 그림 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("그림 — 옛 길(업체 직접 호출)", () => {
  it("통로 없이 고치면 그림 한 장을 알린다", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: [{ b64_json: "QUFB" }] }), { status: 200 }));
    const 받은것: unknown[] = [];
    await editSection({
      imageUrl: 그림, request: "밝게", openaiKey: "sk-test",
      onImageUsage: (usage) => 받은것.push(usage),
    });
    expect(받은것).toEqual([{ provider: "openai", images: 1 }]);
  });

  it("통로(fal)로 고치면 알리지 않는다 — 앱이 제 자리에서 적는다", async () => {
    const 받은것: unknown[] = [];
    await editSection({
      imageUrl: 그림, request: "밝게", openaiKey: "sk-test",
      generateImage: async () => ({ buffer: Buffer.from("A"), mimeType: "image/png" }),
      onImageUsage: (usage) => 받은것.push(usage),
    });
    expect(받은것).toEqual([]);
  });
});

describe("임베딩", () => {
  it("질문을 찾을 때 임베딩 토큰을 알린다", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const 받은것: unknown[] = [];
    await retrieveKnowledge("크레딧이 뭔가요", 3, { kind: "guide", onUsage: (usage) => 받은것.push(usage) });
    expect(받은것).toEqual([{ model: "text-embedding-3-small", inputTokens: 7, outputTokens: 0 }]);
  });

  it("지식을 올릴 때 조각마다 알린다", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const 받은것: unknown[] = [];
    const text = `# 하나\n${"가".repeat(200)}\n# 둘\n${"나".repeat(200)}`;
    const result = await indexKnowledgeDocument({ name: "안내", text, kind: "guide", onUsage: (usage) => 받은것.push(usage) });
    // 조각은 120자 이상만 남는다(`chunkText`). 두 절이 두 조각 → 임베딩 두 번.
    expect(result.chunks).toBe(2);
    expect(받은것).toHaveLength(2);
  });
});
