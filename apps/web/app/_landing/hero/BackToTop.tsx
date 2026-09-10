"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { scrollBehaviorFor } from "./scroll-down";
import { shouldShowBackToTop } from "./wheel";

/**
 * 맨 아래까지 내려왔을 때 나오는 **위로 가기.**
 *
 * 첫 화면이 한 화면을 통째로 쓰고 그 아래로 네 섹션이 이어지므로, 바닥에서
 * 다시 올라가려면 한참 굴려야 한다. 끝에 닿으면 손잡이를 하나 낸다.
 *
 * 언제 낼지는 `wheel.ts` 의 `shouldShowBackToTop` 이 정한다 — 화면 밖에서
 * 값으로 재기 위해서다.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const check = () => {
      setShown(
        shouldShowBackToTop(window.scrollY, window.innerHeight, document.documentElement.scrollHeight),
      );
    };

    check();
    // 스크롤마다 계산하지만 하는 일은 뺄셈 하나다. 창 크기가 바뀌어도 다시 잰다.
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const goTop = useCallback(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: scrollBehaviorFor(reduceMotion) });
  }, []);

  return (
    <button
      type="button"
      className="mcs-to-top"
      onClick={goTop}
      aria-label="맨 위로"
      // 안 보일 때는 초점도 안 잡히게 한다. 탭으로 넘기다 보이지 않는 버튼에
      // 걸리면 어디로 갔는지 알 수 없다.
      hidden={!shown}
    >
      {/* 아래의 내려가기(∨)와 짝이 맞게 같은 모양을 쓴다. */}
      <ChevronUp size={22} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
