"use client";

import * as React from "react";
import { ImagePlus, Maximize2, X } from "lucide-react";
import { Button, cn } from "@fixup/ui";
import { ATTACHMENT_ROLE_LABEL, type AttachmentRole } from "@fixup/shared";
import { LibraryPickerButton } from "../../_components/library-picker";
import { openImageViewer } from "../../_components/image-viewer";
import { randomId } from "../../../lib/browser-safe";

/**
 * 포스터 레퍼런스 고르기.
 *
 * 라이브러리의 그림을 그대로 쓴다. 여기서 새로 올려도 라이브러리에 들어간다 —
 * 올린 곳이 어디든 세 도구가 다 본다.
 *
 * 역할은 공용 어휘를 쓴다(@fixup/shared). 세 도구가 같은 말을 써야 라이브러리에서
 * 불러온 그림이 도구를 옮겨도 역할을 잃지 않는다.
 *
 *   따라 만들기        레이아웃·서체·색을 가져온다
 *   제품 그대로 지키기   형태·색·재질·라벨을 유지한다
 *   인물 그대로 지키기   얼굴과 체형을 유지한다
 */

export interface ReferenceItem {
  id: string;
  title: string | null;
  url?: string;
}

/** 공용 역할 어휘를 그대로 쓴다. none 은 '아직 안 골랐다'는 화면 상태다. */
export type Role = "none" | AttachmentRole;

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
        form.set("id", randomId());
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

  /** 고른 것만 화면에 남긴다. 라이브러리 전체는 불러오기 창에서 본다. */
  const picked = references.filter((reference) => (roles[reference.id] ?? "none") !== "none");

  // 고른 뒤에는 세 역할을 돈다. 빼기는 X 로 한다.
  // 사람과 물건을 가르는 이유: 지키는 방법이 다르고, 얼굴이 둘이면 모델이
  // 절충해 제3의 인물을 만든다(2026-07-30 실측).
  const nextRole: Record<Role, Role> = {
    none: "style",
    style: "preserve_product",
    preserve_product: "preserve_person",
    preserve_person: "style",
    place_as_is: "style",
  };
  const label: Record<Role, string> = { none: "안 씀", ...ATTACHMENT_ROLE_LABEL };

  return (
    <div className="grid gap-4">
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
          <ImagePlus className="size-4" />
          {uploading ? "올리는 중…" : "새 이미지 올리기"}
        </Button>
        <LibraryPickerButton
          images={references.map((reference) => ({ id: reference.id, title: reference.title, url: reference.url ?? null }))}
          selectedIds={references.filter((reference) => (roles[reference.id] ?? "none") !== "none").map((reference) => reference.id)}
          onToggle={(picked) => onRoleChange(picked.id, (roles[picked.id] ?? "none") === "none" ? "style" : "none")}
          onReload={onUploaded}
          onDelete={(picked) => {
            const reference = references.find((entry) => entry.id === picked.id);
            if (reference) void remove(reference);
          }}
        />
        <span className="text-sm text-muted-foreground">
          여기서 올린 그림도 라이브러리에 들어갑니다.
        </span>
      </div>

      {message ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {message}
        </div>
      ) : null}

      {picked.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 고른 그림이 없습니다. 새로 올리거나 라이브러리에서 불러오세요.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {picked.map((reference) => {
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
                    : role.startsWith("preserve") ? "border-amber-500"
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
                    : role.startsWith("preserve") ? "text-amber-600"
                      : "text-subtle-foreground",
                )}>
                  {label[role]}
                </span>
              </button>
                <button
                  type="button"
                  aria-label={`${reference.title ?? "참고 이미지"} 크게 보기`}
                  onClick={() => openImageViewer(reference.url ?? "", reference.title ?? "참고 이미지")}
                  className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-foreground"
                >
                  <Maximize2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`${reference.title ?? "참고 이미지"} 빼기`}
                  onClick={() => onRoleChange(reference.id, "none")}
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
