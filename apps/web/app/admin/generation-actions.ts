"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../lib/membership/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { readCachedResult, readCachedResultEntry } from "../../lib/generation/result-cache";
import { inputHash } from "../../lib/generation/run-store";
import type { GenerationRun } from "../../lib/generation/types";
function usd(value:FormDataEntryValue|null,allowZero=false){
  if(value===null||value==="")return null;
  const micros=Math.round(Number(value)*1_000_000);
  if(!Number.isSafeInteger(micros)||micros<(allowZero?0:1))throw new Error("금액을 확인해 주세요.");
  return micros;
}
export async function updateGenerationControls(form:FormData){
  const actor=await requireAdmin();
  const {error}=await createSupabaseAdminClient().rpc("set_generation_controls",{
    p_actor:actor.user.id,p_enabled:form.get("enabled")==="on",p_daily:usd(form.get("dailyUsd")),p_unresolved:usd(form.get("unresolvedUsd")),p_reason:String(form.get("reason")??"").trim(),
  });
  if(error)throw new Error("생성 예산을 저장하지 못했습니다. 처리기 상태와 입력값을 확인해 주세요.");
  revalidatePath("/admin");
}
export async function resolveGenerationCost(form:FormData){
  const actor=await requireAdmin();const id=String(form.get("attemptId")??"");
  if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new Error("호출 ID를 확인해 주세요.");
  const admin=createSupabaseAdminClient();
  const attempt=await admin.from("generation_attempts").select("id,state,run_id").eq("id",id).single();
  if(attempt.error)throw new Error("대조할 호출을 읽지 못했습니다.");
  if(attempt.data.state!=="stored"){
    const row=await admin.from("generation_runs").select("*").eq("id",attempt.data.run_id).single();
    if(row.error)throw new Error("실행을 읽지 못했습니다.");
    const run=row.data as GenerationRun;
    const [image,result]=await Promise.all([readCachedResult<{base64:string}>(run,`${id}-artifact`),readCachedResultEntry<{deliveredDigests?:string[]}>(run)]);
    if(image&&result?.value.deliveredDigests?.includes(inputHash(image.base64)))throw new Error("이미 제공된 결과가 있습니다. 실패로 처리할 수 없습니다.");
  }
  const cost=usd(form.get("costUsd"),true);if(cost===null)throw new Error("확인한 원가를 입력해 주세요.");
  const{error}=await admin.rpc("resolve_generation_attempt",{p_actor:actor.user.id,p_attempt:id,p_cost:cost,p_evidence:String(form.get("evidence")??"").trim(),p_reason:String(form.get("reason")??"").trim()});
  if(error)throw new Error("대조 결과를 반영하지 못했습니다. 호출 상태를 다시 확인해 주세요.");
  revalidatePath("/admin");
}
