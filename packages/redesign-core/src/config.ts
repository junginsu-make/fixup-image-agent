import { getKnowledgeStats, isRagConfigured } from "./rag.js";
import { isKnowledgeAccessRequired, isKnowledgeAdminRequired } from "./knowledge-access.js";

/**
 * Ported from `.refs/redesign-maker-10/src/app/api/config/route.ts` (GET).
 * Reads only process.env + RAG stats; logic byte-for-byte identical.
 *
 * Original route runtime config (re-declare on the adapter):
 *   export const runtime = "nodejs";
 *
 * Always 200. The internal getKnowledgeStats() failure is swallowed via
 * `.catch(...)` exactly as the original.
 */
export async function getServerConfig() {
  const knowledgeStats = isRagConfigured()
    ? await getKnowledgeStats().catch(() => ({ configured: true, documents: 0, chunks: 0 }))
    : { configured: false, documents: 0, chunks: 0 };

  return {
    serverOpenaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    serverGoogleKeyConfigured: Boolean(process.env.GOOGLE_API_KEY),
    knowledgeConfigured: knowledgeStats.configured,
    knowledgeDocuments: knowledgeStats.documents,
    knowledgeChunks: knowledgeStats.chunks,
    knowledgeAccessRequired: isKnowledgeAccessRequired(),
    knowledgeAdminRequired: isKnowledgeAdminRequired()
  };
}
