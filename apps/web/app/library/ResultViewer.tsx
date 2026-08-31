"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Package, Palette, Pencil, X } from "lucide-react";
import { Button } from "@fixup/ui";
import type { PdpResultImage } from "../../lib/library";

/**
 * 라이브러리 결과물 뷰어 — 저장한 작업의 섹션 이미지를 크게 보고 내려받는다.
 *
 * 편집기를 거치지 않고 결과물만 훑고 저장하려는 용도다. 앞서 "결과물을 볼 수
 * 없다"던 불편이 여기서 풀린다. 정밀 편집(레이어·문구)은 '이어서 편집'으로 넘긴다.
 *
 * 여기서 보여주는 것은 AI 가 만든 섹션 이미지 원본이다. 편집기에서 텍스트
 * 레이어를 얹은 최종 합성본이 필요하면 편집기의 내보내기를 써야 한다.
 */

interface ResultViewerProps {
  title: string;
  images: PdpResultImage[];
  onClose: () => void;
  /** 없으면 '이어서 편집'을 감춘다. 계정 보관분은 편집기 초안이 아니다. */
  onEdit?: () => void;
}

/** data URL 한 장을 파일로 내려받는다. */
function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 이미지 한 장을 base64 로 만든다.
 *
 * 브라우저 저장분은 data URL 이고, 계정 보관분은 Storage 서명 URL(https)이다.
 * 예전에는 data URL 만 가정하고 콤마 뒤를 잘라 썼는데, https 주소가 오면
 * 주소 문자열이 그대로 base64 로 들어가 ZIP 이 깨진다.
 */
async function base64Of(source: string): Promise<string> {
  if (source.startsWith("data:")) {
    const comma = source.indexOf(",");
    return comma >= 0 ? source.slice(comma + 1) : source;
  }

  const blob = await (await fetch(source)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** data URL 의 확장자를 mime 에서 유추한다(기본 jpg). */
function extOf(source: string): string {
  const dataMatch = source.match(/^data:image\/([a-z0-9.+-]+)/i);
  if (dataMatch) {
    // "svg+xml" 처럼 뒤에 붙는 건 잘라 파일명에 안전한 확장자만 남긴다.
    const raw = dataMatch[1].toLowerCase().split("+")[0];
    return raw === "jpeg" ? "jpg" : raw;
  }

  // 서명 URL 은 쿼리스트링이 붙는다. 경로 부분의 확장자만 본다.
  const pathMatch = source.split("?")[0].match(/\.([a-z0-9]+)$/i);
  const raw = (pathMatch?.[1] ?? "png").toLowerCase();
  return raw === "jpeg" ? "jpg" : raw;
}

export function ResultViewer({ title, images, onClose, onEdit }: ResultViewerProps) {
  const [index, setIndex] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [savingReference, setSavingReference] = useState(false);
  const [referenceNotice, setReferenceNotice] = useState("");

  const step = useCallback(
    (delta: number) =>
      setIndex((current) => {
        const next = current + delta;
        return next < 0 || next >= images.length ? current : next;
      }),
    [images.length]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  const current = images[index];

  /**
   * 지금 보고 있는 이미지를 내 디자인 레퍼런스로 등록한다.
   *
   * 마음에 든 결과를 다음 작업의 기준으로 삼는 것이 이 버튼의 목적이다.
   * 레퍼런스는 전부 사용자별이라 남에게 영향을 주지 않는다.
   */
  const handleUseAsReference = async () => {
    if (!current || savingReference) return;
    setSavingReference(true);
    setReferenceNotice("");
    try {
      const base64 = await base64Of(current.image);
      const response = await fetch("/api/pdp/style-references", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `${title} ${index + 1}번째`,
          source: "generated",
          imageBase64: base64,
          mimeType: current.image.startsWith("data:")
            ? current.image.slice(5, current.image.indexOf(";"))
            : "image/png",
        }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      setReferenceNotice(
        body.ok
          ? "내 레퍼런스로 등록했습니다. 다음 작업부터 후보로 나옵니다."
          : body.message ?? "레퍼런스로 등록하지 못했습니다.",
      );
    } catch (error) {
      setReferenceNotice(
        error instanceof Error ? error.message : "레퍼런스로 등록하지 못했습니다.",
      );
    } finally {
      setSavingReference(false);
    }
  };

  const handleDownloadOne = async () => {
    if (!current) return;
    const filename = `${title}-${String(index + 1).padStart(2, "0")}.${extOf(current.image)}`;

    // 원격 이미지는 a[download] 로 바로 받으면 다른 출처라 무시되고 새 탭만 열린다.
    // 내려받아 blob 으로 바꾼 뒤 저장한다.
    if (current.image.startsWith("data:")) {
      downloadDataUrl(current.image, filename);
      return;
    }
    const blob = await (await fetch(current.image)).blob();
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, filename);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    if (!images.length) return;
    setZipping(true);
    try {
      // 편집기와 같은 JSZip 을 쓴다. 라이브러리에서도 한 번에 받을 수 있게.
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      // base64Of 가 원격 이미지를 받아오므로 순차가 아니라 한 번에 기다린다.
      const encoded = await Promise.all(images.map((entry) => base64Of(entry.image)));
      images.forEach((entry, i) => {
        zip.file(`${title}-${String(i + 1).padStart(2, "0")}.${extOf(entry.image)}`, encoded[i], {
          base64: true,
        });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      downloadDataUrl(url, `${title}.zip`);
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 결과물 보기`}
      className="fixed inset-0 z-[60] flex flex-col bg-foreground/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-none items-center gap-3 pb-3 text-background">
        <div className="min-w-0">
          <strong className="block truncate text-sm">{title}</strong>
          <span className="block truncate text-xs opacity-80">
            {current?.sectionName} · {index + 1} / {images.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-background/15 hover:bg-background/25"
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={index === 0}
          aria-label="이전"
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-background/15 text-background hover:bg-background/25 disabled:opacity-30"
        >
          <ChevronLeft size={22} />
        </button>

        {current ? (
          <img
            alt={current.sectionName}
            src={current.image}
            className="max-h-full max-w-full rounded-md object-contain shadow-[var(--shadow-elevate)]"
          />
        ) : null}

        <button
          type="button"
          onClick={() => step(1)}
          disabled={index === images.length - 1}
          aria-label="다음"
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-background/15 text-background hover:bg-background/25 disabled:opacity-30"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div
        className="mx-auto flex w-full max-w-5xl flex-none flex-wrap items-center justify-center gap-2 pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <Button variant="outline" size="sm" onClick={() => void handleDownloadOne()} disabled={!current}>
          <Download size={14} className="mr-1.5" />이 이미지 저장
        </Button>
        <Button variant="outline" size="sm" onClick={() => void handleDownloadAll()} disabled={zipping}>
          {zipping ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Package size={14} className="mr-1.5" />}
          전체 ZIP
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleUseAsReference()}
          disabled={!current || savingReference}
          title="이 디자인을 다음 작업의 기준으로 삼습니다"
        >
          {savingReference ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <Palette size={14} className="mr-1.5" />
          )}
          레퍼런스로 쓰기
        </Button>
        {onEdit ? (
          <Button size="sm" onClick={onEdit}>
            <Pencil size={14} className="mr-1.5" />이어서 편집
          </Button>
        ) : null}
      </div>
      {referenceNotice ? (
        <p
          className="mx-auto max-w-5xl flex-none pt-2 text-center text-xs text-background/80"
          onClick={(event) => event.stopPropagation()}
        >
          {referenceNotice}
        </p>
      ) : null}
    </div>
  );
}
