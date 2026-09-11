"use client";

import * as React from "react";
import { Check, Loader2, Maximize2, Trash2 } from "lucide-react";
import { cn } from "@fixup/ui";
import { openImageViewer } from "./image-viewer";
import { ThumbImage } from "./thumb-image";

/**
 * 고를 수 있는 그림 한 칸.
 *
 * **라이브러리에서 그림을 고르는 자리는 전부 이 칸을 쓴다** — 라이브러리
 * 불러오기 창(`library-picker.tsx`)과 저장된 이미지 고르기
 * (`create/SavedImagePicker.tsx`). 전에는 둘이 자기 칸을 따로 들고 있어서
 * 확대 단추 자리도, 이름 붙는 자리도, 고른 표시도 달랐다. 같은 일을 하는
 * 자리가 도구마다 다르게 생기면 쓰는 사람이 매번 다시 배운다
 * (2026-09-11 사용자 요청).
 *
 * 자리 규약은 하나다.
 *
 *   왼쪽 위   확대 — 그림 자체는 고르기에 쓰이므로 따로 연다
 *   오른쪽 위 지우기 — 되돌릴 수 없어 눈에 덜 띄게 두고, 부르는 쪽이 한 번 묻는다
 *   오른쪽 아래 고른 표시 — 왼쪽 위는 확대 단추에 가려 안 보인다(실측)
 *   아래 한 줄 이름
 */

export interface PickCellImage {
  id: string;
  /** 칸 아래에 적을 이름. */
  title: string | null;
  url: string | null;
  /** 목록에 걸 사본. 있으면 격자는 이것을 쓰고 확대는 원본을 쓴다. */
  thumbUrl?: string | null;
}

export function PickCell({
  image,
  caption,
  badge,
  selected = false,
  busy = false,
  disabled = false,
  aspect = "square",
  fit = "cover",
  onPick,
  onDelete,
}: {
  image: PickCellImage;
  /** 이름 대신 적을 말. 캐릭터 각도(「정면」)처럼 제목보다 짧은 것이 나을 때. */
  caption?: string;
  /** 왼쪽 위에 붙는 작은 딱지. 「레퍼런스」·「작업물」처럼 출처를 말한다. */
  badge?: string;
  selected?: boolean;
  /** 이 칸을 고르는 중인가. 받아 오는 데 시간이 걸리는 자리가 있다. */
  busy?: boolean;
  disabled?: boolean;
  /**
   * 칸 모양.
   *
   * 기본은 정사각이다 — 참고 이미지는 잘라도 무엇인지 알아본다. 세로로 긴
   * 상세페이지 그림은 `portrait` + `contain` 이라야 전체가 보인다.
   */
  aspect?: "square" | "portrait";
  fit?: "cover" | "contain";
  onPick(): void;
  onDelete?(): void;
}) {
  const name = caption ?? image.title ?? "제목 없음";

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={onPick}
        disabled={disabled || busy}
        aria-pressed={selected}
        aria-label={`${name} ${selected ? "빼기" : "고르기"}`}
        className={cn(
          "block w-full overflow-hidden rounded-lg border-2 text-left transition-colors disabled:opacity-60",
          selected
            ? "border-primary bg-primary-soft ring-2 ring-primary/40"
            : "border-transparent hover:border-border",
        )}
      >
        <span className={cn(
          "relative block overflow-hidden bg-muted",
          aspect === "portrait" ? "aspect-[3/4]" : "aspect-square",
        )}>
          {image.url ? (
            <ThumbImage
              src={(image.thumbUrl ?? image.url) as string}
              alt=""
              className={cn("h-full w-full", fit === "contain" ? "object-contain p-1" : "object-cover")}
            />
          ) : null}

          {badge ? (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/85 px-1.5 py-0.5 text-[10px] font-bold text-subtle-foreground backdrop-blur">
              {badge}
            </span>
          ) : null}

          {selected ? (
            <span className="absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-ring)]">
              <Check className="size-3.5" />
            </span>
          ) : null}

          {busy ? (
            <span className="absolute inset-0 grid place-items-center bg-background/60">
              <Loader2 className="size-4 animate-spin text-primary" />
            </span>
          ) : null}
        </span>

        <span className={cn(
          "block truncate px-2 py-2 text-xs",
          selected && "font-bold text-primary",
        )}>
          {name}
        </span>
      </button>

      <button
        type="button"
        aria-label={`${name} 크게 보기`}
        onClick={() => openImageViewer(image.url ?? "", name)}
        className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-foreground"
      >
        <Maximize2 className="size-3.5" />
      </button>

      {onDelete ? (
        <button
          type="button"
          disabled={busy}
          aria-label={`${name} 지우기`}
          onClick={onDelete}
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
