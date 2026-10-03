import { z } from "zod";
import { assetPath, assetSchema, DOCUMENT_JSON_LIMIT, DocumentError, notFound, uuid, validateDocument, type DocumentRecord } from "./model";
import type { DocumentRepository } from "./repository";
import type { DocumentStorage } from "./storage";
export interface DocumentDependencies {
  enabled:()=>boolean;
  authenticate:()=>Promise<{userId:string} | Response>;
  repo:DocumentRepository;storage:DocumentStorage;
  cleanupLegacy?:(userId:string,sourceIds:string[])=>Promise<void>;
}
const uploadSchema=assetSchema.omit({path:true,fileName:true}).strict();
const saveSchema=z.object({baseRevision:z.number().int().nonnegative(),requestId:uuid,document:z.unknown()}).strict();
export async function readDocumentBytes(req:Request,limit:number):Promise<Buffer>{
  const reader=req.body?.getReader();if(!reader)throw new DocumentError(400,"요청 내용이 없습니다.");
  const chunks:Uint8Array[]=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>limit){await reader.cancel();throw new DocumentError(413,"작업 정보가 너무 큽니다.");}chunks.push(value);}
    return Buffer.concat(chunks);
  }finally{reader.releaseLock();}
}
export async function readDocumentJson(req:Request,limit=DOCUMENT_JSON_LIMIT+4096):Promise<unknown>{
  return JSON.parse((await readDocumentBytes(req,limit)).toString("utf8"));
}
export function documentResponseError(error:unknown):Response{
  const status=error instanceof DocumentError?error.status:error instanceof z.ZodError || error instanceof SyntaxError?400:503;
  return Response.json({ok:false,message:error instanceof DocumentError?error.message:status===400?"요청 형식이 올바르지 않습니다.":"작업을 처리하지 못했습니다.",
    ...(error instanceof DocumentError && error.current?{current:error.current}:{})},{status,headers:{"cache-control":"no-store"}});
}
export function documentHandlers(deps:DocumentDependencies){
  const completeDelete=async(userId:string,row:Pick<DocumentRecord,"id"|"sourceDraftId">)=>{
    await deps.cleanupLegacy?.(userId,[row.id,...(row.sourceDraftId?[row.sourceDraftId]:[])]);
    await deps.storage.removeAll(userId,row.id);await deps.repo.finishDelete(userId,row.id);
  };
  const run=(fn:(userId:string)=>Promise<unknown>)=>async()=>{
    try{
      if(!deps.enabled())throw notFound();
      const auth=await deps.authenticate();if(auth instanceof Response)return auth;
      return Response.json({ok:true,...await fn(auth.userId) as object},{headers:{"cache-control":"no-store"}});
    }catch(e){return documentResponseError(e);}
  };
  const requireDoc=async(userId:string,id:string,revision?:number)=>{
    uuid.parse(id);const row=await deps.repo.get(userId,id,revision);if(!row)throw notFound();return row;
  };
  const withUrls=async(record:DocumentRecord)=>{
    if(record.document)validateDocument(record.document,record.userId,record.id);
    return {record,urls:record.document?await deps.storage.urls(record.document.assets):{}};
  };
  const ensureAssets=async(record:NonNullable<DocumentRecord["document"]>)=>{
    // 동시에 수백 요청을 보내지 않는다. 한 번 확인한 같은 경로는 다시 조회하지 않는다.
    const seen=new Set<string>();
    for(const asset of Object.values(record.assets)){
      if(seen.has(asset.path))continue;seen.add(asset.path);
      if(!await deps.storage.exists(asset))throw new DocumentError(409,"그림 업로드가 끝나지 않았습니다. 다시 저장해 주세요.");
    }
  };
  return {
    pin:(req:Request,id:string)=>run(async userId=>{
      const {revision}=z.object({revision:z.number().int().positive()}).strict().parse(await readDocumentJson(req,4096));
      await requireDoc(userId,id);await deps.repo.pin(userId,id,revision);return {};
    })(),
    list:()=>run(async userId=>{
      for(const row of await deps.repo.pendingDeletes(userId)){
        try{await completeDelete(userId,row);}
        catch{console.warn("[pdp documents] 삭제 중인 작업 정리를 다음 요청에서 다시 시도합니다.");}
      }
      const documents=await deps.repo.list(userId);
      const covers=Object.fromEntries(documents.flatMap(d=>d.cover?[[d.id,d.cover]]:[]));
      const urls=await deps.storage.urls(covers);
      // 가졌던 그림 지문은 서버 안에서만 쓴다(라이브러리 옛 그림 가르기). 화면에 보내지 않는다.
      return {documents:documents.map(({heldImageTags:_held,...d})=>({...d,mine:true,coverUrl:urls[d.id]??null})),excludedDraftIds:await deps.repo.deletedDraftIds(userId)};
    })(),
    create:(req:Request)=>run(async userId=>{
      const body=z.object({id:uuid,sourceDraftId:z.string().min(1).max(120).optional()}).strict().parse(await readDocumentJson(req,4096));
      return withUrls(await deps.repo.create(userId,body.id,body.sourceDraftId));
    })(),
    get:(req:Request,id:string)=>run(async userId=>{
      const raw=new URL(req.url).searchParams.get("revision");
      const revision=raw===null?undefined:z.coerce.number().int().positive().parse(raw);
      return withUrls(await requireDoc(userId,id,revision));
    })(),
    put:(req:Request,id:string)=>run(async userId=>{
      await requireDoc(userId,id);
      const input=saveSchema.parse(await readDocumentJson(req));
      const document=validateDocument(input.document,userId,id);
      await ensureAssets(document);
      return {record:await deps.repo.save(userId,id,input.baseRevision,document,input.requestId)};
    })(),
    assets:(req:Request,id:string)=>run(async userId=>{
      await requireDoc(userId,id);
      const input=uploadSchema.parse(await readDocumentJson(req,4096));
      const asset={...input,path:assetPath(userId,id,input.sha256,input.mimeType)};
      return {asset,...await deps.storage.exists(asset)?{exists:true}:await deps.storage.uploadTicket(asset)};
    })(),
    revisions:(_req:Request,id:string)=>run(async userId=>{
      await requireDoc(userId,id);return {revisions:await deps.repo.revisions(userId,id)};
    })(),
    restore:(req:Request,id:string)=>run(async userId=>{
      const body=z.object({revision:z.number().int().positive(),baseRevision:z.number().int().nonnegative(),requestId:uuid}).strict().parse(await readDocumentJson(req,4096));
      const current=await requireDoc(userId,id);
      // 복원이 성공한 뒤 응답/서명만 실패했을 수 있다. 원본 버전이 정리됐어도 같은 요청을 확인한다.
      if(current.lastRequestId===body.requestId){
        if(current.revision!==body.baseRevision+1 || current.document?.body.restoredFromRevision!==body.revision){
          throw new DocumentError(400,"복원 요청이 달라졌습니다.");
        }
        return withUrls(current);
      }
      if(current.revision!==body.baseRevision)throw new DocumentError(409,"다른 창에서 먼저 저장했습니다.",current);
      const past=await requireDoc(userId,id,body.revision);if(!past.document)throw notFound();
      validateDocument(past.document,userId,id);await ensureAssets(past.document);
      const restored={...past.document,body:{...past.document.body,restoredFromRevision:body.revision}};
      return withUrls(await deps.repo.save(userId,id,body.baseRevision,restored,body.requestId));
    })(),
    remove:(_req:Request,id:string)=>run(async userId=>{
      uuid.parse(id);const row=await deps.repo.markDeleted(userId,id);
      await completeDelete(userId,row);return {};
    })(),
  };
}
