"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchLibraryImages, uploadLibraryImage, type LibraryImage } from "./library-images";

/**
 * 라이브러리의 참고 이미지에서 하나 고른다.
 *
 * 로고 칸에 놓을 그림과, 「이 레퍼런스처럼 칸을 잡아 줘」에 쓸 카드 한 장을
 * 같은 곳에서 고른다. 올리는 곳이 둘이면 사용자가 어디에 뒀는지 못 찾는다.
 *
 * 받아 오는 일은 `library-images.ts` 가 한다 — 이 자리가 한 화면에 둘이라
 * 각자 부르면 같은 목록을 두 번 받아 온다.
 */

export type { LibraryImage };

export function useLibraryImages() {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const loaded = await fetchLibraryImages();
        if (alive) setImages(loaded);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "참고 이미지를 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /** 올린 그림을 목록 맨 앞에 끼운다. 다시 받아 오면 순서가 흔들린다. */
  const add = useCallback((image: LibraryImage) => {
    setImages((current) => [image, ...current]);
  }, []);

  return { images, error, loading, add };
}

/** 그림을 골라 올리는 버튼. 하던 일을 끊지 않게 이 자리에 둔다. */
export function LibraryUploadButton({ onUploaded }: { onUploaded(image: LibraryImage): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <label className="grid gap-1">
      <span
        className={`inline-flex h-9 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium ${
          busy ? "opacity-60" : "hover:bg-muted"
        }`}
      >
        {busy ? "올리는 중…" : "레퍼런스 올리기"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            // 같은 파일을 다시 골라도 change 가 뜨게 값을 비운다.
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              onUploaded(await uploadLibraryImage(file));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "그림을 올리지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </span>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

export function LibraryPicker({ value, onPick, emptyHint, size = "card", images: given }: {
  value?: string;
  onPick(id: string): void;
  emptyHint?: string;
  /** 밖에서 이미 받아 둔 목록. 주면 자기가 다시 받아 오지 않는다. */
  images?: LibraryImage[];
  /**
   * `card` 는 카드 한 장을 고르는 자리다 — **잘리지 않게 통째로** 보여 준다.
   * 칸 배치를 보고 고르는 것이라 64px 짜리 잘린 조각으로는 판단할 수 없다.
   * `icon` 은 로고처럼 작은 그림을 고르는 자리다.
   */
  size?: "card" | "icon";
}) {
  const own = useLibraryImages();
  const images = given ?? own.images;
  const error = given ? null : own.error;
  const loading = given ? false : own.loading;

  if (loading) return <p className="text-sm text-muted-foreground">라이브러리를 여는 중…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!images.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyHint ?? "라이브러리에 그림이 없습니다. 먼저 라이브러리에 올려 주세요."}
      </p>
    );
  }

  const big = size === "card";
  return (
    /**
     * `content-start` 와 `auto-rows-max` 가 없으면 격자가 줄 높이를 목록
     * 높이에 맞춰 **눌러 버린다.** 버튼이 눌리면 `overflow-hidden` 이 그림
     * 아래를 잘라, 카드 배치를 보고 고르는 자리에서 정작 아래쪽이 안 보인다
     * (실측: 이미지 224px 인데 버튼 154px).
     */
    <div className={`grid h-full content-start gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 ${
      big ? "auto-rows-max grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "max-h-56 auto-rows-max grid-cols-4"
    }`}>
      {images.map((image) => (
        <button
          key={image.id}
          type="button"
          onClick={() => onPick(image.id)}
          title={image.title ?? image.id}
          className={`overflow-hidden rounded-md border-2 bg-white transition ${
            value === image.id ? "border-primary ring-2 ring-primary/40" : "border-transparent hover:border-muted-foreground/40"
          }`}
        >
          {image.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 서명 URL·data URL 이라 최적화 대상이 아니다.
            <img
              src={image.signedUrl}
              alt={image.title ?? "참고 이미지"}
              /**
               * `contain` 이어야 카드 전체가 보인다 — `cover` 는 가장자리를 잘라
               * 배치를 감춘다. 칸을 정사각으로 두는 것은 카드가 대개 정사각이나
               * 세로라, 가로로 넓은 칸에 담으면 양옆이 온통 흰 여백이 되기 때문이다.
               */
              className={`w-full bg-white object-contain ${big ? "aspect-square h-auto" : "h-16"}`}
            />
          ) : (
            <span className={`flex items-center justify-center bg-muted text-[10px] ${big ? "aspect-square" : "h-16"}`}>주소 없음</span>
          )}
        </button>
      ))}
    </div>
  );
}
