"use client";

import * as React from "react";
import { Check, FolderOpen, Maximize2, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@fixup/ui";
import { openImageViewer } from "./image-viewer";

/**
 * 라이브러리에서 그림을 불러오는 버튼.
 *
 * 전에는 라이브러리 그림을 화면에 통째로 깔아 두고 "눌러서 고르세요"라고
 * 적어 뒀다. 누를 것이 안 보이니 불러올 방법이 없다는 말을 세 번 들었다.
 * 파일 올리기 옆에 같은 크기의 버튼을 두고, 고른 것만 아래에 남긴다.
 *
 * 이 컴포넌트는 그리기만 한다. 목록을 어디서 가져오는지는 쓰는 쪽 사정이다.
 */

export interface LibraryPickImage {
  id: string;
  title: string | null;
  url: string | null;
}

/**
 * 묶음 세트 — 표지·속지·엔딩까지 정해 둔 한 벌.
 *
 * 세트를 만들어 놓고도 여기서 못 불러왔다. 낱장만 보여줘서 한 장씩 고르고
 * 자리도 다시 정해야 했다. 세트를 만든 뜻이 사라진다.
 */
export interface LibraryPickSet {
  id: string;
  name: string;
  items: Array<{ referenceImageId: string; role: "cover" | "body" | "ending" }>;
}

export function LibraryPickerButton({
  images,
  selectedIds,
  loading = false,
  onToggle,
  onReload,
  onDelete,
  sets,
  onPickSet,
  label = "라이브러리에서 불러오기",
}: {
  images: LibraryPickImage[];
  selectedIds: string[];
  loading?: boolean;
  onToggle(image: LibraryPickImage): void;
  onReload(): void;
  /** 세트를 통째로 넣는다. 안 넘기면 세트 칸이 안 나온다. */
  sets?: LibraryPickSet[];
  onPickSet?(set: LibraryPickSet): void;
  /** 라이브러리에서 아주 지운다. 안 넘기면 지우기 버튼이 안 나온다. */
  onDelete?(image: LibraryPickImage): void;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const picked = new Set(selectedIds);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FolderOpen className="size-4" />
        {label}
        <Badge variant="secondary" className="ml-1">{images.length}</Badge>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>라이브러리에서 불러오기</DialogTitle>
            <DialogDescription>
              올려 둔 그림 {images.length}장 · 눌러서 고르고 다시 눌러 뺍니다
            </DialogDescription>
          </DialogHeader>

          {sets?.length && onPickSet ? (
            <section className="grid gap-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-meta text-subtle-foreground">묶음 세트 — 누르면 한 벌이 통째로 들어갑니다</p>
              <div className="flex flex-wrap gap-2">
                {sets.map((set) => (
                  <Button
                    key={set.id}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => { onPickSet(set); setOpen(false); }}
                  >
                    {set.name}
                    <Badge variant="secondary" className="ml-1">{set.items.length}장</Badge>
                  </Button>
                ))}
              </div>
            </section>
          ) : null}

          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">불러오는 중입니다.</p>
          ) : images.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              라이브러리가 비어 있습니다. 먼저 그림을 올려 주세요.
            </p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
              {images.map((image) => {
                const selected = picked.has(image.id);
                return (
                  <div key={image.id} className="relative">
                    <button
                      type="button"
                      onClick={() => onToggle(image)}
                      aria-pressed={selected}
                      aria-label={`${image.title ?? "참고 이미지"} ${selected ? "빼기" : "고르기"}`}
                      className={cn(
                        "block w-full overflow-hidden rounded-lg border-2 text-left transition-colors",
                        selected ? "border-primary" : "border-transparent hover:border-border",
                      )}
                    >
                      <span className="relative block aspect-square overflow-hidden bg-muted">
                        {image.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image.url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                        {selected ? (
                          <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3.5" />
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate px-2 py-2 text-xs">{image.title ?? "제목 없음"}</span>
                    </button>
                    {/* 그림 자체는 고르기에 쓰이므로 확대는 따로 연다. */}
                    <button
                      type="button"
                      aria-label={`${image.title ?? "참고 이미지"} 크게 보기`}
                      onClick={() => openImageViewer(image.url ?? "", image.title ?? "참고 이미지")}
                      className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-foreground"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                    {onDelete ? (
                      <button
                        type="button"
                        aria-label={`${image.title ?? "참고 이미지"} 라이브러리에서 지우기`}
                        onClick={() => onDelete(image)}
                        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={onReload}>새로고침</Button>
            <Button type="button" onClick={() => setOpen(false)}>
              다 골랐습니다{selectedIds.length ? ` · ${selectedIds.length}장` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
