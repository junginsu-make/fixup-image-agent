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
let anthropicReply: { input: unknown; stop_reason?: string } | null = null;

vi.mock("server-only", () => ({}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (args: Record<string, unknown>) => {
        anthropicCalls.push(args);
        if (anthropicThrows) throw anthropicThrows;
        return {
          stop_reason: anthropicReply?.stop_reason ?? "tool_use",
          content: [
            {
              type: "tool_use",
              name: (args.tools as Array<{ name: string }>)[0]!.name,
              input: anthropicReply ? anthropicReply.input : { from: "claude" },
            },
          ],
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
  anthropicReply = null;
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
  it("검수는 기존 공통 환경변수를 쓴다", async () => {
    reset();
    await createPdpLlm({ ...환경, ANTHROPIC_MODEL: "claude-opus-5" }).generate({ ...요청, name: "pdp_review" });
    expect(anthropicCalls[0]!.model).toBe("claude-opus-5");
  });

  it("기획의 기본은 Fable이다", async () => {
    reset();
    await createPdpLlm(환경).generate(요청);
    expect(anthropicCalls[0]!.model).toBe("claude-fable-5");
  });
  it("공통 Sonnet 설정이 있어도 상세페이지 기획은 Fable을 쓴다", async () => {
    reset();
    await createPdpLlm({ ...환경, ANTHROPIC_MODEL: "claude-sonnet-5" }).generate(요청);
    expect(anthropicCalls[0]!.model).toBe("claude-fable-5");
  });
  it("기획 전용 override는 검수 모델을 바꾸지 않는다", async () => {
    reset(); const llm = createPdpLlm({ ...환경, PDP_PLANNING_MODEL: "test-fable", ANTHROPIC_MODEL: "test-review" });
    await llm.generate(요청); await llm.generate({ ...요청, name: "pdp_qa" });
    expect(anthropicCalls.map(call => call.model)).toEqual(["test-fable", "test-review"]);
  });
  it("알 수 없는 모델 404를 조용한 대체 실행으로 숨기지 않는다", async () => {
    reset(); anthropicThrows = Object.assign(new Error("model not found"), { status: 404 });
    await expect(createPdpLlm(환경).generate(요청)).rejects.toThrow("model not found");
    expect(openaiCalls).toHaveLength(0);
  });
  it("대체 실행 모델과 사유를 호출 결과에 남긴다", async () => {
    reset(); anthropicThrows = Object.assign(new Error("overloaded"), { status: 529 });
    const result = await createPdpLlm(환경).generate(요청);
    expect(result).toMatchObject({ execution: { purpose: "planning", provider: "openai", model: "gpt-5.6-sol", fallbackFrom: "claude-fable-5", fallbackReason: "provider_529" } });
  });
});

/**
 * **답이 잘렸으면 잘렸다고 말한다.**
 *
 * 2026-09-17 W3 실호출 검증에서 텍스트 기획이 111초를 쓰고
 * `INVALID_REQUEST`(「구성안을 만들지 못했습니다」)로 죽었다. 원인은 모델이
 * `max_tokens` 에 걸려 도구 인자를 끝까지 못 쓴 것이고, 그 조각난 값이
 * 조용히 아래로 흘러 「섹션이 0개」가 됐다. 값은 이미 다 치렀다.
 *
 * 종료 사유를 보면 그 자리에서 알 수 있다.
 */
describe("잘린 답을 결과로 쓰지 않는다", () => {
  it("max_tokens 로 끝났으면 조각난 값을 돌려주지 않는다", async () => {
    reset();
    anthropicReply = { input: { sections: [] }, stop_reason: "max_tokens" };

    await expect(createPdpLlm(환경).generate(요청)).rejects.toThrow(/잘렸|truncat/i);
  });

  it("잘림은 예비 모델로 넘기지 않는다 — 같은 길이를 또 치른다", async () => {
    reset();
    anthropicReply = { input: {}, stop_reason: "max_tokens" };

    await expect(createPdpLlm(환경).generate(요청)).rejects.toThrow();
    expect(openaiCalls).toHaveLength(0);
  });

  it("기획 호출은 검수보다 길게 답할 자리를 준다", async () => {
    reset();
    const llm = createPdpLlm(환경);
    await llm.generate({ ...요청, name: "pdp_blueprint", purpose: "planning" });
    await llm.generate({ ...요청, name: "pdp_review", purpose: "review" });

    const 기획 = anthropicCalls[0]!.max_tokens as number;
    const 검수 = anthropicCalls[1]!.max_tokens as number;
    expect(기획).toBeGreaterThan(8192);
    expect(기획).toBeGreaterThan(검수);
  });
});
