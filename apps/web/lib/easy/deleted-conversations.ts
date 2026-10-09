import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import { emailsByUserId } from "../reference-images";
import { MESSAGE_COLUMNS, toMessageRecord, type EasyMessageRecord, type EasyMessageRow } from "./store-core";

/**
 * **회원이 지운 쉽게 대화**(관리자 「회원이 삭제한 자료」, 2026-10-08 — 계획 2단계).
 *
 * 회원이 지운 대화는 줄·내용이 남는다(`store.ts` 의 `removeConversation`). 회원 세션은 RLS 가 감추므로 관리자는
 * 서버 권한으로 읽는다. **부르는 쪽이 관리자인지 먼저 확인해야 한다** — 이 함수들은 묻지 않는다.
 *
 * 여기서는 **회원이 지운 것만** 다룬다. 살아 있는 대화를 열거나 지우는 길이 아니다 — 지운 때가 없으면 없는 것으로
 * 답한다.
 */
export interface DeletedConversation {
  id: string;
  userId: string;
  ownerEmail: string | null;
  title: string;
  createdAt: string;
  deletedAt: string;
}

/** 최근에 지운 것부터 400개. */
export async function listDeletedConversations(): Promise<DeletedConversation[]> {
  // 로컬 파일 저장소는 지금처럼 지운다(개발용) — 보관된 것이 없다.
  if (isLocalStoreEnabled()) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from("easy_conversations")
    .select("id,user_id,title,created_at,deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; user_id: string; title: string | null; created_at: string; deleted_at: string }>;
  const emails = await emailsByUserId(rows.map((row) => row.user_id));
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    ownerEmail: emails.get(row.user_id) ?? null,
    title: row.title ?? "",
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  }));
}

/** 지운 대화의 내용. 없거나 지운 대화가 아니면 null. */
export async function readDeletedConversation(id: string): Promise<EasyMessageRecord[] | null> {
  const supabase = createSupabaseAdminClient();
  const { data: conversation, error } = await supabase
    .from("easy_conversations").select("id").eq("id", id).not("deleted_at", "is", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!conversation) return null;
  const { data, error: messagesError } = await supabase
    .from("easy_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (messagesError) throw new Error(messagesError.message);
  return ((data ?? []) as EasyMessageRow[]).map(toMessageRecord);
}

/**
 * 지운 대화를 **완전히 지운다**(대화 줄은 FK 로 함께). 대화가 만든 그림은 라이브러리 작업이라 여기서 안 지운다 —
 * 그것은 라이브러리에서 따로 지운다. 지운 대화가 아니면 false.
 */
export async function purgeDeletedConversation(id: string): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from("easy_conversations").delete().eq("id", id).not("deleted_at", "is", null).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
