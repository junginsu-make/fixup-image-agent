import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionStore, GenerationAttempt, GenerationRun } from "../types";
vi.mock("server-only",()=>({}));
const state=vi.hoisted(()=>({
  run:undefined as GenerationRun|undefined, attempts:[] as GenerationAttempt[], submits:0, llm:0, settles:0, loseCheckpoint:false,
  store:undefined as ExecutionStore|undefined,
}));
vi.mock("../run-store",()=>({executionStore:()=>state.store,inputHash:(x:unknown)=>JSON.stringify(x)}));
vi.mock("../../supabase/admin",()=>({createSupabaseAdminClient:()=>{
  const q={upsert:()=>q,update:()=>q,eq:()=>q,then:(resolve:(x:unknown)=>void)=>resolve({error:null,data:[]})};return{from:()=>q};
}}));
vi.mock("../../storage/signing",()=>({signPath:async(_b:string,p:string)=>`https://example.invalid/${p}`}));
vi.mock("../../sns/runtime",()=>({
  refreshProjectAssetUrls:async(p:unknown)=>p,
  createQueuedGenerationDependencies:async(input:{providers:{sceneProvider:unknown;reviewPrimary:unknown;reviewBackup:unknown;falQueue:unknown};requestStore:unknown})=>({
    sceneProvider:input.providers.sceneProvider,reviewPrimary:input.providers.reviewPrimary,reviewBackup:input.providers.reviewBackup,
    queue:input.providers.falQueue,requestStore:input.requestStore,
    uploadReference:async()=>"https://example.invalid/ref",savePrompt:async()=>{},saveSubmitted:async()=>{},saveFailed:async()=>{},saveReview:async()=>{},
    saveOriginal:async()=>{throw new Error("not an original-card fixture");},
    saveAsset:async(_image:unknown,c:{index:number})=>({assetPath:`owner/sns/project/run/${c.index}.png`,thumbPath:null,assetUrl:"https://example.invalid/image",reviewUrl:"https://example.invalid/image"}),
  }),
}));
vi.mock("@anthropic-ai/sdk",()=>({default:class {
  messages={create:async(input:{tools?:unknown})=>{
    state.llm++;
    return{usage:{input_tokens:10,output_tokens:5},content:input.tools?[{type:"tool_use",name:"submit_card_review",input:{decision:"pass",summary:"ok",issues:[],
      textFidelity:{headline:"exact",body:"not_applicable",accent:"not_applicable",footnote:"not_applicable"},extraCopy:{status:"none",texts:[]}}}]:[{type:"text",text:"A simple scene"}]};
  }};
}}));
vi.mock("openai",()=>({default:class {responses={create:async()=>{throw new Error("Unexpected fallback");}};}}));
vi.mock("../../fal/queue",()=>({createFalQueueClient:()=>({submitJob:async()=>({requestId:`fal-${++state.submits}`}),jobStatus:async()=>"completed",jobResult:async()=>({images:[{url:"https://example.invalid/image"}]})})}));
vi.mock("../../fal/upload",()=>({createFalUploader:()=>({}),uploadUniqueReferences:async()=>({})}));

import {tickSnsRun} from "../sns-execution";
import {quoteQueuedImages} from "../../sns/queued-flow";
import type {SnsProjectRecord} from "../../../app/api/sns/projects/project-service";
import type {SnsFlowState} from "../../../app/api/sns/flow-service";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

beforeEach(()=>{
  vi.stubEnv("LOCAL_STORE","0");
  vi.stubEnv("ANTHROPIC_API_KEY","test");vi.stubEnv("OPENAI_API_KEY","test");vi.stubEnv("FAL_KEY","test");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(new Uint8Array([1,2]),{headers:{"content-type":"image/png"}})));
  state.attempts=[];state.submits=0;state.llm=0;state.settles=0;state.loseCheckpoint=false;
  const flow:SnsFlowState={stage:"result",planningIssues:[],copyIssues:[],costs:[],generation:{startedAt:"2026-09-11T00:00:00Z",selectedCardIndexes:[1,2],falReferenceUrls:{}},
    cards:[1,2].map(index=>({index,kind:"generated",role:"body",copy:{index,headline:"hello"},status:"pending"}))};
  const project={id:"project",userId:"owner",modelId:"nano-banana",ratio:"4:5",language:"ko",data:{attachments:[],flow,source:{kind:"text",text:"fixture"}}} as unknown as SnsProjectRecord;
  state.run={id:"run",user_id:"owner",resource_type:"sns",resource_id:"project",state:"prepared",lease_token:"lease",checkpoint:{},max_cost_microusd:20_000_000,
    execution_snapshot:{project,initialFlow:flow,selected:[1,2],models:{ANTHROPIC_MODEL:"claude-sonnet-5",OPENAI_DRAFT_MODEL:"gpt-5.6-sol",OPENAI_VISION_MODEL:"gpt-5.6-sol"},imagePrices:quoteQueuedImages(project,flow,[1,2])}} as unknown as GenerationRun;
  state.store={
    async attempts(){return structuredClone(state.attempts);},
    async prepare(s){const a={id:`attempt-${state.attempts.length}`,run_id:"run",logical_step:s.step,sequence:s.sequence,state:"prepared",provider:s.provider,
      model:s.model,endpoint:s.endpoint,request_payload:s.payload,price_snapshot:s.price,requested_images:s.requestedImages,returned_images:0,delivered_images:0,estimated_cost_microusd:s.maxCostMicrousd,output_manifest:null,provider_request_id:null} as GenerationAttempt;state.attempts.push(a);return structuredClone(a);},
    async advance(id,p){const a=state.attempts.find(a=>a.id===id)!;Object.assign(a,{state:p.state},p.providerRequestId?{provider_request_id:p.providerRequestId}:{},
      p.output?{output_manifest:p.output}:{},p.returnedImages===undefined?{}:{returned_images:p.returnedImages},p.deliveredImages===undefined?{}:{delivered_images:p.deliveredImages});return structuredClone(a);},
    async persist(c){if(state.loseCheckpoint&&state.submits){state.loseCheckpoint=false;throw new Error("checkpoint connection lost");}state.run!.checkpoint=structuredClone(c);return state.run!;},
    async checkpoint(c,s){state.run!.checkpoint=structuredClone(c);state.run!.state=s;return state.run!;},
    async settle(){state.settles++;expect(state.attempts.every(a=>["stored","failed","cancelled"].includes(a.state))).toBe(true);state.run!.state="succeeded";return state.run!;},
  };
});

describe("T02: server ticks complete SNS without a browser",()=>{
  it("submits sequentially, persists model calls, and settles once",async()=>{
    for(let i=0;i<20&&state.run!.state!=="succeeded";i++)await tickSnsRun(structuredClone(state.run!));
    expect(state.run!.state).toBe("succeeded");expect(state.submits).toBe(2);expect(state.settles).toBe(1);
    expect(state.attempts.filter(a=>a.provider==="anthropic")).toHaveLength(4);
    await tickSnsRun(structuredClone(state.run!));expect(state.settles).toBe(1);
  });
  it("recovers an accepted request even if its flow checkpoint was lost",async()=>{
    state.loseCheckpoint=true;
    for(let i=0;i<20&&state.run!.state!=="succeeded";i++) {
      try{await tickSnsRun(structuredClone(state.run!));}catch(e){expect(String(e)).toContain("checkpoint connection lost");}
    }
    expect(state.run!.state).toBe("succeeded");expect(state.submits).toBe(2);expect(state.settles).toBe(1);
  });
});
