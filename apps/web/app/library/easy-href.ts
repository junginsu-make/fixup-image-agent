/**
 * 라이브러리 「과정 보기」 · 그림 없는 카드가 **어디로 가나**(2026-10-06 설계 C).
 *
 * 쉽게로 만든 작업도 포스터 · 카드뉴스 작업으로 저장되어 카드 주소가 늘 `/poster/{id}` ·
 * `/sns/{id}` 였다. 그래서 쉽게 작업의 과정 보기가 다양하게 · 카드뉴스 화면으로 갔다.
 * **내** 쉽게 작업이면 그 대화(`/easy/{대화}`)로 보낸다. 대화를 지웠거나(목록에 없음),
 * 남의 작업이거나, 목록을 못 읽었으면(관리자 전체 보기 포함) 지금처럼 도구 화면이다 —
 * 남의 대화는 열 수 없다.
 *
 * 순수한 규칙이라 값으로 잰다(`__tests__/easy-href.test.ts`).
 */
export interface EasyWorks {
  ids: Set<string>;
  conversations: Map<string, string>;
}

const 대화모양 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/api/easy/works` 의 답. 못 읽으면 `null` — 빈 목록으로 대신하면 쉽게 작업이 「다양하게」로 간다. */
export function readEasyWorks(body: unknown): EasyWorks | null {
  const value = body as { ok?: unknown; workIds?: unknown; conversations?: unknown } | null;
  if (!value?.ok || !Array.isArray(value.workIds)) return null;
  const ids = new Set(value.workIds.filter((id): id is string => typeof id === "string"));
  const conversations = new Map<string, string>();
  if (value.conversations && typeof value.conversations === "object") {
    for (const [workId, conversationId] of Object.entries(value.conversations as Record<string, unknown>)) {
      if (typeof conversationId === "string" && 대화모양.test(conversationId)) conversations.set(workId, conversationId);
    }
  }
  return { ids, conversations };
}

/** 과정 보기 · 그림 없는 카드가 갈 주소. */
export function stepsHref(
  work: { id: string; tool: string; href: string; mine: boolean },
  conversations: ReadonlyMap<string, string> | null,
): string {
  if (!work.mine || !conversations) return work.href;
  if (work.tool !== "poster" && work.tool !== "sns") return work.href;
  const conversationId = conversations.get(work.id);
  return conversationId ? `/easy/${conversationId}` : work.href;
}
