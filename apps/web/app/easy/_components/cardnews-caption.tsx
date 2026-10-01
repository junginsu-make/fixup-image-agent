"use client";

import * as React from "react";
import { Button } from "@fixup/ui";
import { captionText, type Caption } from "../cardnews-after";

/** **인스타 게시글**(3단계 §4 · §6-4). 첫 문장 · 본문 · 해시태그 · 첫 댓글을 한 덩이로 보이고 복사한다. */
export function EasyCardnewsCaption({ caption }: { caption: Caption }) {
  const 글 = captionText(caption);
  const [알림, set알림] = React.useState("");

  async function 복사() {
    try {
      await navigator.clipboard.writeText(글);
      set알림("복사했습니다.");
    } catch {
      set알림("복사하지 못했습니다. 글을 직접 골라 복사해 주세요.");
    }
  }

  return (
    <div className="grid gap-1.5 rounded-lg border border-border bg-background p-2 text-meta">
      <span className="font-medium">인스타 게시글</span>
      <p className="whitespace-pre-line">{글}</p>
      <div className="flex items-center justify-end gap-2">
        {알림 ? <span className="text-subtle-foreground">{알림}</span> : null}
        <Button size="sm" variant="secondary" onClick={() => void 복사()}>복사</Button>
      </div>
    </div>
  );
}
