"use client";

import * as React from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from "@fixup/ui";
import type { ReferencePurpose, ReferenceRole, ReferenceSetRecord } from "../api/reference-sets/schema";
import type { ReferenceImageRow } from "./reference-upload";

type ImageOption = ReferenceImageRow & { signedUrl: string | null };

export function SetEditor({
  open,
  images,
  initialSet,
  onClose,
  onSaved,
}: {
  open: boolean;
  images: ImageOption[];
  initialSet: ReferenceSetRecord | null;
  onClose(): void;
  onSaved(set: ReferenceSetRecord): void;
}) {
  const [name, setName] = React.useState("");
  const [purpose, setPurpose] = React.useState<ReferencePurpose>("cardnews");
  const [roles, setRoles] = React.useState<Record<string, ReferenceRole | "">>({});
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName(initialSet?.name ?? "");
    setPurpose(initialSet?.purpose ?? "cardnews");
    setRoles(Object.fromEntries((initialSet?.items ?? []).map((item) => [item.referenceImageId, item.role])));
    setMessage("");
  }, [initialSet, open]);

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
          <DialogDescription>참고 이미지를 고르고 표지·속지·엔딩 역할을 지정합니다.</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-6 overflow-y-auto p-1">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="grid gap-2">
              <Label htmlFor="reference-set-name">세트 이름</Label>
              <Input id="reference-set-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="예: 브랜드 기본 카드 세트" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reference-set-purpose">용도</Label>
              <select id="reference-set-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value as ReferencePurpose)} className="h-9 rounded-md border bg-background px-3 text-sm">
                <option value="cardnews">카드뉴스</option>
                <option value="poster">포스터</option>
                <option value="both">공용</option>
              </select>
            </div>
          </div>

          {compatibleImages.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">이 용도에 맞는 낱장 참고 이미지를 먼저 올려 주세요.</p>
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
