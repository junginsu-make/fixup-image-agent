import {hasFullScope} from "../../access/core";
import type {LibraryViewer,ServerLibraryItem} from "../../server-library";
import {workProcessOf} from "../../../app/api/library/work-process";
import {documentServices,serverDocumentsEnabled} from "./index";
import {DocumentError,uuid,validateDocument,type DocumentRecord} from "./model";
export function documentLibraryAdapter(viewer:LibraryViewer){
  const resolve=async(id:string,action:"read"|"export"="read"):Promise<DocumentRecord|null>=>{
    if(!serverDocumentsEnabled() || !uuid.safeParse(id).success)return null;
    const {repo}=documentServices();
    let row=await repo.get(viewer.userId,id);
    if(!row)row=await repo.find(viewer.userId,id,"sourceDraftId");
    if(!row && hasFullScope(viewer,action)){
      row=await repo.find(null,id,"id")??await repo.find(null,id,"sourceDraftId");
    }
    if(!row?.document)return null;
    validateDocument(row.document,row.userId,row.id);return row;
  };
  const pictures=(row:DocumentRecord)=>{
    const doc=row.document!;
    return (doc.body.sections as Array<{generatedImage?:{$asset?:string}}>).flatMap((s,position)=>{
      const asset=s.generatedImage?.$asset?doc.assets[s.generatedImage.$asset]:null;
      return asset?[{asset,position}]:[];
    });
  };
  return {
    async excluded(){
      return serverDocumentsEnabled()?documentServices().repo.deletedDraftIds(hasFullScope(viewer,"read")?null:viewer.userId):[];
    },
    async list():Promise<ServerLibraryItem[]|null>{
      if(!serverDocumentsEnabled())return null;
      const {repo,storage}=documentServices();
      const rows=await repo.list(hasFullScope(viewer,"read")?null:viewer.userId);
      const urls=await storage.urls(Object.fromEntries(rows.flatMap(r=>r.cover?[[r.id,r.cover]]:[])));
      return rows.map(r=>({id:r.id,title:r.title,tool:"create",aspectRatio:null,sourceType:"generation",sourceId:r.sourceDraftId??r.id,
        imageCount:r.imageCount,createdAt:r.createdAt,coverUrl:urls[r.id]??null,coverThumbUrl:null,mine:r.userId===viewer.userId,ownerEmail:null,
        documentId:r.id,documentOwner:r.userId,imageTags:r.imageTags,heldImageTags:r.heldImageTags??[]}));
    },
    /** 옛 작업이 연결된 문서의 지금 그림 지문과 가졌던 그림 지문. 옛 그림을 보일지 정한다(W9·M1). */
    async linkedDocument(id:string){
      const row=await resolve(id);if(!row)return null;
      return {imageTags:pictures(row).flatMap(x=>x.asset.legacyHash?[x.asset.legacyHash.slice(0,8)]:[]),heldImageTags:row.heldImageTags??[]};
    },
    async work(id:string){
      const row=await resolve(id);if(!row)return null;
      const doc=row.document!,settings=doc.body.settings as Record<string,unknown>;
      return {id:row.id,title:doc.title,tool:"create" as const,aspectRatio:String(settings?.aspectRatio??"9:16"),
        imageCount:pictures(row).length,createdAt:row.createdAt,mine:row.userId===viewer.userId,ownerEmail:null,
        documentId:row.id,documentOwner:row.userId,
        process:workProcessOf({blueprint:{...(doc.body.blueprint as object),sections:doc.body.sections} as never,review:doc.body.planningReview})};
    },
    async images(id:string){
      const row=await resolve(id);if(!row)return null;
      const items=pictures(row),urls=await documentServices().storage.urls(Object.fromEntries(items.map(x=>[String(x.position),x.asset])));
      return items.map(x=>({position:x.position,mimeType:x.asset.mimeType,url:urls[String(x.position)]??null}));
    },
    async file(id:string,position:number,action:"read"|"export"){
      const row=await resolve(id,action);if(!row)return null;
      const item=pictures(row).find(x=>x.position===position);if(!item)return null;
      const storage=documentServices().storage;
      if(!storage.read)throw new DocumentError(503,"그림을 읽지 못했습니다.");
      return {bytes:await storage.read(item.asset),mimeType:item.asset.mimeType};
    },
  };
}
