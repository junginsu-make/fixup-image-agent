"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 갤러리의 모션 카드.
 *
 * 영상이 11.4MB 라서 첫 화면에서 받게 두면 랜딩이 무거워진다. 화면에 들어올 때
 * 비로소 src 를 붙이고 그때 직접 load·play 한다 — src 를 나중에 붙이면
 * autoPlay 속성만으로는 재생이 시작되지 않는다.
 */
export function MotionCard({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const el = ref.current;
    if (!el) return;
    el.load();
    // 브라우저가 자동재생을 막으면 그냥 첫 프레임이 남는다. 던지지 않는다.
    void el.play().catch(() => undefined);
  }, [visible]);

  return (
    <video
      ref={ref}
      src={visible ? src : undefined}
      preload={visible ? "auto" : "none"}
      autoPlay
      muted
      loop
      playsInline
      aria-label={label}
    />
  );
}
