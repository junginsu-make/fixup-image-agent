"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Button,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@fixup/ui";

/**
 * 목록 카드 모서리에 놓는 지우기 단추의 생김새.
 *
 * 카드뉴스·이미지 목록은 아래 `DeleteWorkButton` 을 그대로 쓰고, 라이브러리
 * 작업물은 자기 확인 창이 따로 있어(누가 만든 것인지까지 말해야 한다) 단추만
 * 가져다 쓴다. 생김새가 두 곳에 갈려 있으면 한쪽만 고치는 날이 온다.
 */
export const DELETE_CORNER_BUTTON =
  "absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-md " +
  "bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive";

/**
 * 만든 것을 지우는 버튼.
 *
 * 목록 카드의 모서리에 둔다. 아래에 줄로 두면 카드가 길어지고, 열기 버튼과
 * 섞여 실수로 누르게 된다. 참고 이미지 목록이 쓰는 자리와 같다.
 *
 * **한 번 더 묻는다.** 만든 것은 되돌릴 수 없다 — 그림 파일까지 함께 지운다.
 * 무엇을 지우는지 이름을 보여주고 묻는다. "정말요?" 만 뜨면 어느 것을 누른
 * 것인지 알 수 없다.
 */
export function DeleteWorkButton({
  endpoint,
  title,
  what = "작업",
  onDeleted,
}: {
  /** DELETE 를 보낼 곳. */
  endpoint: string;
  /** 무엇을 지우는지 사람에게 보여줄 이름. */
  title: string;
  /** "이 카드뉴스" 처럼 종류를 부르는 말. */
  what?: string;
  onDeleted(): void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const body = await (await fetch(endpoint, { method: "DELETE" })).json();
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      setOpen(false);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "지우지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${title} 지우기`}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}
        className={DELETE_CORNER_BUTTON}
      >
        <Trash2 className="size-3.5" />
      </button>

      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>지울까요?</DialogTitle>
            <DialogDescription>
              「{title}」{what}을 지웁니다. 만들어 둔 그림도 함께 사라지고,
              되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>취소</Button>
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {busy ? "지우는 중…" : "지웁니다"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
