"use client";
import { decodeServerDocument, encodeServerDocument } from "./server-document-codec";
import type { PdpDraftInput, PdpDraftRecord, PdpDraftSummary } from "./pdp-drafts";
import type { DocumentRecord, DocumentRevision, DocumentSummary } from "../../lib/pdp/documents/model";
import { DocumentError, uuid } from "../../lib/pdp/documents/model";
type Reply={ok:boolean;message?:string;current?:DocumentRecord;record?:DocumentRecord;urls?:Record<string,string>;
  asset?:{path:string};uploadUrl?:string;exists?:boolean;excludedDraftIds?:string[];documents?:Array<DocumentSummary & {coverUrl?:string}>;revisions?:DocumentRevision[]};
class ApiError extends Error{
  constructor(public status:number,body:Reply){super(body.message??"작업을 처리하지 못했습니다.");this.current=body.current;}
  current?:DocumentRecord;
}
/** 저장 준비가 뜻밖에 실패했을 때의 고정 문구. 브라우저 오류 원문은 보이지 않는다. */
const SAVE_FAILED_MESSAGE="작업을 저장하지 못했습니다.";
/** 다시 보내도 같은 답이 올 저장 거절. 화면은 이 이름이면 문구를 그대로 보인다. */
const rejectedSave=(message:string)=>Object.assign(new Error(message),{name:"DocumentSaveRejectedError"});
/**
 * 다시 하면 될 실패: 5xx·시간 초과(408)·로그인 만료(401)·요청 많음(429)·그림 업로드 미완료(409).
 * 버전 충돌 409 는 서버 최신(`current`)을 함께 주고 저장 안에서 별도 사본으로 처리한다. 업로드 미완료 409 에는 그것이 없다.
 */
const transientStatus=(error:ApiError)=>error.status>=500 || [401,408,429].includes(error.status) || (error.status===409 && !error.current);
/** 임시 보관은 연결 실패와 위의 실패에서만 한다. 나머지 4xx 는 그 말을 보이고, 404 는 삭제된 작업으로 알린다. */
function saveRejection(error:unknown):Error|null{
  if(error instanceof Error && error.name==="DocumentSaveRejectedError")return error;
  if(!(error instanceof ApiError) || error.status<400 || transientStatus(error))return null;
  return rejectedSave(error.status===404?"다른 곳에서 삭제된 작업입니다. 이 화면의 수정은 서버에 저장되지 않았습니다.":error.message);
}
/** 임시 보관 안내를 고를 까닭. 로그인 만료와 요청 많음은 사용자가 할 일이 다르다. */
const temporaryReason=(error:unknown):ServerDraftRecord["temporaryReason"]=>
  error instanceof ApiError?(error.status===401?"login":error.status===429?"busy":undefined):undefined;
type BrowserDrafts={get:(id:string)=>Promise<PdpDraftRecord|null>;list:()=>Promise<PdpDraftSummary[]>;remove?:(id:string)=>Promise<void>;
  save?:(input:PdpDraftInput)=>Promise<PdpDraftRecord>;discard?:(id:string)=>Promise<void>};
/** `unsavedCopyId`: 서버 최신본을 열면서 이 브라우저에 남은 변경을 따로 둔 곳. `temporaryReason`: 임시 보관한 까닭. */
export type ServerDraftRecord=PdpDraftRecord & {conflictOf?:string;unsavedCopyId?:string;temporaryReason?:"login"|"busy"};
export function createServerDraftRepository(browser:BrowserDrafts,fetcher:typeof fetch=(...args)=>fetch(...args)){
  const opened=new Map<string,DocumentRecord>();
  // 같은 화면의 확인된 연속 저장만 연결한다. 읽기/복원은 별도 화면이므로 끊는다.
  const savedSuccessors=new Map<string,Map<number,number>>();
  const temporaryIds=new Set<string>();
  // 따로 둔 「저장 안 된 변경」 id → 원래 작업 id. 저장하면 원래 작업을 덮지 않고 사본이 된다.
  const unsaved=new Map<string,string>();
  // 임시본 정리가 실패해도 저장은 끝난 것이다. 남은 임시본은 다음에 열 때 서버 최신과 다시 견준다.
  const discardTemporary=async(id:string)=>{try{await browser.discard?.(id);}catch{/* 다음에 열 때 다시 견준다 */}};
  const capture=(input:PdpDraftInput):PdpDraftInput=>({...input,
    serverRevision:input.serverRevision??(input.id?opened.get(input.id)?.revision:undefined)});
  const attempts=new Map<string,{fingerprint:string;requestId:string;packed:Awaited<ReturnType<typeof encodeServerDocument>>}>();
  const sentRequests=new Map<string,Set<string>>();
  const forks=new Map<string,{fingerprint:string;id:string}>();
  const restores=new Map<string,{baseRevision:number;revision:number;requestId:string}>();
  let pendingNewId:string|null=null;
  let queue:Promise<void>=Promise.resolve();
  function serial<T>(run:()=>Promise<T>):Promise<T>{
    const next=queue.then(run,run);queue=next.then(()=>{},()=>{});return next;
  }
  const call=async(path:string,method="GET",body?:unknown):Promise<Reply>=>{
    const response=await fetcher("/api/pdp/documents"+path,{method,cache:"no-store",headers:{"content-type":"application/json"},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120_000)});
    // 앞단(프록시)이 JSON 아닌 답을 줘도 상태 번호로 가린다. 413 은 본문이 없어도 까닭을 안다.
    const data=await response.json().catch(()=>null) as Reply|null;
    if(!response.ok || !data?.ok)throw new ApiError(response.status,data??{ok:false,...(response.status===413?{message:"작업이 너무 큽니다."}:{})});
    return data;
  };
  const hydrate=async(reply:Reply):Promise<PdpDraftRecord>=>{
    const record=reply.record!;if(!record?.document)throw new Error("아직 저장을 마치지 않은 작업입니다.");
    const urls=reply.urls??{};
    const draft=await decodeServerDocument(record.document,async asset=>{
      const key=Object.entries(record.document!.assets).find(([,a])=>a.path===asset.path)?.[0];
      const url=key?urls[key]:undefined;if(!url)throw new Error("그림 주소를 받지 못했습니다.");
      const response=await fetcher(url,{cache:"no-store",signal:AbortSignal.timeout(120_000)});
      if(!response.ok)throw new Error("그림 원본을 불러오지 못했습니다.");
      return new Uint8Array(await response.arrayBuffer());
    });
    opened.set(record.id,record);
    savedSuccessors.delete(record.id);
    return {...draft,id:record.id,serverRevision:record.revision,title:record.document.title,createdAt:record.createdAt,updatedAt:record.updatedAt};
  };
  async function fork(input:PdpDraftInput,sourceId:string):Promise<ServerDraftRecord>{
    const fingerprint=JSON.stringify(input);
    let target=forks.get(sourceId);
    if(!target){
      target={fingerprint,id:crypto.randomUUID()};forks.set(sourceId,target);
    }
    const copy=await save({...input,id:target.id,serverRevision:undefined,snapshotOf:sourceId});
    forks.delete(sourceId);attempts.delete(sourceId);pendingNewId=null;
    // 사본에 담긴 변경이다. 원래 id 의 임시본이 남으면 다음에 열 때 서버 최신을 가린다.
    if(temporaryIds.delete(sourceId))await discardTemporary(sourceId);
    return {...copy,conflictOf:sourceId};
  }
  async function saveUnsaved(input:PdpDraftInput,id:string,origin:string):Promise<ServerDraftRecord>{
    unsaved.delete(id);
    try{return {...await save({...input,id,serverRevision:undefined,snapshotOf:origin}),conflictOf:origin};}
    catch(error){unsaved.set(id,origin);throw error;}
  }
  async function save(input:PdpDraftInput):Promise<ServerDraftRecord>{
    const id=input.id??(pendingNewId??=crypto.randomUUID());
    const origin=unsaved.get(id);if(origin)return saveUnsaved(input,id,origin);
    let previous=opened.get(id);
    if(!previous){
      previous=(await call("","POST",{id})).record!;
      if(previous.document && input.serverRevision===undefined){
        // 저장 전 최신본을 읽어 덮어쓰지 않는다. 이 창이 읽지 않은 원본은 사본으로 분리한다.
        return fork(input,id);
      }
      opened.set(id,previous);
    }
    const fingerprint=JSON.stringify(input);
    let attempt=attempts.get(id);
    if(!attempt || attempt.fingerprint!==fingerprint){
      // 담을 수 없는 내용(알려진 400·413)은 다시 보내도 같다. 임시 보관 대신 그 까닭을 보인다.
      // 그 밖의 실패(브라우저 오류 등)는 원문을 숨기고 서버 장애처럼 임시 보관한다(최종 리뷰 L2).
      const packed=await encodeServerDocument(input,previous.userId,id).catch((error:unknown)=>{
        throw error instanceof DocumentError && [400,413].includes(error.status)?rejectedSave(error.message):new Error(SAVE_FAILED_MESSAGE);
      });
      attempt={fingerprint,requestId:crypto.randomUUID(),packed};
      if(previous.document)attempt.packed.document.title=previous.document.title;
      attempts.set(id,attempt);
    }
    for(const {asset,bytes} of attempt.packed.uploads){
      const ticket=await call("/"+id+"/assets","POST",{sha256:asset.sha256,mimeType:asset.mimeType,bytes:asset.bytes});
      if(ticket.exists)continue;
      if(!ticket.uploadUrl)throw new Error("그림 업로드 주소를 받지 못했습니다.");
      const response=await fetcher(ticket.uploadUrl,{method:"PUT",headers:{"content-type":asset.mimeType},
        body:new Uint8Array(bytes).buffer,signal:AbortSignal.timeout(120_000)});
      if(!response.ok){
        // 다른 창이 같은 파일을 먼저 올렸거나 응답만 유실된 경우에는 상태를 다시 확인한다.
        const check=await call("/"+id+"/assets","POST",{sha256:asset.sha256,mimeType:asset.mimeType,bytes:asset.bytes});
        if(!check.exists)throw new Error("그림 업로드를 마치지 못했습니다. 다시 저장해 주세요.");
      }
    }
    let record:DocumentRecord;
    let baseRevision=input.serverRevision??previous.revision;
    const successors=savedSuccessors.get(id);
    while(successors?.has(baseRevision))baseRevision=successors.get(baseRevision)!;
    try{
      const sent=sentRequests.get(id)??new Set<string>();sent.add(attempt.requestId);sentRequests.set(id,sent);
      record=(await call("/"+id,"PUT",{baseRevision,requestId:attempt.requestId,document:attempt.packed.document})).record!;
    }catch(e){
      if(e instanceof ApiError && e.status===409 && e.current){
        if(e.current.lastRequestId && sentRequests.get(id)?.has(e.current.lastRequestId)){
          opened.set(id,e.current);
          return save({...input,serverRevision:e.current.revision});
        }
        return fork(input,id);
      }
      throw e;
    }
    if(record.revision>baseRevision){
      const next=savedSuccessors.get(id)??new Map<number,number>();next.set(baseRevision,record.revision);savedSuccessors.set(id,next);
    }
    opened.set(id,record);attempts.delete(id);sentRequests.delete(id);pendingNewId=null;
    const saved={...input,id,temporary:false,serverRevision:record.revision,title:record.document!.title,createdAt:record.createdAt,updatedAt:record.updatedAt};
    if(temporaryIds.has(id) && browser.save){await browser.save(saved);temporaryIds.delete(id);}
    return saved;
  }
  /** 임시 보관본에 함께 적는 서버 기준: 이 내용이 딛고 선 버전과 이 브라우저가 보낸 저장 요청. */
  function pendingServerState(id:string,input:PdpDraftInput){
    let serverRevision=input.serverRevision??opened.get(id)?.revision??0;
    const successors=savedSuccessors.get(id);
    while(successors?.has(serverRevision))serverRevision=successors.get(serverRevision)!;
    const sent=[...sentRequests.get(id)??[]],requestId=attempts.get(id)?.requestId;
    return {serverRevision,serverSentRequestIds:sent,serverRequestId:requestId && sent.includes(requestId)?requestId:undefined,
      ...(unsaved.has(id)?{unsavedOf:unsaved.get(id)}:{})};
  }
  /** 임시 보관본을 열기 전에 서버 최신과 견준다. 서버에 닿지 못하면 지금처럼 임시본을 연다. */
  async function reopenTemporary(local:PdpDraftRecord):Promise<ServerDraftRecord>{
    const reply=await call("/"+local.id).catch(()=>null),record=reply?.record;
    const keep=(serverRevision=local.serverRevision)=>{temporaryIds.add(local.id);return {...local,serverRevision};};
    if(!reply || !record?.document){if(local.unsavedOf)unsaved.set(local.id,local.unsavedOf);return keep();}
    if(record.lastRequestId && record.lastRequestId===local.serverRequestId){
      // 응답만 잃었고 서버에는 이미 반영된 저장이다. 서버본을 열고 임시본은 치운다.
      const current=await hydrate(reply);await discardTemporary(local.id);return current;
    }
    if(record.revision<=(local.serverRevision??0))return keep();
    // 서버 최신이 이 브라우저의 앞선 저장이면 이 변경은 그 뒤의 것이다. 그 위에 이어 쓴다.
    if(record.lastRequestId && local.serverSentRequestIds?.includes(record.lastRequestId))return keep(record.revision);
    // 그사이 다른 곳에서 저장했다. 서버본을 열고, 남은 변경은 덮지도 버리지도 않게 따로 둔다.
    const current=await hydrate(reply);
    const kept=await browser.save!({...local,id:crypto.randomUUID(),unsavedOf:local.id,serverRevision:undefined,
      serverRequestId:undefined,serverSentRequestIds:undefined});
    await discardTemporary(local.id);
    return {...current,unsavedCopyId:kept.id};
  }
  const repo={
    // 화면은 복구 사본의 id 만 쓴다. 이미 만든 사본이면 그림을 다시 내려받지 않고 id 만 돌려준다.
    recover:(input:PdpDraftInput,sourceId:string,jobId:string):Promise<{id:string}>=>serial(async()=>{
      const created=await call("","POST",{id:crypto.randomUUID(),sourceDraftId:"recovery:"+sourceId+":"+jobId});
      if(created.record!.document)return {id:created.record!.id};
      const id=created.record!.id;opened.set(id,created.record!);
      return save({...input,id,serverRevision:0,snapshotOf:sourceId});
    }),
    save:(input:PdpDraftInput)=>{const snapshot=capture(input);return serial(async()=>{
      try{return await save(snapshot);}
      catch(error){
        const rejected=saveRejection(error);if(rejected)throw rejected;
        if(!browser.save)throw error;
        const id=snapshot.id??pendingNewId??crypto.randomUUID();
        const local=await browser.save({...snapshot,id,temporary:true,...pendingServerState(id,snapshot)});
        temporaryIds.add(id);return {...local,temporary:true,temporaryReason:temporaryReason(error)};
      }
    });},
    get:(key:string):Promise<ServerDraftRecord|null>=>serial(async()=>{
      const [id,version]=key.split("@");
      if(!version){
        const local=await browser.get(id);
        if(local?.temporary)return reopenTemporary(local);
      }
      if(version){
        const revision=Number(version);if(!Number.isInteger(revision)||revision<1)throw new Error("이전 버전 번호가 올바르지 않습니다.");
        const current=opened.get(id)??(await call("/"+id)).record!;
        let attempt=restores.get(id);
        if(!attempt || attempt.revision!==revision || attempt.baseRevision!==current.revision){
          attempt={baseRevision:current.revision,revision,requestId:crypto.randomUUID()};restores.set(id,attempt);
        }
        try{
          const restored=await hydrate(await call("/"+id+"/restore","POST",attempt));
          restores.delete(id);return restored;
        }catch(error){
          if(error instanceof ApiError && error.status===409 && error.current){
            opened.set(id,error.current);savedSuccessors.delete(id);restores.delete(id);
            const conflict=new Error("다른 창에서 작업을 바꿨습니다. 이전 버전을 다시 선택하고 복원을 확인해 주세요.");
            conflict.name="RestoreConflictError";throw conflict;
          }
          throw error;
        }
      }
      let pending:DocumentRecord|undefined;
      if(uuid.safeParse(id).success){
        try{
          const reply=await call("/"+id);
          if(reply.record?.document)return hydrate(reply);
          pending=reply.record;
        }
        catch(e){if(!(e instanceof ApiError) || e.status!==404)throw e;}
      }
      const legacy=await browser.get(pending?.sourceDraftId??id);if(!legacy)return null;
      if(pending){
        opened.set(pending.id,pending);
        return save({...legacy,id:pending.id});
      }
      const created=await call("","POST",{id:uuid.safeParse(id).success?id:crypto.randomUUID(),sourceDraftId:id});
      if(created.record!.document)return hydrate(created);
      opened.set(created.record!.id,created.record!);
      return save({...legacy,id:created.record!.id});
    }),
    preserve:(input:PdpDraftInput):Promise<PdpDraftRecord>=>{const snapshot=capture(input);return serial(async()=>{
      const saved=await save(snapshot);
      await call("/"+saved.id+"/pin","POST",{revision:saved.serverRevision});
      return {...saved,id:saved.id+"@"+opened.get(saved.id)!.revision};
    });},
    remove:(id:string)=>serial(async()=>{
      if(!uuid.safeParse(id).success){
        if(await browser.get(id)){await browser.remove?.(id);return;}
        throw new Error("작업을 찾지 못했습니다.");
      }
      try{await call("/"+id,"DELETE");}
      catch(e){
        if(e instanceof ApiError && e.status===404 && await browser.get(id)){await browser.remove?.(id);return;}
        throw e;
      }
      const localId=opened.get(id)?.sourceDraftId??id;
      await browser.remove?.(localId);opened.delete(id);attempts.delete(id);forks.delete(id);restores.delete(id);
    }),
    async list():Promise<PdpDraftSummary[] & {serverUnavailable?:true}>{
      let reply:Reply;
      // 서버에 닿지 못하면 이 브라우저의 작업이라도 보인다. 화면이 그렇다고 알린다.
      try{reply=await call("");}catch{return Object.assign([...await browser.list()],{serverUnavailable:true as const});}
      const {documents=[],excludedDraftIds=[]}=reply;
      const local=await browser.list();
      const covered=new Set([...excludedDraftIds,...documents.flatMap(d=>[d.id,d.sourceDraftId].filter((x):x is string=>Boolean(x)))]);
      return [...local.filter(d=>!covered.has(d.id)),...documents.map(d=>({
        id:d.id,title:d.title,createdAt:d.createdAt,updatedAt:d.updatedAt,aspectRatio:(d.aspectRatio??"9:16") as PdpDraftSummary["aspectRatio"],
        sectionCount:d.sectionCount,stageLabel:d.stage==="input"?"설정 초안":"편집 중",thumbnailUrl:d.coverUrl??null,
      }))].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    },
    async revisions(id:string){return (await call("/"+id+"/revisions")).revisions??[];},
    async restore(id:string,revision:number){return repo.get(id+"@"+revision);},
  };
  return repo;
}
