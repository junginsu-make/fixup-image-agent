import { beforeEach, expect, it, vi } from "vitest";
import type { ExecutionStore, GenerationRun } from "../types";
vi.mock("server-only",()=>({}));
import { executeGenerationTick, type ExecutorDependencies } from "../executor";
import { assertNewProviderCall } from "../deadline";
let deps:ExecutorDependencies;let run:GenerationRun;let store:ExecutionStore;
beforeEach(()=>{
  run={id:"run",user_id:"owner",operation:"sns_image",state:"prepared",checkpoint:{},execution_snapshot:{},lease_token:"lease"} as GenerationRun;
  store={attempts:vi.fn(async()=>[]),checkpoint:vi.fn(async()=>run),settle:vi.fn(async()=>run),advance:vi.fn()} as unknown as ExecutionStore;
  deps={admission:vi.fn(async()=>true),member:vi.fn(async r=>r),claim:vi.fn(async()=>run),store:()=>store,sns:vi.fn(async()=>run),poster:vi.fn(async()=>run),journal:vi.fn(async()=>0),heartbeat:vi.fn(async()=>{}),
    result:vi.fn(async()=>undefined),finalizeImages:vi.fn(async()=>{}),review:vi.fn(async()=>{}),defer:vi.fn(async()=>{})};
});
it("updates heartbeat even when there is no queued work",async()=>{
  deps.claim=vi.fn(async()=>null);
  expect(await executeGenerationTick(deps)).toMatchObject({ok:true,processed:false});
  expect(deps.heartbeat).toHaveBeenCalledWith(true,undefined);
});
it("advances SNS through the server dispatcher without a browser status request",async()=>{
  await executeGenerationTick(deps);expect(deps.sns).toHaveBeenCalledWith(run);expect(deps.poster).not.toHaveBeenCalled();
});
it("recovers a stored synchronous response through settlement without invoking a provider",async()=>{
  run.operation="pdp_image";
  deps.result=vi.fn(async()=>({path:"owner/run/result-1.json",value:{businessSuccess:true,deliveredDigests:["digest"]}}));
  await executeGenerationTick(deps);
  expect(deps.finalizeImages).toHaveBeenCalledWith(run,store,["digest"]);
  expect(store.checkpoint).toHaveBeenCalledWith({resultRef:"owner/run/result-1.json",businessSuccess:true},"settlement_pending",0);
  expect(store.settle).toHaveBeenCalledOnce();expect(deps.sns).not.toHaveBeenCalled();expect(deps.poster).not.toHaveBeenCalled();
});
it("keeps incomplete provider submissions for review instead of silently refunding",async()=>{
  run.operation="redesign_generate";
  store.attempts=vi.fn(async()=>[{state:"submitting"}] as never);
  await executeGenerationTick(deps);
  expect(deps.review).toHaveBeenCalledWith(run,"response_incomplete");expect(store.settle).not.toHaveBeenCalled();
});
it("a broken journal blocks new paid work but leaves the execution queued",async()=>{
  deps.journal=vi.fn(async()=>{throw new Error("disk unavailable");});
  const paid=vi.fn();deps.sns=async()=>{assertNewProviderCall();paid();};
  expect(await executeGenerationTick(deps)).toMatchObject({ok:false,deferred:true});
  expect(paid).not.toHaveBeenCalled();expect(deps.defer).toHaveBeenCalledWith(run);
});
it("does not overlap ticks inside the same web process",async()=>{
  let release!:()=>void;
  deps.journal=()=>new Promise<void>(resolve=>{release=resolve;});
  const first=executeGenerationTick(deps);
  expect(await executeGenerationTick(deps)).toMatchObject({busy:true,processed:false});
  release();await first;expect(deps.claim).toHaveBeenCalledOnce();
});
it("an intentional admission pause defers new work without marking the executor unhealthy",async()=>{
  deps.admission=async()=>false;deps.sns=async()=>{assertNewProviderCall();};
  expect(await executeGenerationTick(deps)).toMatchObject({ok:true,deferred:true});
  expect(deps.heartbeat).toHaveBeenCalledWith(true,undefined);
});
