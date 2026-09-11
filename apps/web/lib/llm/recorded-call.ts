import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { ExecutionControlError, llmUsdFromTokens, priceOf } from "@fixup/shared";
import type { InvokeProvider } from "@fixup/shared";
import type { ExecutionStore } from "../generation/types";
import { inputHash } from "../generation/run-store";
import { tokensFrom } from "./meter";

interface Context { store: ExecutionStore; prefix: string; sequence: number; calls: number; maxCalls: number }
const context=new AsyncLocalStorage<Context>();
// Standard web_search call fee; content tokens are already in model usage.
// https://developers.openai.com/api/docs/pricing (checked 2026-09-11)
const WEB_SEARCH_CALL_MICROUSD=10000;
async function ledger<T>(operation:()=>Promise<T>):Promise<T> {
  try{return await operation();}catch{throw new ExecutionControlError("storage_unavailable");}
}
export const MAX_RECORDED_LLM_INPUT_BYTES=120_000;
export const MAX_RECORDED_LLM_OUTPUT_TOKENS=4096;
// Conservative internal estimate, not a promise about a provider invoice.
export function llmCallUpperMicrousd(model:string,images=9,maxOutput=MAX_RECORDED_LLM_OUTPUT_TOKENS) {
  return Math.ceil(llmUsdFromTokens(model,MAX_RECORDED_LLM_INPUT_BYTES+images*65536,maxOutput)*1_000_000);
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
    if("inlineData" in value)return {type:"google_image",imageDigest:inputHash(value)};
    if("type" in value && ["image","input_image"].includes(String(value.type)))return {type:value.type,imageDigest:inputHash(value)};
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,inputSummary(v,k)]));
  }
  return value;
}
export async function recordedLlmCall<T>(provider:string,model:string,input:unknown,call:()=>Promise<T>,maxOutput=MAX_RECORDED_LLM_OUTPUT_TOKENS):Promise<T> {
  const current=context.getStore();
  if(!current)return call();
  const summary=inputSummary(input);
  const payload=JSON.stringify(summary);
  const maxTools=input&&typeof input==="object"&&"max_tool_calls" in input?Number(input.max_tool_calls):0;
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
    attempt=existing??await current.store.prepare({step,sequence,provider,model,endpoint:"llm",requestHash:inputHash(summary),payload:{input:summary,maxOutputTokens:maxOutput},
      price:{tokenPrice:priceOf(model),webSearchCallMicrousd:WEB_SEARCH_CALL_MICROUSD},maxCostMicrousd:llmCallUpperMicrousd(model,9,maxOutput)+Math.max(0,maxTools)*WEB_SEARCH_CALL_MICROUSD,requestedImages:0});
    await current.store.advance(attempt.id,{state:"submitting"});
  } catch {throw new ExecutionControlError("storage_unavailable");}
  claimPaidCall();
  let response:T;
  try {response=await call();}
  catch(error) {
    const status=error && typeof error==="object" ? ("providerStatus" in error?Number(error.providerStatus):"status" in error?Number(error.status):0):0;
    if([400,401,403,404,422,429].includes(status)) {
      await ledger(()=>current.store.advance(attempt.id,{state:"failed",costMicrousd:0,meteringState:"estimated",errorCode:`provider_${status}`}));
      throw error;
    }
    await ledger(()=>current.store.advance(attempt.id,{state:"unknown",errorCode:"llm_outcome_unknown"}));
    throw new ExecutionControlError("outcome_unknown");
  }
  try {
    const tokens=tokensFrom(response);
    const toolCalls=response&&typeof response==="object"&&"output" in response&&Array.isArray(response.output)
      ?response.output.filter(item=>item?.type==="web_search_call").length
      :response&&typeof response==="object"&&"toolCalls" in response?Number(response.toolCalls):0;
    const output={response:JSON.parse(JSON.stringify(response)) as unknown};
    await current.store.advance(attempt.id,{state:"result_ready",output,...(tokens?{
      costMicrousd:Math.round(llmUsdFromTokens(model,tokens.input,tokens.output)*1_000_000)+Math.max(0,toolCalls)*WEB_SEARCH_CALL_MICROUSD,inputTokens:tokens.input,outputTokens:tokens.output,meteringState:"observed" as const,
    }:{meteringState:"unknown" as const})});
    await current.store.advance(attempt.id,{state:"stored",output});
  } catch {throw new ExecutionControlError("storage_unavailable");}
  return response;
}
export const invokeRecordedLlm:InvokeProvider=(meta,call)=>recordedLlmCall(meta.provider,meta.model,meta.request,call,meta.maxOutputTokens);
