"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@fixup/ui";

/**
 * 「지금 돌고 있다」를 눈에 띄게 말한다.
 *
 * 전에는 조용한 회색 띠 한 줄이었다. 04 에서 기획이 저절로 돌기 시작하는데
 * 그 표시가 화면 맨 위에 작게 떠서, **작동 중인지 알기 어려웠다**
 * (2026-09-08 사용자). 만들기를 눌러도 대시보드는 아무 변화가 없었다 —
 * 사이드바 아래쪽에만 표시가 났다.
 *
 * 그래서 셋을 바꿨다.
 *
 *   색   회색 → 강조색. 화면에서 유일하게 강조색을 쓰는 자리가 된다
 *   움직임  도는 표시 + 흐르는 막대. 멈춰 있는 글자와 구분된다
 *   자리   `sticky` — 아래로 굴려도 따라온다. 결과를 보다가도 보인다
 *
 * **막대는 진행률이 아니다.** fal 이 얼마나 갔는지 알려 주지 않는다.
 * 흐르기만 하는 막대는 「살아 있다」는 뜻이고, 남은 시간은 글자가 말한다.
 */
export function WorkingBanner({ label, hint }: { label: string; hint?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-2 z-20 overflow-hidden rounded-md border border-primary/40",
        "bg-primary-soft px-4 py-3 shadow-sm backdrop-blur",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="text-sm font-medium text-primary">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {/* 띠 아래를 흐르는 가는 막대. 도는 표시만으로는 멀리서 안 보인다. */}
      <span aria-hidden className="fixup-working-track mt-2.5 block h-1 rounded-full bg-primary/15">
        <span className="fixup-working-bar block h-full w-1/3 rounded-full bg-primary/70" />
      </span>
    </div>
  );
}
