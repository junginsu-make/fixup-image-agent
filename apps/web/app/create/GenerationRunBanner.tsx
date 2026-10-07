"use client";

import { CheckCircle2 } from "lucide-react";
import { Badge, cn } from "@fixup/ui";
import { ElapsedTime } from "../_components/elapsed-time";
import { WorkingStatus } from "../_components/working-status";

/** 편집기의 `generationRun` 과 같은 모양. */
export interface GenerationRunBannerRun {
  mode: "single" | "batch";
  status: "running" | "finished";
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentLabel: string;
  startedAt: number;
  endedAt?: number;
  expectedSeconds?: number;
}

/**
 * 이미지 생성의 진행 띠와 끝난 뒤 요약.
 *
 * **도는 동안은 공통 띠(`WorkingStatus`)다**(2026-10-08 사용자). 「약 N분 남음」과
 * 크레딧 문구는 버리지 않고 띠 안으로 옮겼다. 끝난 뒤 요약은 전과 같다.
 */
export function GenerationRunBanner({ run, creditUnits, unit }: {
  run: GenerationRunBannerRun;
  /** 성공한 장수만큼의 차감. 서버와 같은 식(`imageCreditUnits`)으로 편집기가 센다. */
  creditUnits: number;
  unit: string;
}) {
  const summary = (
    <p className="text-xs text-muted-foreground">
      성공 {run.completed}장 · 실패 {run.failed}장{run.skipped ? ` · 미시도 ${run.skipped}장` : ""} · 성공한 이미지만 차감되며 {run.completed}장이면 {creditUnits}{unit}입니다.
    </p>
  );

  if (run.status === "running") {
    return (
      <WorkingStatus
        label={run.mode === "batch" ? `${run.total}장 만드는 중입니다` : `${run.currentLabel} 만드는 중입니다`}
        startedAt={run.startedAt}
        // 한 장이면 막대를 채울 것이 없다 — 여러 장일 때만 센다.
        progress={run.mode === "batch" ? { done: run.completed + run.failed, total: run.total } : undefined}
        remaining={run.expectedSeconds ? `약 ${Math.max(1, Math.round(run.expectedSeconds / 60))}분 남음` : undefined}
      >
        {summary}
      </WorkingStatus>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        run.failed || run.skipped ? "border-warning/25 bg-warning/5" : "border-primary/20 bg-primary/5",
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <strong>{run.failed || run.skipped ? "이미지 생성 부분 완료" : "이미지 생성 완료"}</strong>
        <Badge variant="secondary">{`${run.completed + run.failed}/${run.total} 처리`}</Badge>
        <Badge variant="outline"><ElapsedTime startedAt={run.startedAt} endedAt={run.endedAt} /></Badge>
      </div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.round(((run.completed + run.failed) / run.total) * 100)}%` }}
        />
      </div>
      <div className="mt-2">{summary}</div>
    </div>
  );
}
