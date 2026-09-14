import "server-only";
import { creditUnits, llmCostUsd, LLM_PLAN_USD, ExecutionControlError } from "@fixup/shared";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";
import type { SnsFlowState } from "../../app/api/sns/flow-service";
import { createSnsGenerationProviders, snsModelSnapshot, requireSnsProviderKeys } from "../sns/providers";
import { createQueuedGenerationDependencies, refreshProjectAssetUrls } from "../sns/runtime";
import { startQueuedFlow, pollQueuedFlow, hasActiveQueuedGeneration, quoteQueuedImages, type SubmittedGenerationRequestStore } from "../sns/queued-flow";
import { signPath } from "../storage/signing";
import { claimPaidCall, llmCallUpperMicrousd, withRecordedLlm } from "../llm/recorded-call";
import { beginRun, executionStore, existingRun, inputHash, requestKey } from "./run-store";
import { advanceQueueAttempt } from "./coordinator";
import { isTerminal, type GenerationRun } from "./types";
import { generationArtifacts } from "./artifacts";
import { isLocalStoreEnabled, readLocalSnsResultFile, localStoreRoot } from "../local-store";

interface Snapshot { project:SnsProjectRecord; initialFlow:SnsFlowState; selected:number[]; note?:string; models:ReturnType<typeof snsModelSnapshot>; imagePrices:ReturnType<typeof quoteQueuedImages> }
interface Checkpoint { flow:SnsFlowState; prepared:number[] }

function baseFlow(project:SnsProjectRecord):SnsFlowState {
  const draft=project.data.flow;
  if(!draft)throw new Error("planning_required");
  const previous=project.data.executionFlow;
  return {...draft,costs:previous?.costs??draft.costs,cards:draft.cards.map(card=>{
    const old=previous?.cards.find(c=>c.index===card.index);
    if(!old)return card;
    const same=inputHash({copy:card.copy,layout:card.layout})===inputHash({copy:old.copy,layout:old.layout});
    return {...card,...(same?old:{}),copy:card.copy,plan:card.plan,layout:card.layout,
      assetPath:old.assetPath,thumbPath:old.thumbPath,assetUrl:old.assetUrl};
  })};
}
function identity(project:SnsProjectRecord,flow:SnsFlowState,selected:number[],note?:string) {
  return {projectId:project.id,modelId:project.modelId,ratio:project.ratio,language:project.language,
    attachments:project.data.attachments.map(({url:_url,...a})=>a),look:project.data.look,instruction:project.data.userInstruction,intents:project.data.attachmentIntents,
    cards:flow.cards.map(c=>({index:c.index,kind:c.kind,role:c.role,copy:c.copy,plan:c.plan,layout:c.layout})),selected,note};
}
export async function beginSnsRun(request:Request,userId:string,project:SnsProjectRecord,options:{cardIndexes?:number[];note?:string}={}) {
  const flow=baseFlow(project);const selected=options.cardIndexes??flow.cards.map(c=>c.index);
  if(!selected.length||selected.some(i=>!flow.cards.some(c=>c.index===i)))throw new Error("invalid_card_selection");
  const key=requestKey(request);const semantic=identity(project,flow,selected,options.note);
  const existing=await existingRun(userId,key,project.id,semantic,"sns_image");if(existing)return existing;
  requireSnsProviderKeys("generation");
  const imagePrices=quoteQueuedImages(project,flow,selected);
  const estimate={usd:imagePrices.reduce((sum,p)=>sum+p.unitCostUsd,0),generatedCount:imagePrices.length};
  const initialFlow=structuredClone(flow);
  initialFlow.stage="result";
  initialFlow.generation={selectedCardIndexes:selected,startedAt:new Date().toISOString(),falReferenceUrls:{}};
  for(const card of initialFlow.cards)if(selected.includes(card.index))card.status="pending";
  const models=snsModelSnapshot();
  const llmCards=flow.cards.filter(c=>selected.includes(c.index)&&c.kind==="generated"&&!c.layout).length;
  const bound=Math.max(llmCallUpperMicrousd(models.ANTHROPIC_MODEL),llmCallUpperMicrousd(models.OPENAI_VISION_MODEL));
  const snapshot:Snapshot={project,initialFlow,selected,note:options.note,models,imagePrices};
  return beginRun({userId,key,operation:"sns_image",resourceType:"sns",resourceId:project.id,identity:semantic,
    units:creditUnits(estimate.usd+llmCostUsd({planCalls:1+estimate.generatedCount})),
    maxCostMicrousd:Math.max(1,Math.ceil(estimate.usd*1_000_000)+llmCards*4*bound),
    snapshot:{...snapshot,kind:"sns",customerLlmUnitMicrousd:Math.round(LLM_PLAN_USD*1_000_000)}});
}

/** Advances one preparation/card step using server snapshots and a paid-call budget. */
export async function tickSnsRun(run:GenerationRun) {
  if(isTerminal(run.state)||run.state==="needs_reconciliation")return run;
  const store=executionStore(run);
  if(run.state==="settlement_pending")return store.settle();
  const snap=run.execution_snapshot as unknown as Snapshot;
  if(!snap.project||snap.project.id!==run.resource_id||snap.project.userId!==run.user_id)throw new Error("invalid_server_snapshot");
  let checkpoint:Checkpoint=run.checkpoint.flow?run.checkpoint as unknown as Checkpoint:{flow:snap.initialFlow,prepared:[]};
  const artifacts=generationArtifacts(run);
  await artifacts.ensureSnsCards(snap.initialFlow.cards);
  const project=await refreshProjectAssetUrls({...snap.project,data:{...snap.project.data,executionFlow:undefined,flow:checkpoint.flow}});
  const providers=createSnsGenerationProviders({...process.env,...snap.models});
  const attempts=()=>store.attempts();
  // Rebuild an ID checkpoint lost AFTER the provider accepted the request.
  // The authoritative identity is the attempt row, never project JSON.
  for (let a of await attempts()) {
    if(a.provider!=="fal")continue;
    if(a.state==="submitting") {
      a=await advanceQueueAttempt(a,store,providers.falQueue,async()=>({}));
      if(a.state==="unknown")throw new ExecutionControlError("outcome_unknown");
    }
    if(!a.provider_request_id)continue;
    const [,index,slot]=a.logical_step.split(":");
    const card=checkpoint.flow.cards.find(c=>c.index===Number(index));
    if(!card||["done","review_required"].includes(card.status))continue;
    const job=slot==="whole"?undefined:card.slotJobs?.find(j=>j.slot===Number(slot));
    if(slot!=="whole"&&!job)throw new Error("missing_server_slot_checkpoint");
    if(job ? job.falRequestId===a.provider_request_id : card.falRequestId===a.provider_request_id)continue;
    card.status="generating";
    if(job)Object.assign(job,{status:"generating",falRequestId:a.provider_request_id,generationRequestId:a.id,endpoint:a.endpoint});
    else Object.assign(card,{falRequestId:a.provider_request_id,generationRequestId:a.id,generationEndpoint:a.endpoint});
    if(!checkpoint.flow.costs.some(c=>c.generationRequestId===a.id))checkpoint.flow.costs.push({cardIndex:card.index,generationRequestId:a.id,
      falRequestId:a.provider_request_id,unitCostUsd:(a.price_snapshot.providerUnitMicrousd??0)/1_000_000,costUsd:null});
  }
  const byProvider=async(endpoint:string,id:string)=>{
    const found=(await attempts()).find(a=>a.provider==="fal"&&a.endpoint===endpoint&&a.provider_request_id===id);
    if(!found)throw new ExecutionControlError("storage_unavailable");return found;
  };
  const requestStore:SubmittedGenerationRequestStore={
    async createSubmitted(row){
      const a=(await attempts()).find(a=>a.provider_request_id===row.falRequestId&&a.provider==="fal");
      if(!a)throw new ExecutionControlError("storage_unavailable");return {id:a.id};
    },
    async complete(id,patch){
      const a=(await attempts()).find(a=>a.id===id);if(!a)throw new ExecutionControlError("storage_unavailable");
      try{await artifacts.completeSns(a,patch.returnedImages);}catch{throw new ExecutionControlError("storage_unavailable");}
    },
  };
  const deps=await createQueuedGenerationDependencies({userId:run.user_id,runId:run.id,project,requestStore,providers});
  deps.durable=true;
  const save=deps.saveAsset;
  deps.saveAsset=async(images,card)=>{
    const imagesForCard=(await attempts()).filter(a=>a.provider==="fal"&&a.logical_step.startsWith(`image:${card.index}:`));
    const cached=imagesForCard.find(a=>a.state==="stored")?.output_manifest?.saved as Awaited<ReturnType<typeof save>>|undefined;
    if(cached&&imagesForCard.every(a=>["stored","failed","cancelled"].includes(a.state))) {
      if(isLocalStoreEnabled())return {...cached,reviewUrl:`data:image/png;base64,${(await readLocalSnsResultFile(localStoreRoot(),cached.assetPath)).toString("base64")}`};
      const url=await signPath("library",cached.assetPath,3600);return {...cached,assetUrl:url,reviewUrl:url};
    }
    const saved=await save(images,card);
    for(const a of imagesForCard)if(a.state==="result_ready")await store.advance(a.id,{state:"stored",deliveredImages:a.returned_images,
      output:{...a.output_manifest,saved,paths:[saved.assetPath],thumbPaths:[saved.thumbPath]}});
    return saved;
  };
  const upload=deps.uploadReference;
  deps.uploadReference=a=>checkpoint.flow.generation?.falReferenceUrls?.[a.id]?Promise.resolve(checkpoint.flow.generation.falReferenceUrls[a.id]!):upload(a);
  deps.checkpoint=async flow=>{checkpoint={...checkpoint,flow};await store.persist(checkpoint as unknown as Record<string,unknown>);};
  deps.submitImage=async input=>{
    const step=`image:${input.cardIndex}:${input.slot??"whole"}`;
    const frozen=snap.imagePrices.find(p=>p.step===step);
    if(!frozen||frozen.modelId!==input.modelId||frozen.endpoint!==input.endpoint||frozen.unitCostUsd!==input.unitCostUsd)throw new Error("generation_price_version_changed");
    let a=(await attempts()).find(a=>a.logical_step===step);
    if(!a||a.state==="prepared")claimPaidCall();
    const micro=Math.round(input.unitCostUsd*1_000_000);
    a=a??await store.prepare({step,sequence:input.cardIndex,provider:"fal",model:input.modelId,endpoint:input.endpoint,
      requestHash:inputHash(input.input),payload:input.input,price:{chargeUnitMicrousd:micro,providerUnitMicrousd:micro},maxCostMicrousd:micro,requestedImages:1});
    try{await artifacts.snsRequest(a,{cardIndex:input.cardIndex,modelId:input.modelId,mode:frozen.mode,size:frozen.size,unitCostUsd:input.unitCostUsd});}
    catch{throw new ExecutionControlError("storage_unavailable");}
    if(a.state==="prepared"||a.state==="submitting")a=await advanceQueueAttempt(a,store,providers.falQueue,async()=>({}));
    if(a.state==="unknown"||!a.provider_request_id)throw new ExecutionControlError("outcome_unknown");
    return {requestId:a.provider_request_id};
  };
  deps.queue={
    submitJob:async()=>{throw new Error("durable submission requires card identity");},
    async jobStatus(endpoint,id){const a=await byProvider(endpoint,id);if(["result_ready","stored","failed"].includes(a.state))return "completed";
      try{return await providers.falQueue.jobStatus(endpoint,id);}catch{throw new ExecutionControlError("execution_yield");}},
    async jobResult(endpoint,id){
      let a=await byProvider(endpoint,id);if(a.state==="failed")return {images:[]};
      if(a.state==="submitted") {
        try{a=await advanceQueueAttempt(a,store,providers.falQueue,async()=>({}));}catch{throw new ExecutionControlError("execution_yield");}
      }
      if(a.state==="failed")return {images:[]};
      if(!["result_ready","stored"].includes(a.state))throw new ExecutionControlError("execution_yield");
      return {images:a.output_manifest?.images as Array<{url:string}>};
    },
  };
  if(run.stop_requested_at) {
    checkpoint={...checkpoint,prepared:snap.selected,flow:{...checkpoint.flow,cards:checkpoint.flow.cards.map(c=>({ ...c,
      ...(snap.selected.includes(c.index)&&c.status==="pending"?{status:"failed" as const,error:"사람이 중지했습니다."}:{}),
      slotJobs:c.slotJobs?.map(j=>j.status==="pending"?{...j,status:"failed" as const,error:"사람이 중지했습니다."}:j),
    }))}};
  }
  const next=snap.selected.find(i=>!checkpoint.prepared.includes(i));
  const activeCard=checkpoint.flow.cards.find(c=>snap.selected.includes(c.index)&&c.status==="generating");
  try {
    if(next!==undefined) {
      const prepared=await withRecordedLlm(store,`prepare:${next}`,()=>startQueuedFlow(project,checkpoint.flow,deps,{cardIndexes:[next],note:snap.note,deferSubmit:true}));
      prepared.generation={...prepared.generation!,selectedCardIndexes:snap.selected,
        startedAt:snap.initialFlow.generation!.startedAt,falReferenceUrls:{...checkpoint.flow.generation?.falReferenceUrls,...prepared.generation?.falReferenceUrls}};
      checkpoint={flow:prepared,prepared:[...checkpoint.prepared,next]};
    } else if(hasActiveQueuedGeneration(checkpoint.flow)) {
      checkpoint={...checkpoint,flow:await withRecordedLlm(store,`poll:${activeCard?.index??"next"}`,()=>pollQueuedFlow(project,checkpoint.flow,deps))};
    }
  } catch(error) {
    if(error instanceof ExecutionControlError&&error.code==="execution_yield")return store.checkpoint(checkpoint as unknown as Record<string,unknown>,"running");
    throw error;
  }
  const done=checkpoint.prepared.length===snap.selected.length&&!hasActiveQueuedGeneration(checkpoint.flow);
  if(done&&checkpoint.flow.generation)checkpoint.flow.generation.completedAt=new Date().toISOString();
  await store.checkpoint(checkpoint as unknown as Record<string,unknown>,done?"settlement_pending":"running");
  if(done)return store.settle();
  return run;
}
