/**
 * 비용 한 줄에 붙이는 **이름표**(설계 2026-09-30 §3.4).
 *
 * ── 작업 키 ────────────────────────────────────────────────
 *
 * C2 는 새 작업 이름을 만들지 않고 **기존 이름 + resource** 로 갔다(§3.1). 그래서
 * `generation_events.operation` 만으로는 카드뉴스 그림(`sns_image` + `sns:{id}`)과
 * 카드뉴스 기획(`sns_image` + `sns:{id}:plan`)이 한 칸에 섞인다. 「기능별 비용은
 * `ai_cost_events` 의 작업 칸으로 나눈다」(§3.1)는 약속을 지키려고, 작업 칸에는
 * **resource 에서 id 를 뺀 것**을 적는다 — `sns`, `sns:plan`, `poster:review`, `cs:ask`.
 *
 * resource 가 없거나 주소(`/api/…`, 크기를 몰라 예약 계획이 빠진 경우)면 작업 이름을 쓴다.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function costOperationKey(operation: string, resource?: string): string {
  if (!resource || resource.startsWith("/")) return operation;
  const kept = resource.split(":").filter((part) => part.length > 0 && !UUID.test(part));
  return kept.length > 0 ? kept.join(":").slice(0, 80) : operation;
}

export type AiCostProvider = "anthropic" | "openai" | "google" | "fal" | "apify" | "other";

/**
 * 글 모델 이름으로 공급자를 가른다. **모르면 `other`** — 지어내지 않는다.
 * 화면이 「기타」로 모아 보여 주면 누군가 새 모델을 들인 줄 안다.
 */
export function providerOfModel(model: string): AiCostProvider {
  const id = model.trim().toLowerCase();
  if (id.startsWith("claude")) return "anthropic";
  if (id.startsWith("gemini")) return "google";
  if (/^(gpt|o\d|text-embedding)/.test(id)) return "openai";
  return "other";
}

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
