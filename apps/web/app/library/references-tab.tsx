"use client";

import * as React from "react";
import { FolderPlus, ImageIcon, ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@fixup/ui";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import type { ReferencePurpose, ReferenceSetRecord } from "../api/reference-sets/schema";
import { persistReferenceImage, type ReferenceImageRow } from "./reference-upload";
import { SetEditor } from "./set-editor";

type ReferenceImageView = ReferenceImageRow & { signedUrl: string | null };

const PURPOSE_LABEL: Record<ReferencePurpose, string> = {
  cardnews: "카드뉴스",
  poster: "포스터",
  both: "공용",
};

type ReferenceImageDbRow = {
  id: string;
  user_id: string;
  storage_path: string;
  title: string | null;
  purpose: ReferencePurpose;
  width: number | null;
  height: number | null;
  created_at: string;
};

function toReferenceImage(row: ReferenceImageDbRow): ReferenceImageRow {
  return {
    id: row.id,
    userId: row.user_id,
    storagePath: row.storage_path,
    title: row.title,
    purpose: row.purpose,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export function ReferencesTab() {
  const [images, setImages] = React.useState<ReferenceImageView[]>([]);
  const [sets, setSets] = React.useState<ReferenceSetRecord[]>([]);
  const [purpose, setPurpose] = React.useState<"all" | ReferencePurpose>("all");
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingSet, setEditingSet] = React.useState<ReferenceSetRecord | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const imageResult = await supabase.from("reference_images")
        .select("id,user_id,storage_path,title,purpose,width,height,created_at")
        .order("created_at", { ascending: false });
      if (imageResult.error) throw new Error(imageResult.error.message);
      const rows = (imageResult.data ?? []) as ReferenceImageDbRow[];
      const signed = rows.length
        ? await supabase.storage.from("library").createSignedUrls(rows.map((row) => row.storage_path), 60 * 60)
        : { data: [], error: null };
      if (signed.error) throw new Error(signed.error.message);
      setImages(rows.map((row, index) => ({ ...toReferenceImage(row), signedUrl: signed.data?.[index]?.signedUrl ?? null })));

      const response = await fetch("/api/reference-sets", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; sets?: ReferenceSetRecord[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "묶음 세트를 불러오지 못했습니다.");
      setSets(payload.sets ?? []);
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
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      for (const file of Array.from(files)) {
        await persistReferenceImage(
          {
            file,
            title: file.name.replace(/\.[^.]+$/, ""),
            purpose: purpose === "all" ? "cardnews" : purpose,
          },
          {
            createId: () => crypto.randomUUID(),
            getUserId: async () => {
              const { data, error } = await supabase.auth.getUser();
              if (error || !data.user) throw new Error(error?.message ?? "로그인이 필요합니다.");
              return data.user.id;
            },
            upload: async (path, selectedFile) => {
              const { error } = await supabase.storage.from("library").upload(path, selectedFile, { contentType: selectedFile.type, upsert: false });
              if (error) throw new Error(error.message);
            },
            insert: async (row) => {
              const { data, error } = await supabase.from("reference_images").insert(row)
                .select("id,user_id,storage_path,title,purpose,width,height,created_at").single();
              if (error) throw new Error(error.message);
              return toReferenceImage(data as ReferenceImageDbRow);
            },
            remove: async (paths) => {
              const { error } = await supabase.storage.from("library").remove(paths);
              if (error) throw new Error(error.message);
            },
          },
        );
      }
      setMessage(`${files.length}장을 올렸습니다.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "참고 이미지를 올리지 못했습니다.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeSet(set: ReferenceSetRecord) {
    if (!window.confirm(`'${set.name}' 묶음 세트를 삭제할까요?`)) return;
    try {
      const response = await fetch(`/api/reference-sets/${set.id}`, { method: "DELETE" });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "세트를 삭제하지 못했습니다.");
      setSets((current) => current.filter((item) => item.id !== set.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "세트를 삭제하지 못했습니다.");
    }
  }

  const visibleImages = images.filter((image) => purpose === "all" || image.purpose === purpose || image.purpose === "both");
  const visibleSets = sets.filter((set) => purpose === "all" || set.purpose === purpose || set.purpose === "both");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">참고 이미지</h2>
          <p className="mt-1 text-sm text-muted-foreground">카드뉴스와 포스터에 반복해서 쓸 이미지를 낱장 또는 역할이 있는 세트로 관리합니다.</p>
        </div>
        <label className="grid gap-1 text-xs text-muted-foreground">
          용도
          <select value={purpose} onChange={(event) => setPurpose(event.target.value as "all" | ReferencePurpose)} className="h-9 min-w-36 rounded-md border bg-background px-3 text-sm text-foreground">
            <option value="all">전체</option>
            <option value="cardnews">카드뉴스</option>
            <option value="poster">포스터</option>
            <option value="both">공용</option>
          </select>
        </label>
      </div>

      {message ? <p role="status" className="rounded-md border bg-muted/40 px-4 py-3 text-sm">{message}</p> : null}

      <Tabs defaultValue="images" className="grid gap-5">
        <TabsList className="w-fit">
          <TabsTrigger value="images">낱장</TabsTrigger>
          <TabsTrigger value="sets">묶음 세트</TabsTrigger>
        </TabsList>

        <TabsContent value="images" className="grid gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
            <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {uploading ? "올리는 중…" : "참고 이미지 올리기"}
            </Button>
            <span className="text-xs text-muted-foreground">현재 선택한 용도로 저장됩니다. 전체에서는 카드뉴스로 저장됩니다.</span>
          </div>

          {loading ? <p className="py-12 text-center text-sm text-muted-foreground">참고 이미지를 불러오는 중입니다.</p> : visibleImages.length === 0 ? (
            <Card className="grid place-items-center gap-3 py-14 text-center"><ImageIcon className="size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">이 용도의 참고 이미지가 없습니다.</p></Card>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {visibleImages.map((image) => (
                <Card key={image.id} className="overflow-hidden">
                  <div className="aspect-square bg-muted">{image.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.signedUrl} alt={image.title ?? "참고 이미지"} className="h-full w-full object-cover" />
                  ) : null}</div>
                  <CardContent className="grid gap-2 p-3">
                    <p className="truncate text-sm font-medium">{image.title || "제목 없음"}</p>
                    <Badge variant="secondary" className="w-fit">{PURPOSE_LABEL[image.purpose]}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sets" className="grid gap-5">
          <div><Button onClick={() => { setEditingSet(null); setEditorOpen(true); }}><FolderPlus className="size-4" />세트 만들기</Button></div>
          {loading ? <p className="py-12 text-center text-sm text-muted-foreground">묶음 세트를 불러오는 중입니다.</p> : visibleSets.length === 0 ? (
            <Card className="grid place-items-center gap-3 py-14 text-center"><FolderPlus className="size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">이 용도의 묶음 세트가 없습니다.</p></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleSets.map((set) => (
                <Card key={set.id}>
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                    <div className="grid gap-2"><CardTitle>{set.name}</CardTitle><div className="flex gap-2"><Badge variant="secondary">{PURPOSE_LABEL[set.purpose]}</Badge><Badge variant="secondary">{set.items.length}장</Badge></div></div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={`${set.name} 수정`} onClick={() => { setEditingSet(set); setEditorOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`${set.name} 삭제`} onClick={() => void removeSet(set)}><Trash2 className="size-4" /></Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <SetEditor
        open={editorOpen}
        images={images}
        initialSet={editingSet}
        onClose={() => setEditorOpen(false)}
        onSaved={(saved) => setSets((current) => {
          const exists = current.some((set) => set.id === saved.id);
          return exists ? current.map((set) => set.id === saved.id ? saved : set) : [saved, ...current];
        })}
      />
    </div>
  );
}
