"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@fixup/ui";

export interface PlanBarProps {
  /** 01 에서 「그대로 생성」을 고른 작업인가. 이 작업에는 04 기획이 없다. */
  verbatim: boolean;
  hasImages: boolean;
  variants: number;
  busyKind: "plan" | "generate" | "review" | null;
  onOpenPlan: () => void;
  onGenerate: () => void;
}

/**
 * **결과 화면 위의 안내 줄**(2026-09-29 떼어 냄).
 *
 * AI 가 다듬는 작업은 여기서 기획 패널을 연다 — 만들기 단추는 패널 안에 있어서,
 * 기획을 한 번 보고 만들게 된다.
 *
 * **「그대로 생성」 작업은 여기서 바로 만든다.** 기획 칸이 비어 있어 패널을 열지
 * 않는데, 만들기 단추가 패널 안에만 있어 회원이 닿을 수 없었다. 까닭은
 * `__tests__/plan-bar.test.tsx` 머리에 있다.
 */
export function PlanBar({ verbatim, hasImages, variants, busyKind, onOpenPlan, onGenerate }: PlanBarProps) {
  const busy = busyKind !== null;

  if (verbatim) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {hasImages ? "쓴 글 그대로 다시 만들 수 있습니다." : "쓴 글을 고치지 않고 그대로 보내 만듭니다."}
        </p>
        <Button size="sm" onClick={onGenerate} disabled={busy}>
          {busyKind === "generate"
            ? <><Loader2 className="mr-1.5 size-4 animate-spin" />만드는 중…</>
            : `${variants}장 만들기`}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {hasImages ? "기획을 고치고 다시 만들 수 있습니다." : "기획을 확인한 뒤 만듭니다."}
      </p>
      <Button variant="secondary" size="sm" onClick={onOpenPlan} disabled={busy}>
        기획 확인
      </Button>
    </div>
  );
}
