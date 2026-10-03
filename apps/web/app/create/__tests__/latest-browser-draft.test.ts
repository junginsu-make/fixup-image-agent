import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { savePdpDraft } from "../pdp-drafts";
import { createPdpDocument } from "../document-state";
import { savePdpDocument } from "../document-store";
import { createDraftRepository, readLatestBrowserDraft } from "../draft-repository";
const input={appState:"upload" as const,preparedImage:null,modelImage:null,modelImageUsage:null,result:null,
  additionalInfo:"옛 v3",desiredTone:"",aspectRatio:"9:16" as const,notice:"",editorState:null};
describe("이관할 브라우저 사본",()=>{
  it("오래된 v3가 최신 v2를 가리지 않는다",async()=>{
    const id=crypto.randomUUID();await savePdpDocument(createPdpDocument({...input,id}));
    await new Promise(resolve=>setTimeout(resolve,5));
    await savePdpDraft({...input,id,additionalInfo:"최신 v2"});
    expect((await readLatestBrowserDraft(id))?.additionalInfo).toBe("최신 v2");
    expect((await createDraftRepository(false).get(id))?.additionalInfo).toBe("최신 v2");
    expect((await createDraftRepository(false).list()).find(x=>x.id===id)?.title).toBeDefined();
  });
  it("최신 v3도 플래그에 관계없이 읽을 수 있다",async()=>{
    const id=crypto.randomUUID();await savePdpDraft({...input,id});
    await new Promise(resolve=>setTimeout(resolve,5));
    await savePdpDocument(createPdpDocument({...input,id,additionalInfo:"최신 v3"}));
    expect((await readLatestBrowserDraft(id))?.additionalInfo).toBe("최신 v3");
  });
});
