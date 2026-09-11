import "server-only";
import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import { localLedger } from "./local-ledger";
import type { AttemptPatch, AttemptSpec, ExecutionStore, GenerationAttempt, GenerationRun } from "./types";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export function inputHash(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function useDurableGeneration() { return process.env.NODE_ENV === "production" || process.env.GENERATION_EXECUTION_V2 === "1"; }
export function requestKey(request: Request) {
  if(request.headers.get("x-generation-protocol")!=="2")throw new Error("reload_required");
  const key=request.headers.get("x-idempotency-key");
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new Error("idempotency_key_required");
  return key;
}

export function generationFailureResponse(error:unknown):Response|undefined {
  const code=error instanceof Error?error.message:"";
  const messages:Record<string,[number,string]>={
    reload_required:[409,"화면을 새로고침한 뒤 다시 시도해 주세요."],
    idempotency_key_required:[400,"요청 식별자가 필요합니다. 화면을 새로고침해 주세요."],
    idempotency_conflict:[409,"같은 요청 식별자에 다른 내용이 전달됐습니다."],
    concurrent_limit:[429,"이미 처리 중인 생성이 있습니다. 완료 후 다시 시도해 주세요."],
    quota_exceeded:[429,"이번 달 사용 한도를 모두 사용했습니다."],
    team_quota_exceeded:[429,"팀의 이번 달 사용 한도를 모두 사용했습니다."],
    provider_budget_exceeded:[429,"현재 생성 가능한 서비스 사용량을 초과했습니다. 잠시 후 다시 시도해 주세요."],
    analysis_rate_limit:[429,"요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."],
    admission_closed:[503,"생성 서비스를 점검 중입니다. 잠시 후 다시 시도해 주세요."],
    not_owner:[403,"본인이 만든 작업만 변경할 수 있습니다."],inactive_member:[403,"이 계정으로 생성할 수 없습니다."],
    price_unavailable:[503,"생성 비용을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."],
  };
  const mapped=messages[code];return mapped?Response.json({ok:false,code,message:mapped[1]},{status:mapped[0]}):undefined;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const {data,error}=await createSupabaseAdminClient().rpc(name,args);
  if(error) throw new Error(error.message);
  return data as T;
}
export async function beginRun(input: {
  userId: string; key: string; operation: string; units: number;
  resourceType?: "sns" | "poster" | "character"; resourceId?: string;
  snapshot: Record<string, unknown>; identity: unknown; maxCostMicrousd: number;
}) {
  if(isLocalStoreEnabled())return localLedger().begin({...input,inputHash:inputHash(input.identity)});
  return rpc<GenerationRun>("begin_generation_v2", {p_input:{...input,inputHash:inputHash(input.identity)}});
}
export async function existingRun(userId:string,key:string,resourceId:string,identity:unknown,operation:string) {
  if(isLocalStoreEnabled()) {
    const data=await localLedger().existing(userId,key);if(!data)return null;
    if(data.resource_id!==resourceId||data.operation!==operation||data.input_hash!==inputHash(identity))throw new Error("idempotency_conflict");return data;
  }
  const {data,error}=await createSupabaseAdminClient().from("generation_runs").select("*").eq("user_id",userId).eq("idempotency_key",key).maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)return null;
  if(data.resource_id!==resourceId||data.operation!==operation||data.input_hash!==inputHash(identity))throw new Error("idempotency_conflict");
  return data as GenerationRun;
}
export function claimRun(id?:string) { return isLocalStoreEnabled()?localLedger().claim(id):rpc<GenerationRun|null>("claim_generation_run",{p_id:id??null}); }
export function executionStore(run:GenerationRun):ExecutionStore {
  if(!run.lease_token)throw new Error("lease_required");
  if(isLocalStoreEnabled())return localLedger().execution(run);
  return {
    prepare:(spec:AttemptSpec)=>rpc<GenerationAttempt>("prepare_generation_attempt",{p_run:run.id,p_token:run.lease_token,p_spec:spec}),
    advance:(id:string,patch:AttemptPatch)=>rpc<GenerationAttempt>("advance_generation_attempt",{p_id:id,p_token:run.lease_token,p_patch:patch}),
    async attempts(){const {data,error}=await createSupabaseAdminClient().from("generation_attempts").select("*").eq("run_id",run.id).order("sequence");if(error)throw new Error(error.message);return data as GenerationAttempt[];},
    checkpoint:(data,state,delay=5)=>rpc<GenerationRun>("checkpoint_generation_run",{p_id:run.id,p_token:run.lease_token,p_checkpoint:data,p_state:state,p_delay_seconds:delay,p_release:true}),
    persist:data=>rpc<GenerationRun>("checkpoint_generation_run",{p_id:run.id,p_token:run.lease_token,p_checkpoint:data,p_state:"running",p_delay_seconds:0,p_release:false}),
    settle:()=>rpc<GenerationRun>("settle_generation_v2",{p_id:run.id,p_token:run.lease_token}),
    async accepted(attempt,providerRequestId){
      const root=process.env.GENERATION_JOURNAL_DIR??"/var/lib/fixup-image-agent/generation";
      await mkdir(root,{recursive:true,mode:0o700});
      await appendFile(path.join(root,"accepted.jsonl"),JSON.stringify({runId:run.id,attemptId:attempt.id,providerRequestId,at:new Date().toISOString()})+"\n",{mode:0o600,flush:true});
    },
  };
}
export async function runForResource(userId:string,kind:"sns"|"poster",resourceId:string,runId?:string){
  if(isLocalStoreEnabled())return localLedger().resource(userId,kind,resourceId,runId);
  let query=createSupabaseAdminClient().from("generation_runs").select("*").eq("user_id",userId).eq("resource_type",kind).eq("resource_id",resourceId)
    .eq("operation",kind==="sns"?"sns_image":"poster_image");
  if(runId)query=query.eq("id",runId);
  const {data,error}=await query.order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error(error.message);
  return data as GenerationRun|null;
}
export function stopRun(userId:string,id:string){return isLocalStoreEnabled()?localLedger().stop(userId,id):rpc<GenerationRun>("request_stop_generation",{p_actor:userId,p_id:id});}
