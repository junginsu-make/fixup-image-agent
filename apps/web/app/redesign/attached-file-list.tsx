"use client";

import * as React from "react";
import { FileText, X } from "lucide-react";
import { attachedFileKey } from "./attached-files";

/**
 * 첨부한 원본을 **그림으로** 보여 주고 한 장씩 뺄 수 있게 한다.
 *
 * 전에는 파일 이름 딱지만 있었다. 무엇을 올렸는지 눈으로 확인할 수 없었고,
 * 잘못 올린 한 장을 빼려면 전부 다시 골라야 했다(2026-09-23 사용자).
 */
export function AttachedFileList({
  files,
  onRemove,
}: {
  files: readonly File[];
  onRemove: (key: string) => void;
}) {
  /*
    미리보기 주소는 **만드는 것과 놓는 것을 한 곳에서** 한다. 만드는 것을
    `useMemo` 에 두면, 개발 모드가 effect 를 한 번 정리했다 다시 돌릴 때 방금
    만든 주소만 놓이고 다시 안 만들어져 그림이 깨진다(독립 리뷰).
  */
  const [previews, setPreviews] = React.useState<string[]>([]);
  React.useEffect(() => {
    const urls = files.map((file) => (file.type.startsWith("image/") ? URL.createObjectURL(file) : ""));
    setPreviews(urls);
    return () => urls.forEach((url) => url && URL.revokeObjectURL(url));
  }, [files]);

  if (files.length === 0) return null;

  return (
    <div className="mt-3">
      {/*
        **몇 번째 파일이 빠지는지는 여기서 짚지 않는다.** 긴 이미지는 여러
        조각으로, PDF 는 여러 쪽으로 펼쳐진 뒤에 앞 몇 장이 쓰이므로 펼치기
        전에는 모른다. 틀리게 짚느니 안 짚는다 — 실제로 빠진 것은 변환 뒤
        `coverageNotice` 가 정확히 알린다.
      */}
      <p className="mb-2 text-xs font-bold text-muted-foreground">첨부 {files.length}개</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {files.map((file, index) => {
          const key = attachedFileKey(file);
          return (
            <li
              key={key}
              className="relative overflow-hidden rounded-md border border-border bg-card"
            >
              {previews[index] ? (
                <img src={previews[index]} alt={file.name} className="block aspect-[3/4] w-full object-cover object-top" />
              ) : (
                <span className="grid aspect-[3/4] w-full place-items-center text-muted-foreground">
                  <FileText className="size-6" />
                </span>
              )}
              <span className="block truncate px-1.5 py-1 text-[11px]" title={file.name}>
                {index + 1}. {file.name}
              </span>
              <button
                type="button"
                aria-label={`${file.name} 빼기`}
                onClick={() => onRemove(key)}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-foreground/75 text-background hover:bg-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
