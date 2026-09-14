import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import { GENERATION_SCHEMA_VERSION } from "./operations";
export interface GenerationRuntime { protocol:2;releaseId:string;executorId:string }
export async function generationRuntime():Promise<GenerationRuntime>{
  const executorId=process.env.GENERATION_EXECUTOR_ID??"primary";
  if(process.env.NODE_ENV!=="production")return{protocol:2,releaseId:process.env.GENERATION_RELEASE_ID??"development",executorId};
  const info=JSON.parse(await readFile(path.join(process.cwd(),"generation-release.json"),"utf8"));
  if(info.protocol!==2||info.schemaVersion!==GENERATION_SCHEMA_VERSION||typeof info.releaseId!=="string"||!/^[a-f0-9]{40}$/.test(info.releaseId))throw new Error("invalid_generation_release");
  return{protocol:2,releaseId:info.releaseId,executorId};
}
export async function recordExecutorHeartbeat(runtime:GenerationRuntime,ok:boolean,errorCode?:string){
  if(isLocalStoreEnabled())return;
  const{error}=await createSupabaseAdminClient().rpc("record_generation_executor_tick",{p_executor:runtime.executorId,p_release:runtime.releaseId,p_ok:ok,p_error:errorCode??null});
  if(error)throw new Error("executor_heartbeat_unavailable");
}
export async function generationRuntimeStatus(runtime:GenerationRuntime){
  if(isLocalStoreEnabled())return{ok:true,protocol:2,schemaVersion:GENERATION_SCHEMA_VERSION,releaseId:runtime.releaseId,executorFresh:true,admissionEnabled:true,budgetConfigured:true};
  const admin=createSupabaseAdminClient();
  const [status,health]=await Promise.all([
    admin.rpc("generation_runtime_status"),
    admin.from("generation_executor_health").select("release_id,succeeded_at,error_code").eq("executor_id",runtime.executorId).maybeSingle(),
  ]);
  if(status.error||health.error)throw new Error("executor_status_unavailable");
  const sameRelease=health.data?.release_id===runtime.releaseId;
  const fresh=sameRelease&&!health.data?.error_code&&Date.now()-Date.parse(health.data?.succeeded_at??"")<300_000;
  return{...status.data,releaseId:runtime.releaseId,executorFresh:fresh,ok:status.data?.protocol===2&&status.data?.schemaVersion===GENERATION_SCHEMA_VERSION&&fresh};
}
