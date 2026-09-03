"use client";

import * as React from "react";
import { Download, Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@fixup/ui";
import { downloadName } from "./download-name";
import { describeZoom, fitScale, type PixelSize } from "./image-viewer-scale";

/**
 * 어디서든 그림을 크게 본다.
 *
 * 화면마다 미리보기 크기가 제각각이라 뭘 만들었는지 확인이 안 됐다. 카드에
 * 잘려 들어간 그림으로는 글자가 겹쳤는지 색이 맞는지 알 수 없다.
 *
 * 두 상태만 둔다.
 *   맞춤       그림 전체가 한 화면에 들어온다
 *   원본 크기   픽셀 그대로. 화면보다 크면 끌어서 옮긴다
 *
 * 여는 방법도 둘이다.
 *   1) 그림에 data-zoomable 을 붙인다 — 누르면 열린다
 *   2) openImageViewer(src, alt) 를 부른다 — 그림이 다른 일(고르기)에
 *      쓰이고 있을 때 돋보기 버튼에서 쓴다
 */

const OPEN_EVENT = "fixup:view-image";

export interface ViewableImage {
  src: string;
  alt?: string;
  /** 내려받을 때 붙일 이름. 없으면 alt 와 주소에서 만든다. */
  name?: string;
}

/** 그림 자체가 다른 일에 쓰이는 자리에서 확대를 여는 길. */
export function openImageViewer(src: string, alt = "", name?: string) {
  if (!src) return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { src, alt, name } }));
}

/**
 * 그림을 내려받는다.
 *
 * `<a download>` 로는 안 된다. 그림이 다른 곳(Supabase 서명 주소)에 있어서
 * 브라우저가 `download` 를 무시하고 그냥 그 주소로 이동해 버린다. 받아서
 * 메모리에 담은 뒤 그것을 내려준다.
 *
 * 실패하면 새 탭으로 연다 — 아무 일도 안 일어나는 것보다 낫다.
 */
export async function downloadImage(image: ViewableImage) {
  try {
    const response = await fetch(image.src);
    if (!response.ok) throw new Error(String(response.status));
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadName(image);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch {
    window.open(image.src, "_blank", "noreferrer");
  }
}

export function ImageViewerHost() {
  const [image, setImage] = React.useState<ViewableImage | null>(null);
  const [natural, setNatural] = React.useState<PixelSize | null>(null);
  const [actualSize, setActualSize] = React.useState(false);
  const [viewport, setViewport] = React.useState<PixelSize>({ width: 0, height: 0 });

  const open = React.useCallback((next: ViewableImage) => {
    setImage(next);
    setNatural(null);
    setActualSize(false);
  }, []);

  // data-zoomable 그림을 누르면 연다. 잡아채는 단계에서 막아 카드의 다른
  // 동작이 같이 일어나지 않게 한다.
  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest?.("img[data-zoomable]") as HTMLImageElement | null;
      const src = target?.currentSrc || target?.src;
      if (!src) return;
      event.preventDefault();
      event.stopPropagation();
      open({ src, alt: target?.alt ?? "" });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [open]);

  React.useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<ViewableImage>).detail;
      if (detail?.src) open(detail);
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [open]);

  React.useEffect(() => {
    if (!image) return;
    function measure() {
      // 도구 줄과 여백을 뺀 나머지가 그림이 쓸 수 있는 자리다.
      setViewport({ width: window.innerWidth - 64, height: window.innerHeight - 140 });
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setImage(null);
    }
    measure();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
    };
  }, [image]);

  if (!image) return null;

  const scale = actualSize ? 1 : fitScale(natural, viewport);
  const width = natural ? Math.round(natural.width * scale) : undefined;
  const oversized = Boolean(natural && fitScale(natural, viewport) < 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || "이미지 크게 보기"}
      className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setImage(null); }}
    >
      <div className="flex flex-none items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate text-sm">
          <span className="font-bold">{image.alt || "이미지"}</span>
          <span className="ml-3 text-white/70">{describeZoom(natural, scale)}</span>
        </p>
        <div className="flex flex-none items-center gap-2">
          {oversized ? (
            <button
              type="button"
              onClick={() => setActualSize((current) => !current)}
              className="flex h-9 items-center gap-1.5 rounded-md bg-white/15 px-3 text-sm hover:bg-white/25"
            >
              {actualSize ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              {actualSize ? "화면에 맞추기" : "원본 크기"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void downloadImage(image)}
            className="flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-bold text-black hover:bg-white/90"
          >
            <Download className="size-4" />내려받기
          </button>
          <a
            href={image.src}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center rounded-md bg-white/15 px-3 text-sm hover:bg-white/25"
          >새 탭에서 열기</a>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setImage(null)}
            className="grid size-9 place-items-center rounded-md bg-white/15 hover:bg-white/25"
          ><X className="size-5" /></button>
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 p-4",
          actualSize ? "items-start justify-start overflow-auto" : "items-center justify-center",
        )}
        onMouseDown={(event) => { if (event.target === event.currentTarget) setImage(null); }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          alt={image.alt || ""}
          onLoad={(event) => setNatural({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })}
          style={width ? { width, maxWidth: "none" } : undefined}
          className={cn("select-none rounded-md", actualSize ? "flex-none" : "max-h-full max-w-full object-contain")}
        />
      </div>

      <p className="flex-none pb-3 text-center text-xs text-white/60">
        {oversized ? "원본 크기에서는 끌어서 옮겨 볼 수 있습니다 · " : ""}Esc 또는 바깥을 눌러 닫습니다
      </p>
    </div>
  );
}
