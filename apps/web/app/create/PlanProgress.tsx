"use client";

import { useEffect, useState } from "react";
import {
  ALWAYS_PASSED,
  PLAN_STAGE_LABEL,
  PLAN_STAGE_STEP,
  isPlanStage,
  planStageOrder,
  type PdpPlanStage,
} from "@fixup/pdp-core";
import { apiJson } from "./pdp-utils";

/**
 * **기획이 어디쯤인지 보여 주는 차례표**(2026-09-22 사용자 요청).
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 *
 * 사진 기획은 4분 가까이 걸린다. 그동안 화면은 「AI가 상세페이지 구조를 만드는
 * 중입니다」 한 줄이었다. 사용자는 「막연하게 너무 지루하게 기다리기만
 * 합니다」라고 했고, **검수 중이라고도 표시**해 달라고 했다.
 *
 * ── 왜 물어보는가 ──────────────────────────────────────────
 *
 * 시간으로 세면 **틀린다.** 모델이 늦으면 아직 구성안을 짜는 중인데 화면이
 * 「검수 중」이라고 말하게 된다. 그래서 서버가 **실제로 넘어갈 때** 찍어 두고,
 * 여기서 몇 초마다 물어본다.
 *
 * ── 모르면 모른다고 둔다 ───────────────────────────────────
 *
 * 아직 첫 자리에 못 들어갔거나 서버가 답을 못 주면 **차례표를 안 그린다.**
 * 그때는 부르는 쪽이 준 한 줄이 그대로 남는다 — 지어낸 단계를 띄우지 않는다.
 */

/** 3초. 4분짜리 기다림에 여든 번이면 충분하고, 서버는 메모리 한 칸을 읽는다. */
const 간격 = 3000;

interface PlanProgressProps {
  /** 이 기획을 가리키는 번호. 요청에 함께 실어 보낸 그것이다. */
  progressId: string;
  /** 단계를 모를 때 그대로 둘 한 줄. */
  fallback: string;
}

interface 답 {
  ok?: boolean;
  stage?: unknown;
}

export function PlanProgress({ progressId, fallback }: PlanProgressProps) {
  const [current, setCurrent] = useState<PdpPlanStage | null>(null);
  /**
   * **지나온 자리를 들고 있는다.**
   *
   * 건너뛸 수 있는 자리(고쳐 쓰기)는 **실제로 시작해야** 차례표에 낀다. 미리
   * 펴 두면 안 하고 지나갔을 때 사용자가 무엇이 잘못된 줄 안다.
   */
  const [seen, setSeen] = useState<PdpPlanStage[]>([]);

  useEffect(() => {
    if (!progressId) return;

    let 살아있다 = true;

    const 물어본다 = async () => {
      try {
        const answer = await apiJson<답>(`/pdp/analyze/progress?id=${encodeURIComponent(progressId)}`);
        if (!살아있다 || !answer?.ok || !isPlanStage(answer.stage)) return;

        const stage = answer.stage;
        setCurrent(stage);
        setSeen((before) => (before.includes(stage) ? before : [...before, stage]));
      } catch {
        // 못 물어봤다. 다음 차례에 다시 묻는다 — 기획 자체와는 상관없다.
      }
    };

    void 물어본다();
    const 시계 = window.setInterval(() => void 물어본다(), 간격);
    return () => {
      살아있다 = false;
      window.clearInterval(시계);
    };
  }, [progressId]);

  /**
   * 차례표에 걸 줄들.
   *
   * 늘 지나는 자리에 **실제로 지나온 자리**를 합치고 순서대로 놓는다.
   */
  const 줄들 = [...new Set([...ALWAYS_PASSED, ...seen])].sort(
    (a, b) => planStageOrder(a) - planStageOrder(b),
  );

  if (!current) {
    return <p className="mt-1 text-body text-muted-foreground">{fallback}</p>;
  }

  const 지금 = planStageOrder(current);

  return (
    <>
      <p className="mt-1 text-body text-muted-foreground" aria-live="polite">
        {PLAN_STAGE_LABEL[current]}
      </p>
      <ol className="mx-auto mt-4 grid w-full max-w-sm gap-1.5 text-left">
        {줄들.map((stage) => {
          const 자리 = planStageOrder(stage);
          const 끝났다 = 자리 < 지금;
          const 지금것 = stage === current;

          return (
            <li key={stage} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={
                  끝났다
                    ? "grid h-4 w-4 flex-none place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                    : 지금것
                      ? "h-4 w-4 flex-none rounded-full border-2 border-primary bg-primary-soft"
                      : "h-4 w-4 flex-none rounded-full border border-border"
                }
              >
                {끝났다 ? "✓" : ""}
              </span>
              <span className={지금것 ? "font-bold" : 끝났다 ? "text-muted-foreground" : "text-subtle-foreground"}>
                {PLAN_STAGE_STEP[stage]}
              </span>
              {지금것 ? <span className="text-xs text-primary">진행 중</span> : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}
