"use client";

import * as React from "react";
import { AlertTriangle, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { groupAttachments, modelById, referenceWarningsForRole, validateAttachments, type Attachment, type AttachmentKind, type StyleRole } from "@fixup/sns-core";
import { Badge, Button, Card, CardContent } from "@fixup/ui";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { persistReferenceImage, type ReferenceImageRow } from "../../library/reference-upload";

type ImageView = ReferenceImageRow & { signedUrl: string | null };
type ReferenceImageDbRow = {
  id: string; user_id: string; storage_path: string; title: string | null;
  purpose: ReferenceImageRow["purpose"]; width: number | null; height: number | null; created_at: string;
};

async function localStoreEnabled(): Promise<boolean> {
  const response = await fetch("/api/local-store", { cache: "no-store" });
  const payload = await response.json() as { ok?: boolean; enabled?: boolean };
  return Boolean(response.ok && payload.ok && payload.enabled);
}

export function AttachmentPicker({
  attachments,
  onChange,
  modelId,
  totalCards,
}: {
  attachments: Attachment[];
  onChange(value: Attachment[]): void;
  modelId: string;
  totalCards: number;
}) {
  const [images, setImages] = React.useState<ImageView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (await localStoreEnabled()) {
        const response = await fetch("/api/reference-images", { cache: "no-store" });
        const payload = await response.json() as { ok?: boolean; images?: ImageView[]; message?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.message ?? "참고 이미지를 불러오지 못했습니다.");
        setImages(payload.images ?? []);
      } else {
        const supabase = createSupabaseBrowserClient();
        const result = await supabase.from("reference_images")
          .select("id,user_id,storage_path,title,purpose,width,height,created_at")
          .order("created_at", { ascending: false });
        if (result.error) throw new Error(result.error.message);
        const rows = (result.data ?? []) as ReferenceImageDbRow[];
        const signed = rows.length ? await supabase.storage.from("library").createSignedUrls(rows.map((row) => row.storage_path), 3600) : { data: [], error: null };
        if (signed.error) throw new Error(signed.error.message);
        setImages(rows.map((row, index) => ({
          id: row.id, userId: row.user_id, storagePath: row.storage_path,
          title: row.title, purpose: row.purpose, width: row.width, height: row.height,
          createdAt: row.created_at, signedUrl: signed.data?.[index]?.signedUrl ?? null,
        })) as ImageView[]);
      }
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "참고 이미지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const local = await localStoreEnabled();
      for (const file of Array.from(files)) {
        if (local) {
          const form = new FormData();
          form.set("id", crypto.randomUUID());
          form.set("title", file.name.replace(/\.[^.]+$/, ""));
          form.set("purpose", "cardnews");
          form.set("file", file);
          const response = await fetch("/api/reference-images", { method: "POST", body: form });
          const payload = await response.json() as { ok?: boolean; message?: string };
          if (!response.ok || !payload.ok) throw new Error(payload.message ?? "업로드하지 못했습니다.");
        } else {
          const supabase = createSupabaseBrowserClient();
          await persistReferenceImage({ file, title: file.name.replace(/\.[^.]+$/, ""), purpose: "cardnews" }, {
            createId: () => crypto.randomUUID(),
            getUserId: async () => {
              const result = await supabase.auth.getUser();
              if (result.error || !result.data.user) throw new Error(result.error?.message ?? "로그인이 필요합니다.");
              return result.data.user.id;
            },
            upload: async (path, selected) => {
              const result = await supabase.storage.from("library").upload(path, selected, { contentType: selected.type, upsert: false });
              if (result.error) throw new Error(result.error.message);
            },
            insert: async (row) => {
              const result = await supabase.from("reference_images").insert(row).select("id,user_id,storage_path,title,purpose,width,height,created_at").single();
              if (result.error) throw new Error(result.error.message);
              return { id: result.data.id, userId: result.data.user_id, storagePath: result.data.storage_path, title: result.data.title, purpose: result.data.purpose, width: result.data.width, height: result.data.height, createdAt: result.data.created_at };
            },
            remove: async (paths) => {
              const result = await supabase.storage.from("library").remove(paths);
              if (result.error) throw new Error(result.error.message);
            },
          });
        }
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "업로드하지 못했습니다.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function toggle(image: ImageView) {
    const current = attachments.find((attachment) => attachment.id === image.id);
    if (current) return onChange(attachments.filter((attachment) => attachment.id !== image.id));
    onChange([...attachments, {
      id: image.id,
      kind: "style_reference",
      role: "body",
      assetPath: image.storagePath,
      url: image.signedUrl ?? "",
    }]);
  }

  function patch(id: string, change: Partial<Attachment>) {
    onChange(attachments.map((attachment) => attachment.id === id ? { ...attachment, ...change } : attachment));
  }

  const model = modelById(modelId);
  const issues = validateAttachments(attachments, model.maxReferenceImages, totalCards);
  const grouped = groupAttachments(attachments);
  const warnings = (["cover", "body"] as StyleRole[]).flatMap((role) => referenceWarningsForRole(grouped, role));

  /** 라이브러리에서 아주 지운다. 세 도구 어디서도 안 보이게 된다. */
  async function removeFromLibrary(image: ImageView) {
    if (!window.confirm(`'${image.title ?? "이 이미지"}' 를 라이브러리에서 지울까요?`)) return;
    try {
      const body = await (await fetch(`/api/reference-images/${image.id}`, { method: "DELETE" })).json();
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      onChange(attachments.filter((attachment) => attachment.id !== image.id));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지우지 못했습니다.");
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">라이브러리에서 불러오기</h3>
          <p className="text-meta text-subtle-foreground">올려 둔 그림 {images.length}장 · 눌러서 고르고 다시 눌러 뺍니다</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()}>새로고침</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
        <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {uploading ? "올리는 중…" : "새 참고 이미지 올리기"}
        </Button>
        <span className="text-sm text-muted-foreground">여기서 올린 그림도 라이브러리에 들어갑니다.</span>
      </div>
      {message ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">이미지를 불러오는 중입니다.</p> : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {images.map((image) => {
            const selected = attachments.find((attachment) => attachment.id === image.id);
            return <Card key={image.id} className={`relative ${selected ? "border-primary shadow-[0_0_0_1px_var(--primary-ring)]" : ""}`}>
              <button
                type="button"
                aria-label={`${image.title ?? "참고 이미지"} 라이브러리에서 지우기`}
                onClick={() => void removeFromLibrary(image)}
                className="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
              <button type="button" className="block w-full" onClick={() => toggle(image)} aria-label={`${image.title ?? "참고 이미지"} ${selected ? "선택 해제" : "선택"}`}>
                <div className="aspect-square overflow-hidden rounded-t-xl bg-muted">{image.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image.signedUrl} alt={image.title ?? "참고 이미지"} className="h-full w-full object-cover" />
                ) : null}</div>
                <p className="truncate p-3 text-left text-sm font-medium">{image.title ?? "제목 없음"}</p>
              </button>
              {selected ? <CardContent className="grid gap-3 border-t p-3">
                <label className="grid gap-1 text-xs">첨부 종류<select aria-label={`${image.title ?? "참고 이미지"} 첨부 종류`} className="h-9 rounded-md border bg-background px-2 text-sm" value={selected.kind} onChange={(event) => {
                  const kind = event.target.value as AttachmentKind;
                  patch(selected.id, { kind, role: kind === "style_reference" ? "body" : undefined, subject: kind === "keep_identity" ? "object" : undefined, bodySlot: undefined });
                }}><option value="style_reference">따라 만들 카드뉴스</option><option value="keep_identity">그대로 넣을 것</option><option value="place_as_is">원본 그대로 쓸 장</option><option value="ending">마지막 장</option></select></label>
                {selected.kind === "style_reference" ? <label className="grid gap-1 text-xs">역할<select aria-label={`${image.title ?? "참고 이미지"} 역할`} className="h-9 rounded-md border bg-background px-2 text-sm" value={selected.role ?? "body"} onChange={(event) => patch(selected.id, { role: event.target.value as StyleRole })}><option value="cover">표지</option><option value="body">속지</option><option value="ending">엔딩</option></select></label> : null}
                {selected.kind === "keep_identity" ? <label className="grid gap-1 text-xs">대상<select aria-label={`${image.title ?? "참고 이미지"} 대상`} className="h-9 rounded-md border bg-background px-2 text-sm" value={selected.subject ?? "object"} onChange={(event) => patch(selected.id, { subject: event.target.value as "person" | "object" })}><option value="object">제품·로고·물건</option><option value="person">인물</option></select></label> : null}
                {selected.kind === "place_as_is" ? <label className="grid gap-1 text-xs">카드 번호 · 선택<input aria-label={`${image.title ?? "참고 이미지"} 카드 번호`} className="h-9 rounded-md border bg-background px-2 text-sm" type="number" min={2} max={totalCards - 1} value={selected.bodySlot ?? ""} onChange={(event) => patch(selected.id, { bodySlot: event.target.value ? Number(event.target.value) : undefined })} placeholder={`2~${totalCards - 1}`} /></label> : null}
              </CardContent> : null}
            </Card>;
          })}
        </div>
      )}
      <div className="grid gap-2" aria-live="polite">
        {issues.map((issue) => <div key={issue} role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 flex-none" />{issue}</div>)}
        {warnings.map((warning) => <div key={warning} className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{warning}</div>)}
        {!issues.length && attachments.length ? <Badge variant="green" className="w-fit">첨부 검증 통과 · {attachments.length}장</Badge> : null}
      </div>
    </div>
  );
}
