"use client";

import { useCallback, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  buildOverlayBackgroundStyle,
  buildOverlayShellStyle,
  buildOverlayTextStyle,
  buildShapeLayerStyle,
  isShapeLayer,
  isTextLayer,
} from "./pdp-canvas-utils";
import { previewFitFor } from "./layer-coords";
import type { CanvasLayer } from "./pdp-drafts";

/**
 * 섹션 한 장을 **얹은 글자까지 함께** 보여 준다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 갤러리와 이어보기는 `generatedImage` 원본만 그렸다. 이어보기 옆에는 「실제
 * 상세페이지처럼 위에서 아래로 이어 붙인 모습입니다」라고 적혀 있는데, 정작
 * **얹은 글자가 하나도 안 보였다.** 최종 모습을 확인하려고 여는 화면인데
 * 확인이 안 됐다.
 *
 * ── 어떻게 ───────────────────────────────────────────────────
 *
 * 레이어 좌표가 460 기준으로 고정돼 있으므로(B-1), **보여 줄 폭에 맞춰 배율만
 * 곱하면** 같은 자리에 그려진다. 다시 굽지 않으니 값도 시간도 안 든다.
 *
 * **스타일은 편집기와 같은 함수를 쓴다**(`pdp-canvas-utils`). 여기서 따로
 * 지으면 화면마다 다르게 보이고, 그 파일 머리말이 경고한 그대로가 된다.
 */
export function SectionPreview({
  src,
  alt,
  layers,
  className,
  imageClassName,
}: {
  src: string;
  alt: string;
  layers: CanvasLayer[];
  className?: string;
  imageClassName?: string;
}) {
  const [fit, setFit] = useState(1);
  /** 못 읽은 그림. 빈 자리만 남기면 사용자는 무엇이 잘못됐는지 모른다. */
  const [broken, setBroken] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  /*
    붙는 순간에 재고, 붙어 있는 동안 폭이 바뀌면 다시 잰다.
    `useEffect` 로 하면 목록이 다시 그려질 때 놓치는 자리가 생긴다 — B-1 에서
    실제 브라우저로 겪었다.
  */
  const attach = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setFit(previewFitFor(entry?.contentRect.width));
    });
    observer.observe(node);
    observerRef.current = observer;
    setFit(previewFitFor(node.clientWidth));
  }, []);

  return (
    <div ref={attach} className={className} style={{ position: "relative" }}>
      <img
        alt={alt}
        src={src}
        className={imageClassName}
        draggable={false}
        onError={() => setBroken(true)}
      />

      {broken ? (
        <span
          className="absolute inset-0 grid place-items-center bg-canvas/80 p-2 text-center text-xs text-subtle-foreground"
          role="status"
        >
          이미지를 불러오지 못했습니다
        </span>
      ) : null}

      {layers.length > 0 ? (
        /*
          레이어는 460 기준 좌표다. 이 칸을 그 폭으로 두고 통째로 배율을 준다 —
          자리·크기·글자 크기가 한꺼번에 맞는다.

          **누르는 것을 가로채지 않는다.** 갤러리의 썸네일은 눌러서 크게 보고,
          이어보기도 마찬가지다.
        */
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: 460,
            transformOrigin: "top left",
            transform: `scale(${fit})`,
            pointerEvents: "none",
            // 그림 밖으로 안 새게 한다. 내보내기 노드도 잘라 낸다 — 안 맞추면
            // 미리보기와 구운 결과가 또 달라진다.
            overflow: "hidden",
          }}
        >
          {[...layers.filter(isShapeLayer), ...layers.filter(isTextLayer)].map((layer) => (
            <div
              key={layer.id}
              style={{
                position: "absolute",
                left: `${layer.x}px`,
                top: `${layer.y}px`,
                width: typeof layer.width === "number" ? `${layer.width}px` : layer.width,
                height: typeof layer.height === "number" ? `${layer.height}px` : layer.height,
              }}
            >
              {isShapeLayer(layer) ? (
                <div style={buildShapeLayerStyle(layer)} />
              ) : (
                <div style={buildOverlayShellStyle(layer)}>
                  {/*
                    **쌓임 순서를 편집기와 맞춘다.**

                    편집기는 CSS 클래스로 `z-index` 를 준다
                    (`.overlayBackdrop{z-index:0}` · `.overlayTextLayer{z-index:1}`).
                    여기서 빠뜨리면 자리잡힌 배경이 static 인 글자보다 위에 칠해져
                    **배경이 글자를 덮는다** — 「최종 모습 확인」이 정반대가 된다.
                  */}
                  {layer.backgroundEnabled ? (
                    <div
                      style={{ position: "absolute", inset: 0, zIndex: 0, ...buildOverlayBackgroundStyle(layer) }}
                    />
                  ) : null}
                  <span
                    style={{ position: "relative", zIndex: 1, ...buildOverlayTextStyle(layer) } as CSSProperties}
                  >
                    {layer.text}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
