"use client";

import * as React from "react";
import { cn } from "@fixup/ui";

/**
 * 목록에 거는 그림 한 장.
 *
 * 목록은 그림마다 따로 요청하므로 **한꺼번에 나타날 수 없다.** 도착하는 시점이
 * 제각각이라 하나씩 툭툭 튀어나오는데, 그게 "아직 안 뜬 화면" 처럼 보인다.
 *
 * 그래서 두 가지를 한다.
 *
 * 1. **칸을 미리 채워 둔다** — 부르는 쪽이 회색 배경을 이미 깔아 두므로,
 *    화면은 처음부터 완성된 격자로 보인다.
 * 2. **도착하면 천천히 드러낸다** — 툭 나타나는 대신 짧게 스며들면, 눈에는
 *    "이미 거기 있던 것이 선명해진" 것으로 읽힌다.
 *
 * 실제로 빨라지는 것은 아니다. 빠르게 **보이는** 것이 목적이다.
 *
 * **캐시된 그림을 조심해야 한다.** 이미 받아 둔 그림은 `onLoad` 가 React 가
 * 손잡이를 붙이기 전에 끝나 버려, 그대로 두면 영영 투명한 채로 남는다.
 * 붙는 순간 `complete` 를 직접 확인해 그 함정을 막는다.
 */
export function ThumbImage({
  src,
  alt,
  className,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string }) {
  const [shown, setShown] = React.useState(false);

  const attach = React.useCallback((node: HTMLImageElement | null) => {
    // 캐시에서 바로 온 그림은 여기 붙는 시점에 이미 끝나 있다.
    if (node?.complete) setShown(true);
  }, []);

  return (
    <img
      {...rest}
      ref={attach}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setShown(true)}
      // 못 받은 그림을 영영 숨기지 않는다. 깨진 표시라도 보이는 편이 낫다.
      onError={() => setShown(true)}
      className={cn("transition-opacity duration-300", shown ? "opacity-100" : "opacity-0", className)}
    />
  );
}
