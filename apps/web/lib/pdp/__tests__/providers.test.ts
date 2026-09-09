import { describe, expect, it, vi } from "vitest";

/**
 * 상세페이지의 글 모델 배선.
 *
 * **Claude 가 먼저, 실패하면 OpenAI.** 이 순서가 뒤집히거나 예비가 조용히
 * 사라지면 사용자는 「가끔 잘 되고 가끔 안 된다」로만 겪는다.
 *
 * SDK 를 통째로 가짜로 바꿔 넣고 **무엇이 어느 쪽으로 갔는지**를 잰다.
 */

const anthropicCalls: Array<Record<string, unknown>> = [];
const openaiCalls: Array<Record<string, unknown>> = [];
let anthropicThrows: Error | null = null;

vi.mock("server-only", () => ({}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (args: Record<string, unknown>) => {
        anthropicCalls.push(args);
        if (anthropicThrows) throw anthropicThrows;
        return {
          content: [{ type: "tool_use", name: (args.tools as Array<{ name: string }>)[0]!.name, input: { from: "claude" } }],
        };
      },
    };
  },
}));

vi.mock("openai", () => ({
  default: class {
    responses = {
      create: async (args: Record<string, unknown>) => {
        openaiCalls.push(args);
        return {
          output: [
            {
              type: "function_call",
              name: (args.tools as Array<{ name: string }>)[0]!.name,
              arguments: JSON.stringify({ from: "openai" }),
            },
          ],
        };
      },
    };
  },
}));

const { createPdpLlm, createPdpLlmOrNull, PdpProviderConfigurationError } = await import("../providers");

const 요청 = {
  name: "pdp_brief",
  prompt: "무엇을 파는지 정리해 주세요",
  schema: { type: "object", properties: { offeringName: { type: "string" } } },
};

const 환경 = { ANTHROPIC_API_KEY: "a-key", OPENAI_API_KEY: "o-key" };

function reset() {
  anthropicCalls.length = 0;
  openaiCalls.length = 0;
  anthropicThrows = null;
}

describe("Claude 가 먼저다", () => {
  it("Claude 가 답하면 OpenAI 는 부르지 않는다", async () => {
    reset();
    const result = await createPdpLlm(환경).generate(요청);

    expect(JSON.parse(result.text)).toEqual({ from: "claude" });
    expect(anthropicCalls).toHaveLength(1);
    expect(openaiCalls).toHaveLength(0);
  });

  it("도구를 반드시 부르게 못 박는다 — 자유 문장으로 답하면 파싱이 깨진다", async () => {
    reset();
    await createPdpLlm(환경).generate(요청);

    expect(anthropicCalls[0]!.tool_choice).toEqual({
      type: "tool",
      name: "pdp_brief",
      disable_parallel_tool_use: true,
    });
    expect((anthropicCalls[0]!.tools as Array<{ input_schema: unknown }>)[0]!.input_schema).toEqual(요청.schema);
  });

  it("그림을 글보다 먼저 싣는다 — 프롬프트가 「첫 번째 그림」이라 부를 때 맞아야 한다", async () => {
    reset();
    await createPdpLlm(환경).generate({
      ...요청,
      images: [
        { base64: "PRODUCT", mimeType: "image/png" },
        { base64: "PERSON", mimeType: "image/png" },
      ],
    });

    const content = (anthropicCalls[0]!.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]!.content;
    expect(content.map((part) => part.type)).toEqual(["image", "image", "text"]);
    expect((content[0]!.source as { data: string }).data).toBe("PRODUCT");
    expect((content[1]!.source as { data: string }).data).toBe("PERSON");
  });
});

describe("Claude 가 실패하면 OpenAI 로 넘어간다", () => {
  it("예비가 같은 결과를 돌려준다", async () => {
    reset();
    anthropicThrows = new Error("overloaded");
    const result = await createPdpLlm(환경).generate(요청);

    expect(JSON.parse(result.text)).toEqual({ from: "openai" });
    expect(openaiCalls).toHaveLength(1);
    expect(openaiCalls[0]!.tool_choice).toEqual({ type: "function", name: "pdp_brief" });
  });

  it("예비 키가 없으면 원래 오류를 그대로 올린다 — 조용히 삼키지 않는다", async () => {
    reset();
    anthropicThrows = new Error("overloaded");
    await expect(createPdpLlm({ ANTHROPIC_API_KEY: "a-key" }).generate(요청)).rejects.toThrow("overloaded");
    expect(openaiCalls).toHaveLength(0);
  });

  it("예비에도 그림이 실린다", async () => {
    reset();
    anthropicThrows = new Error("overloaded");
    await createPdpLlm(환경).generate({ ...요청, images: [{ base64: "IMG", mimeType: "image/png" }] });

    const content = (openaiCalls[0]!.input as Array<{ content: Array<Record<string, unknown>> }>)[1]!.content;
    expect(content.map((part) => part.type)).toEqual(["input_image", "input_text"]);
    expect(content[0]!.image_url).toBe("data:image/png;base64,IMG");
  });
});

describe("키가 없을 때", () => {
  it("어떤 키가 없는지 말한다", () => {
    expect(() => createPdpLlm({})).toThrow(PdpProviderConfigurationError);
    try {
      createPdpLlm({});
    } catch (error) {
      expect((error as InstanceType<typeof PdpProviderConfigurationError>).missing).toEqual([
        "ANTHROPIC_API_KEY",
      ]);
    }
  });

  it("없어도 되는 자리에서는 null 이다", () => {
    expect(createPdpLlmOrNull({})).toBeNull();
    expect(createPdpLlmOrNull(환경)).not.toBeNull();
  });
});

describe("모델 이름", () => {
  it("환경변수가 있으면 그것을 쓴다", async () => {
    reset();
    await createPdpLlm({ ...환경, ANTHROPIC_MODEL: "claude-opus-5" }).generate(요청);
    expect(anthropicCalls[0]!.model).toBe("claude-opus-5");
  });

  it("없으면 기본값을 쓴다", async () => {
    reset();
    await createPdpLlm(환경).generate(요청);
    expect(anthropicCalls[0]!.model).toBe("claude-sonnet-5");
  });
});
