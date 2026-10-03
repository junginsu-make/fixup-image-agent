import "fake-indexeddb/auto";
import {savePdpDraft,getPdpDraft,listPdpDrafts} from "../pdp-drafts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerDraftRepository } from "../server-draft-repository";
import { createLocalDocumentRepository } from "../../../lib/pdp/documents/local-repository";
import { documentHandlers } from "../../../lib/pdp/documents/http";
import type { PdpDraftInput } from "../pdp-drafts";
const user="11111111-1111-4111-8111-111111111111",roots:string[]=[];
const input=(message:string):PdpDraftInput=>({appState:"upload",preparedImage:null,modelImage:null,modelImageUsage:null,result:null,
  additionalInfo:message,desiredTone:"",aspectRatio:"9:16",notice:"",editorState:null});
const empty={get:async()=>null,list:async()=>[]};
function setup(){
  const root=mkdtempSync(join(tmpdir(),"pdp-client-"));roots.push(root);const repo=createLocalDocumentRepository(root);
  const h=documentHandlers({enabled:()=>true,authenticate:async()=>({userId:user}),repo,
    storage:{exists:async()=>true,uploadTicket:async()=>({exists:true}),urls:async()=>({}),removeAll:async()=>{},copy:async()=>{}}});
  const fetcher=async(url:RequestInfo|URL,init?:RequestInit)=>{
    const req=new Request(new URL(String(url),"http://local"),init);
    const suffix=new URL(req.url).pathname.replace("/api/pdp/documents",""),[id,action]=suffix.split("/").filter(Boolean);
    if(!id)return req.method==="POST"?h.create(req):h.list();
    if(action==="restore")return h.restore(req,id);
    if(action==="pin")return h.pin(req,id);
    if(action==="revisions")return h.revisions(req,id);
    if(req.method==="PUT")return h.put(req,id);
    if(req.method==="DELETE")return h.remove(req,id);
    return h.get(req,id);
  };
  return {repo,fetcher,client:()=>createServerDraftRepository(empty,fetcher)};
}
afterEach(()=>{for(const root of roots.splice(0)){if(!root.startsWith(join(tmpdir(),"pdp-client-")))throw Error("unsafe");rmSync(root,{recursive:true,force:true});}});
describe("브라우저 서버 저장 창구",()=>{
  it("F21: 복원 충돌은 최신 버전을 기억하고 재확인 뒤 다시 복원할 수 있다",async()=>{
    const {client,repo}=setup(),a=client(),b=client();let record=await a.save(input("이전"));
    record=await a.save({...record,additionalInfo:"중간"});await b.get(record.id);
    await a.save({...record,additionalInfo:"다른 창 최신"});
    await expect(b.restore(record.id,1)).rejects.toThrow("다시");
    expect((await repo.get(user,record.id))?.revision).toBe(3);
    expect((await b.restore(record.id,1))?.additionalInfo).toBe("이전");
    expect((await repo.get(user,record.id))?.revision).toBe(4);
  });
  it("F16: 같은 원본과 생성 작업의 복구 사본을 다시 열어도 저장·업로드하지 않는다",async()=>{
    const {fetcher,repo}=setup(),fetchSpy=vi.fn(fetcher),a=createServerDraftRepository(empty,fetchSpy);
    const source=crypto.randomUUID(),first=await a.recover(input("되찾은 그림"),source,"job-1");
    fetchSpy.mockClear();
    const b=createServerDraftRepository(empty,fetchSpy),second=await b.recover(input("되찾은 그림"),source,"job-1");
    expect(second.id).toBe(first.id);expect(await repo.list(user)).toHaveLength(1);
    expect(fetchSpy.mock.calls.filter(([url,init])=>init?.method==="PUT" || String(url).endsWith("/assets"))).toHaveLength(0);
  });
  it("F15: 보관 지점은 자동저장 25회 뒤에도 복원한다",async()=>{
    const {client}=setup(),a=client();let current=await a.save(input("보관 전"));
    const checkpoint=await a.preserve(current);
    for(let i=0;i<25;i++)current=await a.save({...current,additionalInfo:"수정 "+i});
    expect((await a.get(checkpoint.id))?.additionalInfo).toBe("보관 전");
  });
  it("F9: 첫 서버 저장 실패를 IndexedDB에 보관하고 새 창구에서 되찾는다",async()=>{
    const browser={get:getPdpDraft,list:listPdpDrafts,save:savePdpDraft};
    const offline=async()=>{throw Error("서버 연결 실패");};
    const a=createServerDraftRepository(browser,offline),saved=await a.save(input("비용 낸 분석 내용"));
    expect(saved.temporary).toBe(true);
    const reopened=await createServerDraftRepository(browser,offline).get(saved.id);
    expect(reopened?.additionalInfo).toBe("비용 낸 분석 내용");expect(reopened?.temporary).toBe(true);
  });
  it("F7: 내 저장 응답 유실 뒤 내용이 바뀌어도 같은 문서에 이어 쓴다",async()=>{
    const {fetcher,repo,client}=setup(),a=client(),first=await a.save(input("처음"));
    let lose=true;
    const b=createServerDraftRepository(empty,async(url,init)=>{
      const response=await fetcher(url,init);
      if(init?.method==="PUT"&&lose){lose=false;throw Error("응답 유실");}return response;
    });
    const old=await b.get(first.id);
    await expect(b.save({...old!,additionalInfo:"1차 수정"})).rejects.toThrow("응답 유실");
    const next=await b.save({...old!,additionalInfo:"2차 수정"});
    expect(next.id).toBe(first.id);expect(next.conflictOf).toBeUndefined();
    expect(await repo.list(user)).toHaveLength(1);
    expect((await a.get(first.id))?.additionalInfo).toBe("2차 수정");
  });
  it("F7: 사본 응답 유실 뒤 내용이 바뀌어도 사본은 하나만 만든다",async()=>{
    const {fetcher,repo,client}=setup(),a=client(),first=await a.save(input("처음"));let lose=true;
    const b=createServerDraftRepository(empty,async(url,init)=>{
      const response=await fetcher(url,init);
      if(init?.method==="PUT"&&!String(url).endsWith("/"+first.id)&&lose){lose=false;throw Error("사본 유실");}return response;
    });
    const old=await b.get(first.id);await a.save({...first,additionalInfo:"A 최신"});
    await expect(b.save({...old!,additionalInfo:"B 수정"})).rejects.toThrow("사본 유실");
    const next=await b.save({...old!,additionalInfo:"B 추가 수정"});
    expect(next.conflictOf).toBe(first.id);expect(await repo.list(user)).toHaveLength(2);
    expect((await a.get(first.id))?.additionalInfo).toBe("A 최신");
    expect((await b.get(next.id))?.additionalInfo).toBe("B 추가 수정");
  });
  it("첫 이관 저장이 실패해도 원본으로 다시 열어 이관을 완료한다",async()=>{
    const {fetcher,repo}=setup(),id=crypto.randomUUID();
    const legacy={...input("원본 유지"),id,title:"로컬",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    const browser={get:async(key:string)=>key===id?legacy:null,list:async()=>[]};
    let failed=false;
    const first=createServerDraftRepository(browser,async(url,init)=>{
      if(init?.method==="PUT" && !failed){failed=true;throw Error("저장 중단");}
      return fetcher(url,init);
    });
    await expect(first.get(id)).rejects.toThrow("저장 중단");
    const retried=await createServerDraftRepository(browser,fetcher).get(id);
    expect(retried?.additionalInfo).toBe("원본 유지");
    expect(await repo.list(user)).toHaveLength(1);
  });
  it("충돌 사본의 응답만 유실되면 같은 사본을 재확인한다",async()=>{
    const {fetcher,repo,client}=setup(),a=client(),first=await a.save(input("처음"));
    let lose=true;
    const b=createServerDraftRepository(empty,async(url,init)=>{
      const response=await fetcher(url,init);
      if(init?.method==="PUT" && !String(url).endsWith("/"+first.id) && lose){
        lose=false;throw Error("사본 응답 유실");
      }
      return response;
    });
    const old=await b.get(first.id);await a.save({...first,additionalInfo:"먼저"});
    const later={...old!,additionalInfo:"나중"};
    await expect(b.save(later)).rejects.toThrow("사본 응답 유실");
    const saved=await b.save(later);
    expect(saved.conflictOf).toBe(first.id);
    expect(await repo.list(user)).toHaveLength(2);
  });
  it("F2: 다시 읽는 동안 대기한 옛 화면 저장은 최신본을 덮지 않고 사본으로 남긴다",async()=>{
    const {fetcher,repo,client}=setup(),a=client();let pause=false,seen!:()=>void,release!:()=>void;
    const started=new Promise<void>(resolve=>{seen=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    const b=createServerDraftRepository(empty,async(url,init)=>{
      const response=await fetcher(url,init);
      if(pause && init?.method==="GET"){pause=false;seen();await gate;}
      return response;
    });
    const first=await a.save(input("처음")),old=await b.get(first.id);
    await a.save({...first,additionalInfo:"A 최신"});
    pause=true;const reading=b.get(first.id);await started;
    const saving=b.save({...old!,additionalInfo:"B 옛 화면"});
    release();await reading;const copy=await saving;
    expect(copy.conflictOf).toBe(first.id);
    expect((await a.get(first.id))?.additionalInfo).toBe("A 최신");
    expect(await repo.list(user)).toHaveLength(2);
  });
  it("F2: 복원 뒤 옛 화면 저장이 도착해도 복원 결과는 유지한다",async()=>{
    const {client,repo}=setup(),a=client();const first=await a.save(input("복원할 내용"));
    const later=await a.save({...first,additionalInfo:"복원 전 내용"});
    await a.restore(first.id,1);
    const copy=await a.save({...later,additionalInfo:"늦은 자동저장"});
    expect(copy.conflictOf).toBe(first.id);
    expect((await a.get(first.id))?.additionalInfo).toBe("복원할 내용");
    expect(await repo.list(user)).toHaveLength(2);
  });
  it("복원 응답이 유실되고 원본 버전이 20개 보관에서 빠져도 재시도한다",async()=>{
    const {fetcher,repo}=setup();let lose=true;
    const a=createServerDraftRepository(empty,async(url,init)=>{
      const response=await fetcher(url,init);
      if(String(url).endsWith("/restore") && lose){lose=false;throw Error("복원 응답 유실");}
      return response;
    });
    let record=await a.save(input("v0"));
    for(let i=1;i<=20;i++)record=await a.save({...record,additionalInfo:"v"+i});
    await expect(a.restore(record.id,1)).rejects.toThrow("복원 응답 유실");
    const restored=await a.restore(record.id,1);
    expect(restored?.additionalInfo).toBe("v0");
    expect((await repo.get(user,record.id))?.revision).toBe(22);
  });
  it("저장 응답을 기다리는 중의 복원은 그 저장 다음에 실행한다",async()=>{
    const {fetcher,repo}=setup();let release!:()=>void,wait=false;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const a=createServerDraftRepository(empty,async(url,init)=>{
      if(wait && init?.method==="PUT")await gate;
      return fetcher(url,init);
    });
    const first=await a.save(input("이전"));const backup=await a.preserve(first);wait=true;
    const saving=a.save({...first,additionalInfo:"이후"});
    await new Promise(resolve=>setTimeout(resolve,5));
    const restoring=a.get(backup.id);release();
    await saving;expect((await restoring)?.additionalInfo).toBe("이전");
    expect(await repo.list(user)).toHaveLength(1);
  });
  it("연 초안만 이관하며 원본을 남기고 중복 이관하지 않는다",async()=>{
    const {fetcher,repo}=setup();
    const legacy={...input("브라우저 원본"),id:"legacy",title:"기존 작업",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    const browser={get:vi.fn(async()=>legacy),list:async()=>[]};
    const a=createServerDraftRepository(browser,fetcher),b=createServerDraftRepository(browser,fetcher);
    await a.list();expect(browser.get).not.toHaveBeenCalled();
    const first=await a.get("legacy"),second=await b.get("legacy");
    expect(first?.id).toBe(second?.id);expect(legacy.additionalInfo).toBe("브라우저 원본");
    expect(await repo.list(user)).toHaveLength(1);
  });
  it("저장 응답이 유실돼도 같은 요청으로 재시도하면 버전이 한 번만 늘어난다",async()=>{
    const {fetcher,repo}=setup();let lost=true;
    const a=createServerDraftRepository(empty,async(url,init)=>{
      const response=await fetcher(url,init);
      if(init?.method==="PUT" && lost){lost=false;throw new Error("응답 유실");}return response;
    });
    const draft=input("유실 시험");await expect(a.save(draft)).rejects.toThrow("응답 유실");
    const saved=await a.save(draft);
    expect((await repo.get(user,saved.id))?.revision).toBe(1);
    expect(await repo.list(user)).toHaveLength(1);
  });
  it("같은 창의 자동저장과 보관이 겹쳐도 자기 자신과 충돌하지 않는다",async()=>{
    const {client,repo}=setup(),a=client(),first=await a.save(input("처음"));
    const [saved,backup]=await Promise.all([a.save({...first,additionalInfo:"수정"}),a.preserve({...first,additionalInfo:"보관"})]);
    expect(saved.id).toBe(first.id);expect(backup.id.split("@")[0]).toBe(first.id);
    expect(await repo.list(user)).toHaveLength(1);
  });
  it("빈 브라우저에서도 저장된 입력을 열고 같은 문서에 이어 쓴다",async()=>{
    const {client}=setup(),a=client();const first=await a.save(input("회사"));
    const b=client(),opened=await b.get(first.id);
    expect(opened?.additionalInfo).toBe("회사");
    const next=await b.save({...opened!,additionalInfo:"집"});
    expect(next.id).toBe(first.id);
    expect((await a.get(first.id))?.additionalInfo).toBe("집");
  });
  it("두 창 충돌 시 뒤늦은 수정은 별도 사본에 저장하고 이후에도 사본을 쓴다",async()=>{
    const {client,repo}=setup(),a=client(),b=client();
    const first=await a.save(input("처음"));
    const old=await b.get(first.id);
    await a.save({...first,additionalInfo:"먼저"});
    const copy=await b.save({...old!,additionalInfo:"나중"});
    expect(copy.id).not.toBe(first.id);
    expect(copy.conflictOf).toBe(first.id);
    expect((await a.get(first.id))?.additionalInfo).toBe("먼저");
    expect((await b.save({...copy,additionalInfo:"사본 수정"})).id).toBe(copy.id);
    expect(await repo.list(user)).toHaveLength(2);
  });
  it("보관 후 되돌리기는 새 작업을 열지 않고 같은 문서를 복원한다",async()=>{
    const {client,repo}=setup(),a=client();const first=await a.save(input("이전"));
    const preserved=await a.preserve(first);
    await a.save({...first,additionalInfo:"이후"});
    expect((await a.get(preserved.id))?.additionalInfo).toBe("이전");
    expect(await repo.list(user)).toHaveLength(1);
    expect((await repo.get(user,first.id))?.revision).toBeGreaterThan(2);
  });
});
