import { canManageCommonKnowledge } from "./knowledge-access.js";
import { deleteKnowledgeDocument, getKnowledgeStats, indexKnowledgeDocument, isRagConfigured, normalizeKnowledgeKind } from "./rag.js";
import { RedesignError } from "./errors.js";

/**
 * Ported from `.refs/redesign-maker-10/src/app/api/knowledge/route.ts`
 * (GET / POST / DELETE handlers). RAG + access-key logic byte-for-byte
 * identical. Only NextRequest/NextResponse glue removed.
 *
 * Original route runtime config (re-declare on the adapter):
 *   export const runtime = "nodejs";
 *   export const maxDuration = 300;
 *
 * --- GET (knowledgeStats) ---
 *   - not RAG configured  -> 200 body { configured:false, documents:0,
 *                             chunks:0, reason } (returned object below)
 *   - configured          -> 200 body = getKnowledgeStats()
 *   - thrown error         -> 500 body { configured:true, error: message }
 *       => function throws plain Error; adapter maps to 500 with
 *          { configured: true, error: err.message }.
 *
 * --- POST (indexKnowledge) ---
 *   - admin key invalid    -> 403 (RedesignError)
 *   - empty text           -> 400 (RedesignError)
 *   - not RAG configured   -> 200 body { configured:false, indexed:false,
 *                             chunks:0, reason } (returned object below)
 *   - success              -> 200 body { configured:true, ...result }
 *   - thrown error         -> 500 body { error: message } (plain Error)
 *
 * --- DELETE (deleteKnowledge) ---
 *   - admin key invalid    -> 403 (RedesignError)
 *   - missing documentId   -> 200 body { deleted:false, reason } (returned)
 *   - not RAG configured   -> 200 body { deleted:false, reason } (returned)
 *   - success              -> 200 body = deleteKnowledgeDocument(documentId)
 *   - thrown error         -> 500 body { error: message } (plain Error)
 */

export async function knowledgeStats() {
  if (!isRagConfigured()) {
    return {
      configured: false,
      documents: 0,
      chunks: 0,
      reason: "DATABASE_URL과 OPENAI_API_KEY를 설정하면 Neon pgvector RAG가 활성화됩니다."
    };
  }

  return await getKnowledgeStats();
}

export type IndexKnowledgeInput = {
  name?: string;
  text?: string;
  adminKey?: string;
  /** 비우면 redesign 으로 들어간다. 판매 원칙을 넣을 때만 "sales" 를 준다. */
  kind?: string;
};

export async function indexKnowledge(input: IndexKnowledgeInput) {
  const name = String(input.name || "knowledge-file");
  const text = String(input.text || "");
  const adminKey = String(input.adminKey || "");

  if (!canManageCommonKnowledge(adminKey)) {
    throw new RedesignError("지식파일 등록 권한 키가 올바르지 않습니다.", 403);
  }

  if (!text.trim()) {
    throw new RedesignError("인덱싱할 텍스트가 없습니다.", 400);
  }

  if (!isRagConfigured()) {
    return {
      configured: false,
      indexed: false,
      chunks: 0,
      reason: "DATABASE_URL과 OPENAI_API_KEY가 없어 로컬 사전 지식 fallback으로 등록했습니다."
    };
  }

  const result = await indexKnowledgeDocument({
    name,
    text,
    kind: normalizeKnowledgeKind(input.kind),
  });
  return { configured: true, ...result };
}

export type DeleteKnowledgeInput = {
  documentId?: string;
  adminKey?: string;
};

export async function deleteKnowledge(input: DeleteKnowledgeInput) {
  const documentId = String(input.documentId || "");
  const adminKey = String(input.adminKey || "");

  if (!canManageCommonKnowledge(adminKey)) {
    throw new RedesignError("지식파일 삭제 권한 키가 올바르지 않습니다.", 403);
  }

  if (!documentId) {
    return { deleted: false, reason: "documentId가 없습니다." };
  }

  if (!isRagConfigured()) {
    return { deleted: false, reason: "RAG가 설정되지 않아 로컬 목록에서만 삭제합니다." };
  }

  return await deleteKnowledgeDocument(documentId);
}
