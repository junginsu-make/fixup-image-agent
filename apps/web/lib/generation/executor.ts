import "server-only";
import { ExecutionControlError } from "@fixup/shared";
import { claimRun, executionStore, stopRun } from "./run-store";
import { tickSnsRun } from "./sns-execution";
import { tickPosterRun } from "./poster-execution";
import { readCachedResultEntry } from "./result-cache";
import { finalizeImageArtifacts } from "./recorded-image";
import { replayAcceptanceJournal } from "./journal";
import { withExecutionDeadline, allowExecutionSubmissions } from "./deadline";
import { recordExecutorHeartbeat, type GenerationRuntime } from "./runtime";
import { createSupabaseAdminClient } from "../supabase/admin";
import { getLocalDatabase, isLocalStoreEnabled } from "../local-store";
import type { ExecutionStore, GenerationRun } from "./types";
import { GENERATION_OPERATIONS, type GenerationOperationV2 } from "./operations";
export interface ExecutorDependencies {
  admission:()=>Promise<boolean>;member:(run:GenerationRun)=>Promise<GenerationRun>;
  claim:()=>Promise<GenerationRun|null>;store:(run:GenerationRun)=>ExecutionStore;
  sns:(run:GenerationRun)=>Promise<unknown>;poster:(run:GenerationRun)=>Promise<unknown>;
  journal:()=>Promise<unknown>;heartbeat:(ok:boolean,code?:string)=>Promise<void>;
  result:(run:GenerationRun)=>Promise<{path:string;value:{businessSuccess:boolean;deliveredDigests?:string[]}}|undefined>;
  finalizeImages:(run:GenerationRun,store:ExecutionStore,digests:string[])=>Promise<void>;
  review:(run:GenerationRun,reason:string)=>Promise<void>;defer:(run:GenerationRun)=>Promise<void>;
}
export function executorDependencies(runtime:GenerationRuntime):ExecutorDependencies{return{
  async admission(){if(isLocalStoreEnabled())return true;const{data,error}=await createSupabaseAdminClient().from("usage_controls").select("admission_enabled").single();if(error)throw new Error("policy_unavailable");return data.admission_enabled===true;},
  async member(run){if(isLocalStoreEnabled())return run;const{data,error}=await createSupabaseAdminClient().from("profiles").select("status,email_confirmed_at").eq("id",run.user_id).maybeSingle();if(error)throw new Error("member_state_unavailable");return data?.status==="active"&&data.email_confirmed_at?run:stopRun(run.user_id,run.id);},
  claim:()=>claimRun(),store:executionStore,sns:tickSnsRun,poster:tickPosterRun,journal:()=>replayAcceptanceJournal(),
  heartbeat:(ok,code)=>recordExecutorHeartbeat(runtime,ok,code),result:readCachedResultEntry,finalizeImages:finalizeImageArtifacts,
  async review(run,reason){
    if(isLocalStoreEnabled()){await getLocalDatabase().update(raw=>{const r=(raw as unknown as {generationRuns:GenerationRun[]}).generationRuns.find(r=>r.id===run.id&&r.lease_token===run.lease_token);if(r){r.state="needs_reconciliation";r.error_code=reason;r.lease_until=null;}});return;}
    const{error}=await createSupabaseAdminClient().rpc("mark_generation_review",{p_id:run.id,p_token:run.lease_token,p_reason:reason});if(error)throw new Error("review_write_failed");
  },
  async defer(run){
    if(isLocalStoreEnabled()){await getLocalDatabase().update(raw=>{const r=(raw as unknown as {generationRuns:GenerationRun[]}).generationRuns.find(r=>r.id===run.id&&r.lease_token===run.lease_token);if(r)r.lease_until=new Date().toISOString();});return;}
    const{error}=await createSupabaseAdminClient().from("generation_runs").update({next_check_at:new Date(Date.now()+5000).toISOString(),lease_until:new Date().toISOString()}).eq("id",run.id).eq("lease_token",run.lease_token).not("state","in","(succeeded,failed,cancelled,needs_reconciliation)");
    if(error)throw new Error("defer_write_failed");
  },
};}
let active=false;
export async function executeGenerationTick(deps:ExecutorDependencies){
  if(active)return{ok:true,busy:true,processed:false};
  active=true;let timer:ReturnType<typeof setInterval>|undefined;let run:GenerationRun|null=null;let journalReady=true;
  return withExecutionDeadline(Date.now()+150000,false,async()=>{
  try{
    try{await deps.journal();}catch{journalReady=false;}
    allowExecutionSubmissions(journalReady&&await deps.admission());
    await deps.heartbeat(journalReady,journalReady?undefined:"journal_unavailable");
    timer=setInterval(()=>{void deps.heartbeat(journalReady,journalReady?undefined:"journal_unavailable").catch(()=>{});},45000);timer.unref();
    run=await deps.claim();
    if(run)run=await deps.member(run);
    if(run)await (async()=>{
      if(!GENERATION_OPERATIONS.includes(run!.operation as GenerationOperationV2))return deps.review(run!,"unsupported_operation");
      if(run!.operation==="sns_image")return deps.sns(run!);
      if(run!.operation==="poster_image")return deps.poster(run!);
      const store=deps.store(run!);const result=await deps.result(run!);
      if(result){
        if(result.value.deliveredDigests)await deps.finalizeImages(run!,store,result.value.deliveredDigests);
        await store.checkpoint({resultRef:result.path,businessSuccess:result.value.businessSuccess},"settlement_pending",0);
        return store.settle();
      }
      const attempts=await store.attempts();
      const unrecoverable=attempts.some(a=>["submitting","submitted","unknown","result_ready"].includes(a.state)||a.delivered_images>0||(run!.operation==="poster_plan"&&a.state==="stored"));
      if(unrecoverable)return deps.review(run!,"response_incomplete");
      for(const attempt of attempts.filter(a=>a.state==="prepared"))await store.advance(attempt.id,{state:"cancelled"});
      await store.checkpoint({businessSuccess:false},"settlement_pending",0);return store.settle();
    })();
    await deps.heartbeat(journalReady,journalReady?undefined:"journal_unavailable");
    return{ok:journalReady,processed:Boolean(run)};
  }catch(error){
    if(run&&error instanceof ExecutionControlError&&error.code==="execution_yield"){
      await deps.defer(run);return{ok:journalReady,processed:true,deferred:true};
    }
    if(run&&error instanceof ExecutionControlError&&error.code==="outcome_unknown"){
      await deps.review(run,"provider_outcome_unknown");return{ok:journalReady,processed:true,needsReview:true};
    }
    await deps.heartbeat(false,"executor_error").catch(()=>{});
    throw error;
  }finally{if(timer)clearInterval(timer);active=false;}
  });
}
