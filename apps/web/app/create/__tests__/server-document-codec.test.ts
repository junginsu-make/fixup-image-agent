import { describe, expect, it } from "vitest";
import { encodeServerDocument, decodeServerDocument } from "../server-document-codec";
import { createEmptySection } from "../scenario-sections";
import type { PdpDraftInput } from "../pdp-drafts";
const id="33333333-3333-4333-8333-333333333333",user="11111111-1111-4111-8111-111111111111";
const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const picture={base64:png,mimeType:"image/png",fileName:"상품.png",previewUrl:"data:image/png;base64,"+png};
const section={...createEmptySection(0),generatedImage:picture.previewUrl};
export const codecFixture=():PdpDraftInput=>({id,appState:"editor",startMode:"image",preparedImage:picture,modelImage:picture,modelImageUsage:"all-sections",
  result:{originalImage:png,blueprint:{executiveSummary:"설명",scorecard:[],blueprintList:[],sections:[section]}},
  analyzedBlueprint:{executiveSummary:"원래 설명",scorecard:[],blueprintList:[],sections:[{...section,generatedImage:undefined}]},
  additionalInfo:"여름",desiredTone:"",aspectRatio:"9:16",notice:"알림",
  styleReference:{id:"style",name:"스타일",imageBase64:png,mimeType:"image/png",description:"밝게",reason:"직접 선택"},
  editorState:{currentSectionIndex:0,sections:[section],sectionKeys:["S1"],sectionOptions:{S1:{style:"studio",withModel:false}},overlaysBySection:{S1:[]},
    defaultCopyLanguage:"ko",notice:"알림",workbenchTab:"image",workbenchState:{x:1,y:2,width:300,height:400,isOpen:true}}});
describe("서버 문서의 원본 분리와 복원",()=>{
  it.each(["data URL","빈 원본"])("F8: 옛 초안의 %s을 이관하고 다시 연다",async kind=>{
    const input=codecFixture();input.preparedImage=null;
    input.result!.originalImage=kind==="data URL"?"data:image/png;base64,"+png:"";
    const packed=await encodeServerDocument(input,user,id);
    const reopened=await decodeServerDocument(packed.document,async()=>Buffer.from(png,"base64"));
    expect(reopened.result!.originalImage).toBe(kind==="data URL"?png:"");
    expect(reopened.result!.blueprint).toEqual(input.result!.blueprint);
  });
  it("같은 그림을 두 역할로 올려도 각 파일 이름은 따로 보존한다",async()=>{
    const input=codecFixture();
    input.preparedImage={...picture,fileName:"상품사진.png"};
    input.modelImage={...picture,fileName:"인물사진.png"};
    const packed=await encodeServerDocument(input,user,id);
    expect(packed.uploads).toHaveLength(1);
    const restored=await decodeServerDocument(packed.document,async()=>packed.uploads[0].bytes);
    expect(restored.preparedImage?.fileName).toBe("상품사진.png");
    expect(restored.modelImage?.fileName).toBe("인물사진.png");
  });
  it("16MB보다 큰 초안도 그림을 뺀 작은 문서로 보낸다",async()=>{
    const bytes=new Uint8Array(1024*1024);bytes.set(Buffer.from(png,"base64"));
    const data="data:image/png;base64,"+Buffer.from(bytes).toString("base64");
    const input=codecFixture(),sections=Array.from({length:10},(_,i)=>({...createEmptySection(i),generatedImage:data}));
    input.result!.blueprint.sections=sections;input.editorState!.sections=sections;
    input.editorState!.sectionKeys=sections.map(s=>s.section_id);
    expect(JSON.stringify(input).length).toBeGreaterThan(16*1024*1024);
    const packed=await encodeServerDocument(input,user,id);
    expect(JSON.stringify(packed.document).length).toBeLessThan(100_000);
    expect(packed.uploads).toHaveLength(2);
  });
  it("사진·스타일·생성 결과를 한 번만 올리고 ID와 편집 상태를 복원한다",async()=>{
    const input=codecFixture(),packed=await encodeServerDocument(input,user,id);
    expect(packed.uploads).toHaveLength(1);
    expect(JSON.stringify(packed.document)).not.toContain(png);
    expect(JSON.stringify(packed.document)).not.toContain("data:image");
    const restored=await decodeServerDocument(packed.document,async()=>packed.uploads[0].bytes);
    expect(restored.preparedImage).toEqual(input.preparedImage);
    expect(restored.result).toEqual(input.result);
    expect(restored.analyzedBlueprint).toEqual(input.analyzedBlueprint);
    expect(restored.editorState).toEqual(input.editorState);
    expect(restored.styleReference).toEqual(input.styleReference);
  });
  it("텍스트 중간 기획·대표 이미지와 양쪽 구성안을 함께 복원한다",async()=>{
    const input=codecFixture();input.startMode="text";input.result=null;input.appState="upload";input.editorState=null;
    input.textDraft={stage:"keyVisual",text:"상품 소개",brief:null,blueprint:input.analyzedBlueprint!,originalBlueprint:input.analyzedBlueprint!,
      keyVisual:{base64:png,mimeType:"image/png"},styleReference:input.styleReference,styleReferenceEnabled:true,
      preserveProduct:false,characterAngles:[],imageModel:"nano-banana",copyIntensity:"normal",gapPolicy:"ask",productKind:"physical",pageGoal:"purchase"};
    const packed=await encodeServerDocument(input,user,id);
    expect(JSON.stringify(packed.document)).not.toContain(png);
    const restored=await decodeServerDocument(packed.document,async()=>packed.uploads[0].bytes);
    expect(restored.textDraft).toEqual(input.textDraft);
    expect(restored.result).toBeNull();
  });
  it("다른 바이트·누락된 파일이면 복원 성공으로 처리하지 않는다",async()=>{
    const packed=await encodeServerDocument(codecFixture(),user,id);
    await expect(decodeServerDocument(packed.document,async()=>new Uint8Array([1,2]))).rejects.toThrow();
  });
  it.each([
    ["300번째 칸에 걸친 이모지","가".repeat(299)+"😀끝","가".repeat(299)],
    ["이모지만 긴 제목","😀".repeat(200),"😀".repeat(150)],
    ["한도 안의 이모지 제목","새 상품 😀","새 상품 😀"],
  ])("제목은 서버 한도(UTF-16 300)를 넘기지 않고 이모지를 반으로 자르지 않는다: %s",async(_case,name,expected)=>{
    const input=codecFixture();
    input.result={...input.result!,blueprint:{...input.result!.blueprint,sections:[{...input.result!.blueprint.sections[0],section_name:name}]}};
    const packed=await encodeServerDocument(input,user,id);
    expect(packed.document.title).toBe(expected);
    expect(packed.document.title.length).toBeLessThanOrEqual(300);
    expect(/\p{Cs}/u.test(packed.document.title)).toBe(false);
  });
});
