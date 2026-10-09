import type { SupabaseClient } from "@supabase/supabase-js";
import { DocumentError, pinLimitError, UNSAFE_CHARACTERS_MESSAGE, uuid, validateDocument, type DocumentRecord, type DocumentSummary, type ServerDocument } from "./model";
import type { DocumentRepository } from "./repository";
type Row = { id: string; user_id: string; revision: number; document: ServerDocument | null; source_draft_id: string | null;
  created_at: string; updated_at: string; deleted_at: string | null; last_request_id: string | null; copied_from_owner?: string | null;
  held_image_tags?: string[] | null; deleted_by?: string | null };
export const recordFromRow = (r: Row): DocumentRecord => ({ id:r.id,userId:r.user_id,revision:r.revision,document:r.document,
  sourceDraftId:r.source_draft_id,createdAt:r.created_at,updatedAt:r.updated_at,deletedAt:r.deleted_at,lastRequestId:r.last_request_id,
  copiedFromOwner:r.copied_from_owner ?? null, heldImageTags:r.held_image_tags ?? [], deletedBy:r.deleted_by ?? null });
export function createSupabaseDocumentRepository(db: SupabaseClient): DocumentRepository {
  const write = async (userId: string, id: string, action: string, payload = {}) => {
    const { data, error } = await db.rpc("pdp_document_write", { p_user:userId,p_id:id,p_action:action,p_payload:payload });
    if(error?.code==="23514" && error.message.includes("pdp_document_size"))throw new DocumentError(413,"작업 정보가 너무 큽니다.");
    // NUL(22P05·22021)·짝 없는 서로게이트(22P02 json)는 다시 보내도 실패한다. 503 이 아니라 400 이다.
    if(error && (["22P05","22021"].includes(error.code) || (error.code==="22P02" && /json|unicode/i.test(error.message)))){
      throw new DocumentError(400,UNSAFE_CHARACTERS_MESSAGE);
    }
    if (error) throw new DocumentError(503,"작업 저장소에 연결하지 못했습니다.");
    if (data?.status !== 200) throw new DocumentError(data?.status ?? 503,
      data?.status === 413 ? "작업 정보가 너무 큽니다." : data?.status === 409 ? "다른 창에서 먼저 저장했습니다." : "작업을 처리하지 못했습니다.",
      data?.record ? recordFromRow(data.record) : undefined);
    return recordFromRow(data.record);
  };
  const repo: DocumentRepository = {
    async pendingDeletes(userId){
      // 마지막 시도가 오래된(한 번도 안 한) 것부터 고르고, 고른 행은 시도 시각을 적어 다음 차례를 뒤로 미룬다.
      const {data,error}=await db.from("pdp_documents").select("id,source_draft_id").eq("user_id",userId)
        .eq("cleanup_pending",true).not("deleted_at","is",null)
        .order("cleanup_attempted_at",{ascending:true,nullsFirst:true}).order("id").limit(20);
      if(error)throw new DocumentError(503,"삭제 중인 작업을 읽지 못했습니다.");
      const rows=data??[];
      if(rows.length){
        const stamped=await db.from("pdp_documents").update({cleanup_attempted_at:new Date().toISOString()})
          .eq("user_id",userId).in("id",rows.map(row=>row.id));
        if(stamped.error)throw new DocumentError(503,"삭제 중인 작업을 읽지 못했습니다.");
      }
      return rows.map(row=>({id:row.id,sourceDraftId:row.source_draft_id}));
    },
    async pin(userId,id,revision){
      // 보관 요청의 409 는 저장 충돌이 아니라 보관 지점 한도다.
      try{await write(userId,id,"pin",{revision});}
      catch(e){throw e instanceof DocumentError && e.status===409?pinLimitError():e;}
    },
    async find(userId,key,field) {
      let query=db.from("pdp_documents").select("*").eq(field==="id"?"id":"source_draft_id",key).is("deleted_at",null).order("id").limit(1);
      if(userId!==null)query=query.eq("user_id",userId);
      const {data,error}=await query.maybeSingle();
      if(error)throw new DocumentError(503,"작업을 읽지 못했습니다.");
      return data?recordFromRow(data):null;
    },
    create: (userId,id,sourceDraftId) => write(userId,id,"create",{ sourceDraftId }),
    createCopy: (userId,id,copiedFromOwner) => write(userId,id,"create",{ copiedFromOwner }),
    async copiesOf(ownerId){
      // 서버가 적은 사본 표시로 찾는다. 다 지운 사본은 정리 때 표시가 지워져 다시 나오지 않는다.
      const {data,error}=await db.from("pdp_documents").select("id,user_id,source_draft_id").eq("copied_from_owner",ownerId).limit(100);
      if(error)throw new DocumentError(503,"사본을 확인하지 못했습니다.");
      return (data??[]).map(row=>({id:row.id,userId:row.user_id,sourceDraftId:row.source_draft_id}));
    },
    async get(userId,id,revision,options) {
      const base = db.from("pdp_documents").select("*").eq("id",id).eq("user_id",userId);
      const { data,error } = await (options?.includeDeleted ? base : base.is("deleted_at",null)).maybeSingle();
      if (error) throw new DocumentError(503,"작업을 읽지 못했습니다.");
      if (!data) return null;
      const current = recordFromRow(data);
      if (revision === undefined || revision === current.revision) return current;
      const old = await db.from("pdp_document_revisions").select("revision,document,created_at")
        .eq("document_id",id).eq("user_id",userId).eq("revision",revision).maybeSingle();
      if (old.error) throw new DocumentError(503,"이전 버전을 읽지 못했습니다.");
      return old.data ? { ...current, document:old.data.document,revision:old.data.revision,updatedAt:old.data.created_at } : null;
    },
    async list(userId,options) {
      // 페이지를 나눠 읽어 기본 1,000행 제한 때문에 오래된 문서를 숨기지 않는다.
      const summaries: DocumentSummary[] = [];
      for (let start=0;;start+=100) {
        const base = db.from("pdp_documents").select("id,user_id,revision,source_draft_id,created_at,updated_at,summary,held_image_tags,deleted_at");
        let query = (options?.includeDeleted ? base : base.is("deleted_at",null)).not("summary","is",null)
          .order("updated_at",{ascending:false}).order("id").range(start,start+99);
        if (userId !== null) query=query.eq("user_id",userId);
        const {data,error}=await query;
        if (error) throw new DocumentError(503,"작업 목록을 읽지 못했습니다.");
        summaries.push(...(data??[]).map(r=>({id:r.id,userId:r.user_id,revision:r.revision,sourceDraftId:r.source_draft_id,
          createdAt:r.created_at,updatedAt:r.updated_at,...r.summary,heldImageTags:r.held_image_tags ?? [],
          ...(r.deleted_at?{deletedAt:r.deleted_at}:{})} as DocumentSummary)));
        if ((data?.length ?? 0)<100) break;
      }
      return summaries;
    },
    async save(userId,id,baseRevision,document,requestId) {
      validateDocument(document,userId,id);
      return write(userId,id,"save",{baseRevision,document,requestId});
    },
    async deletedDraftIds(userId){
      const ids:string[]=[];
      for(let start=0;;start+=100){
        let query=db.from("pdp_documents").select("id,source_draft_id").not("deleted_at","is",null).order("id").range(start,start+99);
        if(userId!==null)query=query.eq("user_id",userId);
        const {data,error}=await query;
        if(error)throw new DocumentError(503,"삭제된 작업을 확인하지 못했습니다.");
        ids.push(...(data??[]).flatMap(r=>[r.id,...(r.source_draft_id?[r.source_draft_id]:[])]));
        if((data?.length??0)<100)break;
      }
      return ids;
    },
    async isDeleted(userId,key){
      // 지운 문서 목록 전체가 아니라 이 한 건만 본다. id 칸은 uuid 라 uuid 일 때만 견준다(형식 오류 대신).
      for(const column of [...(uuid.safeParse(key).success?["id"]:[]),"source_draft_id"]){
        const {data,error}=await db.from("pdp_documents").select("id").eq("user_id",userId).eq(column,key).not("deleted_at","is",null).limit(1);
        if(error)throw new DocumentError(503,"삭제된 작업을 확인하지 못했습니다.");
        if(data?.length)return true;
      }
      return false;
    },
    async revisions(userId,id) {
      if (!await repo.get(userId,id)) throw new DocumentError(404,"작업을 찾지 못했습니다.");
      const {data,error}=await db.from("pdp_document_revisions").select("revision,created_at")
        .eq("document_id",id).eq("user_id",userId).order("revision",{ascending:false});
      if(error) throw new DocumentError(503,"이전 버전을 읽지 못했습니다.");
      return (data ?? []).map(r => ({revision:r.revision,createdAt:r.created_at}));
    },
    markDeleted:(userId,id)=>write(userId,id,"delete"),
    async softDelete(userId,id,deletedBy){
      // RPC 의 delete 는 정리 대기를 켠다 — 그러면 다음 목록 요청이 문서를 비운다. 그래서 칸만 직접 적는다.
      const {data,error}=await db.from("pdp_documents")
        .update({deleted_at:new Date().toISOString(),deleted_by:deletedBy??userId,cleanup_pending:false})
        .eq("id",id).eq("user_id",userId).is("deleted_at",null).select("*").maybeSingle();
      if(error)throw new DocumentError(503,"작업을 지우지 못했습니다.");
      if(!data)throw new DocumentError(404,"작업을 찾지 못했습니다.");
      return recordFromRow(data);
    },
    async finishDelete(userId,id){await write(userId,id,"purge");},
  };
  return repo;
}
