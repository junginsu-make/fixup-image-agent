import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createPdpDocument, updatePdpDocument } from "../document-state";
import { readPdpDocument, savePdpDocument, migratePdpDraft } from "../document-store";
import { savePdpDraft, getPdpDraft, listPdpDrafts } from "../pdp-drafts";
import { createDraftRepository } from "../draft-repository";
import { createEmptySection } from "../scenario-sections";

const input = () => ({ id: crypto.randomUUID(), appState: "editor" as const, preparedImage: null, modelImage: null,
  modelImageUsage: null, additionalInfo: "original", desiredTone: "", aspectRatio: "3:4" as const,
  notice: "", editorState: null, result: { originalImage: "AAAA", blueprint: { executiveSummary: "", scorecard: [], blueprintList: [], sections: [createEmptySection(0)] } } });
describe("T-MIGRATE: v3 문서 저장", () => {
  it("동시 수정 충돌은 밀린 탭의 수정본도 별도로 보관한다", async () => {
    const old = await savePdpDraft(input());
    const a = createDraftRepository(true), b = createDraftRepository(true);
    const first = (await a.get(old.id))!, second = (await b.get(old.id))!;
    await a.save({ ...first, additionalInfo: "winner" });
    await expect(b.save({ ...second, additionalInfo: "other edit" })).rejects.toThrow("다른 탭");
    const backups = await Promise.all((await listPdpDrafts()).map((draft) => getPdpDraft(draft.id)));
    expect(backups.some((draft) => draft?.snapshotOf === old.id && draft.additionalInfo === "other edit")).toBe(true);
  });
  it("생성 이미지는 revision 본문에 복제하지 않고 별도 자산에서 복원한다", async () => {
    const doc = createPdpDocument(input()); doc.sections[0].generatedImage = "data:image/png;base64,BBBB";
    const saved = await savePdpDocument(doc);
    const stored = await new Promise<Record<string, any>>((resolve) => {
      const request = indexedDB.open("hanirum-pdp-documents", 1);
      request.onsuccess = () => { const db = request.result; const get = db.transaction("documents").objectStore("documents").get(doc.id);
        get.onsuccess = () => { db.close(); resolve(get.result); }; };
    });
    expect(stored.sections[0].generatedImage).toBeUndefined();
    expect((await readPdpDocument(saved.id))?.sections[0].generatedImage).toBe("data:image/png;base64,BBBB");
  });
  it("저장 후 원본 이미지와 안정된 섹션 ID를 복구한다", async () => {
    const doc = createPdpDocument(input()); const saved = await savePdpDocument(doc);
    const restored = await readPdpDocument(doc.id);
    expect(restored?.sections).toEqual(doc.sections);
    expect(restored?.assets).toEqual(doc.assets);
    expect(saved.savedRevision).toBe(saved.revision);
  });
  it("다른 탭의 오래된 버전은 최신 수정 위에 저장하지 못한다", async () => {
    const saved = await savePdpDocument(createPdpDocument(input()));
    const next = updatePdpDocument(saved, { type: "patchSection", id: saved.sections[0].id, patch: { headline: "winner" } });
    await savePdpDocument(next);
    const stale = updatePdpDocument(saved, { type: "patchSection", id: saved.sections[0].id, patch: { headline: "stale" } });
    await expect(savePdpDocument(stale)).rejects.toThrow("다른 탭");
    expect((await readPdpDocument(saved.id))?.sections[0].headline).toBe("winner");
  });
  it("이관 후에도 기존 초안 원본은 남는다", async () => {
    const old = await savePdpDraft(input());
    const doc = await migratePdpDraft(old.id);
    expect(doc?.schemaVersion).toBe(3);
    expect((await getPdpDraft(old.id))?.result?.originalImage).toBe("AAAA");
  });
  it("이관 쓰기 실패는 원본을 삭제하거나 덮어쓰지 않는다", async () => {
    const old = await savePdpDraft(input());
    const put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value) {
      if (this.name === "documents") throw new DOMException("full", "QuotaExceededError");
      return put.call(this, value);
    });
    try { await expect(migratePdpDraft(old.id)).rejects.toThrow("full"); } finally { spy.mockRestore(); }
    expect((await getPdpDraft(old.id))?.additionalInfo).toBe("original");
    expect(await readPdpDocument(old.id)).toBeNull();
  });
});
