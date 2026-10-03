import { createPdpDocument, documentToDraft, type PdpDocumentV3 } from "./document-state";
import { deletePdpDocument, listPdpDocuments, migratePdpDraft, readPdpDocument, savePdpDocument, PdpDocumentConflictError } from "./document-store";
import { deletePdpDraft, getPdpDraft, listPdpDrafts, preservePdpDraft, savePdpDraft, type PdpDraftInput, type PdpDraftRecord } from "./pdp-drafts";

function record(doc: PdpDocumentV3): PdpDraftRecord {
  return { ...documentToDraft(doc), id: doc.id, title: doc.title ?? doc.sections[0]?.section_name ?? "상세페이지 작업",
    createdAt: doc.createdAt, updatedAt: doc.updatedAt };
}

/** 서버 이관 전에 두 브라우저 저장소의 실제 저장 시각을 비교한다. 원본은 지우지 않는다. */
export async function readLatestBrowserDraft(id:string):Promise<PdpDraftRecord|null>{
  const [legacy,document]=await Promise.all([getPdpDraft(id),readPdpDocument(id)]);
  if(!document)return legacy;
  if(legacy && legacy.updatedAt>document.updatedAt)return legacy;
  const current=record(document);
  if(legacy && legacy.updatedAt===document.updatedAt){
    current.notice="두 브라우저 사본의 저장 시각이 같습니다. 새 저장 방식의 사본을 열었습니다. 다른 사본도 이 브라우저에 남아 있습니다.";
  }
  return current;
}

/**
 * 서버 저장 모드가 쓰는 이 브라우저의 보관함. 화면과 시험이 같은 조합을 쓴다.
 *
 * `discard` 는 임시 보관본(옛 초안 칸)만 지운다. 이관 원본인 새 저장 방식 사본은 남긴다.
 */
export function createServerBrowserDrafts(enableV3: boolean) {
  return { ...createDraftRepository(enableV3), get: readLatestBrowserDraft, save: savePdpDraft, discard: deletePdpDraft };
}

/** 한 화면이 마지막으로 읽은 revision을 유지한다. 저장 직전 최신본을 읽어 충돌을 숨기지 않는다. */
export function createDraftRepository(enableV3: boolean) {
  const opened = new Map<string, PdpDocumentV3>();
  const conflictCopies = new Map<string, string>();
  return {
    async get(id: string): Promise<PdpDraftRecord | null> {
      const [stored,legacy] = await Promise.all([readPdpDocument(id),getPdpDraft(id)]);
      const doc = stored ?? (enableV3 && legacy ? await migratePdpDraft(id) : null);
      if(doc && legacy && legacy.updatedAt>doc.updatedAt){
        opened.set(id,doc);
        return { ...record(createPdpDocument(legacy)), title:legacy.title, updatedAt:legacy.updatedAt };
      }
      if (!doc) {
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
      for (const entry of documents) if(!list.has(entry.id) || entry.updatedAt>=list.get(entry.id)!.updatedAt) list.set(entry.id, entry);
      return [...list.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  };
}
