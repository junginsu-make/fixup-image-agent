"use client";

import Image from "next/image";
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const MIN = 2;
const MAX = 98;
const START = 46;

/**
 * 레퍼런스 ↔ 결과 비교 슬라이더.
 * 마우스·터치 드래그와 키보드 좌우 화살표를 모두 받는다.
 */
export function ReferenceCompare({
  leftLabel,
  rightLabel,
  leftAlt,
  rightAlt,
  ariaLabel,
}: {
  leftLabel: string;
  rightLabel: string;
  leftAlt: string;
  rightAlt: string;
  ariaLabel: string;
}) {
  const [pct, setPct] = useState(START);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.max(MIN, Math.min(MAX, next)));
  }, []);

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    // 위치부터 반영한다. 포인터 캡처가 실패해도(합성 이벤트 등) 손잡이는 따라와야 한다.
    moveTo(event.clientX);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 캡처가 안 되면 컨테이너 밖으로 나갔을 때만 드래그가 끊긴다. 치명적이지 않다.
    }
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    moveTo(event.clientX);
  };

  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 3;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPct((value) => Math.max(MIN, value - step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPct((value) => Math.min(MAX, value + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      setPct(MIN);
    } else if (event.key === "End") {
      event.preventDefault();
      setPct(MAX);
    }
  };

  return (
    <div
      ref={box}
      className="mcs-slider"
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={`${Math.round(pct)}%`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      <Image
        src="/landing/ref-lease.png"
        alt={leftAlt}
        width={956}
        height={955}
        draggable={false}
        sizes="(min-width: 900px) 46vw, 92vw"
      />
      <div className="mcs-slider-top" style={{ clipPath: `inset(0 0 0 ${pct}%)` }}>
        <Image
          src="/landing/result-cardnews-lease.png"
          alt={rightAlt}
          width={1080}
          height={1080}
          draggable={false}
          sizes="(min-width: 900px) 46vw, 92vw"
        />
      </div>
      <span className="mcs-slider-tag mcs-slider-tag--left">{leftLabel}</span>
      <span className="mcs-slider-tag mcs-slider-tag--right">{rightLabel}</span>
      <div className="mcs-slider-handle" style={{ left: `${pct}%` }} aria-hidden="true">
        <i>↔</i>
      </div>
    </div>
  );
}
