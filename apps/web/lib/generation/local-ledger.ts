import "server-only";
import { randomUUID } from "node:crypto";
import { getLocalDatabase, type LocalDatabase } from "../local-store";
import { isTerminal, type GenerationRun, type GenerationAttempt, type ExecutionStore } from "./types";

type LocalRun = GenerationRun & { idempotency_key:string;input_hash:string;created_at:string;next_check_at:string;units:number;consumed_units:number };
type OwnedProject = {id:string;userId:string;status:string;data:Record<string,unknown>};
interface LocalLedger { generationRuns?:LocalRun[]; generationAttempts?:GenerationAttempt[]; snsProjects?:OwnedProject[]; posterProjects?:OwnedProject[] }
const runs=(data:LocalLedger)=>data.generationRuns??(data.generationRuns=[]);
const attempts=(data:LocalLedger)=>data.generationAttempts??(data.generationAttempts=[]);
const now=()=>new Date().toISOString();
const imageOps=new Set(["pdp_image","redesign_generate","redesign_edit","poster_image","sns_image"]);
function ownedProject(data:LocalLedger,run:Pick<GenerationRun,"resource_type"|"resource_id"|"user_id">){
  return (run.resource_type==="sns"?data.snsProjects:data.posterProjects)?.find(p=>p.id===run.resource_id&&p.userId===run.user_id);
}
function leased(data:LocalLedger,claimed:GenerationRun) {
  const r=runs(data).find(r=>r.id===claimed.id);
  if(!r||!claimed.lease_token||r.lease_token!==claimed.lease_token||!r.lease_until||Date.parse(r.lease_until)<=Date.now()||isTerminal(r.state)||r.state==="needs_reconciliation")throw new Error("lease_lost");
  return r;
}

/** Development-only ledger in the existing atomic local JSON store. Not a substitute for PostgreSQL/RLS tests. */
export function localLedger(database:LocalDatabase=getLocalDatabase()) {
  return {
    async begin(input:{userId:string;key:string;operation:string;units:number;resourceType?:"sns"|"poster"|"character";resourceId?:string;snapshot:Record<string,unknown>;inputHash:string;maxCostMicrousd:number;inline?:boolean}) {
      return database.update(raw=>{
        const data=raw as unknown as LocalLedger;
        const existing=runs(data).find(r=>r.user_id===input.userId&&r.idempotency_key===input.key);
        if(existing){if(existing.input_hash!==input.inputHash||existing.operation!==input.operation||existing.resource_id!==(input.resourceId??null))throw new Error("idempotency_conflict");return {...existing,lease_token:null,lease_until:null};}
        if(!Number.isInteger(input.units)||input.units<0||input.units>60||!Number.isSafeInteger(input.maxCostMicrousd)||input.maxCostMicrousd<=0)throw new Error("invalid_request");
        if(runs(data).some(r=>r.user_id===input.userId&&!isTerminal(r.state)&&imageOps.has(r.operation)===imageOps.has(input.operation)))throw new Error("concurrent_limit");
        const r:LocalRun={id:randomUUID(),user_id:input.userId,event_id:randomUUID(),operation:input.operation,idempotency_key:input.key,input_hash:input.inputHash,
          resource_type:input.resourceType??null,resource_id:input.resourceId??null,execution_snapshot:structuredClone(input.snapshot),checkpoint:{},state:"prepared",stop_requested_at:null,
          lease_token:null,lease_epoch:0,lease_until:null,error_code:null,max_cost_microusd:input.maxCostMicrousd,result_manifest:{},created_at:now(),next_check_at:now(),units:input.units,consumed_units:0};
        if(input.resourceType==="sns"||input.resourceType==="poster"){
          const p=ownedProject(data,r);if(!p)throw new Error("not_owner");
          if(imageOps.has(input.operation))p.status="generating";
          if(input.operation==="sns_image")p.data.executionFlow=input.snapshot.initialFlow;
        }
        if(input.inline){r.state="running";r.lease_token=randomUUID();r.lease_epoch=1;r.lease_until=new Date(Date.now()+210_000).toISOString();}
        runs(data).push(r);return r;
      });
    },
    async existing(userId:string,key:string){return database.read(raw=>runs(raw as unknown as LocalLedger).find(r=>r.user_id===userId&&r.idempotency_key===key)??null);},
    async resource(userId:string,kind:"sns"|"poster",resourceId:string,id?:string){
      return database.read(raw=>runs(raw as unknown as LocalLedger).filter(r=>r.user_id===userId&&r.resource_type===kind&&r.resource_id===resourceId
        &&r.operation===(kind==="sns"?"sns_image":"poster_image")&&(!id||r.id===id)).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]??null);
    },
    async claim(id?:string){return database.update(raw=>{
      const r=runs(raw as unknown as LocalLedger).filter(r=>(!id||r.id===id)&&!isTerminal(r.state)&&r.state!=="needs_reconciliation"
        &&Date.parse(r.next_check_at)<=Date.now()&&(!r.lease_until||Date.parse(r.lease_until)<Date.now())).sort((a,b)=>a.next_check_at.localeCompare(b.next_check_at))[0];
      if(!r)return null;r.lease_token=randomUUID();r.lease_epoch++;r.lease_until=new Date(Date.now()+210_000).toISOString();return r;
    });},
    async stop(userId:string,id:string){return database.update(raw=>{const r=runs(raw as unknown as LocalLedger).find(r=>r.id===id&&r.user_id===userId);if(!r)throw new Error("not_owner");if(!isTerminal(r.state))r.stop_requested_at??=now();return r;});},
    async renew(claimed:GenerationRun){return database.update(raw=>{const r=runs(raw as unknown as LocalLedger).find(r=>r.id===claimed.id&&r.lease_token===claimed.lease_token&&!isTerminal(r.state)&&r.state!=="needs_reconciliation");if(!r)throw new Error("lease_lost");r.lease_until=new Date(Date.now()+210_000).toISOString();});},
    execution(claimed:GenerationRun):ExecutionStore {
      const checkpoint=(value:Record<string,unknown>,state:"running"|"collecting"|"settlement_pending",delay:number,release:boolean)=>database.update(raw=>{
        const data=raw as unknown as LocalLedger;const r=leased(data,claimed);r.checkpoint=structuredClone(value);r.state=state;r.next_check_at=new Date(Date.now()+delay*1000).toISOString();
        if(release&&state!=="settlement_pending")r.lease_until=now();
        const p=ownedProject(data,r);if(p&&r.resource_type==="sns"&&value.flow){p.data.executionFlow=value.flow;p.status="generating";}
        return r;
      });
      return {
        async attempts(){return database.read(raw=>attempts(raw as unknown as LocalLedger).filter(a=>a.run_id===claimed.id));},
        async prepare(spec){return database.update(raw=>{
          const data=raw as unknown as LocalLedger;const r=leased(data,claimed);if(r.stop_requested_at)throw new Error("stop_requested");
          const previous=attempts(data).find(a=>a.run_id===r.id&&a.logical_step===spec.step&&a.sequence===spec.sequence);if(previous)return previous;
          if(attempts(data).filter(a=>a.run_id===r.id).reduce((sum,a)=>sum+a.estimated_cost_microusd,0)+spec.maxCostMicrousd>r.max_cost_microusd)throw new Error("attempt_budget_exceeded");
          const a:GenerationAttempt={id:randomUUID(),run_id:r.id,logical_step:spec.step,sequence:spec.sequence,state:"prepared",provider:spec.provider,model:spec.model,endpoint:spec.endpoint,
            provider_request_id:null,request_payload:spec.payload,price_snapshot:spec.price,output_manifest:null,estimated_cost_microusd:spec.maxCostMicrousd,requested_images:spec.requestedImages,returned_images:0,delivered_images:0};
          attempts(data).push(a);return a;
        });},
        async advance(id,patch){return database.update(raw=>{
          const data=raw as unknown as LocalLedger;const r=leased(data,claimed);const a=attempts(data).find(a=>a.id===id&&a.run_id===r.id);if(!a)throw new Error("attempt_not_found");
          const allowed:Record<string,string[]>={prepared:["submitting","cancelled"],submitting:["submitted","result_ready","failed","unknown"],submitted:["result_ready","failed","unknown","cancelled"],result_ready:["stored","failed","unknown"]};
          if(a.state!==patch.state&&!allowed[a.state]?.includes(patch.state))throw new Error("invalid_transition");
          if(patch.state==="submitting"&&r.stop_requested_at)throw new Error("stop_requested");
          if(a.provider_request_id&&patch.providerRequestId&&a.provider_request_id!==patch.providerRequestId)throw new Error("attempt_conflict");
          a.state=patch.state;if(patch.providerRequestId)a.provider_request_id=patch.providerRequestId;if(patch.output)a.output_manifest=patch.output;
          if(patch.costMicrousd!==undefined)a.measured_cost_microusd=patch.costMicrousd;
          if(patch.inputTokens!==undefined)a.input_tokens=patch.inputTokens;if(patch.outputTokens!==undefined)a.output_tokens=patch.outputTokens;
          if(patch.meteringState)a.metering_state=patch.meteringState;if(patch.errorCode)a.error_code=patch.errorCode;
          if(patch.state==="submitting")a.submitted_at=now();
          if(patch.returnedImages!==undefined)a.returned_images=patch.returnedImages;if(patch.deliveredImages!==undefined)a.delivered_images=patch.deliveredImages;
          if(a.delivered_images>a.returned_images||a.returned_images>a.requested_images)throw new Error("invalid_image_count");
          if(a.state==="unknown"){r.state="needs_reconciliation";r.error_code="provider_outcome_unknown";r.lease_until=null;}
          return a;
        });},
        persist:value=>checkpoint(value,"running",0,false),
        checkpoint:(value,state,delay=5)=>checkpoint(value,state,delay,true),
        async settle(){return database.update(raw=>{
          const data=raw as unknown as LocalLedger;const existing=runs(data).find(r=>r.id===claimed.id);if(existing&&isTerminal(existing.state))return existing;
          const r=leased(data,claimed);if(r.state!=="settlement_pending")throw new Error("not_ready_to_settle");
          const list=attempts(data).filter(a=>a.run_id===r.id);if(list.some(a=>!["stored","failed","cancelled"].includes(a.state)))throw new Error("attempts_unresolved");
          let micros=list.reduce((sum,a)=>sum+(a.state==="stored"?(a.price_snapshot.chargeUnitMicrousd??0)*a.delivered_images+(a.price_snapshot.chargeFlatMicrousd??0):0),0);
          let successful=imageOps.has(r.operation)?list.reduce((sum,a)=>sum+a.delivered_images,0):list.filter(a=>a.state==="stored").length;
          if(r.operation==="sns_image"){
            const flow=r.checkpoint.flow as {generation?:{selectedCardIndexes?:number[]};cards?:Array<{index:number;status:string;falRequestId?:string;slotJobs?:Array<{status:string;falRequestId?:string}>}>};
            const made=(flow?.cards??[]).filter(c=>flow.generation?.selectedCardIndexes?.includes(c.index)&&["done","review_required"].includes(c.status));
            successful=made.length;const paid=made.filter(c=>c.falRequestId||c.slotJobs?.some(j=>j.status==="done"&&j.falRequestId)).length;
            if(paid)micros+=(1+paid)*Number(r.execution_snapshot.customerLlmUnitMicrousd??0);
          }
          if(r.checkpoint.businessSuccess===false){successful=0;micros=0;}
          const units=Math.ceil(micros/50000);if(units>r.units){r.state="needs_reconciliation";r.error_code="credit_estimate_exceeded";return r;}
          r.consumed_units=units;r.state=successful?"succeeded":r.stop_requested_at?"cancelled":"failed";r.lease_until=null;
          const p=ownedProject(data,r);if(p&&imageOps.has(r.operation))p.status=r.resource_type==="poster"&&successful?"done":"ready";
          return r;
        });},
      };
    },
  };
}
