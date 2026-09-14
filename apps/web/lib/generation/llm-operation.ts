import "server-only";
import { ExecutionControlError } from "@fixup/shared";
import { llmCallUpperMicrousd, withRecordedLlm, assertRecordedLlmHealthy } from "../llm/recorded-call";
import { beginRun, claimRun, existingRun, executionStore, renewRun, requestKey, isDurableGenerationEnabled as durableGenerationEnabled } from "./run-store";
import { readCachedResult, readCachedResultEntry, writeCachedResult } from "./result-cache";
import { isTerminal, type GenerationRun } from "./types";

export async function withRunLease<T>(run:GenerationRun,call:()=>Promise<T>):Promise<T> {
  const timer=setInterval(()=>{void renewRun(run).catch(()=>{});},45_000);timer.unref();
  try{return await call();}finally{clearInterval(timer);}
}

/** Free-to-member planning still gets a durable, rate-limited and costed run. */
export async function runLlmOperation<T>(request:Request,userId:string,options:{
  operation:"sns_plan"|"sns_caption"|"layout_analyze"|"poster_review"|"redesign_transcribe"|"pdp_analyze"|"poster_plan";
  units?: number;
  resourceType?:"sns"|"poster";resourceId?:string;identity:unknown;models:string[];maxCalls:number;maxOutputTokens?:number;
  maxToolCalls?:number;isSuccess?:(value:T)=>boolean;
},call:()=>Promise<T>):Promise<T> {
  if(!durableGenerationEnabled())return call();
  const key=requestKey(request);
  const previous=await existingRun(userId,key,options.resourceId??null,options.identity,options.operation);
  if(previous) {
    const entry=await readCachedResultEntry<{value:T;businessSuccess:boolean}>(previous);
    if(entry!==undefined){
      const cached=entry.value;
      if(!isTerminal(previous.state)&&previous.state!=="needs_reconciliation"){
        try {
          const claimed=await claimRun(previous.id);
          if(claimed){const store=executionStore(claimed);await store.checkpoint({resultRef:entry.path,businessSuccess:cached.businessSuccess},"settlement_pending",0);await store.settle();}
        } catch { /* The cached response survives a settlement outage; the executor retries. */ }
      }
      return cached.value;
    }
    throw new Error(isTerminal(previous.state)?"result_unavailable":previous.state==="needs_reconciliation"?"outcome_unknown":"concurrent_limit");
  }
  const maximum=Math.max(...options.models.map(m=>llmCallUpperMicrousd(m,9,options.maxOutputTokens??16384)))*options.maxCalls+(options.maxToolCalls??0)*10000;
  const run=await beginRun({userId,key,operation:options.operation,units:options.operation==="poster_plan"?options.units??0:0,resourceType:options.resourceType,resourceId:options.resourceId,identity:options.identity,
    snapshot:{kind:"llm",models:options.models,maxCalls:options.maxCalls},maxCostMicrousd:maximum,inline:true});
  if(!run.lease_token){const cached=await readCachedResult<{value:T}>(run);if(cached!==undefined)return cached.value;throw new Error("concurrent_limit");}
  const store=executionStore(run);
  return withRunLease(run,()=>withRecordedLlm(store,options.operation,async()=>{
    let value:T;
    try{value=await call();}
    catch(error){
      // An uncertain attempt cannot be converted into a free, terminal failure.
      if(!(error instanceof ExecutionControlError)) {
        const attempts=await store.attempts();
        if(attempts.every(a=>["stored","failed","cancelled"].includes(a.state))){await store.checkpoint({businessSuccess:false},"settlement_pending",0);await store.settle();}
      }
      throw error;
    }
    assertRecordedLlmHealthy();
    const businessSuccess=options.isSuccess?.(value)??true;
    if(!(await store.attempts()).length&&businessSuccess)throw new Error("unmetered_provider_result");
    const ref=await writeCachedResult(run,{value,businessSuccess});
    await store.checkpoint({resultRef:ref,businessSuccess},"settlement_pending",0);
    try{await store.settle();}catch{/* durable pending run is retried by the executor */}
    return value;
  },options.maxCalls));
}
