import type { DocumentCopy, DocumentRecord, DocumentRevision, DocumentSummary, ServerDocument } from "./model";
export interface DocumentRepository {
  create(userId: string, id: string, sourceDraftId?: string): Promise<DocumentRecord>;
  /** 관리자 사본을 만든다. 원래 회원 표시는 이 길로만 적힌다. */
  createCopy(userId: string, id: string, copiedFromOwner: string): Promise<DocumentRecord>;
  /** 이 회원이 원본인, 아직 다 지우지 않은 사본(최대 100건). */
  copiesOf(ownerId: string): Promise<DocumentCopy[]>;
  /** `includeDeleted` — 회원이 지운 문서도. 관리자만 쓴다(2026-10-08 지워도 남겨 관리자가 확인). */
  get(userId: string, id: string, revision?: number, options?: { includeDeleted?: boolean }): Promise<DocumentRecord | null>;
  find(userId: string | null, key: string, field: "id" | "sourceDraftId"): Promise<DocumentRecord | null>;
  list(userId: string | null, options?: { includeDeleted?: boolean }): Promise<DocumentSummary[]>;
  deletedDraftIds(userId:string|null):Promise<string[]>;
  /** 이 회원의 문서(번호 또는 옛 초안 번호 `key`)가 지워졌거나 지우는 중인가. 한 건만 묻는다. */
  isDeleted(userId:string,key:string):Promise<boolean>;
  pendingDeletes(userId:string):Promise<Array<Pick<DocumentRecord,"id"|"sourceDraftId">>>;
  save(userId: string, id: string, baseRevision: number, document: ServerDocument, requestId: string): Promise<DocumentRecord>;
  revisions(userId: string, id: string): Promise<DocumentRevision[]>;
  pin(userId:string,id:string,revision:number):Promise<void>;
  markDeleted(userId: string, id: string): Promise<DocumentRecord>;
  /**
   * **회원의 지우기 — 지운 때만 적는다**(2026-10-08). 정리 대기를 켜지 않아 목록을 열어도 정리되지 않고, 문서·그림이
   * 남아 관리자가 확인한다. 없거나 이미 지웠으면 404. `deletedBy` 는 지운 사람(관리자가 대신 지울 때 다르다).
   */
  softDelete(userId: string, id: string, deletedBy?: string): Promise<DocumentRecord>;
  finishDelete(userId: string, id: string): Promise<void>;
}
