import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import { deleteAnyWork } from "../../app/api/admin/works/store";
import { deleteLibraryItem } from "../server-library";
import { deleteCharacter } from "../characters";
import { purgeReferenceImage } from "../reference-soft-delete";
import { purgeDeletedConversation } from "../easy/deleted-conversations";
import { documentServices } from "../pdp/documents";
import { completeDocumentDelete } from "../pdp/documents/http";
import { deleteDocumentLegacy } from "../pdp/documents/delete-legacy";
import type { PurgeItem, PurgeTarget } from "./purge-deleted";

/**
 * **6개월 자동 파기의 갈래들**(2026-10-08 — 계획 3단계).
 *
 * 묻기는 **회원이 지운 것 가운데 기준보다 먼저 지운 것만**(`deleted_at < 기준`) — 살아 있는 것은 `null` 이라 비교에
 * 절대 안 걸린다. 지우기는 관리자 완전 삭제와 **같은 함수**다. 오래 지운 것부터 지운다.
 */
type Row = { id: string; user_id: string; [column: string]: unknown };

async function deletedBefore(
  table: string,
  columns: string,
  cutoff: string,
  limit: number,
  /** 이번 회차에 실패한 id — 빼고 묻는다. DB 가 준 uuid 라 그대로 이어 붙여도 된다. */
  skip: readonly string[],
  /** 상세페이지 — 이미 비운 문서(내용 없음)는 이름표만 남은 것이라 다시 묻지 않는다. */
  options: { withDocument?: boolean } = {},
) {
  const base = createSupabaseAdminClient().from(table).select(columns).lt("deleted_at", cutoff);
  const fresh = skip.length ? base.not("id", "in", `(${skip.join(",")})`) : base;
  const query = options.withDocument ? fresh.not("document", "is", null) : fresh;
  const { data, error } = await query.order("deleted_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Row[];
}

const plain = (rows: Row[]): PurgeItem[] => rows.map((row) => ({ id: row.id, owner: row.user_id }));

/** 시스템이 관리자처럼 지운다 — 라이브러리 지우기는 관리자에게 주인 조건을 걸지 않는다. */
const SYSTEM = { userId: "system:retention", role: "admin" as const };

export function purgeTargets(): PurgeTarget[] {
  return [
    {
      kind: "sns",
      list: async (cutoff, limit, skip) => plain(await deletedBefore("sns_projects", "id,user_id", cutoff, limit, skip)),
      purge: async (item) => { await deleteAnyWork("sns", item.id); },
    },
    {
      kind: "poster",
      list: async (cutoff, limit, skip) => plain(await deletedBefore("poster_projects", "id,user_id", cutoff, limit, skip)),
      purge: async (item) => { await deleteAnyWork("poster", item.id); },
    },
    {
      kind: "library",
      list: async (cutoff, limit, skip) => plain(await deletedBefore("library_items", "id,user_id", cutoff, limit, skip)),
      purge: async (item) => {
        const result = await deleteLibraryItem(SYSTEM, item.id);
        if (!result.ok) throw new Error(result.message);
      },
    },
    {
      kind: "pdp",
      list: async (cutoff, limit, skip) => (await deletedBefore("pdp_documents", "id,user_id,source_draft_id", cutoff, limit, skip, { withDocument: true }))
        .map((row) => ({ id: row.id, owner: row.user_id, sourceDraftId: (row.source_draft_id as string | null) ?? null })),
      purge: async (item) => {
        await completeDocumentDelete({
          ...documentServices(),
          cleanupLegacy: async (userId, ids) => {
            if (!isLocalStoreEnabled()) await deleteDocumentLegacy(createSupabaseAdminClient(), userId, ids);
          },
        }, item.owner, { id: item.id, sourceDraftId: item.sourceDraftId ?? null });
      },
    },
    {
      kind: "characters",
      list: async (cutoff, limit, skip) => plain(await deletedBefore("characters", "id,user_id", cutoff, limit, skip)),
      purge: async (item) => {
        const result = await deleteCharacter(item.owner, item.id);
        if (!result.ok) throw new Error("message" in result ? String(result.message) : "캐릭터를 지우지 못했습니다.");
      },
    },
    {
      kind: "references",
      list: async (cutoff, limit, skip) => (await deletedBefore("reference_images", "id,user_id,storage_path,thumb_path", cutoff, limit, skip))
        .map((row) => ({ id: row.id, owner: row.user_id, storagePath: String(row.storage_path), thumbPath: (row.thumb_path as string | null) ?? null })),
      purge: async (item) => {
        const { storagePath, thumbPath } = item as PurgeItem & { storagePath: string; thumbPath: string | null };
        await purgeReferenceImage({ id: item.id, owner: item.owner, storagePath, thumbPath });
      },
    },
    {
      kind: "easy",
      list: async (cutoff, limit, skip) => plain(await deletedBefore("easy_conversations", "id,user_id", cutoff, limit, skip)),
      purge: async (item) => { await purgeDeletedConversation(item.id); },
    },
  ];
}
