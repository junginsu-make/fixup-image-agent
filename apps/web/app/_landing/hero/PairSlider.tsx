"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";

/**
 * 레퍼런스와 결과를 **한 자리에 겹쳐 놓고 손잡이로 가른다.**
 *
 * 나란히 두는 방법도 있었지만(처음엔 그렇게 했다) 두 장이 따로 놀아 "이게 저걸
 * 보고 만든 것"이라는 관계가 안 읽혔다. 겹쳐 두면 같은 자리에서 바뀌므로
 * 무엇이 옮겨 왔고 무엇이 달라졌는지가 눈에 바로 걸린다.
 *
 * 기존 `_landing/reference-compare.tsx` 는 이미지를 코드에 박아 두어 한 짝밖에
 * 못 쓴다. 그래서 같은 조작을 하되 **무엇을 볼지 받아서** 그린다.
 */

const MIN = 6;
const MAX = 94;

export interface PairSliderProps {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  alt: string;
  /** 처음 손잡이 자리. 결과 쪽을 더 보여주고 시작한다. */
  start?: number;
}

export function PairSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  alt,
  start = 42,
}: PairSliderProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const [pct, setPct] = useState(start);
  const [dragging, setDragging] = useState(false);

  const moveTo = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.max(MIN, Math.min(MAX, next)));
  };

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(true);
    box.current?.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    moveTo(event.clientX);
  };

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(false);
    box.current?.releasePointerCapture(event.pointerId);
  };

  /* 손 없이도 쓸 수 있어야 한다. 화살표로 3%, 시프트를 누르면 10%. */
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
      className="pair-slider"
      role="slider"
      tabIndex={0}
      aria-label={alt}
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
      <Image src={before} alt="" width={720} height={900} draggable={false} sizes="(min-width: 900px) 30vw, 90vw" />

      {/* 결과가 위에 덮이고, 손잡이 왼쪽만 잘려 레퍼런스가 드러난다. */}
      <div className="pair-slider-top" style={{ clipPath: `inset(0 0 0 ${pct}%)` }}>
        <Image src={after} alt={alt} width={720} height={900} draggable={false} sizes="(min-width: 900px) 30vw, 90vw" />
      </div>

      <span className="pair-tag pair-tag--before">{beforeLabel}</span>
      <span className="pair-tag pair-tag--after">{afterLabel}</span>

      <div className="pair-handle" style={{ left: `${pct}%` }} aria-hidden>
        <i>↔</i>
      </div>
    </div>
  );
}
