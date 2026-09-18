/**
 * Easy 모드 대화의 **모양과 변환** (설계 §4-1).
 *
 * 표 ↔ 기록 변환을 여기 둔다. 저장소 구현 둘(파일·Supabase)이 같은 변환을 써야
 * 하고, **변환이 저장소 안에 있으면 값으로 못 잰다** — `poster` 가 같은 이유로
 * `supabase-store-core.ts` 를 따로 뒀다.
 *
 * `server-only` 를 안 붙인다. 순수 변환이라 시험이 그대로 부른다.
 */

/** 대화 한 줄의 갈래. 표의 `check` 제약과 같아야 한다. */
export const EASY_ROLES = ["user", "system", "image"] as const;
export type EasyRole = (typeof EASY_ROLES)[number];

export interface EasyConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface EasyMessageRecord {
  id: string;
  conversationId: string;
  role: EasyRole;
  body: string;
  /**
   * 그림 줄이면 라이브러리의 결과물을 가리킨다.
   *
   * **그림을 대화 표에 넣지 않는다**(설계 §4-1). 라이브러리가 주인이고, 두 곳에
   * 두면 하나는 곧 어긋난다.
   */
  workId: string | null;
  createdAt: string;
}

/* ── 표 모양 ──────────────────────────────────────────────── */

export interface EasyConversationRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface EasyMessageRow {
  id: string;
  conversation_id: string;
  role: string;
  body: string;
  work_id: string | null;
  created_at: string;
}

export const CONVERSATION_COLUMNS = "id,user_id,title,created_at,updated_at";
export const MESSAGE_COLUMNS = "id,conversation_id,role,body,work_id,created_at";

export function toConversationRecord(row: EasyConversationRow): EasyConversationRecord {
  return {
    id: row.id,
    title: row.title ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 표의 줄을 기록으로.
 *
 * **모르는 갈래는 `system` 으로 떨어뜨리지 않는다.** 그러면 표의 `check` 가
 * 깨진 것을 아무도 모르고, 화면이 엉뚱한 줄을 그린다. 없는 갈래가 오면 그것이
 * 고장이므로 시끄럽게 실패한다.
 */
export function toMessageRecord(row: EasyMessageRow): EasyMessageRecord {
  if (!(EASY_ROLES as readonly string[]).includes(row.role)) {
    throw new Error(`대화 줄의 갈래를 알 수 없습니다: ${row.role}`);
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as EasyRole,
    body: row.body ?? "",
    workId: row.work_id ?? null,
    createdAt: row.created_at,
  };
}
