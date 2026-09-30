import type { ImageUsage, LlmUsage } from "@fixup/redesign-core";
import { recordAiCost, recordLlmUsage } from "../llm/meter";

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
