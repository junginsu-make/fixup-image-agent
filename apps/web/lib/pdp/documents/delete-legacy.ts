import type {SupabaseClient} from "@supabase/supabase-js";
import {DocumentError,uuid} from "./model";
/** 새 문서의 명시적 삭제만 호출한다. 파일 정리 실패 시 행을 남겨 재시도한다. */
export async function deleteDocumentLegacy(db:SupabaseClient,userId:string,sourceIds:string[]){
  const ids=sourceIds.filter(id=>uuid.safeParse(id).success);if(!ids.length)return;
  for(let page=0;page<100;page++){
    const {data:items,error}=await db.from("library_items").select("id").eq("user_id",userId).eq("tool","create").in("source_id",ids).limit(100);
    if(error)throw new DocumentError(503,"라이브러리 그림 목록을 읽지 못했습니다.");
    if(!items?.length)return;
    for(const item of items){
      const images=await db.from("library_images").select("path,thumb_path").eq("user_id",userId).eq("item_id",item.id);
      if(images.error)throw new DocumentError(503,"라이브러리 그림을 확인하지 못했습니다.");
      const paths=(images.data??[]).flatMap(row=>[row.path,row.thumb_path]).filter((p):p is string=>Boolean(p));
      if(paths.some(p=>!p.startsWith(userId+"/"+item.id+"/") || !p.split("/").every(x=>/^[\w-]+(?:\.[\w-]+)*$/.test(x)))){
        throw new DocumentError(400,"라이브러리 그림 경로를 확인해야 합니다.");
      }
      if(paths.length){
        const removed=await db.storage.from("library").remove(paths);
        if(removed.error)throw new DocumentError(503,"라이브러리 그림을 지우지 못했습니다.");
      }
      const removed=await db.from("library_items").delete().eq("id",item.id).eq("user_id",userId);
      if(removed.error)throw new DocumentError(503,"라이브러리 작업을 지우지 못했습니다.");
    }
  }
  throw new DocumentError(503,"남은 라이브러리 정리를 위해 다시 시도해 주세요.");
}
