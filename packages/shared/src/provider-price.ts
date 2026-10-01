/**
 * 토큰도 그림도 아닌 **호출 단가**(설계 2026-09-30 §3.4).
 *
 * 글 모델 토큰 단가는 `llm-price.ts`, 그림 단가는 DB `model_prices` 에 있다. 여기는 둘 다 아닌 것 —
 * 호출 한 번에 붙는 값이다. 값이 바뀌면 **여기만** 고친다.
 */

/**
 * OpenAI 웹검색 도구 한 번(카드뉴스 주제 조사, `ingest-core/topic.ts`). 공표 단가 $10/1,000회.
 * 검색 결과로 들어온 글은 토큰으로 따로 센다.
 */
export const WEB_SEARCH_CALL_USD = 0.01;

/**
 * Apify 유튜브 자막 액터 한 번 실행의 **추정값**(`ingest-core/youtube-apify.ts`).
 * 동기 실행 응답에는 사용 금액이 없어 실행 1회로 어림한다 — 그래서 근거는 `estimate` 다.
 */
export const APIFY_YOUTUBE_RUN_ESTIMATE_USD = 0.01;
