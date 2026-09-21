"use client";

import * as React from "react";
import { MoveHorizontal } from "lucide-react";
import { cn } from "@fixup/ui";
import {
  CHAT_MIN,
  LIST_MIN,
  RESULT_MIN,
  clampListWidth,
  clampResultWidth,
  readListWidth,
  readResultWidth,
} from "../split";

/**
 * 대시보드 안의 **끌 수 있는 구분선** (2026-09-18 · 2026-09-21 사용자 요청).
 *
 * 칸이 셋이라 구분선이 둘이다 — **대화 목록 | 대화 | 결과**. 둘이 하는 일은
 * 같고 **어느 쪽 끝에서 너비를 재느냐만 다르다.**
 *
 *   side="left"   왼쪽 끝에서 포인터까지 = 대화 목록 너비
 *   side="right"  오른쪽 끝에서 포인터까지 = 결과 칸 너비
 *
 * ── 판단은 여기 없다 ─────────────────────────────────────────
 *
 * 「어디까지 끌 수 있나」는 `split.ts` 가 값으로 정한다. 화면 안에 두면 못 잰다.
 *
 * ── 키보드로도 옮길 수 있다 ──────────────────────────────────
 *
 * 마우스로만 되면 키보드로 쓰는 사람은 칸 너비를 못 바꾼다. 화살표로 한 번에
 * 24px 씩 움직인다 — `separator` 역할에 `aria-valuenow` 를 붙여 낭독기도 지금
 * 너비를 읽는다. **미는 방향은 화면과 같다** — 오른쪽 화살표는 선이 오른쪽으로
 * 간다. 그러면 왼쪽 칸은 넓어지고 오른쪽 칸은 좁아진다.
 *
 * ── 저장은 브라우저에만 ──────────────────────────────────────
 *
 * 이 사람 이 브라우저의 편의일 뿐이다. 서버에 보낼 값이 아니고, 비거나
 * 망가져도 기본값으로 뜬다.
 */

const STEP = 24;

/** 구분선 하나가 무엇을 재고 어디에 적어 두는지. */
const 규칙 = {
  list: { key: "easy-list-width", read: readListWidth, clamp: clampListWidth, floor: LIST_MIN },
  result: { key: "easy-result-width", read: readResultWidth, clamp: clampResultWidth, floor: RESULT_MIN },
} as const;

export type SplitKind = keyof typeof 규칙;

/**
 * 칸 하나의 너비를 들고 있는다.
 *
 * ── 「원한 너비」와 「지금 쓸 수 있는 너비」를 따로 둔다 ──────
 *
 * 가둔 값만 들고 있으면 **한쪽으로만 간다.** 목록을 넓혀 결과 칸이 616 에서
 * 492 로 줄었는데, 목록을 도로 좁혀도 492 에 머물렀다(2026-09-21 실측). 자리가
 * 다시 생겼는데 안 돌아오면 사용자는 줄어든 까닭도 안 돌아오는 까닭도 모른다.
 *
 * 그래서 원한 값(`원한너비`)은 그대로 두고, **화면에 쓸 값은 그때그때 가둔다.**
 * 끌면 원한 값이 바뀌고, 옆 칸이 움직이면 쓸 값만 바뀐다.
 *
 * ── `null` 은 아직 안 쟀다는 뜻 ──────────────────────────────
 *
 * 첫 그림은 서버와 같아야 한다(저장값을 처음부터 쓰면 화면이 한 번 튄다).
 * 붙고 나서 한 번 재고 그때 붙인다.
 */
export function useSplitWidth(containerRef: React.RefObject<HTMLElement | null>, kind: SplitKind) {
  const { key, read, clamp } = 규칙[kind];
  const [원한너비, set원한너비] = React.useState<number | null>(null);
  const [나눌자리, set나눌자리] = React.useState<number | null>(null);

  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      // 사생활 보호 창에서는 못 읽는다. 기본값으로 간다.
    }
    set원한너비(read(stored));
  }, [key, read]);

  /*
   * **담는 칸 너비를 계속 따라간다.**
   *
   * 창 크기만 보면 모자란다 — 구분선이 둘이라 **옆 칸을 끌어도** 이 칸이
   * 가진 자리가 달라진다. 목록을 넓히면 대화와 결과가 나눠 갖던 너비가
   * 줄어드는데, 그때 결과 칸이 그대로면 대화가 바닥 아래로 눌린다.
   */
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new ResizeObserver(() => set나눌자리(container.clientWidth));
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  const width = 원한너비 === null || 나눌자리 === null ? null : clamp(나눌자리, 원한너비);

  const apply = React.useCallback((next: number) => {
    const available = containerRef.current?.clientWidth ?? 0;
    const settled = clamp(available, next);
    // **가둔 값을 원한 값으로 적는다.** 끌어서 멈춘 자리가 곧 원한 자리다.
    set원한너비(settled);
    try {
      window.localStorage.setItem(key, String(settled));
    } catch {
      // 못 써도 이번 화면에서는 그대로 쓴다.
    }
  }, [containerRef, key, clamp]);

  return { width, apply };
}

export function EasySplitHandle({
  width,
  onChange,
  containerRef,
  side,
  label,
  className,
}: {
  width: number;
  onChange: (next: number) => void;
  containerRef: React.RefObject<HTMLElement | null>;
  /** 어느 끝에서 너비를 재나. 왼쪽 칸을 재면 `"left"`. */
  side: "left" | "right";
  /** 낭독기가 읽을 이름. 「무엇과 무엇 사이인가」를 적는다. */
  label: string;
  /** 어느 화면 폭부터 보일지. 옆 칸이 사라지면 이 선도 같이 사라져야 한다. */
  className?: string;
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
      onChange(side === "left" ? event.clientX - box.left : box.right - event.clientX);
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
  }, [dragging, containerRef, onChange, side]);

  /** 선을 그쪽으로 밀면 이 칸은 넓어지나 좁아지나. */
  const 밀기 = (방향: "left" | "right") => {
    const 넓어진다 = 방향 === (side === "left" ? "right" : "left");
    onChange(width + (넓어진다 ? STEP : -STEP));
  };

  const 최소 = 규칙[side === "left" ? "list" : "result"].floor;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={최소}
      aria-valuemax={Math.max(최소, (containerRef.current?.clientWidth ?? 0) - CHAT_MIN)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); 밀기("left"); }
        if (event.key === "ArrowRight") { event.preventDefault(); 밀기("right"); }
      }}
      className={cn(
        // 보이는 선은 1px 이지만 잡는 자리는 넓다. 얇으면 잡기가 어렵다.
        // **옆 칸 위에 얹힌다.** 손잡이가 선 밖으로 나오므로 아래 깔리면 잘린다.
        "group relative z-10 w-2 shrink-0 cursor-col-resize",
        "focus-visible:outline-none",
        className,
      )}
    >
      {/*
        **`border` 색으로는 안 보인다**(2026-09-21 사용자 — 「선을 조금 더 잘
        보이게 해주세요. 전체적으로 구분선이 매우 잘 안보입니다」).

        `--border`(#e8e6dc)는 바탕(#f7f6f1)과 거의 같은 값이라, 칸을 **나누는
        선**으로는 약하다. 그 색은 카드 테두리처럼 **있는 듯 없는 듯해야 하는
        자리**의 색이다. 여기는 반대다 — 잡아서 끄는 자리라 눈에 걸려야 한다.

        글자색(`--subtle-foreground`)을 옅게 깔아 쓴다. 두 테마 모두에서
        바탕과 충분히 갈린다.
      */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
          "bg-subtle-foreground/45",
          "group-hover:bg-primary group-focus-visible:bg-primary",
          dragging && "bg-primary",
        )}
      />

      {/*
        **끌 수 있다는 것을 눈으로 알린다**(2026-09-21 사용자 — 「양쪽 다 이동할
        수 있다는 아이콘을 표시해주세요」).

        전에는 1px 선뿐이라, 커서를 정확히 그 위에 올려 모양이 바뀌는 것을 봐야만
        끌 수 있다는 걸 알았다. **몰랐으면 없는 기능이다.**

        늘 보이되 옅게 둔다 — 손이 가면 진해진다. 화살표가 양쪽을 가리키는 것이
        곧 「양쪽 다 간다」는 말이다.
      */}
      <span
        aria-hidden
        className={cn(
          "absolute left-1/2 top-1/2 grid h-9 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center",
          /*
            **작고 옅어서 안 보였다**(2026-09-21 사용자 — 「아이콘이 안보입니다」).
            16×28 에 `--border` 테두리였다. 키우고, 테두리와 화살표에 글자색을
            쓰고, 그림자로 바탕에서 떼어 낸다 — 눌러서 잡는 것처럼 보여야 한다.
          */
          "rounded-full border border-subtle-foreground/45 bg-background shadow-sm",
          "text-muted-foreground transition-colors",
          "group-hover:border-primary group-hover:text-primary",
          "group-focus-visible:border-primary group-focus-visible:text-primary",
          dragging && "border-primary text-primary",
        )}
      >
        <MoveHorizontal className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}
