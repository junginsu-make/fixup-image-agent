import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdir,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url));
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(root,"node_modules/.pnpm/node_modules/playwright"));
const {build}=require("esbuild");
const sharp=createRequire(new URL("../../apps/web/package.json",import.meta.url))("sharp");
const origin=process.env.PDP_BROWSER_ORIGIN??"http://localhost:3117";
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const evidence=process.env.PDP_BROWSER_EVIDENCE??path.join(process.env.TEMP??root,"pdp-server-browser-evidence");
await mkdir(evidence,{recursive:true});
const bundled=await build({stdin:{contents:`import {createServerDraftRepository} from './apps/web/app/create/server-draft-repository';import {createEmptySection} from './apps/web/app/create/scenario-sections';import {normalizeBrief} from './packages/pdp-core/src/pdp.text-plan';window.__pdp={createServerDraftRepository,createEmptySection,normalizeBrief};`,resolveDir:root},bundle:true,platform:"browser",format:"iife",write:false});
const red=(await sharp({create:{width:16,height:24,channels:3,background:"#ff0000"}}).png().toBuffer()).toString("base64");
const blue=(await sharp({create:{width:16,height:24,channels:3,background:"#0000ff"}}).png().toBuffer()).toString("base64");
const browser=await chromium.launch({headless:true});
const results=[];
const browserErrors=[];
try{
  const a=await browser.newContext(),b=await browser.newContext();
  const pa=await a.newPage(),pb=await b.newPage();
  for(const page of [pa,pb]){page.setDefaultTimeout(60_000);page.on("dialog",dialog=>void dialog.accept());
    page.on("pageerror",error=>browserErrors.push(error.message));
    page.on("console",message=>{if(message.type()==="error")browserErrors.push(message.text());});
  }
  await pa.goto(origin+"/create",{waitUntil:"domcontentloaded"});
  await pa.addScriptTag({content:bundled.outputFiles[0].text});
  const first=await pa.evaluate(async({red})=>{
    const {createServerDraftRepository,createEmptySection}=window.__pdp;
    window.repo=createServerDraftRepository({get:async()=>null,list:async()=>[]});
    const section={...createEmptySection(0),section_name:"브라우저 저장 검증",headline:"저장한 제목",generatedImage:"data:image/png;base64,"+red};
    window.original=await window.repo.save({appState:"editor",startMode:"image",preparedImage:{base64:red,mimeType:"image/png",previewUrl:"data:image/png;base64,"+red,fileName:"red.png"},
      modelImage:null,modelImageUsage:null,result:{originalImage:red,blueprint:{executiveSummary:"브라우저 저장 시험",scorecard:[],blueprintList:[],sections:[section]}},
      additionalInfo:"첫 입력",desiredTone:"",aspectRatio:"9:16",notice:"",editorState:null});
    return window.original;
  },{red});
  results.push({case:"real browser upload and save",id:first.id});
  await pb.goto(origin+"/create?doc="+first.id,{waitUntil:"domcontentloaded"});
  await pb.getByRole("button",{name:"이전 버전 보기",exact:true}).waitFor();
  await pb.screenshot({path:path.join(evidence,"01-restored.png"),fullPage:true});
  await pb.addScriptTag({content:bundled.outputFiles[0].text});
  await pb.evaluate(async id=>{window.repo=window.__pdp.createServerDraftRepository({get:async()=>null,list:async()=>[]});window.original=await window.repo.get(id);},first.id);
  assert.equal(await pb.evaluate(()=>window.original.preparedImage.base64),red);
  results.push({case:"fresh browser restores original bytes and editor",ok:true});
  await pa.evaluate(async()=>window.repo.save({...window.original,additionalInfo:"A 먼저 저장"}));
  const copy=await pb.evaluate(async()=>window.repo.save({...window.original,additionalInfo:"B 충돌 사본"}));
  assert.notEqual(copy.id,first.id);assert.equal(copy.conflictOf,first.id);
  assert.equal(await pa.evaluate(async id=>(await window.repo.get(id)).additionalInfo,first.id),"A 먼저 저장");
  results.push({case:"two browser conflict preserves both",original:first.id,copy:copy.id});
  await pb.evaluate(async id=>{
    window.__holdRead=false;
    window.__readGate=new Promise(resolve=>{window.__releaseRead=resolve;});
    window.__raceRepo=window.__pdp.createServerDraftRepository({get:async()=>null,list:async()=>[]},async(url,init)=>{
      const response=await fetch(url,init);
      if(window.__holdRead && init?.method==="GET"){window.__readStarted=true;await window.__readGate;}
      return response;
    });
    window.__raceOld=await window.__raceRepo.get(id);
  },first.id);
  await pa.evaluate(async id=>{const current=await window.repo.get(id);await window.repo.save({...current,additionalInfo:"F2 A 최신"});},first.id);
  await pb.evaluate(id=>{
    window.__holdRead=true;window.__reading=window.__raceRepo.get(id);
  },first.id);
  await pb.waitForFunction(()=>window.__readStarted===true);
  const race=await pb.evaluate(async()=>{
    // 자동저장 타이머가 다시 열기 응답을 기다리는 동안 옛 화면을 보낸다.
    const saving=new Promise((resolve,reject)=>setTimeout(()=>{
      const queued=window.__raceRepo.save({...window.__raceOld,additionalInfo:"F2 B 옛 화면"});
      window.__holdRead=false;window.__releaseRead();queued.then(resolve,reject);
    },0));
    await window.__reading;return saving;
  });
  assert.equal(race.conflictOf,first.id);
  assert.equal(await pa.evaluate(async id=>(await window.repo.get(id)).additionalInfo,first.id),"F2 A 최신");
  results.push({case:"F2 held reopen response plus timer autosave preserves latest and forks stale screen",ok:true});
  await pb.route("**/api/pdp/images",route=>route.fulfill({json:{ok:true,imageBase64:blue,mimeType:"image/png",qa:{status:"passed",warnings:[]}}}));
  await pb.goto(origin+"/create?doc="+copy.id,{waitUntil:"domcontentloaded"});
  await pb.getByRole("button",{name:"다시 생성",exact:true}).first().click();
  await pb.waitForFunction(async({id,blue})=>{
    const response=await fetch("/api/pdp/documents/"+id);const payload=await response.json();
    const section=payload.record?.document?.body?.sections?.[0];
    const key=section?.generatedImage?.$asset;if(!key)return false;
    const image=await fetch(payload.urls[key]);const bytes=new Uint8Array(await image.arrayBuffer());
    return btoa(String.fromCharCode(...bytes))===blue;
  },{id:copy.id,blue},{timeout:60_000});
  await pb.screenshot({path:path.join(evidence,"02-regenerated.png"),fullPage:true});
  results.push({case:"actual regenerate button saves mock provider result to same document",id:copy.id});
  await pb.getByRole("button",{name:"이전 버전 보기",exact:true}).click();
  const restoreResponse=pb.waitForResponse(response=>response.url().endsWith("/api/pdp/documents/"+copy.id+"/restore") && response.request().method()==="POST");
  await pb.getByLabel("되돌릴 버전").selectOption("1");
  assert.equal((await restoreResponse).status(),200);
  const restored=await pb.evaluate(async id=>{
    const p=await (await fetch("/api/pdp/documents/"+id)).json();
    const key=p.record.document.body.sections[0].generatedImage.$asset;
    const bytes=new Uint8Array(await (await fetch(p.urls[key])).arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  },copy.id);
  assert.equal(restored,red);
  results.push({case:"history button restores original image on same document",ok:true});
  const library=await pa.evaluate(async()=>await (await fetch("/api/library")).json());
  assert.ok(library.items.some(x=>x.id===first.id));assert.ok(library.items.some(x=>x.id===copy.id));
  const images=await pa.evaluate(async id=>await (await fetch("/api/library?id="+id)).json(),copy.id);
  assert.equal(images.images.length,1);
  await pb.goto(origin+"/library",{waitUntil:"domcontentloaded"});
  await pb.getByText("브라우저 저장 검증",{exact:true}).first().waitFor();
  await pb.waitForFunction(()=>[...document.querySelectorAll('img[alt="브라우저 저장 검증"]')].some(img=>img.complete && img.naturalWidth>0));
  await pb.screenshot({path:path.join(evidence,"03-library.png"),fullPage:true});
  results.push({case:"library and saved-image API include documents",ok:true});
  await pb.goto(origin+"/create",{waitUntil:"domcontentloaded"});
  await pb.getByRole("button",{name:"저장된 이미지에서 고르기",exact:true}).click();
  const picker=pb.getByRole("dialog");
  await picker.getByRole("button",{name:"브라우저 저장 검증 크게 보기",exact:true}).first().waitFor();
  assert.equal(await picker.getByRole("button",{name:"브라우저 저장 검증 지우기",exact:true}).count(),0);
  const retained=await pa.evaluate(async id=>{
    const read=async()=>({
      record:(await (await fetch("/api/pdp/documents/"+id)).json()).record,
      versions:(await (await fetch("/api/pdp/documents/"+id+"/revisions")).json()).revisions,
    });
    const before=await read();
    await fetch("/api/library",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});
    const after=await read();
    const loaded=await window.repo.get(id);
    return {before,after,original:loaded.preparedImage.base64};
  },first.id);
  assert.deepEqual(retained.after,retained.before);assert.equal(retained.original,red);
  await pb.screenshot({path:path.join(evidence,"05-picker-protected.png"),fullPage:true});
  results.push({case:"F1 picker has no document trash and library DELETE preserves document assets and revisions",ok:true});
  const textDraft=await pa.evaluate(async blue=>{
    const section=window.__pdp.createEmptySection(0);
    const blueprint={executiveSummary:"글 기획 복원",scorecard:[],blueprintList:[],sections:[section]};
    return window.repo.save({appState:"upload",startMode:"text",preparedImage:null,modelImage:null,modelImageUsage:null,result:null,
      additionalInfo:"글로 시작",desiredTone:"",aspectRatio:"9:16",notice:"",editorState:null,
      textDraft:{stage:"keyVisual",text:"글 기획 원문",brief:window.__pdp.normalizeBrief({offeringName:"글로 만든 상품"},"글 기획 원문"),
        blueprint,originalBlueprint:blueprint,keyVisual:{base64:blue,mimeType:"image/png"},styleReferenceEnabled:false,
        preserveProduct:false,characterAngles:[],imageModel:"nano-banana",copyIntensity:"normal",gapPolicy:"ask",productKind:"physical",pageGoal:"purchase"}});
  },blue);
  await pb.goto(origin+"/create?doc="+textDraft.id,{waitUntil:"domcontentloaded"});
  await pb.getByRole("button",{name:"이전 버전 보기",exact:true}).waitFor();
  await pb.waitForFunction(blue=>[...document.querySelectorAll("img")].some(img=>img.src==="data:image/png;base64,"+blue && img.complete && img.naturalWidth>0),blue);
  await pb.screenshot({path:path.join(evidence,"04-text-key-visual.png"),fullPage:true});
  results.push({case:"text planning stage and key visual restored in browser",id:textDraft.id});
  const adminCopy=await pa.evaluate(async id=>{
    const source=await (await fetch("/api/pdp/documents/"+id)).json(),targetId=crypto.randomUUID();
    const response=await fetch("/api/admin/pdp-documents/"+id+"/copy",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({ownerId:source.record.userId,targetId,revision:source.record.revision})});
    return {status:response.status,body:await response.json()};
  },first.id);
  assert.equal(adminCopy.status,200);
  const deleteResult=await pa.evaluate(async id=>{
    const before=await (await fetch("/api/pdp/documents/"+id)).json();
    const removed=await fetch("/api/pdp/documents/"+id,{method:"DELETE"});
    const after=await fetch("/api/pdp/documents/"+id);
    return {removed:removed.status,after:after.status,hadAssets:Object.keys(before.record.document.assets).length>0};
  },adminCopy.body.id);
  assert.deepEqual(deleteResult,{removed:200,after:404,hadAssets:true});
  results.push({case:"admin file copy and owner deletion with real local storage",ok:true});
  const revisionBefore=await pa.evaluate(async id=>(await (await fetch("/api/pdp/documents/"+id)).json()).record.revision,first.id);
  await pb.goto(origin+"/create?doc="+encodeURIComponent(first.id+"@1"),{waitUntil:"domcontentloaded"});
  await pb.getByText("작업 주소가 올바르지 않습니다.",{exact:true}).waitFor();
  const revisionAfter=await pa.evaluate(async id=>(await (await fetch("/api/pdp/documents/"+id)).json()).record.revision,first.id);
  assert.equal(revisionAfter,revisionBefore);
  results.push({case:"opening URL cannot invoke a revision restore",ok:true});
  await writeFile(path.join(evidence,"results.json"),JSON.stringify(results,null,2));
  await writeFile(path.join(evidence,"browser-errors.json"),JSON.stringify(browserErrors,null,2));
  console.log(JSON.stringify({passed:results.length,evidence,results},null,2));
}finally{await browser.close();}
