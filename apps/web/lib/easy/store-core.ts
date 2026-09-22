/**
 * Easy 모드 대화의 **모양과 변환** (설계 §4-1).
 *
 * 표 ↔ 기록 변환을 여기 둔다. 저장소 구현 둘(파일·Supabase)이 같은 변환을 써야
 * 하고, **변환이 저장소 안에 있으면 값으로 못 잰다** — `poster` 가 같은 이유로
 * `supabase-store-core.ts` 를 따로 뒀다.
 *
 * `server-only` 를 안 붙인다. 순수 변환이라 시험이 그대로 부른다.
 */

/**
 * 대화 한 줄의 갈래. 표의 `check` 제약과 같아야 한다.
 *
 *   user       내가 친 말
 *   system     우리가 넣은 안내(인사)
 *   image      만든 그림 — 본체는 라이브러리에 있고 여기는 가리키기만 한다
 *   assistant  **도우미가 말로 한 답** (2026-09-21)
 *
 * `assistant` 를 `system` 으로 대신 쓰지 않는다. 인사는 우리가 적은 안내문이고
 * 이것은 모델이 한 말이라, 한 갈래에 섞으면 나중에 둘을 갈라낼 길이 없다.
 */
export const EASY_ROLES = ["user", "system", "image", "assistant"] as const;
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

/** PostgREST 가 한 번에 주는 줄 수의 윗선. 이보다 많으면 나눠 받는다. */
export const EASY_WORK_PAGE = 1000;

type WorkIdPage = PromiseLike<{ data: { work_id: string | null }[] | null; error: { message: string } | null }>;

/**
 * 쉽게 대화의 그림 줄이 가리키는 작업 id 를 **전부** 모은다(2026-09-22 라이브러리 필터).
 *
 * 한 번에 받으면 1000줄에서 잘린다 — 오래 쓴 회원의 옛 작업이 조용히 「다양하게」로
 * 넘어간다. 끝날 때까지 나눠 받는다. 회원 권한이면 RLS 가 자기 대화만 준다.
 */
export async function collectEasyWorkIds(page: (from: number, to: number) => WorkIdPage): Promise<string[]> {
  const ids = new Set<string>();
  for (let from = 0; ; from += EASY_WORK_PAGE) {
    const { data, error } = await page(from, from + EASY_WORK_PAGE - 1);
    if (error) throw new Error(`쉽게 작업 목록: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) if (row.work_id) ids.add(row.work_id);
    if (rows.length < EASY_WORK_PAGE) return [...ids];
  }
}
