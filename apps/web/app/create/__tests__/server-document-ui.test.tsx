import "fake-indexeddb/auto";
import React from "react";
import { act,create,type ReactTestRenderer } from "react-test-renderer";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { createEmptySection } from "../scenario-sections";
import { deletePdpDraft, getPdpDraft, savePdpDraft } from "../pdp-drafts";
const state=vi.hoisted(()=>({editor:{} as Record<string,any>,replace:vi.fn(),get:vi.fn(),save:vi.fn(),factory:vi.fn(),
  list:vi.fn(),remove:vi.fn(),
  autosave:()=>{},restore:(_revision:number)=>{},
  recovery:{ok:false} as Record<string,unknown>,search:new URLSearchParams("doc=33333333-3333-4333-8333-333333333333")}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:state.replace,push:vi.fn()}),useSearchParams:()=>state.search}));
vi.mock("../../../lib/handoff",()=>({peekHandoff:()=>null,takeHandoff:()=>null}));
vi.mock("../server-draft-repository",()=>({createServerDraftRepository:(...args:unknown[])=>{
  state.factory(...args);return {get:state.get,save:state.save,list:(...a:unknown[])=>state.list(...a),preserve:state.save,remove:state.remove,
    recover:(input:any,sourceId:string)=>state.save({...input,id:crypto.randomUUID(),snapshotOf:sourceId})};
}}));
vi.mock("../PdpEditor",()=>({PdpEditor:(props:Record<string,unknown>)=>{state.editor=props;return null;}}));
vi.mock("../SavedImagePicker",()=>({SavedImagePicker:()=>null}));
vi.mock("../CharacterPicker",()=>({CharacterPicker:()=>null}));
vi.mock("../draft-save-clock",async load=>({...await load<Record<string,unknown>>(),
  startDraftAutosave:(callback:()=>void)=>{state.autosave=callback;return ()=>{};}}));
vi.mock("../ServerDocumentHistory",()=>({ServerDocumentHistory:(props:any)=>{
  state.restore=props.onRestore;return <span>이전 버전 보기</span>;
}}));
vi.mock("../StyleReferenceAttach",()=>({StyleReferenceAttach:()=>null}));
vi.mock("../StyleReferenceCard",()=>({StyleReferenceCard:()=>null}));
vi.mock("../pdp-utils",async load=>({...await load<Record<string,unknown>>(),apiJson:async()=>state.recovery}));
import { PdpMakerClient } from "../PdpMakerClient";
let view:ReactTestRenderer;
const flush=async()=>{for(let i=0;i<24;i++)await act(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));});};
const row=()=>({id:"33333333-3333-4333-8333-333333333333",title:"서버 작업",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  appState:"editor",startMode:"image",preparedImage:null,modelImage:null,modelImageUsage:null,
  result:{originalImage:"AAAA",blueprint:{executiveSummary:"서버 구성",scorecard:[],blueprintList:[],sections:[createEmptySection(0)]}},
  additionalInfo:"집에서 이어서",desiredTone:"",aspectRatio:"9:16",notice:"",editorState:null});
beforeEach(()=>{
  state.search=new URLSearchParams("doc=33333333-3333-4333-8333-333333333333");
  vi.clearAllMocks();state.editor={};state.recovery={ok:false};state.get.mockResolvedValue(row());state.save.mockResolvedValue(row());
  state.list.mockReset();state.list.mockResolvedValue([]);state.remove.mockReset();state.remove.mockResolvedValue(undefined);
  vi.stubGlobal("window",{addEventListener:vi.fn(),removeEventListener:vi.fn(),confirm:()=>true,scrollTo:vi.fn()});
  vi.stubGlobal("requestAnimationFrame",(fn:()=>void)=>{queueMicrotask(fn);return 1;});
});
afterEach(async()=>{if(view)act(()=>view.unmount());await flush();vi.unstubAllGlobals();});
describe("서버 문서 화면 연결",()=>{
  it("F9: 임시 보관까지 용량 초과로 실패하면 기존 저장 공간 안내를 보여 준다",async()=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    state.save.mockImplementationOnce(async()=>{const error=new Error("quota");error.name="QuotaExceededError";throw error;});
    await act(async()=>{state.editor.onManualSave();});await flush();
    expect(JSON.stringify(view.toJSON())).toContain("저장 공간");
    expect(JSON.stringify(view.toJSON())).toContain("오래된 작업");
  });
  it("F9: 임시 보관본을 열면 편집기를 쓰며 서버 재시도 안내를 본다",async()=>{
    state.get.mockResolvedValue({...row(),temporary:true,serverRevision:0});
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    expect(state.editor.initialResult.blueprint.executiveSummary).toBe("서버 구성");
    expect(JSON.stringify(view.toJSON())).toContain("임시 보관한 작업");
  });
  it("F6: 보관한 A를 떠나 B를 불러오면 A 되돌리기 단추를 없앤다",async()=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    state.save.mockResolvedValue({...row(),id:row().id+"@1"});
    await act(async()=>{await state.editor.onBeforeReplace();});await flush();
    expect(state.editor.onUndo).toBeTypeOf("function");
    state.get.mockResolvedValue({...row(),id:"44444444-4444-4444-8444-444444444444"});
    await act(async()=>{state.restore(1);});await flush();
    expect(state.editor.draftId).toBe("44444444-4444-4444-8444-444444444444");
    expect(state.editor.onUndo).toBeUndefined();
  });
  it("F2: 복원 응답을 기다리는 중 자동저장은 멈추고 화면 버전을 보낸다",async()=>{
    state.get.mockResolvedValue({...row(),serverRevision:7});
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    await act(async()=>{state.editor.onManualSave();});await flush();
    expect(state.save.mock.calls[0][0].serverRevision).toBe(7);
    await act(async()=>{state.editor.onDraftStateChange({sections:[createEmptySection(0)],sectionKeys:["S1"],layers:{}});});await flush();
    (window.confirm as any)=()=>false;
    let release!:(value:any)=>void;
    state.get.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    state.save.mockClear();
    await act(async()=>{state.restore(1);});await flush();
    await act(async()=>{state.autosave();});await flush();
    expect(state.save).not.toHaveBeenCalled();
    await act(async()=>{release({...row(),serverRevision:8});});await flush();
  });
  it.each(["doc","draft"])("%s 주소로 내부 복원 명령을 실행할 수 없다",async(param)=>{
    state.search=new URLSearchParams(param+"="+row().id+"@1");
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    expect(state.get).not.toHaveBeenCalled();
    expect(JSON.stringify(view.toJSON())).toContain("작업 주소가 올바르지 않습니다");
  });
  it("서버에 남은 미저장 생성 결과는 원본을 덮지 않고 복구 사본으로 만든다",async()=>{
    const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    state.recovery={ok:true,job:{id:"job",outcome:"succeeded",items:[{sectionId:"S1",url:"https://local/artifact"}]}};
    vi.stubGlobal("fetch",async()=>new Response(Buffer.from(png,"base64"),{headers:{"content-type":"image/png"}}));
    state.save.mockImplementation(async input=>({...row(),...input}));
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    expect(state.save).toHaveBeenCalled();
    const copy=state.save.mock.calls[0][0];
    expect(copy.id).not.toBe(row().id);expect(copy.snapshotOf).toBe(row().id);
    expect(copy.result.blueprint.sections[0].generatedImage).toContain(png);
    expect(state.editor.draftId).toBe(row().id);
    expect(state.editor.initialResult.blueprint.sections[0].generatedImage).toBeUndefined();
  });
  it("빈 IndexedDB에서 doc 주소를 읽어 편집기를 채운다",async()=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    expect(state.get).toHaveBeenCalledWith(row().id);
    expect(state.editor.pageContext).toBe("집에서 이어서");
    expect(state.editor.initialResult.blueprint.executiveSummary).toBe("서버 구성");
    expect(state.editor.draftId).toBe(row().id);
    expect(JSON.stringify(view.toJSON())).toContain("이전 버전 보기");
  });
  it("충돌 사본을 저장하면 화면과 주소가 모두 사본으로 전환된다",async()=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    const copy="44444444-4444-4444-8444-444444444444";
    state.save.mockResolvedValue({...row(),id:copy,conflictOf:row().id});
    await act(async()=>{state.editor.onManualSave();});await flush();
    expect(state.editor.draftId).toBe(copy);
    expect(state.replace).toHaveBeenLastCalledWith("/create?doc="+copy,{scroll:false});
    expect(JSON.stringify(view.toJSON())).toContain("별도 사본");
  });
  it("플래그가 꺼지면 서버 저장 창구를 만들지 않는다",async()=>{
    state.search=new URLSearchParams();
    await act(async()=>{view=create(<PdpMakerClient/>);});await flush();
    expect(state.factory).not.toHaveBeenCalled();
    state.search=new URLSearchParams("doc="+row().id);
  });
  it("W1: 서버 모드 전체 삭제는 지울 작업 수와 라이브러리 그림 삭제를 알리고, 취소하면 삭제 요청이 없다",async()=>{
    state.search=new URLSearchParams();
    state.list.mockResolvedValue([summary("55555555-5555-4555-8555-555555555555"),summary("66666666-6666-4666-8666-666666666666")]);
    const asked:string[]=[];(window as any).confirm=(message:string)=>{asked.push(message);return false;};
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    await act(async()=>{buttonWith("전체 삭제").props.onClick();});await flush();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("2개");
    expect(asked[0]).toContain("라이브러리에서도 함께 사라집니다. 되돌릴 수 없습니다");
    expect(state.remove).not.toHaveBeenCalled();
  });
  it("W1: 플래그가 꺼지면 전체 삭제 확인 문구는 그대로다",async()=>{
    state.search=new URLSearchParams();
    await savePdpDraft({...row(),id:"w1-local"} as never);
    const asked:string[]=[];(window as any).confirm=(message:string)=>{asked.push(message);return false;};
    try{
      await act(async()=>{view=create(<PdpMakerClient/>);});await flush();
      await act(async()=>{buttonWith("전체 삭제").props.onClick();});await flush();
      expect(asked).toEqual(["저장된 작업 1개를 모두 삭제할까요?\n되돌릴 수 없습니다."]);
      expect(await getPdpDraft("w1-local")).not.toBeNull();
    }finally{await deletePdpDraft("w1-local");}
  });
  it("W2: 서버 최신본을 열며 남은 변경을 따로 두었으면 그 사실과 찾을 곳을 알리고 목록을 다시 읽는다",async()=>{
    state.get.mockResolvedValue({...row(),unsavedCopyId:"77777777-7777-4777-8777-777777777777"});
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    expect(state.editor.draftId).toBe(row().id);
    expect(JSON.stringify(view.toJSON())).toContain("「저장 안 된 변경」으로 따로 두었습니다");
    expect(state.list.mock.calls.length).toBeGreaterThan(1);
  });
  it("W2: 따로 둔 저장 안 된 변경을 열면 저장하면 별도 사본이 된다고 알린다",async()=>{
    state.get.mockResolvedValue({...row(),temporary:true,unsavedOf:"88888888-8888-4888-8888-888888888888"});
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    const text=JSON.stringify(view.toJSON());
    expect(text).toContain("별도 사본으로 저장합니다");
    expect(text).not.toContain("임시 보관한 작업입니다");
  });
  it("W3: 임시 보관 뒤 목록마저 못 읽어도 임시 보관 안내를 덮지 않고 오류 원문을 보이지 않는다",async()=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    state.list.mockRejectedValue(new TypeError("Failed to fetch"));
    state.save.mockResolvedValue({...row(),temporary:true,serverRevision:5});
    await act(async()=>{state.editor.onManualSave();});await flush();
    const text=JSON.stringify(view.toJSON());
    expect(text).toContain("이 브라우저에 임시 보관했습니다");
    expect(text).not.toContain("Failed to fetch");
  });
  it("W3: 서버 목록 대신 이 브라우저 목록을 받으면 그렇다고 알린다",async()=>{
    state.search=new URLSearchParams();
    state.list.mockResolvedValue(Object.assign([summary("55555555-5555-4555-8555-555555555555")],{serverUnavailable:true}));
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    const text=JSON.stringify(view.toJSON());
    expect(text).toContain("서버에 연결하지 못해 이 브라우저의 작업만 보입니다");
    expect(text).toContain("작업 5555");
  });
  it("W4: 서버가 저장을 거절하면 그 문구를 그대로 보인다",async()=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    state.save.mockRejectedValueOnce(Object.assign(new Error("다른 곳에서 삭제된 작업입니다. 이 화면의 수정은 서버에 저장되지 않았습니다."),{name:"DocumentSaveRejectedError"}));
    await act(async()=>{state.editor.onManualSave();});await flush();
    expect(JSON.stringify(view.toJSON())).toContain("다른 곳에서 삭제된 작업입니다");
    expect(state.editor.saveState).toBe("error");
  });
  it("W5: 보관 뒤 자동저장이 사본으로 갈라지면 원래 작업의 되돌리기 단추를 없앤다(f6-fork 순서)",async()=>{
    const copy="44444444-4444-4444-8444-444444444444";
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    state.save.mockResolvedValueOnce({...row(),id:row().id+"@5",serverRevision:5});
    await act(async()=>{await state.editor.onBeforeReplace();});await flush();
    expect(state.editor.onUndo).toBeTypeOf("function");
    state.save.mockResolvedValue({...row(),id:copy,serverRevision:1,conflictOf:row().id});
    await act(async()=>{state.editor.onManualSave();});await flush();
    expect(state.editor.draftId).toBe(copy);
    expect(state.editor.onUndo).toBeUndefined();
  });
  it("W5: 다시 만들기 전 보관이 사본으로 갈라지면 앞 보관의 되돌리기 단추를 없앤다",async()=>{
    const copy="44444444-4444-4444-8444-444444444444";
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    state.save.mockResolvedValueOnce({...row(),id:row().id+"@5",serverRevision:5});
    await act(async()=>{await state.editor.onBeforeReplace();});await flush();
    expect(state.editor.onUndo).toBeTypeOf("function");
    state.save.mockResolvedValueOnce({...row(),id:copy+"@1",serverRevision:1,conflictOf:row().id});
    let proceeded:unknown;
    await act(async()=>{proceeded=await state.editor.onBeforeReplace();});await flush();
    expect(proceeded).toBe(false);
    expect(state.editor.draftId).toBe(copy);
    expect(state.editor.onUndo).toBeUndefined();
  });
  it("Low: 복원 응답을 기다리는 중 수동 저장을 누르면 복원 중이라고 알린다",async()=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    let release!:(value:unknown)=>void;
    state.get.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    state.save.mockClear();
    await act(async()=>{state.restore(1);});await flush();
    await act(async()=>{state.editor.onManualSave();});await flush();
    expect(state.save).not.toHaveBeenCalled();
    expect(JSON.stringify(view.toJSON())).toContain("복원 중입니다. 끝나면 다시 저장해 주세요");
    await act(async()=>{release({...row(),serverRevision:8});});await flush();
  });
  it("Low: 복구 사본을 여는 중 수동 저장을 누르면 불러오는 중이라고 알린다",async()=>{
    const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    state.recovery={ok:true,job:{id:"job",outcome:"succeeded",items:[{sectionId:"S1",url:"https://local/artifact"}]}};
    vi.stubGlobal("fetch",async()=>new Response(Buffer.from(png,"base64"),{headers:{"content-type":"image/png"}}));
    state.save.mockImplementation(async input=>({...row(),...input}));
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    let release!:(value:unknown)=>void;
    state.get.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    await act(async()=>{buttonWith("복구 사본 열기").props.onClick();});await flush();
    state.save.mockClear();
    await act(async()=>{state.editor.onManualSave();});await flush();
    expect(state.save).not.toHaveBeenCalled();
    expect(JSON.stringify(view.toJSON())).toContain("작업을 불러오는 중입니다. 끝나면 다시 저장해 주세요");
    await act(async()=>{release(row());});await flush();
  });
  it("Low: 떠나기 전 저장이 사본으로 갈라졌으면 다른 작업을 연 뒤에도 그 사실을 남긴다",async()=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    await act(async()=>{state.editor.onDraftStateChange({sections:[createEmptySection(0)],sectionKeys:["S1"],layers:{}});});await flush();
    state.save.mockResolvedValue({...row(),id:"44444444-4444-4444-8444-444444444444",conflictOf:row().id});
    state.get.mockResolvedValue({...row(),serverRevision:8});
    await act(async()=>{state.restore(1);});await flush();
    expect(state.save).toHaveBeenCalled();
    const text=JSON.stringify(view.toJSON());
    expect(text).toContain("별도 사본으로 저장했습니다");
    expect(text).toContain("저장된 작업 목록");
  });
  it.each([
    ["login","로그인이 만료되어 이 브라우저에 임시 보관했습니다. 다시 로그인한 뒤 저장해 주세요."],
    ["busy","요청이 많아 잠시 뒤 다시 저장해 주세요. 이 브라우저에 임시 보관했습니다."],
  ])("라운드1: 임시 보관 까닭이 %s 면 그에 맞는 안내를 보인다",async(reason,message)=>{
    await act(async()=>{view=create(<PdpMakerClient serverDocumentsEnabled/>);});await flush();
    state.save.mockResolvedValue({...row(),temporary:true,serverRevision:5,temporaryReason:reason});
    await act(async()=>{state.editor.onManualSave();});await flush();
    const text=JSON.stringify(view.toJSON());
    expect(text).toContain(message);
    expect(text).not.toContain("서버에 저장하지 못해");
    expect(state.editor.saveState).toBe("error");
  });
});
type Node=ReactTestRenderer["root"];
function textOf(node:Node|string):string{return typeof node==="string"?node:node.children.map(textOf).join("");}
function buttonWith(label:string):Node{
  const found=view.root.findAll(node=>node.type==="button" && textOf(node).includes(label));
  if(!found.length)throw new Error("단추를 찾지 못했습니다: "+label);
  return found[0];
}
function summary(id:string){
  return {id,title:"작업 "+id.slice(0,4),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),aspectRatio:"9:16",
    sectionCount:1,stageLabel:"편집 중",thumbnailUrl:null};
}
