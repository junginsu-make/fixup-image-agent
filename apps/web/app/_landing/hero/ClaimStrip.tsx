"use client";

import { useEffect, useRef } from "react";
import { PairSlider } from "./PairSlider";

/**
 * 이 시스템이 하는 일 **한 문장과 증거 셋.**
 *
 * 「어떤 이미지든 레퍼런스를 주면, 그 결에 맞는 그림이 빠르게 나온다」 —
 * 이것이 핵심인데 예전 랜딩에서는 품질 장치 · 작동 원리 같은 이야기에 묻혀
 * 있었다. 여기서는 **왼쪽에 넣은 것, 오른쪽에 나온 것**을 나란히 놓는다.
 * 설명하지 않고 보여준다.
 *
 * 셋 다 실제로 이 시스템이 만든 것이고, 왼쪽은 그때 실제로 첨부한 레퍼런스다.
 */

interface Pair {
  reference: string;
  result: string;
  ko: string;
  en: string;
  /** 무엇을 적었는가. 한 줄이면 한 줄이라고만 적는다. */
  koInput: string;
  enInput: string;
}

const PAIRS: Pair[] = [
  {
    reference: "/landing/ref-lease.png",
    result: "/landing/result-cardnews-lease.png",
    ko: "카드뉴스",
    en: "Card news",
    koInput: "기사 URL 하나",
    enInput: "One article URL",
  },
  {
    reference: "/landing/ref-sports.png",
    result: "/landing/result-poster-sports.png",
    ko: "포스터",
    en: "Poster",
    koInput: "한 줄",
    enInput: "One line",
  },
  {
    reference: "/landing/ref-winter.png",
    result: "/landing/result-winter-trend.png",
    ko: "커버 이미지",
    en: "Cover image",
    koInput: "한 줄",
    enInput: "One line",
  },
];

export function ClaimStrip({ locale }: { locale: "ko" | "en" }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ko = locale === "ko";

  /* 화면에 들어오면 오른쪽(결과)이 뒤따라 나타난다. 「넣으면 나온다」의 결. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-pair]"));
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.setAttribute("data-shown", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "true");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25 },
    );

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="mcs-section claim" id="claim">
      <div className="mcs-shell">
        <h2 className="claim-line">
          {ko ? (
            <>
              레퍼런스 한 장이면, <em>같은 결의 그림</em>이 나옵니다
            </>
          ) : (
            <>
              One reference in, <em>an image of the same feel</em> out
            </>
          )}
        </h2>

        <div className="claim-pairs" ref={rootRef}>
          {PAIRS.map((pair, index) => (
            <figure
              className="claim-pair"
              key={pair.result}
              data-pair
              style={{ transitionDelay: `${index * 90}ms` }}
            >
              <PairSlider
                before={pair.reference}
                after={pair.result}
                beforeLabel={ko ? "넣은 것" : "In"}
                afterLabel={ko ? "나온 것" : "Out"}
                alt={ko ? pair.ko : pair.en}
              />

              <figcaption>
                {ko ? pair.ko : pair.en}
                <span>{ko ? pair.koInput : pair.enInput}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
