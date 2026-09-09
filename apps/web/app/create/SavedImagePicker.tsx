"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Loader2, Maximize2, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@fixup/ui";
import { openImageViewer } from "../_components/image-viewer";
import { toSavedLibraryImages } from "./saved-image-picker";
import { deleteTargetFor } from "./saved-image-delete";
import { ThumbImage } from "../_components/thumb-image";

/**
 * 계정에 저장해 둔 이미지에서 고른다.
 *
 * 지금까지는 파일을 올리는 길밖에 없었다. 같은 상품 사진이나 모델 사진을
 * 쓸 때마다 디스크에서 다시 찾아 올려야 했다. 이미 계정에 있는 것을 그대로
 * 쓰는 편이 빠르다.
 *
 * 레퍼런스와 라이브러리를 함께 보여준다. 사용자에게는 둘 다 "내가 저장해 둔
 * 이미지"다 — 어느 통에 들어 있는지는 우리 사정이다.
 */

interface SavedImage {
  id: string;
  name: string;
  /** **원본이다.** 고르면 이 주소를 받아 생성 입력으로 넘긴다. */
  url: string;
  /** 격자에 거는 사본. 없으면 `url` 로 떨어진다. */
  thumbUrl?: string | null;
  origin: "reference" | "library";
  /** 레퍼런스로 이미 등록된 것이면 그 행의 id. 라이브러리 이미지는 없다. */
  referenceId?: string;
  description?: string;
}

/**
 * 고른 이미지가 **어디서 왔는지**. 이미 레퍼런스로 등록된 것을 다시 등록하면
 * 같은 이미지가 두 벌 쌓이고 분석도 한 번 더 돈다 — 받는 쪽이 건너뛸 수 있게 알려준다.
 */
export type SavedImageSource =
  | { origin: "reference"; referenceId: string; description: string }
  | { origin: "library" };

interface SavedImagePickerProps {
  /** 고른 이미지를 파일로 바꿔 넘긴다. 업로드 경로와 똑같이 처리되게 하기 위해서다. */
  onPick: (file: File, source: SavedImageSource) => void;
  label?: string;
  /**
   * 어느 쪽만 보여줄지. 인물 자리에 상세페이지 이미지를 고르면 모델이 그 안의
   * 얼굴을 가져오고, 레퍼런스 자리에 인물 사진을 고르면 디자인이 인물 사진을
   * 따라간다. 자리마다 쓸 수 있는 것만 보여준다.
   */
  origin?: "reference" | "library";
  /** 캐릭터 전용 선택창과 같은 결과물이 겹쳐 보이지 않게 한다. */
  excludeCharacterItems?: boolean;
}

export function SavedImagePicker({
  onPick,
  label = "저장된 이미지에서 고르기",
  origin,
  excludeCharacterItems = false,
}: SavedImagePickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<SavedImage[]>([]);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [refs, library, shared] = await Promise.all([
        fetch("/api/pdp/style-references", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({})),
        fetch("/api/library", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({})),
        // 카드뉴스·포스터가 쓰는 라이브러리 참고 이미지. 표가 다르다고 여기서
        // 안 보이면 "분명 올렸는데 상세페이지에선 없다"가 된다.
        fetch("/api/reference-images", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({})),
      ]);

      const fromRefs: SavedImage[] = (refs?.references ?? [])
        .filter((item: { url?: string }) => item.url)
        .map((item: { id: string; name: string; url: string; description?: string }) => ({
          id: `ref-${item.id}`,
          name: item.name,
          url: item.url,
          // 참고 이미지에는 아직 사본이 없다. 원본으로 떨어진다.
          thumbUrl: null,
          origin: "reference" as const,
          referenceId: item.id,
          description: item.description ?? "",
        }));

      // 라이브러리는 표지 한 장만 쓴다. 작업 하나에 여러 장이 들어 있지만
      // 여기서 고르는 것은 "참조로 쓸 사진 한 장"이다.
      const fromLibrary = toSavedLibraryImages(
        library?.items ?? [],
        excludeCharacterItems,
      );

      const fromShared: SavedImage[] = (shared?.images ?? [])
        .filter((item: { signedUrl?: string | null; url?: string | null }) => item.signedUrl || item.url)
        .map((item: { id: string; title?: string | null; signedUrl?: string | null; url?: string | null }) => ({
          id: `lib-${item.id}`,
          name: item.title ?? "참고 이미지",
          url: (item.signedUrl ?? item.url)!,
          origin: "reference" as const,
          description: "라이브러리 참고 이미지",
        }));

      const all = [...fromRefs, ...fromShared, ...fromLibrary];
      setImages(origin ? all.filter((image) => image.origin === origin) : all);
    } catch {
      setMessage("저장된 이미지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [excludeCharacterItems, origin]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  /**
   * 저장해 둔 그림을 **아주 지운다.**
   *
   * 한 번 올리면 지울 방법이 없어 목록이 계속 쌓였다. 되돌릴 수 없으므로
   * 한 번 묻는다 — 이미지 만들기(`reference-picker.tsx`)와 같은 방식이다.
   */
  const handleDelete = async (image: SavedImage) => {
    if (!window.confirm(`'${image.name}' 를 아주 지울까요? 되돌릴 수 없습니다.`)) return;
    setDeletingId(image.id);
    setMessage("");
    try {
      const target = deleteTargetFor(image);
      const response = await fetch(target.url, {
        method: "DELETE",
        ...(target.body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(target.body) }
          : {}),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지우지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePick = async (image: SavedImage) => {
    setPickingId(image.id);
    setMessage("");
    try {
      // 서명 URL 이라 그대로 넘길 수 없다. 받아서 File 로 바꾼다 —
      // 그래야 업로드한 것과 똑같은 경로(압축·검증)를 탄다.
      const blob = await (await fetch(image.url)).blob();
      const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      onPick(
        new File([blob], `${image.name}.${extension}`, { type: blob.type || "image/jpeg" }),
        image.origin === "reference" && image.referenceId
          ? {
              origin: "reference",
              referenceId: image.referenceId,
              description: image.description ?? "",
            }
          : { origin: "library" },
      );
      setOpen(false);
    } catch {
      setMessage("이미지를 가져오지 못했습니다.");
    } finally {
      setPickingId(null);
    }
  };

  /**
   * **모달로 연다.**
   *
   * 전에는 고르는 격자를 화면에 그대로 깔았다. 세 칸(인물·캐릭터·레퍼런스)이
   * 동시에 펼쳐지면 설정이 저 아래로 밀려 무엇을 고르는 중인지 알기 어려웠다.
   * 이미지 만들기(`_components/library-picker.tsx`)가 먼저 같은 이유로 모달이 됐다.
   */
  return (
    <>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}>
        <FolderOpen size={14} className="mr-1.5" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {loading ? "불러오는 중입니다." : `저장해 둔 그림 ${images.length}장 · 눌러서 고릅니다`}
            </DialogDescription>
          </DialogHeader>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          불러오는 중입니다.
        </div>
      ) : images.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {origin === "reference"
            ? "등록한 레퍼런스가 없습니다. 이미지를 올리면 레퍼런스로 저장되고 여기에 나옵니다."
            : origin === "library" && excludeCharacterItems
              ? "라이브러리에 사용할 수 있는 인물 사진이 없습니다. 캐릭터는 아래 전용 버튼에서 고를 수 있습니다."
              : origin === "library"
                ? "라이브러리에 저장한 작업이 없습니다. 만든 결과를 저장하면 여기에 나옵니다."
              : "저장된 이미지가 없습니다. 레퍼런스를 등록하거나 라이브러리에 작업을 보관하면 여기에 나옵니다."}
        </p>
      ) : (
        <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5">
          {images.map((image) => (
            <div key={image.id} className="relative">
            {/* 그림 자체는 고르기에 쓰이므로 확대는 돋보기로 따로 연다. */}
            <div className="absolute right-1 top-1 z-10 flex gap-1">
              <button
                type="button"
                aria-label={`${image.name} 크게 보기`}
                onClick={() => openImageViewer(image.url, image.name)}
                className="grid h-6 w-6 place-items-center rounded bg-background/85 text-subtle-foreground backdrop-blur hover:text-foreground"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
              {/* 되돌릴 수 없는 일이라 눈에 덜 띄게 두고, 누르면 한 번 묻는다. */}
              <button
                type="button"
                disabled={Boolean(deletingId)}
                aria-label={`${image.name} 지우기`}
                onClick={() => void handleDelete(image)}
                className="grid h-6 w-6 place-items-center rounded bg-background/85 text-subtle-foreground backdrop-blur hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                {deletingId === image.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            </div>
            <button
              type="button"
              disabled={Boolean(pickingId)}
              onClick={() => void handlePick(image)}
              className={cn(
                "group relative aspect-[3/4] overflow-hidden rounded-md bg-muted text-left",
                "transition-opacity hover:opacity-90 disabled:opacity-50",
              )}
            >
              {/*
                object-cover 로 채우면 세로 긴 상세페이지 이미지가 위아래로 잘려
                무엇을 고르는지 알 수 없다. 전체가 보이게 맞춘다.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* 격자는 사본을 쓴다. 고르기(위 handlePick)와 확대는 원본이다. */}
              <ThumbImage alt={image.name} src={image.thumbUrl ?? image.url} className="h-full w-full object-contain" />
              <Badge
                variant="secondary"
                className="absolute left-1 top-1 text-meta backdrop-blur"
              >
                {image.origin === "reference" ? "레퍼런스" : "작업물"}
              </Badge>
              {pickingId === image.id ? (
                <div className="absolute inset-0 grid place-items-center bg-background/60">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-1 text-meta backdrop-blur">
                {image.name}
              </span>
            </button>
            </div>
          ))}
        </div>
      )}

      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
