import type {SupabaseClient} from "@supabase/supabase-js";
import {deleteDocumentLegacy} from "../pdp/documents/delete-legacy";
import {createRemoteDocumentStorage} from "../pdp/documents/storage";
import {createSupabaseDocumentRepository} from "../pdp/documents/supabase-repository";

/**
 * 관리자가 이 회원의 작업을 복사해 둔 사본도 지운다(2026-10-03 사용자 결정).
 * 사본은 서버가 적은 표시(copied_from_owner)로만 찾고, 지우는 순서는 문서를 지울 때와 같다.
 * 실패하면 던진다. 사본은 「정리 대기」로 남아 다시 시도하면(또는 관리자 목록 정리가) 이어서 지운다.
 */
async function removeAdminCopies(db:SupabaseClient,userId:string){
  const repo=createSupabaseDocumentRepository(db),storage=createRemoteDocumentStorage(db);
  for(let round=0;round<100;round++){
    const copies=await repo.copiesOf(userId);
    if(!copies.length)return;
    for(const copy of copies){
      await repo.markDeleted(copy.userId,copy.id);
      await deleteDocumentLegacy(db,copy.userId,[copy.id,...(copy.sourceDraftId?[copy.sourceDraftId]:[])]);
      await storage.removeAll(copy.userId,copy.id);
      await repo.finishDelete(copy.userId,copy.id);
    }
  }
  throw Error("admin copies remain");
}

/** 플래그를 꺼도 이미 보관한 개인정보는 탈퇴 때 정리한다. */
export async function withdrawPdpDocuments(db:SupabaseClient,userId:string) {
  if(!/^[\w-]+$/.test(userId))throw Error("invalid owner");
  // 「정리 대기」를 함께 남긴다. 중간에 실패해도 숨긴 문서를 다음 정리 루틴이 이어서 지운다.
  const marked=await db.from("pdp_documents").update({deleted_at:new Date().toISOString(),cleanup_pending:true}).eq("user_id",userId);
  // 아직 새 저장 기능을 설치하지 않은 서버에는 표와 원본이 없다.
  if(marked.error && ["42P01","PGRST205"].includes(marked.error.code))return;
  if(marked.error)throw marked.error;
  await removeAdminCopies(db,userId);
  const bucket=db.storage.from("pdp-documents");
  const paths:string[]=[];
  async function walk(prefix:string,depth:number):Promise<void>{
    if(depth>4)throw Error("unexpected storage depth");
    for(let offset=0;;offset+=1000){
      const {data,error}=await bucket.list(prefix,{limit:1000,offset,sortBy:{column:"name",order:"asc"}});
      if(error || !data)throw error??Error("missing storage list");
      for(const entry of data){
        if(!/^[\w-]+(?:\.[\w-]+)*$/.test(entry.name))throw Error("invalid storage name");
        const path=prefix+"/"+entry.name;
        if(entry.id)paths.push(path);else await walk(path,depth+1);
      }
      if(data.length<1000)break;
    }
  }
  await walk(userId,1);
  for(let i=0;i<paths.length;i+=100){
    const {error}=await bucket.remove(paths.slice(i,i+100));if(error)throw error;
  }
  const revisions=await db.from("pdp_document_revisions").delete().eq("user_id",userId);
  if(revisions.error)throw revisions.error;
  const cleared=await db.from("pdp_documents").update({document:null,last_request_id:null,cleanup_pending:false,copied_from_owner:null,held_image_tags:[]}).eq("user_id",userId);
  if(cleared.error)throw cleared.error;
}
