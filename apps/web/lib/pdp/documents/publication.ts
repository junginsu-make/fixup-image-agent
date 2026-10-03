import {createSupabaseAdminClient} from "../../supabase/admin";
import {serverDocumentsEnabled} from "./flags";
import {DOCUMENT_BUCKET,uuid,validateDocument,type DocumentRecord} from "./model";
export function publicationSource(record:DocumentRecord,index?:number){
  if(!record.document || record.deletedAt)return null;
  const doc=validateDocument(record.document,record.userId,record.id);
  const sections=doc.body.sections as Array<{generatedImage?:{$asset?:string}}>;
  const position=index??sections.findIndex(s=>Boolean(s.generatedImage?.$asset));
  const marker=sections[position]?.generatedImage?.$asset,asset=marker?doc.assets[marker]:null;
  return asset?{storagePath:asset.path,ownerId:record.userId,index:position,bucket:DOCUMENT_BUCKET}:null;
}
/** 공개 여부는 기존 관리자 게시 API만 결정한다. 여기서는 선택한 문서의 그림만 찾는다. */
export async function findDocumentPublicationSource(id:string,index?:number){
  if(!serverDocumentsEnabled() || !uuid.safeParse(id).success)return null;
  const {data,error}=await createSupabaseAdminClient().from("pdp_documents").select("*").eq("id",id).is("deleted_at",null).maybeSingle();
  if(error){console.warn("[showcase] 상세페이지 그림을 읽지 못해 기존 보관함을 확인합니다.");return null;}
  if(!data)return null;
  const {recordFromRow}=await import("./supabase-repository");
  return publicationSource(recordFromRow(data),index);
}
