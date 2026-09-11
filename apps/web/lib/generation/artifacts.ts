import "server-only";
import { randomUUID } from "node:crypto";
import type { PosterImageStore, PosterRequestStore } from "@fixup/poster-core";
import { getLocalDatabase, isLocalStoreEnabled } from "../local-store";
import { createLocalPosterImageStore, type PosterLocalData } from "../poster/local-store";
import { imageInsertRows, requestInsertRow } from "../poster/supabase-store-core";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { SnsFlowState } from "../../app/api/sns/flow-service";
import type { GenerationRequestCreate } from "@fixup/sns-core";
import type { GenerationAttempt, GenerationRun } from "./types";

/** Projections for existing result screens; the run/attempt ledger remains authoritative. */
export function generationArtifacts(run:GenerationRun) {
  const local=isLocalStoreEnabled();
  function check(a:GenerationAttempt){if(a.run_id!==run.id)throw new Error("attempt_run_mismatch");}
  return {
    async ensureSnsCards(cards:SnsFlowState["cards"]) {
      if(local)return getLocalDatabase().update(data=>{
        for(const c of cards)if(!data.cards.some(row=>row.userId===run.user_id&&row.projectId===run.resource_id&&row.index===c.index))
          data.cards.push({id:randomUUID(),userId:run.user_id,projectId:run.resource_id!,index:c.index,kind:c.kind,role:c.role,copy:c.copy,prompt:null,assetPath:null,status:"pending",review:null,error:null});
      });
      const {error}=await createSupabaseAdminClient().from("sns_cards").upsert(cards.map(c=>({user_id:run.user_id,project_id:run.resource_id,index:c.index,kind:c.kind,role:c.role,copy:c.copy,prompt:null})),{onConflict:"project_id,index",ignoreDuplicates:true});
      if(error)throw new Error(error.message);
    },
    async snsRequest(a:GenerationAttempt,input:{cardIndex:number;modelId:string;mode:"i2i"|"t2i";size:GenerationRequestCreate["size"];unitCostUsd:number}) {
      check(a);
      if(local)return getLocalDatabase().update(data=>{
        if(data.generationRequests.some(r=>r.id===a.id))return;
        data.generationRequests.push({id:a.id,userId:run.user_id,projectId:run.resource_id!,...input,requestedImages:1,returnedImages:0,falRequestId:a.provider_request_id,costUsd:null,createdAt:new Date().toISOString()});
      });
      const {error}=await createSupabaseAdminClient().from("sns_generation_requests").upsert({id:a.id,run_id:run.id,attempt_id:a.id,user_id:run.user_id,project_id:run.resource_id,
        card_index:input.cardIndex,model_id:input.modelId,mode:input.mode,size:input.size,requested_images:1,returned_images:0,unit_cost_usd:input.unitCostUsd,cost_usd:null},{onConflict:"id",ignoreDuplicates:true});
      if(error)throw new Error(error.message);
    },
    async completeSns(a:GenerationAttempt,count:number) {
      check(a);const cost=(a.price_snapshot.providerUnitMicrousd??0)*count/1_000_000;
      if(local)return getLocalDatabase().update(data=>{
        const r=data.generationRequests.find(r=>r.id===a.id&&r.userId===run.user_id);if(!r)throw new Error("request_not_found");Object.assign(r,{falRequestId:a.provider_request_id,returnedImages:count,costUsd:cost});
      });
      const {error}=await createSupabaseAdminClient().from("sns_generation_requests").update({fal_request_id:a.provider_request_id,returned_images:count,cost_usd:cost}).eq("id",a.id).eq("run_id",run.id);
      if(error)throw new Error(error.message);
    },
    async posterRequest(a:GenerationAttempt,row:Parameters<PosterRequestStore["create"]>[0]) {
      check(a);
      if(local)return getLocalDatabase().update(raw=>{
        const data=raw as unknown as PosterLocalData;data.posterRequests??=[];
        if(!data.posterRequests.some(r=>r.id===a.id))data.posterRequests.push({...row,id:a.id,userId:run.user_id,falRequestId:null,returnedImages:0,costUsd:null,createdAt:new Date().toISOString()});
      });
      const {error}=await createSupabaseAdminClient().from("poster_generation_requests").upsert({id:a.id,run_id:run.id,attempt_id:a.id,...requestInsertRow(run.user_id,row)},{onConflict:"id",ignoreDuplicates:true});
      if(error)throw new Error(error.message);
    },
    async completePoster(a:GenerationAttempt) {
      check(a);const cost=a.returned_images?(a.price_snapshot.providerUnitMicrousd??0)*a.returned_images/1_000_000:null;
      if(local)return getLocalDatabase().update(raw=>{
        const r=(raw as unknown as PosterLocalData).posterRequests?.find(r=>r.id===a.id&&r.userId===run.user_id);if(!r)throw new Error("request_not_found");
        Object.assign(r,{falRequestId:a.provider_request_id,returnedImages:a.returned_images,costUsd:cost});
      });
      const {error}=await createSupabaseAdminClient().from("poster_generation_requests").update({fal_request_id:a.provider_request_id,returned_images:a.returned_images,cost_usd:cost}).eq("id",a.id).eq("run_id",run.id);
      if(error)throw new Error(error.message);
    },
    async posterImages(rows:Parameters<PosterImageStore["add"]>[0]) {
      if(rows.some(r=>r.projectId!==run.resource_id))throw new Error("project_mismatch");
      if(local){await createLocalPosterImageStore(getLocalDatabase(),run.user_id).add(rows);return;}
      const {error}=await createSupabaseAdminClient().from("poster_images").upsert(imageInsertRows(run.user_id,rows),{onConflict:"generation_request_id,variant_index",ignoreDuplicates:true});
      if(error)throw new Error(error.message);
    },
  };
}
