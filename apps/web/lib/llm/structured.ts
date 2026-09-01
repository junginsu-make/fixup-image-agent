import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * 구조화된 응답을 강제로 받아내는 공용 어댑터.
 *
 * 도메인을 모른다 — 스키마를 받아서 그대로 요구할 뿐이다. 카드뉴스와 포스터가
 * 같이 쓴다. 복사하면 한쪽만 고치는 일이 반드시 생긴다.
 */

export type JsonSchema = Record<string, unknown>;
export type StructuredSpec = { name: string; description: string; schema: JsonSchema };

export interface StructuredProvider {
  generate(prompt: string): Promise<unknown>;
}

export class AnthropicStructuredProvider implements StructuredProvider {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly spec: StructuredSpec,
  ) {}

  async generate(prompt: string): Promise<unknown> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
      tools: [{
        name: this.spec.name,
        description: this.spec.description,
        input_schema: this.spec.schema as Anthropic.Tool.InputSchema,
      }],
      // 도구를 반드시 부르게 한다. 자유 문장으로 답하면 파싱이 깨진다.
      tool_choice: { type: "tool", name: this.spec.name, disable_parallel_tool_use: true },
    });
    const call = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === this.spec.name,
    );
    if (!call) throw new Error(`Claude가 ${this.spec.name} 결과를 돌려주지 않았습니다.`);
    return call.input;
  }
}

export class OpenAIStructuredProvider implements StructuredProvider {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
    private readonly spec: StructuredSpec,
  ) {}

  async generate(prompt: string): Promise<unknown> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: "developer", content: "Return only the requested structured result." },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        name: this.spec.name,
        description: this.spec.description,
        parameters: this.spec.schema,
        strict: false,
      }],
      tool_choice: { type: "function", name: this.spec.name },
    });
    const call = response.output.find((item) => item.type === "function_call" && item.name === this.spec.name);
    if (!call || call.type !== "function_call") {
      throw new Error(`OpenAI가 ${this.spec.name} 결과를 돌려주지 않았습니다.`);
    }
    return JSON.parse(call.arguments) as unknown;
  }
}
