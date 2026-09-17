"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { fillHeight } from "./fit-screen";

/** 셸의 `<main>` 아래 여백(`pb-6`). 이만큼은 비워 둬야 바닥에 안 붙는다. */
const BOTTOM_GAP = 24;
/** 이보다 작은 창에서는 줄이지 않는다. 그때는 열 안에서 스크롤한다. */
const MIN_HEIGHT = 420;
/** 여러 열로 서는 폭(`lg`). 그보다 좁으면 열이 위아래로 쌓여 화면 한 장에 못 넣는다. */
const WIDE = "(min-width: 1024px)";
/** 캔버스와 그 아래 묶음 사이 틈(`gap-2`). */
const CANVAS_GAP = 8;

/**
 * 작업 영역과 카드 칸이 **실제로 쓸 수 있는 자리**를 잰다.
 *
 * - `rootHeight` — 작업 영역 높이. 화면 높이에서 **위에 실제로 놓인 것**을 뺀다.
 *   전에는 어림값(144px)이라 위가 두꺼워지면 아래로 넘쳐 버튼이 잘렸다
 * - `canvasSpace` — 왼쪽 열에서 캔버스 아래 묶음(더하기 단추·설정)을 뺀 자리.
 *   카드 칸은 이 안에 들어가게 줄어든다
 *
 * 좁은 화면(열이 쌓이는 폭)에서는 재지 않는다 — 한 화면에 넣을 수 없으니 전처럼
 * 페이지가 흐르게 둔다.
 */
export function useFitScreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLElement>(null);
  const belowRef = useRef<HTMLDivElement>(null);
  const [rootHeight, setRootHeight] = useState<number | undefined>(undefined);
  const [canvasSpace, setCanvasSpace] = useState<{ width: number; height: number } | undefined>(undefined);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const wide = window.matchMedia(WIDE);

    const measure = () => {
      if (!wide.matches) {
        setRootHeight(undefined);
        setCanvasSpace(undefined);
        return;
      }
      // 페이지를 조금 내린 채로 창 크기를 바꿔도 같은 값이 나오게 문서 기준으로 잰다.
      const top = root.getBoundingClientRect().top + window.scrollY;
      setRootHeight(fillHeight({ viewport: window.innerHeight, top, bottomGap: BOTTOM_GAP, min: MIN_HEIGHT }));

      const column = columnRef.current;
      const below = belowRef.current;
      if (column && below) {
        setCanvasSpace({
          width: Infinity,
          height: column.clientHeight - below.offsetHeight - CANVAS_GAP,
        });
      }
    };

    measure();
    /*
      **위에 놓인 것이 바뀌어도 다시 잰다.** 프로젝트 필터 띠가 뜨거나 안내 줄이
      두 줄로 접히면 위가 두꺼워진다. 부모를 지켜보면 그 변화가 잡힌다. 아래
      묶음(알림 줄이 늘어나는 등)과 열 높이도 지켜본다.
    */
    const observer = new ResizeObserver(measure);
    if (root.parentElement) observer.observe(root.parentElement);
    if (columnRef.current) observer.observe(columnRef.current);
    if (belowRef.current) observer.observe(belowRef.current);
    window.addEventListener("resize", measure);
    wide.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      wide.removeEventListener("change", measure);
    };
  }, []);

  return { rootRef, columnRef, belowRef, rootHeight, canvasSpace };
}
