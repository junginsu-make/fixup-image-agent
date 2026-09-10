"use client";

import { useEffect, useRef } from "react";

/**
 * 첫 화면 다음에 오는 **슬로건 한 판.**
 *
 * 목록도 문단도 아니다. 여기서 필요한 것은 읽을 거리가 아니라 **한 번에 꽂히는
 * 문장**이고, 그래서 글자 자체가 그림 노릇을 한다.
 *
 * 쓰는 장치는 셋이다.
 *
 *   1. 지우기   직업 이름은 속이 빈 글자로 두고 선을 그어 지운다.
 *              지워지는 것은 자격이고, 남는 것은 결과다.
 *   2. 크기 차  번호(01)는 아주 크고 옅게, 슬로건은 굵고 크게, 설명은
 *              그다음. 셋의 크기 차가 읽는 차례를 정한다.
 *   3. 강조     설명 줄에서 **결론에 해당하는 절**만 흰색으로 남기고
 *              나머지는 물러나게 한다. 한 줄 안에서도 무게가 갈린다.
 */

const LINES = [
  {
    index: "01",
    koRole: "디자이너",
    enRole: "designer",
    koRest: "가 아니여도",
    enRest: "not required",
    /** 앞은 조건, 뒤는 결론. 뒤가 굵게 남는다. */
    koLead: "마음에 든 이미지 한 장만 첨부하면,",
    koPunch: "그대로 내 디자인이 됩니다",
    enLead: "Attach one image you liked,",
    enPunch: "and it becomes your design",
  },
  {
    index: "02",
    koRole: "마케터",
    enRole: "marketer",
    koRest: "가 아니여도",
    enRest: "not required",
    koLead: "리사이징 할 필요 없이",
    koPunch: "규격에 맞는 이미지들이 생성됩니다",
    enLead: "No resizing —",
    enPunch: "every platform size comes out ready",
  },
] as const;

export function KeyMessage({ locale }: { locale: "ko" | "en" }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ko = locale === "ko";

  /* 한 줄씩 든다. 두 줄이 같이 뜨면 슬로건이 아니라 문단으로 읽힌다. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-line]"));
    if (!("IntersectionObserver" in window)) {
      lines.forEach((line) => line.setAttribute("data-shown", "true"));
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

    lines.forEach((line) => observer.observe(line));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="key-visual" aria-label={ko ? "이제는" : "From now on"}>
      <div className="mcs-shell" ref={rootRef}>
        <p className="key-now">{ko ? "이제는" : "From now on"}</p>

        {LINES.map((line, index) => (
          <div
            className="key-slogan"
            key={line.index}
            data-line
            style={{ transitionDelay: `${index * 120}ms` }}
          >
            <span className="key-index" aria-hidden>
              {line.index}
            </span>

            <h2>
              {/* 속이 빈 글자에 선을 그어 지운다. */}
              <s>{ko ? line.koRole : line.enRole}</s>
              <span>{ko ? line.koRest : line.enRest}</span>
            </h2>

            <p>
              {ko ? line.koLead : line.enLead} <b>{ko ? line.koPunch : line.enPunch}</b>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
