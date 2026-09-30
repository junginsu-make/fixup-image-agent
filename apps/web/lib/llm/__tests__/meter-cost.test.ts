import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { llmUsdFromTokens } from "@fixup/shared";
import { bindAiCaller, currentAiCaller, readLlmMeter, recordAiCost, recordFrom, recordLlmUsage, withLlmMeter } from "../meter";
import { replaceAiCostWriterForTest, type AiCostRow } from "../../ai-cost/write";

/**
 * **공급자를 부를 때마다 비용 한 줄**(설계 2026-09-30 §3.4·§5).
 *
 * 글 모델은 `recordLlmUsage` 한 곳에서 적는다 — 모듈 열한 곳을 따로 감싸지 않는다.
 * 계량기가 없어도 버리지 않는다. 쓰기가 실패해도 호출은 막지 않는다.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";
let rows: AiCostRow[] = [];

beforeEach(() => {
  rows = [];
  replaceAiCostWriterForTest(async (row) => { rows.push(row); });
});
afterEach(() => replaceAiCostWriterForTest(null));

describe("글 모델", () => {
  it("부를 때마다 한 줄 — 누구의 무슨 작업인지와 금액을 싣는다", async () => {
    await withLlmMeter(async () => {
      bindAiCaller({ userId: USER, requestId: REQUEST, operation: "cs:ask" });
      recordFrom("claude-sonnet-5", { usage: { input_tokens: 1200, output_tokens: 300 } });
      recordLlmUsage("gpt-5.6-sol", 100, 50);
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      p_user: USER, p_request: REQUEST, p_operation: "cs:ask",
      p_provider: "anthropic", p_model: "claude-sonnet-5",
      p_input_tokens: 1200, p_output_tokens: 300, p_images: 0,
      p_usd: llmUsdFromTokens("claude-sonnet-5", 1200, 300), p_basis: "tokens",
      p_failed: false, p_fal_request_id: null,
    });
    expect(rows[1]!.p_provider).toBe("openai");
  });

  it("계량기 합산과 같은 금액을 적는다 — 두 벌로 세지 않는다", async () => {
    const 읽은값 = await withLlmMeter(async () => {
      recordLlmUsage("claude-sonnet-5", 5000, 700);
      return readLlmMeter();
    });
    expect(rows[0]!.p_usd).toBe(읽은값.usd);
  });

  it("**계량기 밖에서도 적는다** — 문맥 없음(unbound)으로", async () => {
    recordLlmUsage("claude-sonnet-5", 10, 10);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.p_operation).toBe("unbound");
    expect(rows[0]!.p_user).toBeNull();
  });
});

describe("쓰기", () => {
  it("**요청이 끝나기 전에 쓰기를 기다린다** — 응답 뒤 재시작에 줄이 사라지지 않게", async () => {
    let 끝남 = false;
    replaceAiCostWriterForTest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      끝남 = true;
    });
    await withLlmMeter(async () => { recordLlmUsage("claude-sonnet-5", 1, 1); });
    expect(끝남).toBe(true);
  });

  it("**쓰기가 실패해도 호출은 막지 않는다**", async () => {
    replaceAiCostWriterForTest(async () => { throw new Error("DB 가 죽었다"); });
    const 값 = await withLlmMeter(async () => {
      recordLlmUsage("claude-sonnet-5", 1, 1);
      return "결과";
    });
    expect(값).toBe("결과");
  });

  it("그림 한 줄은 금액을 비워 보낸다 — DB 가 model_prices 로 매긴다", async () => {
    await withLlmMeter(async () => {
      recordAiCost({ provider: "fal", model: "nano-banana-pro", images: 2, basis: "image_unit", falRequestId: "fal-1" });
    });
    expect(rows[0]).toMatchObject({ p_provider: "fal", p_images: 2, p_usd: null, p_basis: "image_unit", p_fal_request_id: "fal-1" });
  });
});

describe("문맥", () => {
  it("겹쳐 열면 바깥 문맥을 물려받고, 안쪽에서 바꿔도 바깥은 그대로다", async () => {
    await withLlmMeter(async () => {
      bindAiCaller({ userId: USER, requestId: REQUEST, operation: "easy:decide" });
      await withLlmMeter(async () => {
        expect(currentAiCaller()?.operation).toBe("easy:decide");
        bindAiCaller({ userId: USER, requestId: REQUEST, operation: "poster:plan" });
        recordLlmUsage("claude-sonnet-5", 1, 1);
      });
      expect(currentAiCaller()?.operation).toBe("easy:decide");
    });
    expect(rows[0]!.p_operation).toBe("poster:plan");
  });

  it("요청끼리 문맥이 섞이지 않는다", async () => {
    await Promise.all([
      withLlmMeter(async () => {
        bindAiCaller({ userId: USER, requestId: null, operation: "sns:plan" });
        await new Promise((resolve) => setTimeout(resolve, 5));
        recordLlmUsage("claude-sonnet-5", 1, 1);
      }),
      withLlmMeter(async () => {
        bindAiCaller({ userId: USER, requestId: null, operation: "cs:ask" });
        recordLlmUsage("claude-sonnet-5", 1, 1);
      }),
    ]);
    expect(rows.map((row) => row.p_operation).sort()).toEqual(["cs:ask", "sns:plan"]);
  });
});
