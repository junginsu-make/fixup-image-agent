import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIFY_YOUTUBE_RUN_ESTIMATE_USD, WEB_SEARCH_CALL_USD, llmUsdFromTokens } from "@fixup/shared";

/**
 * **카드뉴스 기획의 웹검색 조사·Apify 도 한 줄씩 적는다**(설계 2026-09-30 §3.4).
 *
 * 둘 다 `ingest-core` 안에서 업체를 부른다. 꾸러미는 DB 를 모르므로 앱이 콜백을 넘긴다 —
 * 그 연결이 여기(`source-adapters.ts`) 하나다. 빠지면 조사·자막 값이 장부 밖으로 샌다.
 */

vi.mock("@fixup/ingest-core/src/adapters/topic", () => ({
  TopicResearchNotConfiguredError: class extends Error {},
  createOpenAITopicResearcher: (_env: unknown, record: (input: unknown) => void) => async () => {
    record({ provider: "openai", feature: "research", model: "gpt-5.6-sol", usage: { input_tokens: 2000, output_tokens: 500 }, toolCalls: 3, topic: "t" });
    return { text: "조사", citations: [] };
  },
}));
vi.mock("@fixup/ingest-core/src/adapters/youtube", () => ({
  ingestYoutube: async (input: { onApifyRun?: (run: { actor: string; failed: boolean }) => void }) => {
    input.onApifyRun?.({ actor: "automation-lab~youtube-transcript", failed: false });
    return { id: "sns", segments: [] };
  },
}));

const { replaceAiCostWriterForTest } = await import("../../ai-cost/write");
const { withLlmMeter } = await import("../../llm/meter");
const { createSourceAdapters } = await import("../source-adapters");

let rows: Array<Record<string, unknown>> = [];
beforeEach(() => {
  rows = [];
  replaceAiCostWriterForTest(async (row) => { rows.push(row as unknown as Record<string, unknown>); });
});
afterEach(() => replaceAiCostWriterForTest(null));

describe("카드뉴스 자료 모으기", () => {
  it("주제 조사 한 번 — 토큰 값 + 웹검색 횟수 × 단가", async () => {
    await withLlmMeter(async () => {
      await createSourceAdapters({ OPENAI_API_KEY: "k" }).research("주제");
    });
    expect(rows).toEqual([expect.objectContaining({
      p_provider: "openai", p_model: "gpt-5.6-sol", p_input_tokens: 2000, p_output_tokens: 500, p_basis: "tokens",
      p_usd: Number((llmUsdFromTokens("gpt-5.6-sol", 2000, 500) + 3 * WEB_SEARCH_CALL_USD).toFixed(6)),
    })]);
  });

  it("유튜브가 Apify 로 넘어가면 한 줄 — 금액은 실행 1회 추정", async () => {
    await withLlmMeter(async () => {
      await createSourceAdapters({}).ingestYoutube({ id: "sns", url: "https://youtu.be/iP5RUzXhWoc" });
    });
    expect(rows).toEqual([expect.objectContaining({
      p_provider: "apify", p_model: "automation-lab~youtube-transcript", p_usd: APIFY_YOUTUBE_RUN_ESTIMATE_USD, p_basis: "estimate", p_failed: false,
    })]);
  });
});
