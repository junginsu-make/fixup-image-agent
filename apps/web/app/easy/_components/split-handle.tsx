"use client";

import * as React from "react";
import { cn } from "@fixup/ui";
import { CHAT_MIN, RESULT_MIN, clampResultWidth, readResultWidth } from "../split";

/**
 * 대화와 결과 칸 사이의 **끌 수 있는 구분선** (2026-09-18 사용자 요청).
 *
 * ── 판단은 여기 없다 ─────────────────────────────────────────
 *
 * 「어디까지 끌 수 있나」는 `split.ts` 가 값으로 정한다. 화면 안에 두면 못 잰다.
 *
 * ── 키보드로도 옮길 수 있다 ──────────────────────────────────
 *
 * 마우스로만 되면 키보드로 쓰는 사람은 칸 너비를 못 바꾼다. 화살표로 한 번에
 * 24px 씩 움직인다 — `separator` 역할에 `aria-valuenow` 를 붙여 낭독기도 지금
 * 너비를 읽는다.
 *
 * ── 저장은 브라우저에만 ──────────────────────────────────────
 *
 * 이 사람 이 브라우저의 편의일 뿐이다. 서버에 보낼 값이 아니고, 비거나
 * 망가져도 기본값으로 뜬다(`readResultWidth`).
 */

const KEY = "easy-result-width";
const STEP = 24;

export function useResultWidth(containerRef: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState<number | null>(null);

  /*
   * **첫 그림은 서버와 같아야 한다.** 저장값을 처음부터 쓰면 서버가 그린 것과
   * 달라 화면이 한 번 튄다. 떠서 한 번 재고 난 뒤에 붙인다.
   */
  React.useEffect(() => {
    const available = containerRef.current?.clientWidth ?? 0;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      // 사생활 보호 창에서는 못 읽는다. 기본값으로 간다.
    }
    setWidth(clampResultWidth(available, readResultWidth(stored)));
  }, [containerRef]);

  /** 창 크기가 바뀌면 지금 너비가 안 맞을 수 있다. 다시 가둔다. */
  React.useEffect(() => {
    const onResize = () => {
      const available = containerRef.current?.clientWidth ?? 0;
      setWidth((current) => (current === null ? null : clampResultWidth(available, current)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [containerRef]);

  const apply = React.useCallback((next: number) => {
    const available = containerRef.current?.clientWidth ?? 0;
    const settled = clampResultWidth(available, next);
    setWidth(settled);
    try {
      window.localStorage.setItem(KEY, String(settled));
    } catch {
      // 못 써도 이번 화면에서는 그대로 쓴다.
    }
  }, [containerRef]);

  return { width, apply };
}

export function EasySplitHandle({
  width,
  onChange,
  containerRef,
}: {
  width: number;
  onChange: (next: number) => void;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [dragging, setDragging] = React.useState(false);

  /*
   * **끄는 동안은 창 전체에서 듣는다.** 손잡이 위에서만 들으면 빨리 움직일 때
   * 포인터가 손잡이를 벗어나 끌기가 끊긴다.
   *
   * `setPointerCapture` 대신 창에 붙이는 까닭은, 잡아 둔 채로 창 밖까지 나갔다
   * 돌아오는 경우까지 받기 위해서다.
   */
  React.useEffect(() => {
    if (!dragging) return undefined;

    const move = (event: PointerEvent) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return;
      // 구분선의 오른쪽이 결과 칸이다. 오른끝에서 포인터까지가 그 너비다.
      onChange(box.right - event.clientX);
    };
    const stop = () => setDragging(false);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    /*
      **끄는 동안 글자가 선택되지 않게 한다.** 안 막으면 끌 때마다 화면의 글이
      파랗게 잡혀 무엇을 하는지 알아보기 어렵다.
    */
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = previous;
      document.body.style.cursor = "";
    };
  }, [dragging, containerRef, onChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="대화와 결과 칸 너비"
      aria-valuenow={width}
      aria-valuemin={RESULT_MIN}
      aria-valuemax={Math.max(RESULT_MIN, (containerRef.current?.clientWidth ?? 0) - CHAT_MIN)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onKeyDown={(event) => {
        // 왼쪽 화살표는 결과 칸을 넓힌다 — 구분선이 왼쪽으로 가는 것이다.
        if (event.key === "ArrowLeft") { event.preventDefault(); onChange(width + STEP); }
        if (event.key === "ArrowRight") { event.preventDefault(); onChange(width - STEP); }
      }}
      className={cn(
        // 보이는 선은 1px 이지만 잡는 자리는 넓다. 얇으면 잡기가 어렵다.
        "group relative w-2 shrink-0 cursor-col-resize",
        /*
          **결과 칸과 같이 나타나고 같이 사라진다**(2026-09-18 확인).

          결과 칸은 `lg` 미만에서 `hidden` 인데 구분선이 그대로 남아 있었다.
          끌 것이 없는 손잡이가 화면 가운데에 선으로 서 있었다.
        */
        "hidden lg:block",
        "focus-visible:outline-none",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors",
          "group-hover:bg-primary group-focus-visible:bg-primary",
          dragging && "bg-primary",
        )}
      />
    </div>
  );
}
