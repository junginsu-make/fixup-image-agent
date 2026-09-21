"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Badge, Button, Card, ImageLightbox, cn } from "@fixup/ui";
import { STYLE_REFERENCE_LIMIT_HINT } from "../../lib/pdp/reference-limits";
import { randomId } from "../../lib/browser-safe";

/**
 * 내 디자인 레퍼런스 관리.
 *
 * 레퍼런스는 전부 사용자별이다. 공용은 없다 — 전역이면 남이 올린 디자인이
 * 내 결과에 씌워지고, 내 기획물이 남에게 새어나간다.
 *
 * 그래서 **새로 가입하면 0장**이고, 올리기 전까지 레퍼런스 기능이 아무 일도
 * 하지 않는다. 그 사실을 숨기지 않고 화면에서 먼저 알린다.
 */

const SOURCE_LABEL: Record<string, string> = {
  upload: "직접 올림",
  generated: "생성 결과",
  seed: "기본 제공",
};

interface StyleReference {
  id: string;
  name: string;
  source: string;
  description: string;
  createdAt: string;
  url: string | null;
}

export function StyleReferenceManager() {
  const [references, setReferences] = useState<StyleReference[]>([]);
  /**
   * **가진 수.** 보이는 수와 다르다.
   *
   * 전에는 받아 온 배열의 길이를 그대로 「N장」이라 적었다. 목록이 앞 200장만
   * 오므로, 240장을 올린 사용자는 **「200장」이라는 말과 함께 40장을 잃어버린다**
   * (C-7).
   */
  const [total, setTotal] = useState(0);
  /** 다음 쪽이 시작하는 자리. `null` 이면 끝이다. */
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // 이미지가 없는 행은 뷰어에서 건너뛴다. 서명 URL 발급이 실패하면 url 이 없다.
  const visible = references.filter((reference) => reference.url);

  /**
   * 한 쪽을 불러온다.
   *
   * `offset` 이 0 이면 처음부터 다시 채우고, 아니면 **뒤에 잇는다.** 갈아
   * 끼우면 더 보기를 누른 순간 앞쪽이 사라진다.
   */
  const load = useCallback(async (offset = 0) => {
    if (offset > 0) setLoadingMore(true);
    try {
      const response = await fetch(`/api/pdp/style-references?offset=${offset}`, { cache: "no-store" });
      const body = (await response.json()) as {
        ok?: boolean;
        references?: StyleReference[];
        total?: number;
        nextOffset?: number | null;
      };
      if (!body.ok) {
        if (offset === 0) { setReferences([]); setTotal(0); }
        setNextOffset(null);
        return;
      }
      const page = body.references ?? [];
      setReferences((current) => (offset === 0 ? page : [...current, ...page]));
      setTotal(body.total ?? page.length);
      setNextOffset(body.nextOffset ?? null);
    } catch {
      if (offset === 0) { setReferences([]); setTotal(0); }
      setNextOffset(null);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");

    let added = 0;
    for (const file of Array.from(files)) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        /*
          **한 장마다 새 식별자다.** 여러 장을 한 번에 고를 수 있는 화면이라,
          값을 돌려 쓰면 두 번째 장부터 중복으로 거절된다(C-4-b).
        */
        const response = await fetch("/api/pdp/style-references", {
          method: "POST",
          headers: { "content-type": "application/json", "x-idempotency-key": randomId() },
          body: JSON.stringify({
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 60),
            source: "upload",
            imageBase64: base64,
            mimeType: file.type || "image/png",
          }),
        });
        const body = (await response.json()) as { ok?: boolean; message?: string };
        if (body.ok) added += 1;
        else setMessage(body.message ?? "일부 이미지를 등록하지 못했습니다.");
      } catch {
        setMessage("이미지를 읽지 못했습니다.");
      }
    }

    if (added) setMessage(`${added}장을 등록했습니다. 다음 작업부터 후보로 나옵니다.`);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    await load();
  };

  const handleDelete = async (reference: StyleReference) => {
    if (!window.confirm(`'${reference.name}' 레퍼런스를 삭제할까요?`)) return;
    setDeletingId(reference.id);
    setMessage("");
    try {
      const response = await fetch("/api/pdp/style-references", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: reference.id }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      /*
        **못 지웠으면 목록에서 치우지 않는다.** 전에는 응답을 아예 안 읽고
        치웠다 — 서버가 거절해도 화면에서는 사라지고, 새로고침하면 되살아난다.
      */
      if (!body.ok) {
        setMessage(body.message ?? "삭제하지 못했습니다.");
        return;
      }
      setReferences((current) => current.filter((item) => item.id !== reference.id));
      /*
        **가진 수도 함께 줄인다.** 배지가 「보이는 수 / 가진 수」라서, 보이는
        수만 줄이면 3장 중 1장을 지웠을 때 「2 / 3장」이 되어 **1장이 어딘가
        숨어 있다고 거짓말**한다.
      */
      setTotal((current) => Math.max(0, current - 1));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-h3">내 디자인 레퍼런스</h2>
        {/*
          **가진 수를 말한다.** 다 안 보이고 있으면 그것도 함께 말한다 —
          「200장」만 적어 두면 나머지가 사라진 것처럼 보인다.
        */}
        <Badge variant="secondary" className="ml-auto">
          {references.length < total ? `${references.length} / ${total}장` : `${total}장`}
        </Badge>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        여기에 올린 이미지의 색·서체·구성을 따라 상세페이지를 만듭니다. 상품에 어울리는 것을
        AI가 한 장 골라 그 페이지 전체에 적용합니다. <strong>내 계정에서만 쓰이며 다른 사용자에게 보이지 않습니다.</strong>
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(event) => void handleUpload(event.target.files)}
        />
        <Button size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? (
            <Loader2 size={16} className="mr-1.5 animate-spin" />
          ) : (
            <ImagePlus size={16} className="mr-1.5" />
          )}
          {uploading ? "등록하는 중…" : "이미지 올리기"}
        </Button>
        <span className="text-xs text-muted-foreground">
          잘 만든 상세페이지나 마음에 드는 디자인을 올리면 됩니다. 여러 장을 한 번에 고를 수 있습니다.
          {/*
            **상한을 먼저 말한다.** 전에는 413 을 받고 나서야 얼마까지 되는지
            알았다. 서버와 **같은 상수**를 읽는다 — 두 벌로 적으면 화면만
            옛말을 하는 날이 온다(설계 §12 「정책 상수와 UI 에서 일치」).
          */}
          <br />
          {STYLE_REFERENCE_LIMIT_HINT}
        </span>
      </div>

      {message ? <p className="mb-3 text-sm text-muted-foreground">{message}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          불러오는 중입니다.
        </div>
      ) : references.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          아직 등록한 레퍼런스가 없습니다.
          <br />
          올리기 전까지는 디자인 참고 없이 만들어집니다.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {references.map((reference) => (
            <div key={reference.id} className="group relative">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
                {reference.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={reference.name}
                    src={reference.url}
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {/* 표지를 덮는 열기 버튼. 삭제 버튼은 이 위(z-20)에 있다. */}
                <button
                  type="button"
                  aria-label={`${reference.name} 크게 보기`}
                  onClick={() => setViewerIndex(visible.findIndex((entry) => entry.id === reference.id))}
                  className="absolute inset-0 z-10 block"
                />
                <button
                  type="button"
                  aria-label={`${reference.name} 삭제`}
                  data-delete="1"
                  disabled={deletingId === reference.id}
                  onClick={() => void handleDelete(reference)}
                  className={cn(
                    "absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/80",
                    "text-muted-foreground opacity-0 backdrop-blur transition-opacity",
                    "hover:bg-background hover:text-destructive group-hover:opacity-100",
                    "z-20",
                  )}
                >
                  {deletingId === reference.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="mt-1 truncate text-sm font-medium" title={reference.name}>
                {reference.name}
              </p>
              <p className="text-meta text-subtle-foreground">
                {SOURCE_LABEL[reference.source] ?? reference.source}
              </p>
            </div>
          ))}
        </div>
      )}

      {nextOffset !== null ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            data-more="1"
            disabled={loadingMore}
            onClick={() => void load(nextOffset)}
          >
            {loadingMore ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
            {loadingMore ? "불러오는 중…" : `더 보기 (${total - references.length}장 남음)`}
          </Button>
        </div>
      ) : null}

      {viewerIndex !== null && visible[viewerIndex] ? (
        <ImageLightbox
          title="내 디자인 레퍼런스"
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          images={visible.map((reference) => ({
            label: reference.name,
            src: reference.url as string,
            fileName: `${reference.name}.png`,
          }))}
        />
      ) : null}
    </Card>
  );
}
