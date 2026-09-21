import { createPdpDocument, type PdpDocumentV3 } from "./document-state";
import { getPdpDraft, type PdpDraftSummary } from "./pdp-drafts";
import { randomId } from "../../lib/browser-safe";
import { selectExpiredDraftIds } from "./draft-retention";

// v2 저장소는 건드리지 않는다. 이관 완료 여부와 무관하게 원본으로 돌아갈 수 있다.
const DB = "hanirum-pdp-documents";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("documents", { keyPath: "id" });
      db.createObjectStore("revisions", { keyPath: ["id", "revision"] });
      db.createObjectStore("assets", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const requestValue = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
type StoredDocument = Omit<PdpDocumentV3, "assets"> & { assetIds: string[]; textKeyVisualAssetId?: string; textStyleAssetId?: string };

export class PdpDocumentConflictError extends Error {
  constructor() { super("다른 탭에서 수정한 작업이 있습니다. 현재 수정본을 유지하고 다시 불러와 주세요."); }
}

export async function readPdpDocument(id: string, revision?: number): Promise<PdpDocumentV3 | null> {
  const db = await open();
  try {
    const tx = db.transaction(["documents", "revisions", "assets"], "readonly");
    const stored = await requestValue<StoredDocument | undefined>(revision === undefined
      ? tx.objectStore("documents").get(id) : tx.objectStore("revisions").get([id, revision]));
    if (!stored) return null;
    if (stored.schemaVersion !== 3 || !Array.isArray(stored.sections) || !Array.isArray(stored.assetIds)) {
      throw new Error("문서 형식을 읽을 수 없습니다. 기존 초안을 보존했습니다.");
    }
    const values = await Promise.all(stored.assetIds.map((assetId) => requestValue<PdpDocumentV3["assets"][string] | undefined>(tx.objectStore("assets").get(assetId))));
    if (values.some((asset) => !asset)) throw new Error("문서의 이미지가 누락됐습니다. 기존 초안을 보존했습니다.");
    const { assetIds: _ids, textKeyVisualAssetId, textStyleAssetId, ...rest } = stored;
    const assets = Object.fromEntries(values.map((asset) => [asset!.id, asset!]));
    const sections = rest.sections.map((section) => {
      const asset = section.generatedAssetId && assets[section.generatedAssetId];
      return asset ? { ...section, generatedImage: `data:${asset.mimeType};base64,${asset.base64}` } : section;
    });
    let textDraft = rest.inputs.textDraft;
    if (textDraft) {
      const keyVisual = textKeyVisualAssetId && assets[textKeyVisualAssetId];
      const style = textStyleAssetId && assets[textStyleAssetId];
      textDraft = { ...textDraft,
        keyVisual: keyVisual ? { base64: keyVisual.base64, mimeType: keyVisual.mimeType } : textDraft.keyVisual,
        styleReference: style && textDraft.styleReference ? { ...textDraft.styleReference, imageBase64: style.base64, mimeType: style.mimeType } : textDraft.styleReference };
    }
    return { ...rest, sections, assets, inputs: { ...rest.inputs, textDraft } };
  } finally { db.close(); }
}

export async function savePdpDocument(document: PdpDocumentV3): Promise<PdpDocumentV3> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["documents", "revisions", "assets"], "readwrite");
    let problem: unknown;
    const assets = { ...document.assets };
    const intern = (base64: string, mimeType: string) => {
      const found = Object.values(assets).find((asset) => asset.base64 === base64 && asset.mimeType === mimeType);
      const id = found?.id ?? randomId(); assets[id] = { ...found, id, base64, mimeType }; return id;
    };
    const sections = document.sections.map((section) => {
      const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(section.generatedImage ?? "");
      return match ? { ...section, generatedAssetId: intern(match[2], match[1]) } : section;
    });
    const textDraft = document.inputs.textDraft;
    const textKeyVisualAssetId = textDraft?.keyVisual ? intern(textDraft.keyVisual.base64, textDraft.keyVisual.mimeType) : undefined;
    const textStyleAssetId = textDraft?.styleReference ? intern(textDraft.styleReference.imageBase64, textDraft.styleReference.mimeType) : undefined;
    const saved = { ...document, sections, assets, savedRevision: document.revision, updatedAt: new Date().toISOString() };
    tx.oncomplete = () => { db.close(); resolve(saved); };
    tx.onerror = tx.onabort = () => { db.close(); reject(problem ?? tx.error ?? new Error("문서 저장이 중단됐습니다.")); };
    const current = tx.objectStore("documents").get(document.id);
    current.onsuccess = () => {
      try {
        const existing = current.result as StoredDocument | undefined;
        if ((existing?.revision ?? 0) !== document.savedRevision) {
          throw new PdpDocumentConflictError();
        }
        const { assets, ...rest } = saved;
        const stored: StoredDocument = { ...rest, assetIds: Object.keys(assets), textKeyVisualAssetId, textStyleAssetId,
          sections: sections.map((section) => {
            if (!section.generatedAssetId) return section;
            const { generatedImage: _image, ...metadata } = section; return metadata;
          }),
          inputs: { ...rest.inputs, textDraft: textDraft ? { ...textDraft, keyVisual: null,
            styleReference: textDraft.styleReference ? { ...textDraft.styleReference, imageBase64: "" } : undefined } : textDraft },
        };
        for (const asset of Object.values(assets)) tx.objectStore("assets").put(asset);
        tx.objectStore("documents").put(stored);
        tx.objectStore("revisions").put(stored);
      } catch (error) { problem = error; tx.abort(); }
    };
  });
}

export async function migratePdpDraft(id: string): Promise<PdpDocumentV3 | null> {
  const existing = await readPdpDocument(id);
  if (existing) return existing;
  const legacy = await getPdpDraft(id);
  if (!legacy) return null;
  const document = createPdpDocument(legacy);
  document.title = legacy.title;
  await savePdpDocument(document);
  const verified = await readPdpDocument(id);
  if (!verified || verified.sections.length !== document.sections.length) throw new Error("이관 검증에 실패했습니다. 기존 초안은 그대로 남아 있습니다.");
  return verified;
}

export async function listPdpDocuments(): Promise<PdpDraftSummary[]> {
  const db = await open();
  try {
    const tx = db.transaction(["documents", "assets"], "readonly");
    const docs = await requestValue<StoredDocument[]>(tx.objectStore("documents").getAll());
    return Promise.all(docs.map(async (doc) => {
      const assetId = doc.sections[0]?.generatedAssetId ?? doc.originalAssetId;
      const asset = assetId ? await requestValue<PdpDocumentV3["assets"][string] | undefined>(tx.objectStore("assets").get(assetId)) : undefined;
      return { id: doc.id, title: doc.title ?? doc.sections[0]?.section_name ?? "상세페이지 작업",
      updatedAt: doc.updatedAt, createdAt: doc.createdAt, aspectRatio: doc.settings.aspectRatio,
      sectionCount: doc.sections.length, stageLabel: doc.stage === "input" ? "설정 초안" : "편집 중",
      thumbnailUrl: asset ? `data:${asset.mimeType};base64,${asset.base64}` : doc.sections[0]?.generatedImage ?? null };
    }));
  } finally { db.close(); }
}

/**
 * 보관 기간이 지난 문서를 지운다. 지운 개수를 돌려준다.
 *
 * ── 왜 이것이 없었나 ─────────────────────────────────────────
 *
 * 옛 저장소에는 `purgeExpiredPdpDrafts` 가 있었는데, 새 저장소로 이관하면서
 * **청소만 뒤에 남았다.** 부르는 줄도 `if (!documentV3Enabled)` 로 막혀 있어서,
 * 새 저장소를 켜는 순간 「30일이 지나면 자동 삭제」라는 **화면의 약속이 거짓**이
 * 된다(E-6-3-b).
 *
 * 옛 것과 같은 판단을 쓴다 — 기준은 `updatedAt`, 열어 둔 작업은 남기고,
 * **실패해도 조용히 넘어간다**(청소 때문에 목록이 안 뜨면 본말이 뒤집힌다).
 */
export async function purgeExpiredPdpDocuments(
  now: Date = new Date(),
  protectedIds: readonly string[] = [],
): Promise<number> {
  try {
    const summaries = await listPdpDocuments();
    const protectedSet = new Set(protectedIds);
    const expired = selectExpiredDraftIds(summaries, now).filter((id) => !protectedSet.has(id));
    if (!expired.length) return 0;

    for (const id of expired) await deletePdpDocument(id);
    return expired.length;
  } catch {
    return 0;
  }
}

export async function deletePdpDocument(id: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    tx.objectStore("documents").delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("삭제하지 못했습니다.")); };
  });
}
