"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { canvasWidthLimit, fillHeight } from "./fit-screen";

/** 셸의 `<main>` 아래 여백(`pb-6`). 이만큼은 비워 둬야 바닥에 안 붙는다. */
const BOTTOM_GAP = 24;
/**
 * 이보다 작은 창에서는 줄이지 않는다. 그때는 열 안에서 스크롤한다.
 *
 * 420 이었는데 1366 노트북을 125% 로 쓰면 창 높이가 590 가량이라 **페이지**가
 * 넘쳤다(실측). 낮게 두면 넘친 만큼을 열이 자기 안에서 스크롤해, 페이지는 늘
 * 한 화면이다.
 */
const MIN_HEIGHT = 300;
/**
 * 여러 열로 서는 폭(`lg`). 그보다 좁으면 열이 위아래로 쌓여 화면 한 장에 못 넣는다.
 *
 * **CSS 와 같은 단위(rem)로 적는다.** Tailwind v4 의 `lg`·`xl` 은 `64rem`·`80rem`
 * 이고, 미디어 쿼리의 rem 은 브라우저 기본 글꼴 설정을 따른다. px 로 적으면 글꼴을
 * 「크게」(20px) 둔 사람에게 훅과 화면의 판단이 갈려, 열이 쌓였는데 높이를 박아
 * 넘치거나 세 열인데 네 열로 셈했다(2026-09-17 독립 리뷰).
 */
const WIDE = "(min-width: 64rem)";
/** 네 열로 서는 폭(`xl`). 그보다 좁으면 세 열이다(`fit-screen.ts` 의 `COLUMN_LAYOUTS`). */
const FOUR_COLUMNS = "(min-width: 80rem)";
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
      /*
        **캔버스에 따라 안 변하는 폭으로 잰다 — 작업 영역을 감싼 본문 폭.**

        처음에는 격자 자신의 폭을 쟀다. 그러면 캔버스가 크게 그려진 첫 순간 격자가
        본문(1029px)보다 넓은 1172px 로 밀려나고, 그 폭으로 다시 재니 캔버스가 다시
        크게 나와 **스스로를 키운 채 굳었다**(1280×1024 실측). 바깥 폭은 안쪽이
        넘쳐도 안 늘어난다.
      */
      const outer = root.parentElement;
      if (column && below && outer) {
        /*
          **가로도 잰다.** 높이로만 정했더니, 세로가 넉넉하고 가로가 좁은 화면
          (1280×1024)에서 캔버스가 첫 열보다 넓어져 그 열에 가로 스크롤이 생겼다
          (2026-09-17 독립 리뷰). 첫 열의 폭을 그대로 쓰면 안 된다 — 열이
          max-content 라 캔버스를 따라가서, 한 번 줄면 다시 안 커진다. 격자 폭에서
          **나머지 세 열의 최소 폭**을 뺀 자리가 캔버스가 쓸 수 있는 가로다.
        */
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const layout = window.matchMedia(FOUR_COLUMNS).matches ? "four" : "three";
        const next = {
          width: canvasWidthLimit(outer.clientWidth, rem, layout),
          height: column.clientHeight - below.offsetHeight - CANVAS_GAP,
        };
        // 같은 값이면 안 넣는다. 새 객체를 넣으면 크기가 같아도 한 번 더 그린다.
        setCanvasSpace((current) =>
          current && current.width === next.width && current.height === next.height ? current : next);
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
    // 창 **높이만** 바뀌면 지켜보는 요소들의 크기는 그대로다(높이를 박아 뒀다).
    // 그때 다시 재는 길은 이것뿐이다.
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
