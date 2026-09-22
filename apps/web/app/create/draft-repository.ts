import { createPdpDocument, documentToDraft, type PdpDocumentV3 } from "./document-state";
import { deletePdpDocument, listPdpDocuments, migratePdpDraft, readPdpDocument, savePdpDocument, PdpDocumentConflictError } from "./document-store";
import { deletePdpDraft, getPdpDraft, listPdpDrafts, preservePdpDraft, savePdpDraft, type PdpDraftInput, type PdpDraftRecord } from "./pdp-drafts";

function record(doc: PdpDocumentV3): PdpDraftRecord {
  return { ...documentToDraft(doc), id: doc.id, title: doc.title ?? doc.sections[0]?.section_name ?? "상세페이지 작업",
    createdAt: doc.createdAt, updatedAt: doc.updatedAt };
}

/** 한 화면이 마지막으로 읽은 revision을 유지한다. 저장 직전 최신본을 읽어 충돌을 숨기지 않는다. */
export function createDraftRepository(enableV3: boolean) {
  const opened = new Map<string, PdpDocumentV3>();
  const conflictCopies = new Map<string, string>();
  return {
    async get(id: string): Promise<PdpDraftRecord | null> {
      const doc = await readPdpDocument(id) ?? (enableV3 ? await migratePdpDraft(id) : null);
      if (!doc) {
        const legacy = await getPdpDraft(id);
        if (!legacy) return null;
        return { ...record(createPdpDocument(legacy)), title: legacy.title, updatedAt: legacy.updatedAt };
      }
      opened.set(id, doc); return record(doc);
    },
    async save(input: PdpDraftInput): Promise<PdpDraftRecord> {
      const previous = input.id ? opened.get(input.id) : undefined;
      if (!enableV3 && !previous) return savePdpDraft(input);
      const next = createPdpDocument(input, previous);
      next.title = previous?.title ?? input.result?.blueprint.sections[0]?.section_name ?? input.preparedImage?.fileName ?? "상세페이지 작업";
      let saved: PdpDocumentV3;
      try { saved = await savePdpDocument(next); }
      catch (error) {
        if (error instanceof PdpDocumentConflictError) {
          const fingerprint = JSON.stringify(input);
          if (conflictCopies.get(next.id) !== fingerprint) {
            await preservePdpDraft(input); conflictCopies.set(next.id, fingerprint);
          }
        }
        throw error;
      }
      opened.set(saved.id, saved); return record(saved);
    },
    preserve: preservePdpDraft,
    async remove(id: string) {
      await deletePdpDraft(id);
      await deletePdpDocument(id);
      opened.delete(id);
    },
    async list() {
      const [legacy, documents] = await Promise.all([listPdpDrafts(), listPdpDocuments()]);
      const list = new Map(legacy.map((entry) => [entry.id, entry]));
      for (const entry of documents) list.set(entry.id, entry);
      return [...list.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  };
}
