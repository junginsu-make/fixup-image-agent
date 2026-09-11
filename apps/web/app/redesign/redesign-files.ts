/**
 * 파일을 다루는 일 — 내려받기, 줄이기, PDF 를 그림으로, 지식 글 뽑기.
 *
 * 전부 브라우저 API(canvas·FileReader·pdf.js)를 쓴다. 화면에서 떼어 내도
 * 하는 일이 같아서 여기 모았다.
 */

import type { SectionResult } from "./redesign-model";
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

export async function normalizeFilesForUpload(files: File[]) {
  const output: File[] = [];
  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      output.push(...(await renderPdfToImages(file)));
    } else if (file.type.startsWith("image/")) {
      output.push(...(await renderImageToReferenceFiles(file)));
    }
  }
  return output.slice(0, 4);
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
  const maxWidth = 1200;
  const maxHeight = 1800;
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
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

export async function renderPdfToImages(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageCount = Math.min(pdf.numPages, 4);
  const pages: File[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
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

  return pages;
}

