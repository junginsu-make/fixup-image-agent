"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Button } from "./ui/button";

/**
 * 이미지 크게 보기.
 *
 * 화면마다 같은 뷰어를 따로 만들고 있었다(결과물·섹션 갤러리·캐릭터). 조작이
 * 조금씩 달라지면 사용자는 화면마다 다시 배워야 한다. 새로 붙는 자리는 이걸
 * 쓴다 — 좌우 이동, Esc 닫기, 배경 클릭 닫기, 저장.
 */

export interface LightboxImage {
  label: string;
  src: string;
  /** 내려받을 때 쓸 파일명. 없으면 제목과 라벨로 만든다. */
  fileName?: string;
}

export function ImageLightbox({
  title,
  images,
  index,
  onIndexChange,
  onClose,
}: {
  title: string;
  images: LightboxImage[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const current = images[index];

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onIndexChange(Math.max(0, index - 1));
      if (event.key === "ArrowRight") onIndexChange(Math.min(images.length - 1, index + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onIndexChange]);

  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 크게 보기`}
      className="fixed inset-0 z-[60] flex flex-col bg-foreground/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-none items-center gap-3 pb-3 text-background">
        <div className="min-w-0">
          <strong className="block truncate text-sm">{title}</strong>
          <span className="block truncate text-xs opacity-80">
            {current.label} · {index + 1} / {images.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-background/15 hover:bg-background/25"
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="이전"
          disabled={index === 0}
          onClick={() => onIndexChange(index - 1)}
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-background/15 text-background hover:bg-background/25 disabled:opacity-30"
        >
          <ChevronLeft size={22} />
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={current.label}
          src={current.src}
          className="max-h-full max-w-full rounded-md object-contain shadow-[var(--shadow-elevate)]"
        />

        <button
          type="button"
          aria-label="다음"
          disabled={index === images.length - 1}
          onClick={() => onIndexChange(index + 1)}
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-background/15 text-background hover:bg-background/25 disabled:opacity-30"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div
        className="mx-auto flex w-full max-w-5xl flex-none justify-center pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <Button variant="outline" size="sm" asChild>
          <a href={current.src} download={current.fileName ?? `${title}-${current.label}.png`}>
            <Download size={14} className="mr-1.5" />이 이미지 저장
          </a>
        </Button>
      </div>
    </div>
  );
}
