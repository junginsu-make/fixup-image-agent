/*
 * ("use client" 를 두지 않는다 — 화면 진입점(`redesign-wizard.tsx`) 아래다.
 * 까닭은 `redesign-results.tsx` 머리말과 같다.)
 */
import { useCreditUnit } from "../_components/credit-policy-provider";
import { WorkingStatus } from "../_components/working-status";
import { models, type GenerationPlan, type GenerationProgress } from "./redesign-model";

type Count = { done: number; total: number };

/**
 * **센 것이 있을 때만 장 수를 준다.**
 *
 * 여러 장이면 끝난 장 수, 한 장이면 원본을 옮겨 적는 구간 수(전사 배치)다.
 * 둘 다 없으면 흐르는 막대만 — 지어낸 진행률은 쓰지 않는다(`generation-progress.ts`).
 */
function workingProgress(plan: GenerationPlan, transcribeCount: Count | null) {
  const total = plan.displayCount || plan.count;
  if (total > 1) return { done: Math.max(0, (plan.displayIndex || 1) - 1), total };
  if (transcribeCount && transcribeCount.total > 0) return { ...transcribeCount, unit: "구간" };
  return undefined;
}

/**
 * 리디자인이 만드는 동안 화면 맨 위에 뜨는 띠.
 *
 * **전체 화면 창을 띠로 바꿨다**(2026-10-08 사용자 승인). 창이 화면을 덮어
 * 만드는 동안 결과도 다른 섹션도 볼 수 없었다. 창이 보이던 구간 수·걸린 시간·
 * 지금 하는 일·차감 안내·취소는 띠로 옮겼다. 넘겨 보이던 상세페이지 팁만 뺐다.
 */
export function RedesignWorkingStatus({ progress, plan, editing, transcribeCount, onStop, className }: {
  progress: GenerationProgress;
  plan: GenerationPlan;
  /** 섹션 수정이면 참. 수정은 원본을 다시 읽지 않아 생성 구간 이름을 띄우지 않는다. */
  editing: boolean;
  transcribeCount: Count | null;
  /** 창의 「요청 취소」와 같은 손잡이. 요청을 끊는다. */
  onStop: () => void;
  className?: string;
}) {
  const 단위 = useCreditUnit();
  const total = plan.displayCount || plan.count;
  const modelLabel = models[plan.model].label;
  const 늦어짐 = progress.elapsedSeconds >= 120 && plan.model === "openai";
  const 남음 = progress.note.endsWith("남음");
  return (
    <WorkingStatus
      label={editing ? "섹션 고치는 중입니다" : total > 1 ? `${total}장 만드는 중입니다` : "리디자인 만드는 중입니다"}
      hint={editing ? undefined : progress.label}
      startedAt={plan.startedAt}
      progress={workingProgress(plan, transcribeCount)}
      remaining={남음 ? progress.note : undefined}
      onStop={onStop}
      className={className}
    >
      <p className="text-xs text-muted-foreground">
        {modelLabel} · 성공 시 현재 요청에서 최대 {total}{단위} 차감됩니다.{!남음 && progress.note ? ` ${progress.note}` : ""}
      </p>
      {늦어짐 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          정밀형은 이미지 편집 요청이 2분 이상 걸릴 수 있습니다. 특히 긴 상세페이지 캡처나 참조 이미지가 여러 장이면 응답 시간이 길어질 수 있어요.
        </p>
      ) : null}
    </WorkingStatus>
  );
}
