import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { ExecutionControlError, llmUsdFromTokens } from "@fixup/shared";
import type { ExecutionStore } from "../generation/types";
import { inputHash } from "../generation/run-store";
import { tokensFrom } from "./meter";

interface Context { store: ExecutionStore; prefix: string; sequence: number; calls: number; maxCalls: number }
const context=new AsyncLocalStorage<Context>();
async function ledger<T>(operation:()=>Promise<T>):Promise<T> {
  try{return await operation();}catch{throw new ExecutionControlError("storage_unavailable");}
}
export const MAX_RECORDED_LLM_INPUT_BYTES=120_000;
export const MAX_RECORDED_LLM_OUTPUT_TOKENS=4096;
// Conservative internal estimate, not a promise about a provider invoice.
export function llmCallUpperMicrousd(model:string,images=9) {
  return Math.ceil(llmUsdFromTokens(model,MAX_RECORDED_LLM_INPUT_BYTES+images*65536,MAX_RECORDED_LLM_OUTPUT_TOKENS)*1_000_000);
}
export function withRecordedLlm<T>(store:ExecutionStore,prefix:string,run:()=>Promise<T>,maxCalls=1) {
  return context.run({store,prefix,sequence:0,calls:0,maxCalls},run);
}
export function claimPaidCall() {
  const current=context.getStore();
  if(!current)return;
  if(current.calls>=current.maxCalls)throw new ExecutionControlError("execution_yield");
  current.calls++;
}
function inputSummary(value:unknown,key=""):unknown {
  if(typeof value==="string"&&/image/i.test(key)&&value.startsWith("data:image/"))return {imageDigest:inputHash(value)};
  if(Array.isArray(value))return value.map(v=>inputSummary(v,key));
  if(value&&typeof value==="object") {
    if("type" in value && ["image","input_image"].includes(String(value.type)))return {type:value.type,imageDigest:inputHash(value)};
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,inputSummary(v,k)]));
  }
  return value;
}
export async function recordedLlmCall<T>(provider:string,model:string,input:unknown,call:()=>Promise<T>):Promise<T> {
  const current=context.getStore();
  if(!current)return call();
  const summary=inputSummary(input);
  const payload=JSON.stringify(summary);
  if(Buffer.byteLength(payload,"utf8")>MAX_RECORDED_LLM_INPUT_BYTES)throw new ExecutionControlError("input_limit");
  const sequence=current.sequence++;
  const step=`${current.prefix}:${provider}:${model}:${sequence}`;
  const existing=(await ledger(()=>current.store.attempts())).find(a=>a.logical_step===step);
  if(existing?.state==="stored" || existing?.state==="result_ready") {
    const value=existing.output_manifest?.response as T;
    if(existing.state==="result_ready")await ledger(()=>current.store.advance(existing.id,{state:"stored",output:existing.output_manifest!}));
    return value;
  }
  if(existing?.state==="failed")throw new Error(existing.logical_step+": provider rejected request");
  if(existing && existing.state!=="prepared") {
    if(existing.state==="submitting")await ledger(()=>current.store.advance(existing.id,{state:"unknown",errorCode:"llm_outcome_unknown"}));
    throw new ExecutionControlError("outcome_unknown");
  }
  if(current.calls>=current.maxCalls)throw new ExecutionControlError("execution_yield");
  let attempt;
  try {
    attempt=existing??await current.store.prepare({step,sequence,provider,model,endpoint:"llm",requestHash:inputHash(summary),payload:{input:summary},price:{},maxCostMicrousd:llmCallUpperMicrousd(model),requestedImages:0});
    await current.store.advance(attempt.id,{state:"submitting"});
  } catch {throw new ExecutionControlError("storage_unavailable");}
  claimPaidCall();
  let response:T;
  try {response=await call();}
  catch(error) {
    const status=error && typeof error==="object" && "status" in error?Number(error.status):0;
    if([400,401,403,404,422,429].includes(status)) {
      await ledger(()=>current.store.advance(attempt.id,{state:"failed",costMicrousd:0,meteringState:"estimated",errorCode:`provider_${status}`}));
      throw error;
    }
    await ledger(()=>current.store.advance(attempt.id,{state:"unknown",errorCode:"llm_outcome_unknown"}));
    throw new ExecutionControlError("outcome_unknown");
  }
  try {
    const tokens=tokensFrom(response);
    const output={response:JSON.parse(JSON.stringify(response)) as unknown};
    await current.store.advance(attempt.id,{state:"result_ready",output,...(tokens?{
      costMicrousd:Math.round(llmUsdFromTokens(model,tokens.input,tokens.output)*1_000_000),inputTokens:tokens.input,outputTokens:tokens.output,meteringState:"observed" as const,
    }:{meteringState:"unknown" as const})});
    await current.store.advance(attempt.id,{state:"stored",output});
  } catch {throw new ExecutionControlError("storage_unavailable");}
  return response;
}
