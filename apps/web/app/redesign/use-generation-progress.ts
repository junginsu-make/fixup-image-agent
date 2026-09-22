import * as React from "react";
import { commerceTips, type GenerationPlan, type GenerationProgress } from "./redesign-model";
import { describeRedesignProgress, type RedesignPhase } from "./generation-progress";
import { estimateGenerationSeconds } from "./redesign-results";

/**
 * **대기 화면이 1초마다 다시 셈하는 것.**
 *
 * 화면 파일에 있었는데, 규칙이 정한 상한(`file-size.test.ts`)을 넘겨 여기로
 * 뺐다. **판단은 한 줄도 안 바뀌었다** — 자리만 옮겼다.
 *
 * 무엇을 말할지는 `generation-progress.ts` 가 정한다. 여기는 시계만 돌린다.
 */
export function useGenerationProgress(input: {
  generating: boolean;
  plan: GenerationPlan | null;
  phase: RedesignPhase;
  transcribeCount: { done: number; total: number } | null;
}): GenerationProgress | null {
  const [progress, setProgress] = React.useState<GenerationProgress | null>(null);
  const { generating, plan, phase, transcribeCount } = input;

  React.useEffect(() => {
    if (!generating || !plan) {
      setProgress(null);
      return;
    }

    const totalSeconds = estimateGenerationSeconds(plan.model, plan.count);
    const update = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - plan.startedAt) / 1000));
      const tip = commerceTips[Math.floor(elapsedSeconds / 7) % commerceTips.length];
      const view = describeRedesignProgress({
        phase,
        done: transcribeCount?.done,
        total: transcribeCount?.total,
        elapsedSeconds,
        estimateSeconds: totalSeconds,
      });
      setProgress({ ...view, elapsedSeconds, tip: tip ?? "" });
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [generating, plan, phase, transcribeCount]);

  return progress;
}
