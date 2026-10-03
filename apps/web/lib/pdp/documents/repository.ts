import type { DocumentCopy, DocumentRecord, DocumentRevision, DocumentSummary, ServerDocument } from "./model";
export interface DocumentRepository {
  create(userId: string, id: string, sourceDraftId?: string): Promise<DocumentRecord>;
  /** 관리자 사본을 만든다. 원래 회원 표시는 이 길로만 적힌다. */
  createCopy(userId: string, id: string, copiedFromOwner: string): Promise<DocumentRecord>;
  /** 이 회원이 원본인, 아직 다 지우지 않은 사본(최대 100건). */
  copiesOf(ownerId: string): Promise<DocumentCopy[]>;
  get(userId: string, id: string, revision?: number): Promise<DocumentRecord | null>;
  find(userId: string | null, key: string, field: "id" | "sourceDraftId"): Promise<DocumentRecord | null>;
  list(userId: string | null): Promise<DocumentSummary[]>;
  deletedDraftIds(userId:string|null):Promise<string[]>;
  /** 이 회원의 문서(번호 또는 옛 초안 번호 `key`)가 지워졌거나 지우는 중인가. 한 건만 묻는다. */
  isDeleted(userId:string,key:string):Promise<boolean>;
  pendingDeletes(userId:string):Promise<Array<Pick<DocumentRecord,"id"|"sourceDraftId">>>;
  save(userId: string, id: string, baseRevision: number, document: ServerDocument, requestId: string): Promise<DocumentRecord>;
  revisions(userId: string, id: string): Promise<DocumentRevision[]>;
  pin(userId:string,id:string,revision:number):Promise<void>;
  markDeleted(userId: string, id: string): Promise<DocumentRecord>;
  finishDelete(userId: string, id: string): Promise<void>;
}
