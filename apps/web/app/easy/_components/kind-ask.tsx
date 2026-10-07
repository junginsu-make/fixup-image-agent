"use client";

import { Button } from "@fixup/ui";
import type { EasyKind } from "../cardnews-state";
import { KIND_REPLY_TEXT } from "../ask-answers";

/** **한 장인가 여러 장인가**(2단계 설계 §4)의 단추 둘. 물음 글은 물음 줄이 보인다(2차 D1). */
export function EasyKindAsk({ onPick, disabled }: { onPick: (kind: EasyKind) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick("image")}>{KIND_REPLY_TEXT.image}</Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick("cardnews")}>{KIND_REPLY_TEXT.cardnews}</Button>
    </div>
  );
}
