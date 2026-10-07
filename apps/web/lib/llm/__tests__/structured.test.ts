import { describe, expect, it, vi } from "vitest";

// 보고 답하기 호출도 같은 계량 줄(`recordFrom`)을 지나는지 본다(2차 D5). 되살리기 시험과는 상관없다.
const 적은것: Array<{ model: string; response: unknown }> = [];
vi.mock("../meter", () => ({ recordFrom: (model: string, response: unknown) => { 적은것.push({ model, response }); } }));

const {
  AnthropicStructuredProvider, OpenAIStructuredProvider, anthropicUserContent, openaiUserContent, unwrapStringified,
} = await import("../structured");

describe("문자열로 만들어 온 결과 되살리기", () => {
  it("멀쩡한 결과는 그대로 둔다", () => {
    const input = { total: 4, cards: [{ index: 1 }] };
    expect(unwrapStringified(input)).toBe(input);
  });

  it("칸 하나를 문자열로 만들어 오면 되살린다", () => {
    const result = unwrapStringified({ total: 4, cards: '[{"index":1},{"index":2}]' });
    expect((result as { cards: unknown[] }).cards).toHaveLength(2);
  });

  it("결과 전체를 한 칸에 문자열로 넣어 와도 되살린다", () => {
    // 자료가 3,000자를 넘으면 실제로 이렇게 온다.
    const result = unwrapStringified({
      cards: '{"total":4,"cards":[{"index":1},{"index":2},{"index":3}]}',
    });
    expect((result as { total: number }).total).toBe(4);
    expect((result as { cards: unknown[] }).cards).toHaveLength(3);
  });

  it("진짜 문자열은 건드리지 않는다", () => {
    const input = { summary: "문제 없음", decision: "pass" };
    expect(unwrapStringified(input)).toBe(input);
  });

  it("JSON 처럼 생겼지만 깨진 문자열은 그대로 둔다", () => {
    const input = { cards: "{망가진" };
    expect(unwrapStringified(input)).toBe(input);
  });

  it("객체가 아니면 그대로 둔다", () => {
    expect(unwrapStringified("문자열")).toBe("문자열");
    expect(unwrapStringified(null)).toBe(null);
  });

  it("여는 괄호로 시작하지 않는 문자열은 파싱하지 않는다", () => {
    const input = { note: "3,000자를 넘으면 [이런 일]이 생긴다" };
    expect(unwrapStringified(input)).toBe(input);
  });
});

describe("이미지를 함께 보내기 (2026-10-07 「쉽게」 2차 D5)", () => {
  it("이미지가 없으면 지금처럼 글 하나다 — 다른 곳의 호출은 그대로", () => {
    expect(anthropicUserContent("말")).toBe("말");
    expect(openaiUserContent("말", [])).toBe("말");
  });

  it("주소 · base64 를 업체 모양으로 싣는다 — 그림 먼저, 글은 마지막", () => {
    expect(anthropicUserContent("말", [{ url: "https://x.test/a.png" }, { mediaType: "image/webp", data: "AAA" }])).toEqual([
      { type: "image", source: { type: "url", url: "https://x.test/a.png" } },
      { type: "image", source: { type: "base64", media_type: "image/webp", data: "AAA" } },
      { type: "text", text: "말" },
    ]);
    expect(openaiUserContent("말", [{ url: "https://x.test/a.png" }, { mediaType: "image/png", data: "BBB" }])).toEqual([
      { type: "input_image", image_url: "https://x.test/a.png", detail: "auto" },
      { type: "input_image", image_url: "data:image/png;base64,BBB", detail: "auto" },
      { type: "input_text", text: "말" },
    ]);
  });
});

/**
 * **이 어댑터는 다른 기능도 같이 쓴다**(카드뉴스 · 포스터 · 캐릭터 · 문의). 이미지를 안 넘기는 호출의 요청은
 * 이미지 입력을 더하기 전과 글자 하나 다르지 않아야 한다 — 글 하나(`string`)다. 이미지를 넘긴 호출도 같은
 * 계량 줄(`recordFrom`)을 지난다(2차 D5 — 값은 회사 원가로 판정 예약에 적힌다).
 */
describe("요청 모양은 이미지가 없으면 예전 그대로다", () => {
  const spec = { name: "t", description: "d", schema: { type: "object" } };

  const anthropic = () => {
    const 보낸: unknown[] = [];
    const response = { content: [{ type: "tool_use", name: "t", input: { reply: "네" } }] };
    const client = { messages: { create: async (body: unknown) => { 보낸.push(body); return response; } } };
    return { 보낸, response, provider: new AnthropicStructuredProvider(client as never, "m-a", spec) };
  };
  const openai = () => {
    const 보낸: unknown[] = [];
    const response = { output: [{ type: "function_call", name: "t", arguments: "{\"reply\":\"네\"}" }] };
    const client = { responses: { create: async (body: unknown) => { 보낸.push(body); return response; } } };
    return { 보낸, response, provider: new OpenAIStructuredProvider(client as never, "m-o", spec) };
  };

  it("Anthropic: 이미지 없이 부르면 예전 요청과 글자까지 같다", async () => {
    const { 보낸, provider } = anthropic();
    expect(await provider.generate("말")).toEqual({ reply: "네" });
    expect(JSON.stringify(보낸[0])).toBe(JSON.stringify({
      model: "m-a",
      max_tokens: 4096,
      messages: [{ role: "user", content: "말" }],
      tools: [{ name: "t", description: "d", input_schema: { type: "object" } }],
      tool_choice: { type: "tool", name: "t", disable_parallel_tool_use: true },
    }));
  });

  it("OpenAI: 이미지 없이 부르면 예전 요청과 글자까지 같다", async () => {
    const { 보낸, provider } = openai();
    expect(await provider.generate("말", [])).toEqual({ reply: "네" });
    expect(JSON.stringify(보낸[0])).toBe(JSON.stringify({
      model: "m-o",
      input: [
        { role: "developer", content: "Return only the requested structured result." },
        { role: "user", content: "말" },
      ],
      tools: [{ type: "function", name: "t", description: "d", parameters: { type: "object" }, strict: false }],
      tool_choice: { type: "function", name: "t" },
    }));
  });

  it("이미지를 넘기면 사용자 글에만 싣고, 같은 계량 줄을 지난다", async () => {
    적은것.length = 0;
    const a = anthropic();
    await a.provider.generate("말", [{ url: "https://x.test/a.png" }]);
    expect((a.보낸[0] as { messages: Array<{ content: unknown }> }).messages[0]!.content).toEqual(anthropicUserContent("말", [{ url: "https://x.test/a.png" }]));
    const o = openai();
    await o.provider.generate("말", [{ mediaType: "image/png", data: "BBB" }]);
    expect((o.보낸[0] as { input: Array<{ content: unknown }> }).input[1]!.content).toEqual(openaiUserContent("말", [{ mediaType: "image/png", data: "BBB" }]));
    expect(적은것).toEqual([{ model: "m-a", response: a.response }, { model: "m-o", response: o.response }]);
  });
});
