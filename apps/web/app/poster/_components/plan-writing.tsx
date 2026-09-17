"use client";

import { Loader2 } from "lucide-react";
import { Skeleton } from "@fixup/ui";

/**
 * 기획을 **쓰는 중**이라고 패널 전체로 말한다.
 *
 * 04 에 들어오면 기획이 저절로 돈다. 그동안 패널에는 **지난 값이나 빈 칸이
 * 그대로** 보였다 — 도는 표시는 화면 뒤쪽 띠에만 있어서, 패널만 보고 있으면
 * 멈춘 화면으로 읽혔다(2026-09-17 사용자 보고).
 *
 * 그래서 패널을 덮는다. 덮으면 두 가지가 한꺼번에 해결된다.
 *
 *   보임    도는 표시 + 자리표 줄이 패널 한가운데서 움직인다
 *   막음    쓰는 중에 고쳐 봐야 도착한 초안이 덮어쓴다. 아예 못 만지게 한다
 *
 * **자리표는 진행률이 아니다.** 몇 칸이 채워졌는지 모델은 알려 주지 않는다.
 * 움직이는 줄은 「살아 있다」는 뜻이고, 얼마나 걸리는지는 글자가 말한다.
 */
export function PlanWriting({ label, hint }: { label: string; hint?: string }) {
  return (
    <div
      /*
        **읽어 주지 않는다.** 같은 때 화면 위 띠(`working-banner.tsx`)가 이미
        `role="status"` 로 「기획하는 중입니다」를 읽는다. 둘 다 읽으면 낭독기가
        같은 말을 두 번 한다(2026-09-17 독립 리뷰). 이 덮개는 **눈으로 보는
        쪽**을 맡는다.
      */
      aria-hidden
      className="absolute inset-0 z-10 grid content-start gap-4 bg-background/85 p-5 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="text-sm font-medium text-primary">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>

      {/* 흐르는 막대. 도는 표시만으로는 멀리서 안 보인다 — 띠와 같은 움직임이다. */}
      <span aria-hidden className="fixup-working-track block h-1 rounded-full bg-primary/15">
        <span className="fixup-working-bar block h-full w-1/3 rounded-full bg-primary/70" />
      </span>

      {/* 칸이 이만큼 채워질 것이라는 자리표. 곧 나올 모양을 미리 잡아 둔다. */}
      <div aria-hidden className="grid gap-4">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="grid gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
