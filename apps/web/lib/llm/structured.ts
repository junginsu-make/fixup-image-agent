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

/**
 * 문자열로 만들어 온 결과를 되살린다.
 *
 * **자료가 3,000자를 넘으면 Claude 가 결과를 JSON 문자열로 만들어 넣는다.**
 * 실측으로 확인했다 — 1,000자에서는 배열이 오고 3,000자부터는 문자열이 온다.
 * `stop_reason` 은 `tool_use` 고 출력 토큰도 850/4096 이라 잘린 것이 아니다.
 * max_tokens 를 16,000 으로 올려도 똑같다. 긴 입력에서 도구 호출 형식이
 * 흐트러지는 것이지 자리가 모자란 것이 아니다.
 *
 * 예비 제공자로 넘어가면 결과는 나오지만 주 모델이 매번 헛돈다.
 * 되살릴 수 있으면 되살린다.
 *
 * **JSON 처럼 생긴 문자열만 건드린다.** 진짜 문자열(요약·판정 문구)은 그대로 둔다.
 */
export function unwrapStringified(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  const repaired: Record<string, unknown> = { ...record };
  let changed = false;

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // 원래 그런 문자열일 수도 있다. 건드리지 않는다.
    }
    // 결과 전체를 한 칸에 넣어 온 경우 — 바깥으로 펼친다.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && key in parsed) {
      return { ...record, ...(parsed as Record<string, unknown>) };
    }
    repaired[key] = parsed;
    changed = true;
  }
  return changed ? repaired : input;
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
    return unwrapStringified(call.input);
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
    return unwrapStringified(JSON.parse(call.arguments) as unknown);
  }
}
