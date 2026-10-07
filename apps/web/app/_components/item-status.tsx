"use client";

import { Clock, Loader2 } from "lucide-react";
import { Badge, cn } from "@fixup/ui";

/**
 * **여러 장을 만들 때 칸마다 같은 말로 상태를 보인다**(2026-10-08 사용자).
 *
 * 카드뉴스 카드·상세페이지 섹션·캐릭터 각도·광고가 모두 이 다섯 말만 쓴다.
 * 「만드는 중」과 「차례 대기」를 나눈 까닭: 한꺼번에 만들면 몇 장씩 나눠
 * 보내는데, 아직 보내지 않은 칸까지 돌고 있는 것처럼 보였다.
 */
export const ITEM_STATE_TEXT = {
  working: "만드는 중",
  queued: "차례 대기",
  done: "완료",
  failed: "실패",
  idle: "만들기 전",
} as const;

export type ItemState = keyof typeof ITEM_STATE_TEXT;

const BADGE_VARIANT = {
  working: "default",
  queued: "secondary",
  done: "green",
  failed: "destructive",
  idle: "outline",
} as const;

export function ItemStatusBadge({ state, className }: { state: ItemState; className?: string }) {
  return (
    <Badge variant={BADGE_VARIANT[state]} className={cn("gap-1", className)}>
      {state === "working" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
      {state === "queued" ? <Clock className="size-3" aria-hidden /> : null}
      {ITEM_STATE_TEXT[state]}
    </Badge>
  );
}

/** 그림 자리 위에 덮는 표시. 만드는 중·차례 대기일 때만 뜬다. 부모는 `relative` 여야 한다. */
export function ItemWorkingOverlay({ state, className }: { state: ItemState; className?: string }) {
  if (state !== "working" && state !== "queued") return null;
  return (
    <span
      role="status"
      className={cn(
        "absolute inset-0 grid place-content-center justify-items-center gap-1.5 bg-background/70 text-xs font-medium",
        state === "working" ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      {state === "working"
        ? <Loader2 size={22} className="animate-spin" aria-hidden />
        : <Clock size={20} aria-hidden />}
      {ITEM_STATE_TEXT[state]}
    </span>
  );
}
