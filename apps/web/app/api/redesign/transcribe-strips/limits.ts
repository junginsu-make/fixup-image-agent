import { TRANSCRIBE_MAX_BASE64_CHARS } from "@fixup/redesign-core";

/**
 * **전사 본문 상한**(F-7-9).
 *
 * 스트립은 base64 그림이다. 전에는 `await req.json()` 한 줄이라 얼마가 오든 다
 * 받아 메모리에 쌓았다.
 *
 * ── 수를 어디서 뽑았나 ──────────────────────────────────────
 *
 * 화면이 배치 하나에 `TRANSCRIBE_MAX_BASE64_CHARS`(약 10MB) 까지 묶는다
 * (`transcribe-batching.ts`). 거기에 JSON 껍데기와 여덟 장어치 구분자·비율
 * 값이 붙으므로 여유를 1MB 둔다.
 *
 * **더 좁게 끊으면 정상 전사가 413 으로 막힌다.** 둘은 짝이다 — 한쪽만 바꾸지
 * 마라.
 */
export const TRANSCRIBE_JSON_LIMIT = TRANSCRIBE_MAX_BASE64_CHARS + 1024 * 1024;

/** 사용자에게 보일 크기. 「몇 MB 냐」는 물음에 답이 있어야 한다. */
export const TRANSCRIBE_MAX_MB = Math.floor(TRANSCRIBE_JSON_LIMIT / (1024 * 1024));
