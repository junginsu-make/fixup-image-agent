import { requireAdmin } from "../../lib/membership/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { isLocalStoreEnabled } from "../../lib/local-store";
import { generationRuntime, generationRuntimeStatus } from "../../lib/generation/runtime";
import { updateGenerationControls, resolveGenerationCost } from "./generation-actions";
import { Button, Input } from "@fixup/ui";
export async function GenerationControls(){
  await requireAdmin();
  if(isLocalStoreEnabled())return <p className="text-sm text-muted-foreground">로컬 모드에서는 운영 생성 예산을 변경하지 않습니다.</p>;
  const admin=createSupabaseAdminClient();
  const [policy,runs,status]=await Promise.all([
    admin.from("usage_controls").select("*").single(),
    admin.from("generation_runs").select("id,operation,error_code,generation_attempts(id,model,state,measured_cost_microusd)").eq("state","needs_reconciliation").order("created_at").limit(20),
    generationRuntime().then(generationRuntimeStatus).catch(()=>({ok:false})),
  ]);
  if(policy.error||runs.error)return <p className="text-sm text-destructive">생성 운영 정보를 읽지 못했습니다.</p>;
  return <details className="rounded-xl border bg-card p-4">
    <summary className="cursor-pointer font-semibold">생성 운영 제어 · {status.ok?"처리기 정상":"처리기 확인 필요"}</summary>
    <form action={updateGenerationControls} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">일일 제공자 예산 (USD)<Input name="dailyUsd" type="number" min="0.01" step="0.01" defaultValue={policy.data.daily_cost_limit_microusd==null?"":policy.data.daily_cost_limit_microusd/1_000_000}/></label>
      <label className="text-sm">미해결 작업 최대 확보액 (USD)<Input name="unresolvedUsd" type="number" min="0.01" step="0.01" defaultValue={policy.data.unresolved_exposure_limit_microusd==null?"":policy.data.unresolved_exposure_limit_microusd/1_000_000}/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={policy.data.admission_enabled}/> 새 생성 허용</label>
      <Input name="reason" placeholder="변경 사유" required minLength={3} maxLength={1000}/>
      <p className="text-sm text-muted-foreground sm:col-span-2">허용을 끄면 새 유료 호출을 중단하고, 이미 받은 결과의 회수·정산은 계속합니다. 예산이 미설정이거나 처리기 신호가 없으면 개방할 수 없습니다.</p>
      <Button type="submit">운영 설정 저장</Button>
    </form>
    <div className="mt-6 space-y-3">
      <h3 className="font-semibold">대조 필요 {runs.data?.length??0}건 <span className="text-xs font-normal">(최대 20건 표시)</span></h3>
      <p className="text-sm text-muted-foreground">제공자 기록에서 확인한 원가와 증거 식별자를 입력합니다. 결과가 불명확한 호출은 대조 상태로 유지하세요.</p>
      {(runs.data??[]).map(run=><div key={run.id} className="rounded border p-3 text-sm">
        <p>{run.operation} · {run.error_code}</p><p className="break-all text-xs text-muted-foreground">{run.id}</p>
        {(run.generation_attempts??[]).filter(a=>["unknown","submitting","submitted"].includes(a.state)||(["stored","failed"].includes(a.state)&&a.measured_cost_microusd==null)).map(attempt=><form key={attempt.id} action={resolveGenerationCost} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="attemptId" value={attempt.id}/><p className="sm:col-span-2">{attempt.model} · {attempt.state}</p>
          <Input name="costUsd" type="number" min="0" step="0.000001" placeholder="확인한 원가 USD" aria-label="확인한 원가 USD" required/>
          <Input name="evidence" placeholder="제공자 증거 식별자" aria-label="제공자 증거 식별자" required minLength={3}/>
          <Input name="reason" placeholder="확인 내용과 사유" aria-label="확인 내용과 사유" required minLength={3}/>
          <Button type="submit" variant="outline">{attempt.state==="stored"?"원가 확인 반영":"실패·미제공 확인 반영"}</Button>
        </form>)}
      </div>)}
    </div>
  </details>;
}
