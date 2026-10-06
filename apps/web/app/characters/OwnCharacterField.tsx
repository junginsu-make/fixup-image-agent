"use client";
import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@fixup/ui";
import { openImageViewer } from "../_components/image-viewer";
import { LibraryPickerButton } from "../_components/library-picker";
import type { ReadImage } from "./read-image";

/**
 * 「내 캐릭터 · 선택」 — 생김새를 **반드시 지킬** 그림 한 장.
 *
 * 참고할 그림 칸과 넣는 길이 같다(새로 올리기·라이브러리). 한 칸 안에 작게
 * 둔다 — 크게 보려면 눌러서 본다. 묘사 칸의 높이를 뺏으면 글이 짧아진다.
 */
export function OwnCharacterField(props: {
  value: (ReadImage & { libraryId?: string }) | null;
  locked: boolean;
  library: Array<{ id: string; title: string | null; url: string | null; thumbUrl: string | null }>;
  onUpload: (files: FileList | null) => void;
  onPickLibrary: (image: { id: string; url: string | null }) => void;
  onClear: () => void;
  onReloadLibrary: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { value, locked } = props;
  return (
    <div className="grid flex-none gap-1.5">
      <span className="text-meta text-subtle-foreground">내 캐릭터 · 선택</span>
      <div className="flex items-center gap-3 rounded-md border border-dashed p-2">
        {value ? (
          <button
            type="button" aria-label="내 캐릭터 크게 보기"
            onClick={() => openImageViewer(value.url, "내 캐릭터")}
            className="size-16 flex-none overflow-hidden rounded border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.url} alt="내 캐릭터" className="size-full object-contain" />
          </button>
        ) : (
          <div className="grid size-16 flex-none place-items-center rounded border bg-muted">
            <ImagePlus className="size-5 text-subtle-foreground" />
          </div>
        )}
        <div className="grid min-w-0 gap-1.5">
          <p className="text-[11px] leading-snug text-subtle-foreground">
            넣으면 이 캐릭터의 생김새를 그대로 지킵니다. 오른쪽 참고할 그림에 레퍼런스를 넣으면
            그 화풍과 몸 비율로 바꿉니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(event) => { props.onUpload(event.target.files); event.target.value = ""; }}
            />
            <Button type="button" variant="secondary" size="sm" disabled={locked}
              onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4" />{value ? "다른 그림" : "새 이미지 올리기"}
            </Button>
            <LibraryPickerButton
              images={props.library}
              selectedIds={value?.libraryId ? [value.libraryId] : []}
              onToggle={(image) => props.onPickLibrary(image)}
              onReload={props.onReloadLibrary}
              label="라이브러리"
              title="내 캐릭터 고르기"
              description="한 장만 씁니다. 다시 누르면 뺍니다"
            />
            {value ? (
              <button
                type="button" disabled={locked} onClick={props.onClear}
                className="text-xs text-subtle-foreground hover:text-destructive disabled:opacity-50"
              >
                <X className="mr-1 inline size-3" />빼기
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
