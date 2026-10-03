import "fake-indexeddb/auto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServerDraftRepository } from "../server-draft-repository";
import { createServerBrowserDrafts } from "../draft-repository";
import { getPdpDraft, listPdpDrafts, type PdpDraftInput } from "../pdp-drafts";
import { createEmptySection } from "../scenario-sections";
import { createLocalDocumentRepository } from "../../../lib/pdp/documents/local-repository";
import { documentHandlers } from "../../../lib/pdp/documents/http";

/*
  임시 보관본(서버에 못 올린 저장)을 다시 열 때의 시험(3차 리뷰 ③ W2).

  브라우저 보관함은 화면이 쓰는 조합(`createServerBrowserDrafts`) 그대로다. 이 조합에서
  「원래 작업 id 의 임시본」이 남아 서버 최신을 가리고, 열 때마다 사본이 늘었다.
*/
const user="11111111-1111-4111-8111-111111111111",roots:string[]=[];
const input=(message:string):PdpDraftInput=>({appState:"upload",preparedImage:null,modelImage:null,modelImageUsage:null,result:null,
  additionalInfo:message,desiredTone:"",aspectRatio:"9:16",notice:"",editorState:null});
const empty={get:async()=>null,list:async()=>[]};
const browser=()=>createServerBrowserDrafts(false);
type Fetch=(url:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
const PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const STORAGE="https://storage.local/";
function setup(){
  const root=mkdtempSync(join(tmpdir(),"pdp-temp-"));roots.push(root);const repo=createLocalDocumentRepository(root);
  const urls=async(assets:Record<string,unknown>)=>Object.fromEntries(Object.keys(assets).map(key=>[key,STORAGE+key]));
  const h=documentHandlers({enabled:()=>true,authenticate:async()=>({userId:user}),repo,
    storage:{exists:async()=>true,uploadTicket:async()=>({exists:true}),urls,removeAll:async()=>{},copy:async()=>{}}});
  const fetcher:Fetch=async(url,init)=>{
    if(String(url).startsWith(STORAGE))return new Response(Buffer.from(PNG,"base64"),{headers:{"content-type":"image/png"}});
    const req=new Request(new URL(String(url),"http://local"),init);
    const suffix=new URL(req.url).pathname.replace("/api/pdp/documents",""),[id,action]=suffix.split("/").filter(Boolean);
    if(!id)return req.method==="POST"?h.create(req):h.list();
    if(action==="restore")return h.restore(req,id);
    if(action==="pin")return h.pin(req,id);
    if(action==="revisions")return h.revisions(req,id);
    if(action==="assets")return h.assets(req,id);
    if(req.method==="PUT")return h.put(req,id);
    if(req.method==="DELETE")return h.remove(req,id);
    return h.get(req,id);
  };
  return {repo,fetcher};
}
/** 저장 요청이 서버에 닿기 전(down) 또는 닿은 뒤 응답만(lose) 끊기는 연결. */
function network(fetcher:Fetch){
  const state={mode:"ok" as "ok"|"down"|"lose"|"offline"};
  const send:Fetch=async(url,init)=>{
    if(state.mode==="offline" || (state.mode==="down" && init?.method==="PUT"))throw new TypeError("Failed to fetch");
    const response=await fetcher(url,init);
    if(state.mode==="lose" && init?.method==="PUT")throw new TypeError("Failed to fetch");
    return response;
  };
  return {state,send};
}
afterEach(()=>{for(const root of roots.splice(0)){if(!root.startsWith(join(tmpdir(),"pdp-temp-")))throw Error("unsafe");rmSync(root,{recursive:true,force:true});}});
describe("임시 보관본을 다시 열 때",()=>{
  it("W2 S5: 저장은 서버에 반영되고 응답만 잃은 뒤 새로고침하면 서버본을 열고 사본을 만들지 않는다",async()=>{
    const {repo,fetcher}=setup(),net=network(fetcher);
    const b=createServerDraftRepository(browser(),net.send),first=await b.save(input("처음"));
    net.state.mode="lose";
    const temp=await b.save({...first,additionalInfo:"내 수정(서버엔 반영됨)"});
    expect(temp.temporary).toBe(true);
    const b2=createServerDraftRepository(browser(),fetcher);
    const reopened=await b2.get(first.id);
    expect(reopened?.additionalInfo).toBe("내 수정(서버엔 반영됨)");
    expect(reopened?.temporary).toBeFalsy();
    expect(reopened?.serverRevision).toBe(2);
    expect(await getPdpDraft(first.id)).toBeNull();
    const saved=await b2.save({...input("내 수정 이어서"),id:first.id,serverRevision:reopened?.serverRevision});
    expect(saved.id).toBe(first.id);expect(saved.conflictOf).toBeUndefined();
    expect(await repo.list(user)).toHaveLength(1);
    const again=await createServerDraftRepository(browser(),fetcher).get(first.id);
    expect(again?.additionalInfo).toBe("내 수정 이어서");expect(again?.temporary).toBeFalsy();
  });
  it("W2 S1: 오프라인 수정이 사본으로 저장되면 원래 작업의 임시본을 지워, 새로고침하면 다른 창의 최신본이 열린다",async()=>{
    const {repo,fetcher}=setup(),net=network(fetcher);
    const a=createServerDraftRepository(empty,fetcher),first=await a.save(input("처음"));
    const b=createServerDraftRepository(browser(),net.send),old=await b.get(first.id);
    net.state.mode="offline";
    const temp=await b.save({...input("B 오프라인 수정"),id:first.id,serverRevision:old?.serverRevision});
    net.state.mode="ok";
    expect(temp.temporary).toBe(true);
    await a.save({...first,additionalInfo:"A 최신"});
    const synced=await b.save({...input("B 오프라인 수정"),id:first.id,serverRevision:old?.serverRevision});
    expect(synced.conflictOf).toBe(first.id);
    expect(await getPdpDraft(first.id)).toBeNull();
    const b2=createServerDraftRepository(browser(),fetcher),reopened=await b2.get(first.id);
    expect(reopened?.additionalInfo).toBe("A 최신");expect(reopened?.temporary).toBeFalsy();
    const next=await b2.save({...input("B 다시 수정"),id:first.id,serverRevision:reopened?.serverRevision});
    expect(next.id).toBe(first.id);expect(next.conflictOf).toBeUndefined();
    expect(await repo.list(user)).toHaveLength(2);
  });
  it("W2: 임시본 정리가 실패해도 사본 저장은 성공으로 돌려주고 새 임시본을 만들지 않는다",async()=>{
    const {fetcher}=setup(),net=network(fetcher);
    const a=createServerDraftRepository(empty,fetcher),first=await a.save(input("처음"));
    const stuck={...browser(),discard:async()=>{throw new Error("정리 실패");}};
    const b=createServerDraftRepository(stuck,net.send),old=await b.get(first.id);
    net.state.mode="offline";
    await b.save({...input("B 오프라인 수정"),id:first.id,serverRevision:old?.serverRevision});
    net.state.mode="ok";
    await a.save({...first,additionalInfo:"A 최신"});
    const synced=await b.save({...input("B 오프라인 수정"),id:first.id,serverRevision:old?.serverRevision});
    expect(synced.conflictOf).toBe(first.id);expect(synced.temporary).toBeFalsy();
    const reopened=await createServerDraftRepository(browser(),fetcher).get(first.id);
    expect(reopened?.additionalInfo).toBe("A 최신");
  });
  it("W2 S1: 동기화 전에 새로고침하면 서버 최신본을 열고, 남은 변경은 따로 두었다가 열어 저장하면 사본 하나로 남긴다",async()=>{
    const {repo,fetcher}=setup(),net=network(fetcher);
    const a=createServerDraftRepository(empty,fetcher),first=await a.save(input("처음"));
    const b=createServerDraftRepository(browser(),net.send),old=await b.get(first.id);
    net.state.mode="offline";
    await b.save({...input("B 오프라인 수정"),id:first.id,serverRevision:old?.serverRevision});
    await a.save({...first,additionalInfo:"A 최신"});
    const b2=createServerDraftRepository(browser(),fetcher),reopened=await b2.get(first.id);
    expect(reopened?.additionalInfo).toBe("A 최신");expect(reopened?.temporary).toBeFalsy();
    const keptId=(reopened as {unsavedCopyId?:string}|null)?.unsavedCopyId;
    expect(keptId).toBeTruthy();
    expect(await getPdpDraft(first.id)).toBeNull();
    expect(await getPdpDraft(keptId!)).toMatchObject({temporary:true,unsavedOf:first.id,additionalInfo:"B 오프라인 수정"});
    expect((await b2.list()).find(d=>d.id===keptId)?.stageLabel).toBe("저장 안 된 변경");
    const opened=await b2.get(keptId!);
    expect(opened?.additionalInfo).toBe("B 오프라인 수정");expect(opened?.temporary).toBe(true);
    const copy=await b2.save({...input("B 오프라인 수정"),id:keptId,serverRevision:opened?.serverRevision});
    expect(copy.conflictOf).toBe(first.id);expect(copy.temporary).toBeFalsy();
    expect((await b2.save({...input("사본 이어서"),id:copy.id,serverRevision:copy.serverRevision})).id).toBe(copy.id);
    expect(await repo.list(user)).toHaveLength(2);
    expect((await a.get(first.id))?.additionalInfo).toBe("A 최신");
    const rows=(await b2.list()).filter(d=>d.id===keptId || d.id===copy.id);
    expect(rows).toHaveLength(1);expect(rows[0].stageLabel).not.toBe("저장 안 된 변경");
  });
  it("W2: 내 앞선 저장만 서버에 반영되고 더 고친 임시본은 서버 최신 위에 이어 저장한다",async()=>{
    const {repo,fetcher}=setup(),net=network(fetcher);
    const b=createServerDraftRepository(browser(),net.send),first=await b.save(input("처음"));
    net.state.mode="lose";await b.save({...first,additionalInfo:"1차(반영됨)"});
    net.state.mode="down";const temp=await b.save({...first,additionalInfo:"2차(못 보냄)"});
    expect(temp.temporary).toBe(true);
    const b2=createServerDraftRepository(browser(),fetcher),reopened=await b2.get(first.id);
    expect(reopened?.additionalInfo).toBe("2차(못 보냄)");expect(reopened?.temporary).toBe(true);
    const saved=await b2.save({...input("2차(못 보냄)"),id:first.id,serverRevision:reopened?.serverRevision});
    expect(saved.id).toBe(first.id);expect(saved.conflictOf).toBeUndefined();
    expect(await repo.list(user)).toHaveLength(1);
    expect((await repo.get(user,first.id))?.revision).toBe(3);
  });
  it("W3: 서버 목록을 못 읽으면 이 브라우저의 작업을 대신 돌려주고 그렇다고 표시한다",async()=>{
    const local={id:"local-only",title:"브라우저 작업",createdAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z",
      aspectRatio:"9:16" as const,sectionCount:1,stageLabel:"편집 중",thumbnailUrl:null};
    const offline=createServerDraftRepository({get:async()=>null,list:async()=>[local]},async()=>{throw new TypeError("Failed to fetch");});
    const list=await offline.list();
    expect(list.map(d=>d.id)).toEqual(["local-only"]);
    expect(list.serverUnavailable).toBe(true);
    const {fetcher}=setup();
    expect((await createServerDraftRepository({get:async()=>null,list:async()=>[local]},fetcher).list()).serverUnavailable).toBeFalsy();
  });
  it.each([
    [413,JSON.stringify({ok:false,message:"작업 정보가 너무 큽니다."}),"작업 정보가 너무 큽니다."],
    [413,"<html>413 Request Entity Too Large</html>","작업이 너무 큽니다"],
    [400,JSON.stringify({ok:false,message:"작업 내용이 올바르지 않습니다."}),"작업 내용이 올바르지 않습니다."],
    [403,JSON.stringify({ok:false,message:"이 작업을 고칠 권한이 없습니다."}),"이 작업을 고칠 권한이 없습니다."],
  ])("W4: 저장이 %s 로 거절되면 서버 문구를 그대로 보이고 임시본을 만들지 않는다",async(status,body,message)=>{
    const {fetcher}=setup(),a=createServerDraftRepository(empty,fetcher),first=await a.save(input("처음"));
    const refuse:Fetch=async(url,init)=>init?.method==="PUT"?new Response(body,{status}):fetcher(url,init);
    const b=createServerDraftRepository(browser(),refuse),old=await b.get(first.id);
    const failure=await b.save({...input("큰 작업"),id:first.id,serverRevision:old?.serverRevision}).catch((error:Error)=>error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(message);
    expect((failure as Error).name).toBe("DocumentSaveRejectedError");
    expect(await getPdpDraft(first.id)).toBeNull();
  });
  it.each([
    [401,{ok:false,code:"unauthenticated",message:"로그인이 필요합니다."},"login"],
    [429,{ok:false,message:"요청이 너무 많습니다."},"busy"],
    [409,{ok:false,message:"그림 업로드가 끝나지 않았습니다. 다시 저장해 주세요."},undefined],
  ])("라운드1: 저장이 %s(다시 하면 될 실패)면 이 브라우저에 임시 보관하고 까닭을 함께 돌려준다",async(status,body,reason)=>{
    const {fetcher}=setup(),a=createServerDraftRepository(empty,fetcher),first=await a.save(input("처음"));
    const refuse:Fetch=async(url,init)=>init?.method==="PUT"?new Response(JSON.stringify(body),{status}):fetcher(url,init);
    const b=createServerDraftRepository(browser(),refuse),old=await b.get(first.id);
    const saved=await b.save({...input("잠깐 막힌 저장"),id:first.id,serverRevision:old?.serverRevision});
    expect(saved.temporary).toBe(true);
    expect((saved as {temporaryReason?:string}).temporaryReason).toBe(reason);
    expect(await getPdpDraft(first.id)).toMatchObject({temporary:true,additionalInfo:"잠깐 막힌 저장"});
    await createServerBrowserDrafts(false).discard(first.id);
  });
  it("라운드1: 버전 충돌(409, 서버 최신을 함께 줌)은 임시 보관이 아니라 지금처럼 별도 사본으로 저장한다",async()=>{
    const {repo,fetcher}=setup(),a=createServerDraftRepository(empty,fetcher),first=await a.save(input("처음"));
    const b=createServerDraftRepository(browser(),fetcher),old=await b.get(first.id);
    await a.save({...first,additionalInfo:"A 최신"});
    const saved=await b.save({...input("B 늦은 수정"),id:first.id,serverRevision:old?.serverRevision});
    expect(saved.conflictOf).toBe(first.id);expect(saved.temporary).toBeFalsy();
    expect(await getPdpDraft(first.id)).toBeNull();
    expect(await repo.list(user)).toHaveLength(2);
  });
  it("W4: 이 브라우저에서 담을 수 없는 그림은 임시 보관하지 않고 그 까닭을 보인다",async()=>{
    const {fetcher}=setup(),b=createServerDraftRepository(browser(),fetcher);
    const broken={...input("주소만 남은 그림"),result:{originalImage:"",blueprint:{executiveSummary:"",scorecard:[],blueprintList:[],
      sections:[{...createEmptySection(0),generatedImage:"https://example.com/expired.png"}]}}} as PdpDraftInput;
    const before=(await listPdpDrafts()).length;
    const failure=await b.save(broken).catch((error:Error)=>error);
    expect((failure as Error).name).toBe("DocumentSaveRejectedError");
    expect((failure as Error).message).toContain("원본 그림이 없는 주소");
    expect(await listPdpDrafts()).toHaveLength(before);
  });
  it("W4: 다른 곳에서 삭제된 작업은 그렇다고 알리고 임시본도 새 작업도 만들지 않는다",async()=>{
    const {repo,fetcher}=setup(),a=createServerDraftRepository(empty,fetcher),first=await a.save(input("처음"));
    const c=createServerDraftRepository(browser(),fetcher),opened=await c.get(first.id);
    await a.remove(first.id);
    const failure=await c.save({...input("삭제 뒤 수정"),id:first.id,serverRevision:opened?.serverRevision}).catch((error:Error)=>error);
    expect((failure as Error).message).toContain("다른 곳에서 삭제된 작업입니다");
    expect(await getPdpDraft(first.id)).toBeNull();
    expect(await createServerDraftRepository(browser(),fetcher).get(first.id)).toBeNull();
    expect(await repo.list(user)).toHaveLength(0);
  });
  it("W4: 서버 오류(5xx)·시간 초과는 지금처럼 이 브라우저에 임시 보관한다",async()=>{
    const {fetcher}=setup(),a=createServerDraftRepository(empty,fetcher),first=await a.save(input("처음"));
    const failures:Array<()=>Promise<Response>>=[
      async()=>new Response(JSON.stringify({ok:false,message:"작업을 처리하지 못했습니다."}),{status:503}),
      async()=>new Response("<html>502 Bad Gateway</html>",{status:502}),
      async()=>{throw new DOMException("signal timed out","TimeoutError");},
    ];
    for(const fail of failures){
      const b=createServerDraftRepository(browser(),async(url,init)=>init?.method==="PUT"?fail():fetcher(url,init));
      const old=await b.get(first.id);
      const saved=await b.save({...input("잠깐 끊긴 저장"),id:first.id,serverRevision:old?.serverRevision});
      expect(saved.temporary).toBe(true);
      expect((await getPdpDraft(first.id))?.temporary).toBe(true);
      await createServerBrowserDrafts(false).discard(first.id);
    }
  });
  it("Low(F16): 이미 만든 복구 사본을 다시 확인할 때 그림을 다시 내려받지 않는다",async()=>{
    const {repo,fetcher}=setup(),calls:string[]=[];
    const spy:Fetch=async(url,init)=>{calls.push((init?.method??"GET")+" "+String(url));return fetcher(url,init);};
    const pictured={...input("되찾은 그림"),result:{originalImage:"",blueprint:{executiveSummary:"",scorecard:[],blueprintList:[],
      sections:[{...createEmptySection(0),generatedImage:"data:image/png;base64,"+PNG}]}}} as PdpDraftInput;
    const source=crypto.randomUUID(),first=await createServerDraftRepository(empty,spy).recover(pictured,source,"job-1");
    calls.length=0;
    const second=await createServerDraftRepository(empty,spy).recover(pictured,source,"job-1");
    expect(second.id).toBe(first.id);
    expect(calls.filter(call=>call.includes(STORAGE))).toEqual([]);
    expect(calls.filter(call=>call.startsWith("PUT")||call.includes("/assets"))).toEqual([]);
    expect(await repo.list(user)).toHaveLength(1);
  });
  it("W2: 서버가 그대로면 임시본을 연다",async()=>{
    const {repo,fetcher}=setup(),net=network(fetcher);
    const b=createServerDraftRepository(browser(),net.send),first=await b.save(input("처음"));
    net.state.mode="down";await b.save({...first,additionalInfo:"못 보낸 수정"});
    const reopened=await createServerDraftRepository(browser(),fetcher).get(first.id);
    expect(reopened?.additionalInfo).toBe("못 보낸 수정");expect(reopened?.temporary).toBe(true);
    expect(await repo.list(user)).toHaveLength(1);
  });
});
