"use client";

import { useEffect } from "react";
import { boostedWheel } from "./wheel";

/**
 * 마우스 휠 한 칸이 **더 내려가게** 한다.
 *
 * 브라우저 기본은 한 칸에 100px 안팎인데, 이 화면은 섹션이 크고 사이가 넓어서
 * 그만큼으로는 «거의 안 움직인다»로 느껴진다.
 *
 * ── 왜 이렇게 조심하나 ────────────────────────────────────────────
 * 스크롤을 가로채는 것은 쉽게 «망가진 화면»이 된다. 트랙패드가 날아가고,
 * 확대가 안 되고, 부드러운 스크롤이 끊긴다. 그래서 **확실히 마우스 휠인
 * 경우만** 손을 대고 나머지는 전부 브라우저에 맡긴다. 무엇을 맡길지는
 * `wheel.ts` 의 `boostedWheel` 이 값으로 정한다.
 *
 * ── 왜 우리가 애니메이션을 만들지 않나 ────────────────────────────
 * `scrollBy({ behavior: "smooth" })` 로 **브라우저의 스크롤 애니메이션을
 * 그대로 쓴다.** 직접 rAF 로 굴리면 손잡이(∨)와 「위로」의
 * `scrollIntoView({ behavior: "smooth" })` 와 서로 목표를 다투며 떨린다.
 * 같은 장치를 쓰면 나중에 부른 쪽이 이긴다 — 그게 사람이 마지막에 한 동작이다.
 *
 * ── 움직임을 줄여 달라고 한 사람 ──────────────────────────────────
 * 그대로 둔다. 부드러운 스크롤 자체가 멀미를 부르는 사람이 있고
 * (`scroll-down.ts` 가 같은 이유로 `auto` 를 쓴다), 기본 동작이 이미 그 사람의
 * 설정을 따른다.
 */
export function WheelBoost() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onWheel = (event: WheelEvent) => {
      const distance = boostedWheel(event);
      if (distance === 0) return;

      event.preventDefault();
      window.scrollBy({ top: distance, behavior: "smooth" });
    };

    // 기본 동작을 막아야 하므로 passive 가 아니다.
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
