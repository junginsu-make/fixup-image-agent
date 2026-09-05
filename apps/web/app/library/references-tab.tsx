"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, ImageIcon, ImagePlus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { putHandoff } from "../../lib/handoff";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@fixup/ui";
import type { ReferenceSetRecord } from "../api/reference-sets/schema";
import type { ReferenceImageRow } from "./reference-upload";
import { SetEditor } from "./set-editor";
import { randomId } from "../../lib/browser-safe";
import { ThumbImage } from "../_components/thumb-image";

/**
 * 화면이 보는 참고 이미지 한 장.
 *
 * `mine` 과 `ownerEmail` 은 서버가 정해서 보낸다. 참고 이미지는 회원 공용
 * 창고라 남이 올린 것도 목록에 나오는데, 지우기는 올린 사람만 한다 —
 * 남이 쓰던 본보기를 지우면 그 사람의 작업이 조용히 깨진다.
 */
type ReferenceImageView = ReferenceImageRow & {
  signedUrl: string | null;
  mine?: boolean;
  ownerEmail?: string | null;
};

const ROLE_LABEL: Record<string, string> = { cover: "표지", body: "속지", ending: "엔딩" };

export function ReferencesTab() {
  const router = useRouter();
  const [images, setImages] = React.useState<ReferenceImageView[]>([]);
  const [sets, setSets] = React.useState<ReferenceSetRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  /**
   * 관리자인가. 서버가 알려준다.
   *
   * 남이 올린 것도 지울 수 있는 사람이라 단추가 하나 더 나온다. 줄마다 실을
   * 값이 아니라 보는 사람의 성질이라 목록과 따로 받는다.
   */
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [editorOpen, setEditorOpen] = React.useState(false);
  /** 어느 세트를 펼쳐 보고 있나. 표지만 보고는 뭐가 묶였는지 알 수 없다. */
  const [previewSet, setPreviewSet] = React.useState<ReferenceSetRecord | null>(null);
  const [editingSet, setEditingSet] = React.useState<ReferenceSetRecord | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // 로컬이든 운영이든 같은 길로 읽는다. 서버가 모드를 가른다.
      const imagesResponse = await fetch("/api/reference-images", { cache: "no-store" });
      const imagesPayload = await imagesResponse.json() as { ok?: boolean; images?: ReferenceImageView[]; isAdmin?: boolean; message?: string };
      if (!imagesResponse.ok || !imagesPayload.ok) throw new Error(imagesPayload.message ?? "참고 이미지를 불러오지 못했습니다.");
      setImages(imagesPayload.images ?? []);
      setIsAdmin(Boolean(imagesPayload.isAdmin));

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
      // 로컬이든 운영이든 같은 길로 올린다. 서버가 모드를 가른다.
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("id", randomId());
        form.set("title", file.name.replace(/\.[^.]+$/, ""));
        form.set("purpose", "both");
        form.set("file", file);
        const response = await fetch("/api/reference-images", { method: "POST", body: form });
        const payload = await response.json() as { ok?: boolean; message?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.message ?? "참고 이미지를 올리지 못했습니다.");
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

  /**
   * 라이브러리의 그림을 도구로 보낸다.
   *
   * 라이브러리에 와서 그림을 찾아 놓고도 도구로 가서 다시 골라야 했다.
   * 여기서 누르면 그 그림이 이미 첨부된 채로 열린다.
   */
  function sendTo(tool: "sns" | "poster" | "create", image: ReferenceImageView) {
    putHandoff({
      title: image.title ?? "참고 이미지",
      text: "",
      images: [{
        id: image.id,
        title: image.title ?? "참고 이미지",
        url: image.signedUrl ?? "",
        assetPath: image.storagePath,
      }],
    });
    router.push(tool === "sns" ? "/sns/new" : tool === "poster" ? "/poster/new" : "/create");
  }

  /** 창고에서 아주 지운다. 세 도구 어디서도 안 보이게 된다. */
  async function removeImage(image: ReferenceImageView) {
    // 남의 것을 지울 때는 누구 것인지 밝히고 묻는다. 공용 창고라 목록에서는
    // 내 것과 남의 것이 나란히 있어, 밝히지 않으면 잘못 짚기 쉽다.
    const whose = image.mine === false
      ? `

${image.ownerEmail ?? "다른 회원"}이 올린 것입니다. 이 그림을 쓰던 작업이 있으면 함께 깨집니다.`
      : "";
    if (!window.confirm(`'${image.title ?? "이 이미지"}' 를 라이브러리에서 지울까요?${whose}`)) return;
    try {
      const body = await (await fetch(`/api/reference-images/${image.id}`, { method: "DELETE" })).json();
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      setImages((current) => current.filter((entry) => entry.id !== image.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지우지 못했습니다.");
    }
  }

  /**
   * 세트에서 그림 한 장을 뺀다.
   *
   * 전에는 수정 창을 열고, 그 그림을 찾고, 선택 상자를 「선택 안 함」으로
   * 바꾸고, 저장해야 했다. 네 단계다. 미리보기에서 X 한 번으로 줄인다.
   *
   * 낱장은 그대로 둔다 — 세트에서 빼는 것과 창고에서 지우는 것은 다르다.
   */
  async function removeFromSet(set: ReferenceSetRecord, imageId: string) {
    const items = set.items
      .filter((item) => item.referenceImageId !== imageId)
      .map((item, position) => ({ referenceImageId: item.referenceImageId, role: item.role, position }));
    try {
      const response = await fetch(`/api/reference-sets/${set.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: set.name, purpose: set.purpose, items }),
      });
      const payload = await response.json() as { ok?: boolean; set?: ReferenceSetRecord; message?: string };
      if (!response.ok || !payload.set) throw new Error(payload.message ?? "세트를 고치지 못했습니다.");
      setSets((current) => current.map((entry) => entry.id === set.id ? payload.set! : entry));
      setPreviewSet(payload.set);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "세트를 고치지 못했습니다.");
    }
  }

  /**
   * 세트를 통째로 카드뉴스로 보낸다.
   *
   * 세트를 만들 수는 있는데 쓸 데가 없었다 — 어느 도구도 세트를 부르지 않는다.
   * 표지·속지·엔딩 자리까지 그대로 실어 보낸다.
   */
  function sendSetTo(set: ReferenceSetRecord) {
    const picked = set.items
      .map((item) => ({ item, image: images.find((entry) => entry.id === item.referenceImageId) }))
      .filter((entry): entry is { item: typeof entry.item; image: ReferenceImageView } => Boolean(entry.image));
    if (!picked.length) return setMessage("이 세트에 남아 있는 그림이 없습니다.");
    putHandoff({
      title: set.name,
      text: "",
      images: picked.map(({ item, image }) => ({
        id: image.id,
        title: image.title ?? "참고 이미지",
        url: image.signedUrl ?? "",
        assetPath: image.storagePath,
        // 세트의 자리를 그대로 들고 간다. 도구에서 다시 정하지 않는다.
        slot: item.role,
      })),
    });
    router.push("/sns/new");
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

  // 용도로 거르지 않는다. 어느 도구도 용도를 보지 않으므로 고를 이유가 없다.
  const visibleImages = images;
  const visibleSets = sets;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">참고 이미지</h2>
          <p className="mt-1 text-sm text-muted-foreground">카드뉴스와 포스터에 반복해서 쓸 이미지를 낱장 또는 역할이 있는 세트로 관리합니다.</p>
        </div>
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
            <span className="text-xs text-muted-foreground">올린 그림은 카드뉴스·포스터·상세페이지에서 모두 쓸 수 있습니다. 참고 이미지는 회원 공용이라 다른 회원이 올린 것도 함께 보이고, 지우기는 올린 사람만 합니다.</span>
          </div>

          {loading ? <p className="py-12 text-center text-sm text-muted-foreground">참고 이미지를 불러오는 중입니다.</p> : visibleImages.length === 0 ? (
            <Card className="grid place-items-center gap-3 py-14 text-center"><ImageIcon className="size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">아직 올린 참고 이미지가 없습니다.</p></Card>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {visibleImages.map((image) => (
                <Card key={image.id} className="relative overflow-hidden">
                  {/* 지우기는 모서리에 둔다. 아래에 줄로 두면 카드가 길어지고
                      「~로 보내기」와 섞여 실수로 누르게 된다.

                      **남이 올린 것에는 안 보인다 — 관리자만 빼고.** 회원이
                      눌렀을 때는 서버가 막아 「지우지 못했습니다」만 떴다. 못 할
                      일은 단추부터 없는 편이 낫다. 관리자는 할 수 있으므로 둔다 —
                      공용 창고에 잘못 올라온 것을 내릴 사람이 없으면 그대로
                      남는다. */}
                  {image.mine === false && !isAdmin ? null : (
                    <button
                      type="button"
                      aria-label={`${image.title ?? "참고 이미지"} 지우기`}
                      onClick={() => void removeImage(image)}
                      className="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
                    ><Trash2 className="size-3.5" /></button>
                  )}
                  <div className="aspect-square bg-muted">{image.signedUrl ? (
                    <ThumbImage src={image.signedUrl} alt={image.title ?? "참고 이미지"} data-zoomable className="h-full w-full cursor-zoom-in object-cover" />
                  ) : null}</div>
                  <CardContent className="grid gap-2 p-3">
                    <p className="truncate text-sm font-medium">{image.title || "제목 없음"}</p>
                    {image.mine === false ? (
                      <p className="truncate text-xs text-muted-foreground">{image.ownerEmail ?? "다른 회원"}이 올림</p>
                    ) : null}
                    {/* 라이브러리는 보기만 하는 곳이 아니다. 여기서 바로 도구로 보낸다. */}
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" onClick={() => sendTo("sns", image)}>카드뉴스로</Button>
                      <Button size="sm" variant="secondary" onClick={() => sendTo("poster", image)}>이미지로</Button>
                      <Button size="sm" variant="secondary" onClick={() => sendTo("create", image)}>상세페이지로</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sets" className="grid gap-5">
          <div><Button onClick={() => { setEditingSet(null); setEditorOpen(true); }}><FolderPlus className="size-4" />세트 만들기</Button></div>
          {loading ? <p className="py-12 text-center text-sm text-muted-foreground">묶음 세트를 불러오는 중입니다.</p> : visibleSets.length === 0 ? (
            <Card className="grid place-items-center gap-3 py-14 text-center"><FolderPlus className="size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">아직 만든 묶음 세트가 없습니다.</p></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleSets.map((set) => (
                <Card key={set.id}>
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                    <div className="grid gap-2"><CardTitle>{set.name}</CardTitle><Badge variant="secondary" className="w-fit">{set.items.length}장</Badge></div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={`${set.name} 수정`} onClick={() => { setEditingSet(set); setEditorOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`${set.name} 삭제`} onClick={() => void removeSet(set)}><Trash2 className="size-4" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* 이름만 있으면 뭐가 묶였는지 알 수 없다. 눌러서 전부 본다. */}
                    <button
                      type="button"
                      className="grid w-full grid-cols-4 gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-muted"
                      onClick={() => setPreviewSet(set)}
                      aria-label={`${set.name} 묶인 이미지 보기`}
                    >
                      {set.items.slice(0, 4).map((item) => {
                        const image = images.find((entry) => entry.id === item.referenceImageId);
                        return (
                          <span key={item.id ?? item.referenceImageId} className="block aspect-square overflow-hidden rounded-md bg-muted">
                            {image?.signedUrl ? (
                              <ThumbImage src={image.signedUrl} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </span>
                        );
                      })}
                      {set.items.length === 0 ? (
                        <span className="col-span-4 py-6 text-center text-xs text-muted-foreground">아직 담긴 이미지가 없습니다.</span>
                      ) : null}
                      {set.items.length > 4 ? (
                        <span className="col-span-4 pt-1 text-center text-meta text-subtle-foreground">외 {set.items.length - 4}장 · 눌러서 전부 보기</span>
                      ) : null}
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(previewSet)} onOpenChange={(open) => { if (!open) setPreviewSet(null); }}>
        <DialogContent className="max-w-3xl">
          {previewSet ? <>
            <DialogHeader>
              <DialogTitle>{previewSet.name}</DialogTitle>
              <DialogDescription>카드뉴스 · {previewSet.items.length}장</DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[65vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3">
              {previewSet.items.map((item) => {
                const image = images.find((entry) => entry.id === item.referenceImageId);
                return (
                  <figure key={item.id ?? item.referenceImageId} className="grid gap-2">
                    <span className="block aspect-[4/5] overflow-hidden rounded-lg border bg-muted">
                      {image?.signedUrl ? (
                        <ThumbImage src={image.signedUrl} alt={image.title ?? "참고 이미지"} data-zoomable className="h-full w-full cursor-zoom-in object-cover" />
                      ) : (
                        <span className="grid h-full place-items-center text-xs text-muted-foreground">이미지를 찾을 수 없습니다</span>
                      )}
                    </span>
                    <figcaption className="flex items-start justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <Badge variant="secondary">{ROLE_LABEL[item.role] ?? item.role}</Badge>
                        <span className="mt-1 block truncate text-muted-foreground">{image?.title ?? "제목 없음"}</span>
                      </span>
                      {/* 수정 창을 열고 선택 상자를 바꾸고 저장하는 네 단계였다. 한 번으로 줄인다. */}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${image?.title ?? "이미지"} 세트에서 빼기`}
                        onClick={() => void removeFromSet(previewSet, item.referenceImageId)}
                      ><X className="size-4" /></Button>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <DialogFooter className="sm:justify-between">
              <span className="text-meta text-subtle-foreground">뺀 그림은 낱장에 그대로 남습니다</span>
              <Button onClick={() => sendSetTo(previewSet)}>이 세트로 카드뉴스 만들기</Button>
            </DialogFooter>
          </> : null}
        </DialogContent>
      </Dialog>

      <SetEditor
        open={editorOpen}
        images={images}
        initialSet={editingSet}
        onClose={() => setEditorOpen(false)}
        onUploaded={load}
        onSaved={(saved) => setSets((current) => {
          const exists = current.some((set) => set.id === saved.id);
          return exists ? current.map((set) => set.id === saved.id ? saved : set) : [saved, ...current];
        })}
      />
    </div>
  );
}
