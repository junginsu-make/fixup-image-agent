"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@fixup/ui";
import { toSavedLibraryImages } from "./saved-image-picker";
import { deleteTargetFor } from "./saved-image-delete";
import { PickCell } from "../_components/pick-cell";

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
  /** 출처가 섞일 때만 쓴다. 한쪽만 보여주는 자리에서는 무시된다. */
  const [tab, setTab] = useState<"all" | "reference" | "library">("all");
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
   * **라이브러리 불러오기 창과 같은 모양이다.**
   *
   * 전에는 고르는 격자를 화면에 그대로 깔았다. 세 칸(인물·캐릭터·레퍼런스)이
   * 동시에 펼쳐지면 설정이 저 아래로 밀려 무엇을 고르는 중인지 알기 어려웠다.
   * 이미지 만들기(`_components/library-picker.tsx`)가 먼저 같은 이유로 모달이 됐다.
   *
   * 2026-09-11 에 **칸과 껍데기를 그쪽과 함께 쓰기로** 했다. 같은 일을 하는
   * 자리가 도구마다 다르게 생기면 쓰는 사람이 매번 다시 배운다 — 확대 단추가
   * 어디 있는지, 이름이 어디 붙는지, 지우기가 어느 쪽인지.
   *
   * 출처가 섞일 때만 **탭**으로 가른다. 한쪽만 보여주는 자리(`origin`)는
   * 가를 것이 없으므로 탭도 없다.
   */
  const shown = origin ? images : tab === "all" ? images : images.filter((image) => image.origin === tab);
  const counts = {
    reference: images.filter((image) => image.origin === "reference").length,
    library: images.filter((image) => image.origin === "library").length,
  };
  const mixed = !origin && counts.reference > 0 && counts.library > 0;

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
              {loading ? "저장해 둔 그림을 찾는 중입니다" : "눌러서 고릅니다"}
            </DialogDescription>
          </DialogHeader>

          {mixed ? (
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
              {([
                { id: "all" as const, label: "전체", count: images.length },
                { id: "reference" as const, label: "레퍼런스", count: counts.reference },
                { id: "library" as const, label: "작업물", count: counts.library },
              ]).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-current={tab === entry.id ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === entry.id
                      ? "bg-background shadow-[var(--shadow-ring)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {entry.count}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중입니다.
            </div>
          ) : shown.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {origin === "reference"
                ? "등록한 레퍼런스가 없습니다. 이미지를 올리면 레퍼런스로 저장되고 여기에 나옵니다."
                : origin === "library" && excludeCharacterItems
                  ? "라이브러리에 사용할 수 있는 인물 사진이 없습니다. 캐릭터는 아래 전용 버튼에서 고를 수 있습니다."
                  : origin === "library"
                    ? "라이브러리에 저장한 작업이 없습니다. 만든 결과를 저장하면 여기에 나옵니다."
                    : "저장된 이미지가 없습니다. 레퍼런스를 등록하거나 라이브러리에 작업을 보관하면 여기에 나옵니다."}
            </p>
          ) : (
            <div className="grid max-h-[56vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
              {shown.map((image) => (
                <PickCell
                  key={image.id}
                  image={{ id: image.id, title: image.name, url: image.url, thumbUrl: image.thumbUrl }}
                  // 출처를 말해 준다. 레퍼런스는 이미 분석이 끝나 있어 받는 쪽이
                  // 한 번 더 돌리지 않는다.
                  badge={mixed ? (image.origin === "reference" ? "레퍼런스" : "작업물") : undefined}
                  // 세로로 긴 상세페이지 그림은 잘리면 무엇인지 알 수 없다.
                  aspect="portrait"
                  fit="contain"
                  busy={pickingId === image.id}
                  disabled={Boolean(pickingId) || Boolean(deletingId)}
                  onPick={() => void handlePick(image)}
                  onDelete={() => void handleDelete(image)}
                />
              ))}
            </div>
          )}

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => void load()}>새로고침</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
