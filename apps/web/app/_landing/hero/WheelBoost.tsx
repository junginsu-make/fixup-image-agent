"use client";

import { useEffect } from "react";
import { boostedWheel, nextWheelTarget } from "./wheel";

/**
 * 마우스 휠 한 칸이 **더 내려가게** 한다.
 *
 * 브라우저 기본은 한 칸에 100px 안팎인데, 이 화면은 섹션이 크고 사이가 넓어서
 * 그만큼으로는 «거의 안 움직인다»로 느껴진다.
 *
 * ── 왜 조심하나 ───────────────────────────────────────────────────
 * 스크롤을 가로채는 것은 쉽게 «망가진 화면»이 된다. 트랙패드가 날아가고,
 * 확대가 안 되고, 부드러운 스크롤이 끊긴다. 그래서 **확실히 마우스 휠인
 * 경우만** 손을 대고 나머지는 전부 브라우저에 맡긴다. 무엇을 맡길지는
 * `wheel.ts` 의 `boostedWheel` 이 값으로 정한다.
 *
 * ── 목표를 우리가 든다 ────────────────────────────────────────────
 * 처음에는 `scrollBy({ behavior: "smooth" })` 한 줄이었는데 **그게 잘못이었다.**
 * 그 함수는 지금 위치에서 재고, 새 부드러운 스크롤은 앞의 것을 취소한다.
 * 연속으로 굴리면 남은 거리가 버려져 **기본 동작보다 못 내려갔다**(사용자 신고).
 *
 * 그래서 목표를 들고 `scrollTo` 로 절대 위치를 준다. 쌓는 계산은
 * `nextWheelTarget` 이 하고, 여기서는 이벤트만 받는다.
 *
 * ── 애니메이션은 브라우저 것을 쓴다 ───────────────────────────────
 * rAF 로 직접 굴리면 손잡이(∨)·「위로」의 `scrollIntoView({ behavior: "smooth" })`
 * 와 서로 목표를 다투며 떨린다. 같은 장치를 쓰면 나중에 부른 쪽이 이긴다 —
 * 그게 사람이 마지막에 한 동작이다.
 *
 * ── 움직임을 줄여 달라고 한 사람 ──────────────────────────────────
 * 아예 붙지 않는다. 부드러운 스크롤 자체가 멀미를 부르는 사람이 있고
 * (`scroll-down.ts` 가 같은 이유로 `auto` 를 쓴다), 기본 동작이 이미 그 사람의
 * 설정을 따른다.
 */
export function WheelBoost() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /** 지금 향하고 있는 자리. 손짓이 끊기면 놓는다. */
    let target: number | null = null;
    let lastAt = 0;

    const onWheel = (event: WheelEvent) => {
      const now = event.timeStamp || performance.now();
      // 첫 휠이면 「한참 전」으로 본다. 0 을 주면 흐르는 입력으로 오해한다.
      const sinceLast = lastAt === 0 ? Number.POSITIVE_INFINITY : now - lastAt;

      const distance = boostedWheel({
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
        defaultPrevented: event.defaultPrevented,
        sinceLast,
        viewport: window.innerHeight,
      });
      if (distance === 0) {
        // 손대지 않은 것도 「방금 왔다」로 기억한다 — 흐르는 입력의 다음 값이
        // 간격만 벌어졌다는 이유로 갑자기 튀지 않게.
        lastAt = now;
        return;
      }

      event.preventDefault();

      const doc = document.documentElement;
      target = nextWheelTarget({
        current: window.scrollY,
        target,
        sinceLast,
        distance,
        max: doc.scrollHeight - window.innerHeight,
      });
      lastAt = now;

      window.scrollTo({ top: target, behavior: "smooth" });
    };

    /**
     * 사람이 다른 길로 스크롤했으면(막대를 끌거나 손잡이를 눌렀거나) 우리
     * 목표를 놓는다. 안 놓으면 다음 휠이 옛 자리에서 이어져 화면이 튄다.
     */
    const onScrollEnd = () => {
      target = null;
    };

    // 기본 동작을 막아야 하므로 passive 가 아니다.
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scrollend", onScrollEnd);

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scrollend", onScrollEnd);
    };
  }, []);

  return null;
}
