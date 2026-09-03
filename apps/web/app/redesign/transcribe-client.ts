// Deep import (not the package barrel): the barrel re-exports server-only modules
// (node:crypto via knowledge-access/generate, @neondatabase via rag) which webpack
// cannot bundle into this browser module. transcribe-batching.ts is pure/DOM-free.
import { planTranscribeBatches, stitchTranscripts, type RedesignStrip } from "@fixup/redesign-core/src/transcribe-batching";

const STRIP_TARGET_WIDTH_MAX = 2048;
const STRIP_TARGET_HEIGHT = 2560;
const MAX_STRIPS_TOTAL = 40;
const MAX_PDF_PAGES = 20;
const JPEG_QUALITY = 0.88;
const MAX_CANVAS_PX = 16000; // 브라우저 캔버스 최대 치수 가드(양 축)

function canvasToJpegBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1] ?? "";
}

// 소스 영역(<img> 또는 페이지 캔버스)을 목표폭 유지로 세로 스트립들로 자른다.
function sliceRegionToStrips(
  source: CanvasImageSource, srcW: number, srcH: number,
  pageStartRatio: number, pageEndRatio: number, out: RedesignStrip[]
) {
  const width = Math.min(srcW, STRIP_TARGET_WIDTH_MAX); // 다운스케일만, 업스케일 금지
  const scale = width / srcW;
  const scaledH = srcH * scale;
  const stripPx = STRIP_TARGET_HEIGHT;
  const count = Math.max(1, Math.ceil(scaledH / stripPx));
  for (let i = 0; i < count && out.length < MAX_STRIPS_TOTAL; i += 1) {
    const sY = (srcH / count) * i;
    const sH = i === count - 1 ? srcH - sY : srcH / count;
    const cw = Math.round(width);
    const ch = Math.min(MAX_CANVAS_PX, Math.round(sH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) continue;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(source, 0, sY, srcW, sH, 0, 0, cw, ch);
    const span = pageEndRatio - pageStartRatio;
    out.push({
      base64: canvasToJpegBase64(canvas), mimeType: "image/jpeg",
      yStartRatio: pageStartRatio + span * (i / count),
      yEndRatio: pageStartRatio + span * ((i + 1) / count),
    });
  }
}

export async function splitFilesToStrips(files: File[]): Promise<RedesignStrip[]> {
  const out: RedesignStrip[] = [];
  for (const file of files) {
    if (out.length >= MAX_STRIPS_TOTAL) break;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) await splitPdf(file, out);
    else if (file.type.startsWith("image/")) await splitImage(file, out);
  }
  return out;
}

async function splitImage(file: File, out: RedesignStrip[]) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    sliceRegionToStrips(img, img.naturalWidth, img.naturalHeight, 0, 1, out);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function splitPdf(file: File, out: RedesignStrip[]) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // 로컬 번들
  // pdfjs 6 부터 문서 자체에는 destroy 가 없다. 정리는 로딩 작업이 맡는다.
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  for (let n = 1; n <= pages && out.length < MAX_STRIPS_TOTAL; n += 1) {
    const page = await pdf.getPage(n);
    // 캔버스 최대 치수(MAX_CANVAS_PX)를 양 축 모두 넘지 않도록 렌더 스케일 자체를 낮춘다.
    // (캔버스만 clamp하면 pdf.js가 원본 뷰포트 변환으로 렌더링해 아래쪽이 잘려나가 데이터 유실됨)
    const raw = page.getViewport({ scale: 1 });
    const scale = Math.min(2.0, MAX_CANVAS_PX / raw.width, MAX_CANVAS_PX / raw.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    // 페이지별로만 슬라이스(세로 이어붙이기 금지)
    sliceRegionToStrips(canvas, canvas.width, canvas.height, (n - 1) / pages, n / pages, out);
  }
  await loadingTask.destroy();
}

function loadImage(objectUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 파일을 열 수 없습니다."));
    img.src = objectUrl;
  });
}

export async function runTranscription(
  strips: RedesignStrip[],
  opts: { provider: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal }
): Promise<{ transcript: string | null; failedBatches: number }> {
  const batches = planTranscribeBatches(strips);
  if (batches.length === 0) return { transcript: null, failedBatches: 0 };
  const parts: { transcript: string | null; batchIndex: number }[] = [];
  let done = 0, failed = 0, prevHint: string | undefined;
  for (let i = 0; i < batches.length; i += 1) {
    if (opts.signal?.aborted) break;
    try {
      const res = await fetch("/api/redesign/transcribe-strips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strips: batches[i], batchIndex: i, batchCount: batches.length, previousSectionHint: prevHint, provider: opts.provider }),
        signal: opts.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "전사 실패");
      parts.push({ transcript: data.transcript, batchIndex: i });
      prevHint = data.lastSectionType || prevHint;
    } catch (err) {
      const isAbort = (err as { name?: string })?.name === "AbortError" || opts.signal?.aborted;
      if (isAbort) break;
      parts.push({ transcript: null, batchIndex: i });
      failed += 1;
    }
    done += 1;
    opts.onProgress?.(done, batches.length);
  }
  const stitched = stitchTranscripts(parts);
  return { transcript: failed === batches.length ? null : stitched, failedBatches: failed };
}
