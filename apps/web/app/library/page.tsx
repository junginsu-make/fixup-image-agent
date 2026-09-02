"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageIcon, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Badge, Button, Card, Tabs, TabsContent, TabsList, TabsTrigger } from "@fixup/ui";
import { planUploadBatches } from "@fixup/pdp-core";
import { loadLibrary, deleteLibraryItem, getPdpResultImages, getAccountItemImages } from "../../lib/library";
import type { PdpResultImage } from "../../lib/library";
import type { LibraryItem } from "@fixup/shared";
import { ResultViewer } from "./ResultViewer";
import { ReferencesTab } from "./references-tab";
import { WorksTab } from "./works-tab";
import { CollectedTab } from "./collected-tab";

function formatDate(ms: number): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

// 아이콘은 버튼(동작)에만 쓴다. 이름표에 붙은 아이콘은 뜻을 더하지 않는다.
const TOOL_META: Record<LibraryItem["tool"], { label: string; href: string }> = {
  pdp: { label: "새로 만들기", href: "/create" },
  redesign: { label: "리디자인", href: "/redesign" },
  reference: { label: "레퍼런스", href: "/settings" },
};

interface ViewerState {
  id: string;
  title: string;
  images: PdpResultImage[];
}

export default function LibraryPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<LibraryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [openingId, setOpeningId] = React.useState<string | null>(null);
  const [viewer, setViewer] = React.useState<(ViewerState & { editable: boolean }) | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadMessage, setUploadMessage] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);

  /**
   * 이미지를 직접 올려 작업물로 보관한다.
   *
   * "라이브러리에 저장"이 편집기 안에만 있어서, 정작 라이브러리에 와서는 넣을
   * 방법이 없었다. 밖에서 만든 이미지를 보관하려면 편집기를 거쳐야 했다.
   *
   * 고른 이미지 전부를 한 건으로 묶는다. 한 상세페이지의 섹션들일 가능성이 높다.
   */
  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadMessage("");
    try {
      const images = await Promise.all(
        Array.from(files).map(
          (file) =>
            new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  base64: String(reader.result).split(",")[1] ?? "",
                  mimeType: file.type || "image/png",
                });
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            }),
        ),
      );

      const first = files[0].name.replace(/\.[^.]+$/, "");
      // 큰 이미지를 한꺼번에 보내면 서버가 JSON 파싱하다 죽을 수 있다.
      const batches = planUploadBatches(images);
      let saved = 0;
      let failure = "";

      for (const [index, batch] of batches.entries()) {
        const base = files.length > 1 ? `${first} 외 ${files.length - 1}장` : first;
        const response = await fetch("/api/library", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: batches.length > 1 ? `${base} (${index + 1}/${batches.length})` : base,
            tool: "create",
            images: batch,
          }),
        });
        const body = (await response.json()) as { ok?: boolean; message?: string };
        if (body.ok) saved += batch.length;
        else {
          failure = body.message ?? "올리지 못했습니다.";
          break;
        }
      }

      setUploadMessage(failure || `${saved}장을 보관했습니다.`);
      if (saved) setItems(await loadLibrary());
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  React.useEffect(() => {
    let active = true;
    loadLibrary()
      .then((result) => active && setItems(result))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function handleOpen(item: LibraryItem) {
    if (openingId) return;
    setOpeningId(item.id);

    // 레퍼런스는 한 장짜리다. 목록에 이미 이미지 주소가 있어 더 받아올 것이 없다.
    if (item.tool === "reference") {
      setOpeningId(null);
      if (!item.thumbnail) return;
      setViewer({
        id: item.id,
        title: item.title,
        images: [{ sectionName: "디자인 레퍼런스", image: item.thumbnail }],
        editable: false,
      });
      return;
    }

    // 계정 보관분은 서버에서 가져온다. 도구가 무엇이든 이미지가 있으니 여기서 본다.
    // 브라우저 저장분과 달리 IndexedDB 에는 없어서, 예전처럼 조회하면 0장이 나와
    // 편집기로 튕겼다.
    if (item.storage === "account") {
      try {
        const result = await getAccountItemImages(item);
        if (result?.images.length) {
          // 계정 보관분은 IndexedDB 초안이 아니라 '이어서 편집'이 불가능하다.
          // 예전에는 그래도 /create?draft= 로 보내 "저장된 작업을 찾지 못했습니다"가 떴다.
          setViewer({ id: item.id, title: result.title, images: result.images, editable: false });
        } else {
          console.error("계정 보관 이미지를 불러오지 못했습니다.");
        }
      } finally {
        setOpeningId(null);
      }
      return;
    }

    // 리디자인의 브라우저 저장분은 아직 뷰어를 지원하지 않는다 — 도구에서 연다.
    if (item.tool === "redesign") {
      setOpeningId(null);
      router.push("/redesign");
      return;
    }

    try {
      const result = await getPdpResultImages(item.id);
      // 이미지가 아직 없는 작업(분석만 하고 생성 전)이면 바로 편집기로 보낸다.
      if (!result || result.images.length === 0) {
        router.push(`/create?draft=${item.id}`);
        return;
      }
      setViewer({ id: item.id, title: result.title, images: result.images, editable: true });
    } catch (error) {
      console.error("결과물을 불러오지 못했습니다:", error);
      router.push(`/create?draft=${item.id}`);
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(event: React.MouseEvent, item: LibraryItem) {
    event.preventDefault();
    event.stopPropagation();
    const key = `${item.tool}-${item.id}`;
    if (deletingId) return;
    if (!window.confirm(`'${item.title}' 작업을 삭제할까요? 이 동작은 되돌릴 수 없습니다.`)) return;

    setDeletingId(key);
    try {
      await deleteLibraryItem(item);
      setItems((prev) => prev.filter((it) => `${it.tool}-${it.id}` !== key));
    } catch (error) {
      console.error("라이브러리 항목 삭제 실패:", error);
      window.alert("삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">라이브러리</h1>
        <p className="text-sm text-muted-foreground">
          완성한 작업물, 참고 이미지, 수집 미디어가 모아 온 글을 한 화면에서 관리합니다. 여기서 바로 카드뉴스·포스터로 보냅니다.
        </p>
      </div>

      <Tabs defaultValue="works" className="space-y-6">
        <TabsList>
          <TabsTrigger value="works">작업물</TabsTrigger>
          <TabsTrigger value="references">참고 이미지</TabsTrigger>
          <TabsTrigger value="collected">수집한 글</TabsTrigger>
        </TabsList>

        <TabsContent value="works">
          <WorksTab />
        </TabsContent>

        <TabsContent value="references">
          <ReferencesTab />
        </TabsContent>

        <TabsContent value="collected">
          <CollectedTab />
        </TabsContent>
      </Tabs>

      {viewer ? (
        <ResultViewer
          title={viewer.title}
          images={viewer.images}
          onClose={() => setViewer(null)}
          onEdit={viewer.editable ? () => router.push(`/create?draft=${viewer.id}`) : undefined}
        />
      ) : null}
    </div>
  );
}
