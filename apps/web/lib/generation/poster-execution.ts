import "server-only";
import { buildPosterJob, posterImageRows, type PosterJobInput, type PosterProjectRecord } from "@fixup/poster-core";
import { creditUnits } from "@fixup/shared";
import { createPosterFalClients } from "../poster/providers";
import { savePosterResult } from "../poster/save-result";
import { beginRun, executionStore, existingRun, inputHash, requestKey } from "./run-store";
import { advanceQueueAttempt } from "./coordinator";
import { isTerminal, publicRun, type GenerationRun } from "./types";
import { generationArtifacts } from "./artifacts";

type Job = PosterJobInput & { parentImageId?: string; editInstruction?: string };
export function posterIdentity(project: PosterProjectRecord, edit?: unknown) {
  const { reservationId: _legacy, ...data } = project.data;
  return { projectId: project.id, model: project.modelId, ratio: project.ratio, data, edit };
}
export async function replayPosterRun(request: Request, userId: string, project: PosterProjectRecord, edit?: unknown) {
  const run = await existingRun(userId,requestKey(request),project.id,posterIdentity(project,edit),"poster_image");
  return run ? posterRunResponse(run) : undefined;
}
export function posterRunResponse(run: GenerationRun) {
  return Response.json({ok:true,runId:run.id,run:publicRun(run),submission:{runId:run.id}});
}
export async function beginPosterRun(request:Request,userId:string,project:PosterProjectRecord,job:Job,edit?:unknown) {
  const built=buildPosterJob(job);
  if(built.rejected)throw new Error(built.rejected);
  const unit=built.estimate.unitUsd;
  const total=built.estimate.totalUsd;
  if(unit===undefined || total===undefined || !Number.isFinite(total) || total<=0)throw new Error("price_unavailable");
  const run=await beginRun({userId,key:requestKey(request),operation:"poster_image",units:creditUnits(total),resourceType:"poster",resourceId:project.id,
    identity:posterIdentity(project,edit),snapshot:{kind:"poster",job,built},maxCostMicrousd:Math.ceil(total*1_000_000)});
  return posterRunResponse(run);
}

/** Called only with a DB-claimed run. All remote identity comes from that run. */
export async function tickPosterRun(run:GenerationRun) {
  if(isTerminal(run.state)||run.state==="needs_reconciliation")return run;
  const store=executionStore(run);
  if(run.state==="settlement_pending") {
    return store.settle();
  }
  const job=run.execution_snapshot.job as Job;
  const built=run.execution_snapshot.built as Exclude<ReturnType<typeof buildPosterJob>,{rejected:string}>;
  if(!job||!built||job.projectId!==run.resource_id||!built.endpoint)throw new Error("invalid_server_snapshot");
  const unit=built.estimate.unitUsd;
  if(unit===undefined||!Number.isFinite(unit)||unit<=0)throw new Error("price_unavailable");
  let attempt=(await store.attempts())[0];
  if(!attempt) {
    attempt=await store.prepare({step:"poster-images",sequence:0,provider:"fal",model:job.modelId,endpoint:built.endpoint,
      requestHash:inputHash(built.input),payload:built.input,price:{chargeUnitMicrousd:Math.round(unit*1_000_000),providerUnitMicrousd:Math.round(unit*1_000_000)},
      maxCostMicrousd:run.max_cost_microusd,requestedImages:job.variants});
  }
  const artifacts=generationArtifacts(run);
  // A compatibility projection, bound to this server attempt BEFORE submission.
  await artifacts.posterRequest(attempt,{projectId:job.projectId,parentImageId:job.parentImageId??null,editInstruction:job.editInstruction??null,
    modelId:job.modelId,ratioId:job.ratioId,mode:built.mode,size:built.size,requestedImages:job.variants,unitCostUsd:unit,costApproximate:built.estimate.approximate===true});
  if(run.stop_requested_at && attempt.state==="prepared")attempt=await store.advance(attempt.id,{state:"cancelled"});
  else attempt=await advanceQueueAttempt(attempt,store,createPosterFalClients().queue,async images=>{
    const paths:string[]=[];const thumbPaths:Array<string|null>=[];
    for(const [index,image] of images.entries()) {
      const saved=await savePosterResult(run.user_id,job.projectId,attempt!.id,index,image.url);
      paths.push(saved.assetPath);thumbPaths.push(saved.thumbPath);
    }
    const rows=posterImageRows({projectId:job.projectId,generationRequestId:attempt!.id,images,paths,thumbPaths});
    await artifacts.posterImages(rows);
    return {deliveredImages:rows.length,output:{paths,thumbPaths}};
  });
  if(attempt.state==="unknown")return run;
  await artifacts.completePoster(attempt);
  const done=["stored","failed","cancelled"].includes(attempt.state);
  await store.checkpoint({},done?"settlement_pending":"collecting");
  if(done)return store.settle();
  return run;
}
