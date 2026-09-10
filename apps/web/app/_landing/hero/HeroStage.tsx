"use client";

import { useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { HeroCarousel } from "./HeroCarousel";
import type { Slide } from "./slides";
import { downScrollOptions } from "./scroll-down";

/**
 * 첫 화면 한 판. 캔버스와 내려가기 손잡이만 있다.
 *
 * **글자를 두지 않는다.** 여기 올라갈 것은 상단 메뉴뿐이고, 나머지는 결과물이
 * 말한다. 페이지 자체는 서버 컴포넌트라 이 조각만 클라이언트로 뗀다.
 */
export function HeroStage({ slides }: { slides: Slide[] }) {
  const goDown = useCallback(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 히어로 바로 다음 섹션으로 간다. 어느 섹션인지는 페이지가 정한다.
    // 어디에 멈출지는 `scroll-down.ts` 가 정한다 — 값으로 재려고 빼 뒀다.
    document.querySelector(".mcs-hero + *")?.scrollIntoView(downScrollOptions(reduceMotion));
  }, []);

  return (
    <section className="mcs-hero">
      <HeroCarousel slides={slides} />

      <div className="mcs-hero-overlay">
        {/*
          아래로 내려가는 손잡이. 글자 없이 아이콘만 둔다 — 첫 화면에서
          읽을 것을 늘리지 않으면서 "아래가 더 있다"만 알린다.
        */}
        <button type="button" className="mcs-hero-down" onClick={goDown} aria-label="아래로 이동">
          <ChevronDown size={22} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </section>
  );
}
