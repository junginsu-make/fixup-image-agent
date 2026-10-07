"use client";

import type { ReactNode } from "react";
import { Loader2, Square } from "lucide-react";
import { Button, cn } from "@fixup/ui";
import { ElapsedTime } from "./elapsed-time";

/**
 * **시간이 걸리는 단계는 모두 이 띠 하나로 「돌고 있다」를 말한다**(2026-10-08 사용자).
 *
 * 쉽게를 뺀 모든 기능(카드뉴스·상세페이지·다양하게·리디자인·캐릭터·광고)이 쓴다.
 * 전에는 기능마다 상단 띠·전체 화면 창·상자·단추 글자만 바뀌는 것이 섞여 있었다.
 *
 * 처음 모양은 다양하게·카드뉴스의 띠(2026-09-08)다 — 그때 정한 셋을 지킨다.
 *
 *   색   강조색. 화면에서 유일하게 강조색을 쓰는 자리가 된다
 *   움직임  도는 표시 + 막대. 멈춰 있는 글자와 구분된다
 *   자리   `sticky` — 아래로 굴려도 따라온다. 결과를 보다가도 보인다
 *
 * **막대는 장 수를 알 때만 진행률이다.** 모르면(fal·AI 가 얼마나 갔는지 안
 * 알려 줄 때) 흐르기만 하는 막대로 「살아 있다」만 말한다 — 채웠다 비우면 거짓말이다.
 */
export function WorkingStatus({ label, hint, startedAt, progress, remaining, onStop, stopping, children, className }: {
  /** 「기획 중입니다」처럼 지금 하는 일. 낱말은 `working-words.ts` 를 따른다. */
  label: string;
  /** 「1~2분 걸립니다」 같은 안내. */
  hint?: string;
  /** 주면 걸린 시간이 흐른다. */
  startedAt?: number;
  /** 여러 장을 만들 때만 준다. 「2/6장」과 채워지는 막대가 된다. */
  progress?: { done: number; total: number; unit?: string };
  /** 「약 3분 남음」. */
  remaining?: string;
  /**
   * 「중지」를 누르면 할 일. 없으면 단추가 안 나온다.
   *
   * **멈추는 자리는 여기 하나다**(2026-09-17 사용자 결정). 전에는 사이드바
   * 아래에도 같은 목록과 중지가 있어서, 만드는 중에 「진행 중」이 두 군데에
   * 보였다. 표시가 있는 자리에서 바로 멈추는 편이 맞다.
   */
  onStop?: () => void;
  stopping?: boolean;
  /** 단계 목록·결과 요약처럼 띠 안에 함께 보일 것. */
  children?: ReactNode;
  className?: string;
}) {
  const percent = progress && progress.total > 0
    ? Math.round((Math.min(progress.done, progress.total) / progress.total) * 100)
    : null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-2 z-20 overflow-hidden rounded-md border border-primary/40",
        "bg-primary-soft px-4 py-3 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="text-sm font-medium text-primary">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {progress ? <span className="tabular-nums font-medium text-primary">{`${progress.done}/${progress.total}${progress.unit ?? "장"}`}</span> : null}
          {remaining ? <span>{remaining}</span> : null}
          {startedAt ? <ElapsedTime startedAt={startedAt} /> : null}
          {onStop ? (
            <Button type="button" variant="secondary" size="sm" className="shrink-0" disabled={stopping} onClick={onStop}>
              <Square className="size-3.5" />
              {stopping ? "멈추는 중…" : "중지"}
            </Button>
          ) : null}
        </span>
      </div>
      {/* 띠 아래 가는 막대. 도는 표시만으로는 멀리서 안 보인다. */}
      <span aria-hidden className="fixup-working-track relative mt-2.5 block h-1 rounded-full bg-primary/15">
        {percent === null
          ? <span className="fixup-working-bar block h-full w-1/3 rounded-full bg-primary/70" />
          : <span data-working-fill="progress" className="block h-full rounded-full bg-primary/70 transition-[width] duration-500" style={{ width: `${percent}%` }} />}
      </span>
      {children ? <div className="mt-2.5 text-sm">{children}</div> : null}
      {/* fal 에 이미 보낸 요청은 취소하지 못한다. 숨기면 사용자가 오해한다 —
          사이드바 칸에 있던 말을 중지 단추와 함께 여기로 옮겼다. */}
      {onStop ? (
        <p className="mt-2 text-meta leading-5 text-muted-foreground">
          중지하면 결과를 더 받지 않습니다. 이미 보낸 요청의 비용은 나갈 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
