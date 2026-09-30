import type { ImageUsage, LlmUsage } from "@fixup/redesign-core";
import type { ApifyRunRecorder, TopicUsageRecorder } from "@fixup/ingest-core";
import { APIFY_YOUTUBE_RUN_ESTIMATE_USD, WEB_SEARCH_CALL_USD, llmUsdFromTokens } from "@fixup/shared";
import { recordAiCost, recordLlmUsage, tokensFrom } from "../llm/meter";

/**
 * 꾸러미가 알린 값을 **앱의 한 줄**로 옮긴다(설계 2026-09-30 §3.4 「패키지는 콜백으로」).
 *
 * 꾸러미는 DB 를 모른다. 콜백이 필수 인자라 넘기는 자리는 빠질 수 없고, 넘기는 값은
 * 여기 것 중 하나다 — 자리마다 화살표 함수를 새로 쓰면 한 곳만 금액을 틀리게 옮긴다.
 */

/** 글 모델·임베딩 토큰. 계량기 합산과 비용 한 줄을 함께 남긴다. */
export function recordPackageLlmUsage(usage: LlmUsage): void {
  recordLlmUsage(usage.model, usage.inputTokens, usage.outputTokens);
}

/**
 * 리디자인이 **fal 없이 업체를 직접 불러** 그린 그림. 단가표의 이름은 `redesign-openai`·
 * `redesign-google` 이다(`model_prices`, `credit-cost.ts` 의 `FLAT_USD`).
 */
export function recordRedesignDirectImage(usage: ImageUsage): void {
  recordAiCost({
    provider: usage.provider,
    model: usage.provider === "google" ? "redesign-google" : "redesign-openai",
    images: usage.images,
    basis: "image_unit",
  });
}

/**
 * 카드뉴스 주제 조사 한 번 — 토큰 값 + 웹검색 횟수 × 호출 단가.
 *
 * 계량기 합산(`readLlmMeter`)에는 안 넣는다. 지금까지 기획 정산의 `llm_usd` 에 안 들어가던
 * 값이라, 넣으면 옛 장부의 숫자가 이번 변경으로 바뀐다. 이 값은 새 표에만 적힌다.
 */
export const recordTopicResearch: TopicUsageRecorder = (research) => {
  const tokens = tokensFrom({ usage: research.usage }) ?? { input: 0, output: 0 };
  const usd = llmUsdFromTokens(research.model, tokens.input, tokens.output) + research.toolCalls * WEB_SEARCH_CALL_USD;
  recordAiCost({
    provider: "openai",
    model: research.model,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    usd,
    basis: "tokens",
  });
};

/** Apify 액터 한 번 — 동기 실행은 금액을 안 주므로 실행 1회 추정(`estimate`). */
export const recordApifyRun: ApifyRunRecorder = (run) => {
  recordAiCost({
    provider: "apify",
    model: run.actor,
    usd: APIFY_YOUTUBE_RUN_ESTIMATE_USD,
    basis: "estimate",
    failed: run.failed,
  });
};
