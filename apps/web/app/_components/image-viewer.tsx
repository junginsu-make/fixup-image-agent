"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Trash2, X } from "lucide-react";
import { cn } from "@fixup/ui";
import { downloadName } from "./download-name";
import { parseViewerMeta, type ViewerMeta } from "./viewer-meta";
import { describeZoom, fitScale, type PixelSize } from "./image-viewer-scale";

/**
 * 어디서든 그림을 크게 본다. **이 시스템의 유일한 큰 그림 창이다.**
 *
 * 전에는 두 가지가 있었다. 만들기 화면은 전체 화면으로 크게 띄웠지만 어떻게
 * 만든 것인지도, 내려받을 길도 없었다. 라이브러리는 작은 창에 설명을 붙였지만
 * 정작 그림이 작아 무엇을 만들었는지 안 보였다. 둘을 하나로 합친다 —
 * 크게 보면서 설명도 보고, 내려받고, 지운다.
 *
 * 두 상태만 둔다.
 *   맞춤       그림 전체가 한 화면에 들어온다
 *   원본 크기   픽셀 그대로. 화면보다 크면 끌어서 옮긴다
 *
 * 여는 방법은 셋이다.
 *   1) 그림에 data-zoomable 을 붙인다 — 누르면 열린다
 *   2) openImageViewer(src, alt) — 그림이 다른 일(고르기)에 쓰이고 있을 때
 *   3) openImageGallery({ images, index }) — 한 벌을 넘기며 볼 때
 *
 * 설명은 그림에 `data-viewer-meta` 로 붙여 둔다. 모달은 화면 전체에서
 * 하나뿐이고 아무 그림에서나 열리므로, 화면마다 값을 넘겨받게 하면 어딘가는
 * 반드시 빠진다.
 */

const OPEN_EVENT = "fixup:view-image";

export interface ViewableImage {
  src: string;
  alt?: string;
  /** 내려받을 때 붙일 이름. 없으면 alt 와 주소에서 만든다. */
  name?: string;
  /** 어떻게 만든 것인지. 그림 옆에 보여준다. */
  meta?: ViewerMeta;
}

export interface ViewerRequest {
  images: ViewableImage[];
  index?: number;
  /** 지우기를 열어 둘 때. 누르면 창이 닫히고 이 함수가 불린다. */
  onDelete?: () => void;
  deleteLabel?: string;
}

/** 한 장만 연다. */
export function openImageViewer(
  src: string,
  alt = "",
  extra?: { name?: string; meta?: ViewerMeta },
) {
  if (!src) return;
  openImageGallery({ images: [{ src, alt, ...extra }] });
}

/** 한 벌을 넘기며 본다. */
export function openImageGallery(request: ViewerRequest) {
  if (!request.images.length) return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: request }));
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
  const [request, setRequest] = React.useState<ViewerRequest | null>(null);
  const [index, setIndex] = React.useState(0);
  const [natural, setNatural] = React.useState<PixelSize | null>(null);
  const [actualSize, setActualSize] = React.useState(false);
  const [viewport, setViewport] = React.useState<PixelSize>({ width: 0, height: 0 });

  const open = React.useCallback((next: ViewerRequest) => {
    setRequest(next);
    setIndex(Math.min(Math.max(next.index ?? 0, 0), next.images.length - 1));
    setNatural(null);
    setActualSize(false);
  }, []);

  const close = React.useCallback(() => setRequest(null), []);

  const move = React.useCallback((step: number) => {
    setRequest((current) => {
      if (!current) return current;
      setIndex((at) => (at + step + current.images.length) % current.images.length);
      setNatural(null);
      setActualSize(false);
      return current;
    });
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
      open({
        images: [{ src, alt: target?.alt ?? "", meta: parseViewerMeta(target?.dataset?.viewerMeta) }],
      });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [open]);

  React.useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<ViewerRequest>).detail;
      if (detail?.images?.length) open(detail);
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [open]);

  const many = (request?.images.length ?? 0) > 1;

  React.useEffect(() => {
    if (!request) return;
    function measure() {
      // 도구 줄과 여백을 뺀 나머지가 그림이 쓸 수 있는 자리다.
      setViewport({ width: window.innerWidth - 64, height: window.innerHeight - 140 });
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (many && event.key === "ArrowLeft") move(-1);
      if (many && event.key === "ArrowRight") move(1);
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
  }, [request, many, move, close]);

  if (!request) return null;

  const image = request.images[index]!;
  const meta = image.meta ?? [];
  const scale = actualSize ? 1 : fitScale(natural, viewport);
  const width = natural ? Math.round(natural.width * scale) : undefined;
  const oversized = Boolean(natural && fitScale(natural, viewport) < 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || "이미지 크게 보기"}
      className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="flex flex-none items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate text-sm">
          <span className="font-bold">{image.alt || "이미지"}</span>
          {many ? <span className="ml-3 text-white/70">{index + 1} / {request.images.length}</span> : null}
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
          {request.onDelete ? (
            <button
              type="button"
              onClick={() => { const run = request.onDelete!; close(); run(); }}
              className="flex h-9 items-center gap-1.5 rounded-md bg-white/15 px-3 text-sm hover:bg-red-500/80"
            >
              <Trash2 className="size-4" />{request.deleteLabel ?? "지우기"}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="닫기"
            onClick={close}
            className="grid size-9 place-items-center rounded-md bg-white/15 hover:bg-white/25"
          ><X className="size-5" /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-2">
        <div
          className={cn(
            "relative flex min-w-0 flex-1",
            actualSize ? "items-start justify-start overflow-auto" : "items-center justify-center",
          )}
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
        >
          {many ? (
            <>
              <button
                type="button"
                aria-label="이전 그림"
                onClick={() => move(-1)}
                className="absolute left-0 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
              ><ChevronLeft className="size-6" /></button>
              <button
                type="button"
                aria-label="다음 그림"
                onClick={() => move(1)}
                className="absolute right-0 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
              ><ChevronRight className="size-6" /></button>
            </>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={image.src}
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

        {/* 어떻게 만든 것인지. 그림 옆에 두어 같이 본다. */}
        {meta.length ? (
          <aside className="hidden w-72 flex-none overflow-y-auto rounded-lg bg-white/10 p-4 text-white lg:block">
            <p className="text-meta text-white/60">이렇게 만들었습니다</p>
            <dl className="mt-3 grid gap-3 text-sm">
              {meta.map(([name, value]) => (
                <div key={name}>
                  <dt className="text-white/60">{name}</dt>
                  <dd className="m-0 mt-0.5 whitespace-pre-wrap break-words leading-6">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        ) : null}
      </div>

      <p className="flex-none pb-3 text-center text-xs text-white/60">
        {many ? "← → 로 넘깁니다 · " : ""}
        {oversized ? "원본 크기에서는 끌어서 옮겨 볼 수 있습니다 · " : ""}
        Esc 또는 바깥을 눌러 닫습니다
      </p>
    </div>
  );
}
