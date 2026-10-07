"use client";

import { useEffect, useMemo, useState } from "react";
import { rememberGenerating, slowCardIndexes, type SlowCardLike } from "./slow-card";

/** 늦었나를 다시 보는 간격. 상태 조회(10초)와 비슷하게 둔다. */
const TICK_MS = 15_000;

/**
 * 3분을 넘긴 카드 번호(`slow-card.ts`). **안내만 한다** — 이 훅은 서버를 부르지 않는다.
 *
 * 만드는 중인 카드가 있을 때만 시계를 돌린다.
 */
export function useSlowCards(cards: readonly SlowCardLike[]): number[] {
  const [now, setNow] = useState(() => Date.now());
  const [seen, setSeen] = useState<Record<number, number>>({});
  const generating = cards.some((card) => card.status === "generating");
  const key = cards.map((card) => `${card.index}:${card.status}`).join(",");

  useEffect(() => {
    setNow(Date.now());
    setSeen((previous) => rememberGenerating(previous, cards, Date.now()));
    // 카드 번호 · 상태가 바뀔 때만 다시 본다. 같은 모양으로 새로 받은 목록은 건너뛴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [generating]);

  return useMemo(() => slowCardIndexes(cards, seen, now), [cards, seen, now]);
}
