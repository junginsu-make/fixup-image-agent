"use client";

import * as React from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from "@fixup/ui";
import type { ReferencePurpose, ReferenceRole, ReferenceSetRecord } from "../api/reference-sets/schema";
import type { ReferenceImageRow } from "./reference-upload";
import { randomId } from "../../lib/browser-safe";

type ImageOption = ReferenceImageRow & { signedUrl: string | null };

/**
 * 묶음 세트 — **카드뉴스 한 벌**이다.
 *
 * 역할이 표지·속지·엔딩이라 카드뉴스 말고는 뜻이 없다. 포스터는 한 장짜리라
 * 표지도 속지도 없다. 전에는 용도를 고르게 해서 「포스터 세트」를 만들 수
 * 있었는데, 만들어 놓아도 포스터가 쓰지 않는다.
 */
export function SetEditor({
  open,
  images,
  initialSet,
  onClose,
  onSaved,
  onUploaded,
}: {
  open: boolean;
  images: ImageOption[];
  initialSet: ReferenceSetRecord | null;
  onClose(): void;
  onSaved(set: ReferenceSetRecord): void;
  /** 창 안에서 올린 뒤 목록을 다시 읽는다. 나갔다 오지 않게. */
  onUploaded(): Promise<void>;
}) {
  const purpose: ReferencePurpose = "cardnews";
  const [name, setName] = React.useState("");
  const [roles, setRoles] = React.useState<Record<string, ReferenceRole | "">>({});
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(initialSet?.name ?? "");
    setRoles(Object.fromEntries((initialSet?.items ?? []).map((item) => [item.referenceImageId, item.role])));
    setMessage("");
  }, [initialSet, open]);

  /** 세트를 만들다 그림이 모자라면 여기서 바로 올린다. */
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("id", randomId());
        form.set("title", file.name.replace(/\.[^.]+$/, ""));
        form.set("purpose", "cardnews");
        form.set("file", file);
        const body = await (await fetch("/api/reference-images", { method: "POST", body: form })).json();
        if (!body.ok) throw new Error(body.message ?? "올리지 못했습니다.");
      }
      await onUploaded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const compatibleImages = React.useMemo(
    () => images.filter((image) => image.purpose === purpose || image.purpose === "both"),
    [images, purpose],
  );

  async function save() {
    const items = compatibleImages.flatMap((image, position) => {
      const role = roles[image.id];
      return role ? [{ referenceImageId: image.id, role, position }] : [];
    });
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(initialSet ? `/api/reference-sets/${initialSet.id}` : "/api/reference-sets", {
        method: initialSet ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, purpose, items }),
      });
      const payload = await response.json() as { ok?: boolean; set?: ReferenceSetRecord; message?: string };
      if (!response.ok || !payload.set) throw new Error(payload.message ?? "세트를 저장하지 못했습니다.");
      onSaved(payload.set);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "세트를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const coverCount = Object.values(roles).filter((role) => role === "cover").length;
  const endingCount = Object.values(roles).filter((role) => role === "ending").length;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{initialSet ? "묶음 세트 수정" : "묶음 세트 만들기"}</DialogTitle>
          <DialogDescription>
            카드뉴스 한 벌을 묶습니다. 그림을 고르고 표지·속지·엔딩 자리를 정하세요.
            표지와 엔딩은 각각 한 장까지입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-6 overflow-y-auto p-1">
          <div className="grid gap-2">
            <Label htmlFor="reference-set-name">세트 이름</Label>
            <Input id="reference-set-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="예: 브랜드 기본 카드 세트" />
          </div>

          {/* 그림이 모자라면 나갔다 오지 않고 여기서 바로 올린다. */}
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
              {uploading ? "올리는 중…" : "이미지 올리기"}
            </Button>
            <span className="text-xs text-muted-foreground">여기서 올린 그림도 라이브러리 낱장에 들어갑니다.</span>
          </div>

          {compatibleImages.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">아직 고를 그림이 없습니다. 위에서 올려 주세요.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {compatibleImages.map((image) => (
                <label key={image.id} className="grid gap-2 rounded-lg border p-2">
                  <div className="aspect-square overflow-hidden rounded-md bg-muted">
                    {image.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.signedUrl} alt={image.title ?? "참고 이미지"} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <span className="truncate text-xs font-medium">{image.title || "제목 없음"}</span>
                  <select
                    aria-label={`${image.title ?? "참고 이미지"} 역할`}
                    value={roles[image.id] ?? ""}
                    onChange={(event) => setRoles((current) => ({ ...current, [image.id]: event.target.value as ReferenceRole | "" }))}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">선택 안 함</option>
                    <option value="cover" disabled={coverCount >= 1 && roles[image.id] !== "cover"}>표지</option>
                    <option value="body">속지</option>
                    <option value="ending" disabled={endingCount >= 1 && roles[image.id] !== "ending"}>엔딩</option>
                  </select>
                </label>
              ))}
            </div>
          )}
          {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? "저장 중…" : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
