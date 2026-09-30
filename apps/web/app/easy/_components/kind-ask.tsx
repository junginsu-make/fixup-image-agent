"use client";

import { Button } from "@fixup/ui";
import type { EasyKind } from "../cardnews-state";

/** **한 장인가 여러 장인가**(2단계 설계 §4). 물음은 코드가 짓는다. */
export function EasyKindAsk({ onPick, disabled }: { onPick: (kind: EasyKind) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
      <p className="text-base leading-7">이미지 한 장으로 만들까요, 여러 장짜리 카드뉴스로 만들까요?</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick("image")}>이미지 한 장</Button>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick("cardnews")}>카드뉴스 여러 장</Button>
      </div>
    </div>
  );
}
