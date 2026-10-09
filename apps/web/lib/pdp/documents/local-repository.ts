import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DocumentError, heldImageTagsAfter, notFound, PIN_LIMIT, pinLimitError, summarize, validateDocument, uuid, type DocumentRecord } from "./model";
import type { DocumentRepository } from "./repository";

interface Data { documents: Array<DocumentRecord & {cleanupAttemptedAt?:string}>; revisions: Array<DocumentRecord & {pinned?:boolean}> }
// 정리 시도가 오래된(한 번도 안 한) 것부터, 같으면 번호 순.
const byCleanupTurn=(a:Data["documents"][number],b:Data["documents"][number])=>{
  const x=a.cleanupAttemptedAt??"",y=b.cleanupAttemptedAt??"";
  return x!==y?(x<y?-1:1):a.id<b.id?-1:a.id>b.id?1:0;
};
// 동기 읽기/쓰기 사이에 await를 두지 않아 같은 개발 서버에서 비교와 갱신을 분리하지 않는다.
export function createLocalDocumentRepository(root: string): DocumentRepository {
  const file = path.join(root, "pdp-documents.json");
  const read = (): Data => {
    try { return JSON.parse(readFileSync(file, "utf8")); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return { documents: [], revisions: [] }; throw e; }
  };
  const write = (data: Data) => {
    mkdirSync(root, { recursive: true });
    const temp = file + "." + randomUUID() + ".tmp";
    writeFileSync(temp, JSON.stringify(data), "utf8"); renameSync(temp, file);
  };
  const owned = (data: Data, userId: string, id: string, deleted = false) => {
    const row = data.documents.find(x => x.id === id && x.userId === userId);
    if (!row || (!deleted && row.deletedAt)) throw notFound(); return row;
  };
  const prune=(data:Data,id:string)=>{
    const rows=data.revisions.filter(x=>x.id===id).sort((a,b)=>b.revision-a.revision);
    rows.filter(x=>x.pinned).slice(5).forEach(x=>{x.pinned=false;});
    const keep=rows.filter(x=>x.pinned).concat(rows.filter(x=>!x.pinned).slice(0,20));
    data.revisions=data.revisions.filter(x=>x.id!==id).concat(keep);
  };
  const insert = (userId: string, id: string, sourceDraftId?: string, copiedFromOwner?: string) => {
    uuid.parse(userId); uuid.parse(id);
    const data = read(); const sameId = data.documents.find(x => x.id === id);
    if (sameId && (sameId.userId !== userId || sameId.deletedAt)) throw notFound();
    const existing = sameId ?? (sourceDraftId ? data.documents.find(x => x.userId === userId && x.sourceDraftId === sourceDraftId) : undefined);
    if (existing) { if (existing.deletedAt) throw notFound(); return existing; }
    const now = new Date().toISOString();
    const row: DocumentRecord = { id, userId, revision: 0, document: null, sourceDraftId: sourceDraftId ?? null,
      createdAt: now, updatedAt: now, deletedAt: null, lastRequestId: null, ...(copiedFromOwner ? { copiedFromOwner } : {}) };
    data.documents.push(row); write(data); return row;
  };
  return {
    async pendingDeletes(userId){
      // 계속 실패하는 20건이 뒤 건을 굶기지 않게, 고른 행은 시도 시각을 적어 다음 차례를 뒤로 미룬다.
      const data=read(),now=new Date().toISOString();
      const queue=data.documents.filter(row=>row.userId===userId && row.deletedAt && row.cleanupPending).sort(byCleanupTurn).slice(0,20);
      const picked=new Set(queue.map(row=>row.id));
      if(picked.size)write({...data,documents:data.documents.map(row=>picked.has(row.id)?{...row,cleanupAttemptedAt:now}:row)});
      return queue.map(({id,sourceDraftId})=>({id,sourceDraftId}));
    },
    async pin(userId,id,revision){
      const data=read(),current=owned(data,userId,id);
      let row=data.revisions.find(x=>x.id===id && x.revision===revision);
      if(!row && current.revision===revision && current.document){row=structuredClone(current);data.revisions.push(row);}
      if(!row)throw notFound();
      if(data.revisions.filter(x=>x.id===id && x.pinned && x.revision>revision).length>=PIN_LIMIT)throw pinLimitError();
      row.pinned=true;prune(data,id);write(data);
    },
    async find(userId,key,field) {
      return read().documents.find(row=>!row.deletedAt && row[field]===key && (userId===null || row.userId===userId))??null;
    },
    async create(userId, id, sourceDraftId) { return insert(userId, id, sourceDraftId); },
    async createCopy(userId, id, copiedFromOwner) { uuid.parse(copiedFromOwner); return insert(userId, id, undefined, copiedFromOwner); },
    async copiesOf(ownerId) {
      return read().documents.filter(row => row.copiedFromOwner === ownerId).slice(0, 100)
        .map(({ id, userId, sourceDraftId }) => ({ id, userId, sourceDraftId }));
    },
    async get(userId, id, revision, options) {
      const data = read(); const row = data.documents.find(x => x.id === id && x.userId === userId && (options?.includeDeleted || !x.deletedAt));
      if (!row) return null;
      return revision === undefined || revision === row.revision ? row
        : data.revisions.find(x => x.id === id && x.userId === userId && x.revision === revision) ?? null;
    },
    async list(userId, options) {
      return read().documents.filter(x => (options?.includeDeleted || !x.deletedAt) && x.document && (userId === null || x.userId === userId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(row => ({ ...summarize(row), ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}) }));
    },
    async deletedDraftIds(userId){
      return read().documents.filter(x=>(userId===null || x.userId===userId) && x.deletedAt).flatMap(x=>[x.id,...(x.sourceDraftId?[x.sourceDraftId]:[])]);
    },
    async isDeleted(userId,key){
      return read().documents.some(x=>x.userId===userId && Boolean(x.deletedAt) && (x.id===key || x.sourceDraftId===key));
    },
    async save(userId, id, baseRevision, document, requestId) {
      uuid.parse(requestId); validateDocument(document, userId, id);
      const data = read(), row = owned(data, userId, id);
      if (row.lastRequestId === requestId) {
        if (JSON.stringify(row.document) !== JSON.stringify(document)) throw new DocumentError(400, "저장 요청이 달라졌습니다.");
        return row;
      }
      if (row.revision !== baseRevision) throw new DocumentError(409, "다른 창에서 먼저 저장했습니다.", row);
      if (row.document && !data.revisions.some(x=>x.id===id && x.revision===row.revision)) data.revisions.push(structuredClone(row));
      // 가졌던 그림 지문은 서버가 센다(최종 리뷰 M1). 복원·관리자 사본도 이 저장을 거친다.
      const held = heldImageTagsAfter(row.heldImageTags ?? [], summarize({ ...row, document }).imageTags ?? []);
      const saved = { ...row, revision: row.revision + 1, document, lastRequestId: requestId, updatedAt: new Date().toISOString(), heldImageTags: held };
      data.documents = data.documents.map(x => x === row ? saved : x);
      prune(data,id);
      write(data); return saved;
    },
    async revisions(userId, id) {
      const data = read(); owned(data, userId, id);
      return data.revisions.filter(x => x.id === id && x.userId === userId).sort((a,b) => b.revision-a.revision)
        .map(x => ({ revision: x.revision, createdAt: x.updatedAt }));
    },
    async softDelete(userId, id, deletedBy) {
      const data = read(), row = owned(data, userId, id);
      row.deletedAt = new Date().toISOString(); row.deletedBy = deletedBy ?? userId; row.cleanupPending = false;
      write(data); return row;
    },
    async markDeleted(userId, id) {
      const data = read(), row = owned(data, userId, id, true);
      row.deletedAt ??= new Date().toISOString();row.cleanupPending=true; write(data); return row;
    },
    async finishDelete(userId, id) {
      const data = read(), row = owned(data, userId, id, true);
      if (!row.deletedAt) throw new DocumentError(409, "삭제를 먼저 시작해야 합니다.");
      data.documents = data.documents.map(x => x === row ? { ...row, document: null, cleanupPending: false, copiedFromOwner: null, heldImageTags: [] } : x);
      data.revisions = data.revisions.filter(x => x.id !== id); write(data);
    },
  };
}
