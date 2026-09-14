import { AsyncLocalStorage } from "node:async_hooks";
import { ExecutionControlError } from "@fixup/shared";
const context=new AsyncLocalStorage<{until:number;allowNewCalls:boolean}>();
export function withExecutionDeadline<T>(until:number,allowNewCalls:boolean,call:()=>Promise<T>){return context.run({until,allowNewCalls},call);}
export function allowExecutionSubmissions(allowed:boolean){const current=context.getStore();if(current)current.allowNewCalls=allowed;}
export function assertNewProviderCall(requiredMs=125_000){
  const current=context.getStore();
  if(current&&(!current.allowNewCalls||current.until-Date.now()<requiredMs))throw new ExecutionControlError("execution_yield");
}
export const boundedProviderFetch:typeof fetch=(input,init)=>{
  const current=context.getStore();
  const timeout=Math.min(30_000,current?current.until-Date.now()-1000:30_000);
  if(timeout<=0)throw new ExecutionControlError("execution_yield");
  const deadline=AbortSignal.timeout(timeout);
  return fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,deadline]):deadline});
};
export const boundedExecutorDatabaseFetch:typeof fetch=(input,init)=>context.getStore()?boundedProviderFetch(input,init):fetch(input,init);
