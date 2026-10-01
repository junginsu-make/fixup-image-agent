import { afterEach, describe, expect, it, vi } from "vitest";
import { costOperationKey, providerOfModel } from "../keys";
import { flushAiCostWrites, replaceAiCostWriterForTest, toAiCostRow, writeAiCostRow } from "../write";

/**
 * 비용 한 줄의 **이름표와 모양**(설계 2026-09-30 §3.1·§3.4).
 *
 * 작업 칸은 기능별 비용을 가르는 유일한 자리다 — C2 가 새 작업 이름 대신 resource 로
 * 갔기 때문이다. 여기서 id 를 안 떼면 프로젝트마다 다른 줄이 되어 합계가 흩어진다.
 */

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("작업 키", () => {
  it.each([
    ["sns_image", `sns:${ID}:plan`, "sns:plan"],
    ["sns_image", `sns:${ID}:caption`, "sns:caption"],
    ["sns_image", `sns:${ID}`, "sns"],
    ["sns_image", "sns:layout-analysis", "sns:layout-analysis"],
    ["poster_image", `poster:${ID}:review`, "poster:review"],
    ["poster_image", "easy:decide", "easy:decide"],
    ["ad_export", "ad:export:cutout", "ad:export:cutout"],
    ["cs_ask", "cs:ask", "cs:ask"],
  ])("%s + %s → %s", (operation, resource, key) => {
    expect(costOperationKey(operation, resource)).toBe(key);
  });

  it("resource 가 없거나 주소면 작업 이름을 쓴다", () => {
    expect(costOperationKey("poster_image")).toBe("poster_image");
    expect(costOperationKey("poster_image", `/api/poster/projects/${ID}/generate`)).toBe("poster_image");
  });
});

describe("공급자", () => {
  it.each([
    ["claude-sonnet-5", "anthropic"],
    ["gpt-5.6-sol", "openai"],
    ["text-embedding-3-small", "openai"],
    ["gemini-3.1-pro-preview", "google"],
    ["mystery-model", "other"],
  ])("%s → %s", (model, provider) => {
    expect(providerOfModel(model)).toBe(provider);
  });
});

describe("한 줄의 모양", () => {
  it("uuid 가 아닌 회원·요청 값은 비운다 — 로컬 우회 계정(`local-dev`)이 표를 깨지 않게", () => {
    const row = toAiCostRow({ userId: "dev", requestId: "local-dev", operation: "cs:ask" }, { provider: "anthropic", model: "m", usd: 0.1, basis: "tokens" });
    expect(row.p_user).toBeNull();
    expect(row.p_request).toBeNull();
  });

  it("음수·소수 토큰과 100 을 넘는 그림 수를 표가 받는 범위로 자른다", () => {
    const row = toAiCostRow(undefined, { provider: "fal", model: "m", inputTokens: -5, outputTokens: 2.6, images: 500, basis: "image_unit" });
    expect(row).toMatchObject({ p_input_tokens: 0, p_output_tokens: 3, p_images: 100, p_usd: null, p_operation: "unbound" });
  });
});

describe("쓰기가 실패하면", () => {
  afterEach(() => replaceAiCostWriterForTest(null));

  it("던지지 않고 경고 한 줄을 남긴다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    replaceAiCostWriterForTest(async () => { throw new Error("rpc 실패"); });
    await expect(writeAiCostRow(undefined, { provider: "openai", model: "m", usd: 1, basis: "tokens" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[ai-cost] 비용 한 줄을 적지 못했습니다", expect.objectContaining({ message: "rpc 실패" }));
    warn.mockRestore();
  });

  it("줄 모양을 만드는 자리(toAiCostRow)가 던져도 처리 안 된 거부 없이 경고만 남긴다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // falRequestId 가 문자열이 아니면 `.trim()` 이 던진다 — toAiCostRow 도 try 안에 있어야 한다.
    const badEntry = { provider: "fal", model: "m", usd: 1, basis: "tokens", falRequestId: 123 } as unknown as Parameters<typeof writeAiCostRow>[1];
    await expect(writeAiCostRow({ userId: null, requestId: null, operation: "poster" }, badEntry)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[ai-cost] 비용 한 줄을 적지 못했습니다", expect.objectContaining({ operation: "poster", provider: "fal" }));
    warn.mockRestore();
  });

  it("Supabase 가 비어 있으면(로컬·시험) 아무것도 안 하고 경고도 안 한다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const saved = process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    await writeAiCostRow(undefined, { provider: "openai", model: "m", usd: 1, basis: "tokens" });
    expect(warn).not.toHaveBeenCalled();
    if (saved !== undefined) process.env.SUPABASE_SECRET_KEY = saved;
    warn.mockRestore();
  });
});

describe("기다리기", () => {
  it("느린 쓰기를 한도까지만 기다린다", async () => {
    const 영영 = new Promise<void>(() => undefined);
    const 시작 = Date.now();
    await flushAiCostWrites([영영], 30);
    expect(Date.now() - 시작).toBeLessThan(1000);
  });
});
