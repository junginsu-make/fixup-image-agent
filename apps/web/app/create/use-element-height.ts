"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 요소의 높이를 지켜본다. 요소가 없으면 0.
 *
 * **생성 띠(`sticky`)가 덮는 만큼 갤러리 막대를 내리려고 쓴다**(2026-10-08).
 * 띠 높이는 문구가 접히면 변하므로 고정값으로 못 적는다.
 */
export function useElementHeight() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);

  useEffect(() => {
    if (!element) {
      setHeight(0);
      return;
    }
    const measure = () => setHeight(Math.ceil(element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref, height };
}
