import {z} from "zod";
import {assetPath,DocumentError,notFound,uuid,validateDocument} from "./model";
import {completeDocumentDelete,documentResponseError,readDocumentJson,type DocumentDependencies} from "./http";
export function adminDocumentHandlers(deps:DocumentDependencies){
  const run=(fn:(userId:string)=>Promise<object>)=>async()=>{
    try{
      if(!deps.enabled())throw notFound();
      const auth=await deps.authenticate();if(auth instanceof Response)throw notFound();
      return Response.json({ok:true,...await fn(auth.userId)},{headers:{"cache-control":"no-store"}});
    }catch(e){return documentResponseError(e);}
  };
  return {
    list:()=>run(async viewer=>{
      const docs=await deps.repo.list(null);
      const urls=await deps.storage.urls(Object.fromEntries(docs.flatMap(d=>d.cover?[[d.id,d.cover]]:[])));
      return {documents:docs.map(({heldImageTags:_held,...d})=>({...d,mine:d.userId===viewer,coverUrl:urls[d.id]??null}))};
    })(),
    get:(req:Request,id:string)=>run(async()=>{
      uuid.parse(id);const owner=uuid.parse(new URL(req.url).searchParams.get("owner"));
      const record=await deps.repo.get(owner,id);if(!record?.document)throw notFound();
      validateDocument(record.document,owner,id);
      return {record,urls:await deps.storage.urls(record.document.assets)};
    })(),
    /**
     * **관리자는 남의 상세페이지도 지운다**(2026-10-09 사용자). 회원 주소는 자기 문서만 찾으므로 주인을 실어 받는다.
     * 회원이 지울 때와 같이 지운 표시 → 옛 라이브러리 그림·문서 그림 파일까지 지운다.
     */
    remove:(req:Request,id:string)=>run(async()=>{
      uuid.parse(id);const owner=uuid.parse(new URL(req.url).searchParams.get("owner"));
      const row=await deps.repo.markDeleted(owner,id);
      await completeDocumentDelete(deps,owner,row);
      return {};
    })(),
    copy:(req:Request,id:string)=>run(async viewer=>{
      uuid.parse(id);
      const input=z.object({ownerId:uuid,targetId:uuid,revision:z.number().int().positive()}).strict().parse(await readDocumentJson(req,4096));
      const existing=await deps.repo.get(viewer,input.targetId);
      if(existing?.document){
        const copied=existing.document.body.copiedFrom as {id?:string;owner?:string;revision?:number}|undefined;
        if(copied?.id!==id || copied.owner!==input.ownerId || copied.revision!==input.revision)throw new DocumentError(409,"이미 사용 중인 작업 번호입니다.");
        return {id:existing.id};
      }
      const source=await deps.repo.get(input.ownerId,id,input.revision);if(!source?.document)throw notFound();
      validateDocument(source.document,input.ownerId,id);
      // 원래 회원(사본의 사본이면 처음 회원)을 서버가 적는다. 그 회원이 떠날 때 이 사본도 지운다.
      const origin=source.copiedFromOwner??input.ownerId;
      const target=await deps.repo.createCopy(viewer,input.targetId,origin);
      if(target.copiedFromOwner!==origin)throw new DocumentError(409,"이미 사용 중인 작업 번호입니다.");
      if(target.document){
        const copied=target.document.body.copiedFrom as {id?:string;owner?:string;revision?:number}|undefined;
        if(copied?.id!==id || copied.owner!==input.ownerId || copied.revision!==input.revision)throw new DocumentError(409,"이미 사용 중인 작업 번호입니다.");
        return {id:target.id};
      }
      const document=structuredClone(source.document);
      document.id=target.id;document.title=(document.title+" · 복사").slice(0,300);
      document.body.copiedFrom={id,owner:input.ownerId,revision:input.revision};
      document.body.snapshotOf=id;
      const seen=new Set<string>();
      for(const [key,asset] of Object.entries(source.document.assets)){
        const next={...asset,path:assetPath(viewer,target.id,asset.sha256,asset.mimeType)};
        if(!seen.has(next.path) && !await deps.storage.exists(next)){
          try{await deps.storage.copy(asset,next);}catch(e){if(!await deps.storage.exists(next))throw e;}
          if(!await deps.storage.exists(next))throw new DocumentError(503,"복사한 그림을 확인하지 못했습니다. 다시 시도해 주세요.");
        }
        seen.add(next.path);document.assets[key]=next;
      }
      validateDocument(document,viewer,target.id);
      await deps.repo.save(viewer,target.id,0,document,target.id);
      return {id:target.id};
    })(),
  };
}
