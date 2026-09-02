"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button, cn } from "@fixup/ui";

/**
 * 포스터 레퍼런스 고르기.
 *
 * 라이브러리의 그림을 그대로 쓴다. 여기서 새로 올려도 라이브러리에 들어간다 —
 * 올린 곳이 어디든 세 도구가 다 본다.
 *
 * 한 그림에 두 가지 역할이 있다:
 *   따라 만들기   레이아웃·서체·색을 가져온다
 *   그대로 지키기  제품·인물의 생김새를 유지한다
 */

export interface ReferenceItem {
  id: string;
  title: string | null;
  url?: string;
}

export type Role = "none" | "style" | "preserved";

export function ReferencePicker({
  references, roles, onRoleChange, onUploaded,
}: {
  references: ReferenceItem[];
  roles: Record<string, Role>;
  onRoleChange(id: string, role: Role): void;
  onUploaded(): void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);

  /** 라이브러리에서 아주 지운다. 세 도구 어디서도 안 보이게 된다. */
  async function remove(item: ReferenceItem) {
    if (!window.confirm(`'${item.title ?? "이 이미지"}' 를 라이브러리에서 지울까요?`)) return;
    try {
      const body = await (await fetch(`/api/reference-images/${item.id}`, { method: "DELETE" })).json();
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      onRoleChange(item.id, "none");
      onUploaded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지우지 못했습니다.");
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("id", crypto.randomUUID());
        form.set("title", file.name.replace(/\.[^.]+$/, ""));
        // 용도로 거르지 않지만 어디서 올렸는지는 남긴다.
        form.set("purpose", "poster");
        form.set("file", file);
        const response = await fetch("/api/reference-images", { method: "POST", body: form });
        const payload = await response.json() as { ok?: boolean; message?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.message ?? "올리지 못했습니다.");
      }
      onUploaded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const nextRole: Record<Role, Role> = { none: "style", style: "preserved", preserved: "none" };
  const label: Record<Role, string> = {
    none: "안 씀", style: "따라 만들기", preserved: "그대로 지키기",
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">라이브러리에서 불러오기</h3>
          <p className="text-meta text-subtle-foreground">
            올려 둔 그림 {references.length}장 · 그림을 눌러 역할을 바꿉니다
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onUploaded}>새로고침</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(event) => void upload(event.target.files)}
        />
        <Button type="button" variant="secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? "올리는 중…" : "새 이미지 올리기"}
        </Button>
        <span className="text-sm text-muted-foreground">
          여기서 올린 그림도 라이브러리에 들어갑니다.
        </span>
      </div>

      {message ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {message}
        </div>
      ) : null}

      {references.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          라이브러리에 그림이 없습니다. 위에서 올리거나 라이브러리에서 먼저 올려 주세요.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {references.map((reference) => {
            const role = roles[reference.id] ?? "none";
            return (
              <div key={reference.id} className="relative">
              <button
                type="button"
                onClick={() => onRoleChange(reference.id, nextRole[role])}
                aria-pressed={role !== "none"}
                className={cn(
                  "overflow-hidden rounded-lg border-2 text-left transition-colors",
                  role === "style" ? "border-primary"
                    : role === "preserved" ? "border-amber-500"
                      : "border-transparent hover:border-border",
                )}
              >
                {reference.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reference.url} alt={reference.title ?? "참고 이미지"} className="aspect-[2/3] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[2/3] w-full place-items-center bg-muted text-xs text-muted-foreground">
                    미리보기 없음
                  </div>
                )}
                <span className="block truncate px-3 pt-2 text-xs">{reference.title ?? "제목 없음"}</span>
                <span className={cn(
                  "block px-3 pb-2 text-xs font-bold",
                  role === "style" ? "text-primary"
                    : role === "preserved" ? "text-amber-600"
                      : "text-subtle-foreground",
                )}>
                  {label[role]}
                </span>
              </button>
                <button
                  type="button"
                  aria-label={`${reference.title ?? "참고 이미지"} 라이브러리에서 지우기`}
                  onClick={() => void remove(reference)}
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
