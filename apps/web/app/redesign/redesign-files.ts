/**
 * 파일을 다루는 일 — 내려받기, 줄이기, PDF 를 그림으로, 지식 글 뽑기.
 *
 * 전부 브라우저 API(canvas·FileReader·pdf.js)를 쓴다. 화면에서 떼어 내도
 * 하는 일이 같아서 여기 모았다.
 */

import type { SectionResult } from "./redesign-model";
import { referenceCuts, type CoverageCut } from "./coverage";
export function downloadDataUrl(url: string, fileName: string) {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function buildImageFileName(projectTitle: string, section: SectionResult, index: number, revisionLabel = "") {
  const ext = imageExtension(section.imageUrl || "");
  const parts = [
    projectTitle || "redesign",
    section.id || `S${index + 1}`,
    section.name || "section",
    revisionLabel && revisionLabel !== "원본" ? revisionLabel : ""
  ].filter(Boolean);
  return `${sanitizeDownloadName(parts.join("-"))}.${ext}`;
}

export function imageExtension(url: string) {
  const mime = url.match(/^data:([^;]+);/)?.[1] || "";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  return "png";
}

export function sanitizeDownloadName(name: string) {
  return name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "redesign-image";
}

export async function compressImageForRequest(dataUrl: string) {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  try {
    const image = await loadDataUrlImage(dataUrl);
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return dataUrl;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await canvasToDataUrl(canvas, "image/jpeg", 0.84);
  } catch {
    return dataUrl;
  }
}

export function loadDataUrlImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("수정용 이미지를 압축하지 못했습니다."));
    image.src = dataUrl;
  });
}

export async function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality: number) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("이미지 압축에 실패했습니다."));
    }, type, quality);
  });
  return blobToDataUrl(blob);
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("이미지 변환에 실패했습니다."));
    reader.readAsDataURL(blob);
  });
}

export function estimateDataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(",")[1] || "";
  return Math.round((payload.length * 3) / 4);
}


export async function extractKnowledgeText(files: File[]) {
  if (files.length === 0) return "";

  const chunks: string[] = [];
  for (const file of files.slice(0, 5)) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      chunks.push(await extractPdfText(file));
      continue;
    }
    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".md")) {
      chunks.push(await file.text());
    }
  }

  return chunks
    .map((chunk, index) => `# 지식파일 ${index + 1}\n${chunk}`)
    .join("\n\n")
    .slice(0, 120000);
}

export async function indexKnowledgeFile(name: string, text: string): Promise<{ indexed: boolean; chunks: number; documentId?: string; reason?: string }> {
  if (!text.trim()) return { indexed: false, chunks: 0, reason: "추출된 텍스트가 없습니다." };

  const response = await fetch("/api/redesign/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, text })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "지식파일 인덱싱 실패");
  return {
    indexed: Boolean(data.indexed),
    chunks: Number(data.chunks || 0),
    documentId: data.documentId,
    reason: data.reason
  };
}

export async function deleteIndexedKnowledge(documentId?: string) {
  if (!documentId) return;
  await fetch("/api/redesign/knowledge", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId })
  });
}

export async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageCount = Math.min(pdf.numPages, 80);
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    if (text.trim()) pages.push(`[${file.name} p.${pageNumber}] ${text}`);
    if (pages.join("\n").length > 120000) break;
  }

  return pages.join("\n");
}

/** 그림 참조로 실을 수 있는 최대 장수. 코어의 `MAX_REFERENCE_IMAGES` 와 짝이다. */
const MAX_REFERENCE_FILES = 4;

/**
 * 올린 자료를 그림 참조로 바꾼다.
 *
 * **자른 것을 함께 돌려준다**(F-7-0). 전에는 `slice(0, 4)` 한 줄이 조용히
 * 버렸다 — 20쪽짜리 PDF 를 올린 사람이 4쪽만 보고 만든 페이지를 받으면서
 * 그 사실을 어디서도 못 들었다.
 */
export async function normalizeFilesForUpload(
  files: File[],
): Promise<{ files: File[]; cuts: CoverageCut[] }> {
  /*
    **자른 뒤에 센다**(2026-09-21 리뷰).

    상한은 **누적**인데 처음 판은 고지를 **파일마다** 쌓았다. PDF 두 개
    (20쪽·12쪽)를 올리면 실제로는 첫 PDF 의 4쪽만 쓰는데 「20쪽 중 4쪽,
    12쪽 중 4쪽」이라고 말했다. 둘째는 한 쪽도 안 썼다. 고지가 목적인 기능이
    사실이 아닌 문장을 냈다.

    그래서 어느 원본에서 나왔는지를 함께 담아 두고, **자른 뒤 살아남은 것**을
    원본별로 센다.
  */
  const produced: Array<{ file: File; origin: string }> = [];
  const pdfPages = new Map<string, number>();

  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const rendered = await renderPdfToImages(file);
      pdfPages.set(file.name, rendered.totalPages);
      for (const page of rendered.pages) produced.push({ file: page, origin: file.name });
    } else if (file.type.startsWith("image/")) {
      for (const cropped of await renderImageToReferenceFiles(file)) {
        produced.push({ file: cropped, origin: file.name });
      }
    }
  }

  const kept = produced.slice(0, MAX_REFERENCE_FILES);

  return {
    files: kept.map((entry) => entry.file),
    // 세는 일은 `coverage.ts` 가 한다. 여기서 세면 돌려 볼 수 없다.
    cuts: referenceCuts({ produced, kept, pdfPages }),
  };
}

export async function renderImageToReferenceFiles(file: File) {
  const image = await loadImageElement(file);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) throw new Error("업로드 이미지를 읽지 못했습니다.");

  const isLongDetailPage = naturalHeight / naturalWidth > 2.2;
  const sliceCount = isLongDetailPage ? Math.min(4, Math.ceil(naturalHeight / naturalWidth / 1.8)) : 1;
  const files: File[] = [];

  for (let index = 0; index < sliceCount; index += 1) {
    const sourceY = Math.floor((naturalHeight / sliceCount) * index);
    const sourceHeight = index === sliceCount - 1 ? naturalHeight - sourceY : Math.floor(naturalHeight / sliceCount);
    files.push(await cropImageToPngFile({
      image,
      sourceX: 0,
      sourceY,
      sourceWidth: naturalWidth,
      sourceHeight,
      fileName: file.name,
      index
    }));
  }

  URL.revokeObjectURL(image.src);
  return files;
}

export function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 파일을 브라우저에서 열 수 없습니다."));
    image.src = URL.createObjectURL(file);
  });
}

/**
 * **참조 그림의 크기 한도**(F-7-1).
 *
 * 화면이 올리는 참조는 여기서 줄여 왔다. 그런데 **PDF 갈래만 줄이지 않았다** —
 * `renderPdfToImages` 가 `scale: 1.6` 을 그대로 캔버스로 썼다.
 *
 * 그래서 **같은 원본이 확장자에 따라 갈렸다.** 1080×15000 을 PNG 로 올리면
 * 조각내고 줄여 518×1800 로 가지만, 같은 것을 PDF 로 올리면 1728×24000
 * (41.5백만 화소)로 올라갔다. 서버 문지기가 생긴 뒤로는 **그 갈래가 413 으로
 * 막힌다** — 사용자에게는 「줄여서 올려 주세요」라고 하는데 PDF 라 줄일 방법이
 * 없다(2026-09-21 리뷰).
 *
 * 한 곳에서 정한다. 이미지는 키우지 않으므로 기준 배율이 1 이고, PDF 는 글씨를
 * 읽히려고 1.6 까지 키운 뒤 이 한도로 다시 조인다.
 */
export const REFERENCE_MAX_WIDTH = 1200;
export const REFERENCE_MAX_HEIGHT = 1800;

export function referenceRenderScale(sourceWidth: number, sourceHeight: number, baseScale = 1): number {
  const width = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1;
  const height = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1;
  const base = Number.isFinite(baseScale) && baseScale > 0 ? baseScale : 1;
  return Math.min(base, REFERENCE_MAX_WIDTH / width, REFERENCE_MAX_HEIGHT / height);
}

export async function cropImageToPngFile({
  image,
  sourceX,
  sourceY,
  sourceWidth,
  sourceHeight,
  fileName,
  index
}: {
  image: HTMLImageElement;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  fileName: string;
  index: number;
}) {
  const scale = referenceRenderScale(sourceWidth, sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("이미지 변환 캔버스를 만들지 못했습니다.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("이미지를 PNG로 변환하지 못했습니다."));
    }, "image/png");
  });

  const safeName = fileName.replace(/\.[^.]+$/i, "");
  return new File([blob], `${safeName}-reference-${index + 1}.png`, { type: "image/png" });
}

/**
 * PDF 를 그림 참조로 만든다.
 *
 * **원래 쪽수를 함께 돌려준다**(F-7-0). 앞 4쪽만 쓰는데, 몇 쪽 중 4쪽인지를
 * 여기서 말하지 않으면 아무도 모른다.
 */
export async function renderPdfToImages(file: File): Promise<{ pages: File[]; totalPages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const totalPages = pdf.numPages;
  const pageCount = Math.min(totalPages, MAX_REFERENCE_FILES);
  const pages: File[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    /*
      **여기도 줄인다.** 전에는 1.6 을 그대로 썼다 — 한 장짜리 긴 상세페이지
      PDF 가 41.5백만 화소로 올라가 서버 문지기에 막혔다. 이미지 갈래와 같은
      한도로 조인다.
    */
    const raw = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: referenceRenderScale(raw.width, raw.height, 1.6) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("PDF 페이지를 이미지로 변환하지 못했습니다."));
      }, "image/png");
    });
    pages.push(new File([blob], `${file.name.replace(/\.pdf$/i, "")}-page-${pageNumber}.png`, { type: "image/png" }));
  }

  return { pages, totalPages };
}

