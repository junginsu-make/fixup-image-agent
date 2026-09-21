// Deep import (not the package barrel): the barrel re-exports server-only modules
// (node:crypto via knowledge-access/generate, @neondatabase via rag) which webpack
// cannot bundle into this browser module. transcribe-batching.ts is pure/DOM-free.
import { randomId } from "../../lib/browser-safe";
import { stripCuts, type CoverageCut } from "./coverage";
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
/**
 * 한 영역을 세로 조각으로 자른다.
 *
 * **자르려던 수를 돌려준다**(F-7-0). 상한에 닿아 덜 자른 경우를 부르는 쪽이
 * 알아야, 「몇 조각 중 몇 조각」을 사실대로 말할 수 있다.
 */
function sliceRegionToStrips(
  source: CanvasImageSource, srcW: number, srcH: number,
  pageStartRatio: number, pageEndRatio: number, out: RedesignStrip[]
): number {
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
  return count;
}

/**
 * 원본을 글자 읽기용 조각으로 자른다.
 *
 * **자른 것을 함께 돌려준다**(F-7-0). 조각 40장·PDF 20쪽에서 멈추는데,
 * 전에는 그 사실을 아무 데도 말하지 않았다 — 100쪽짜리를 올린 사람이 앞
 * 20쪽만 읽은 전사로 만든 페이지를 받으면서 그것을 몰랐다.
 */
export async function splitFilesToStrips(
  files: File[],
): Promise<{ strips: RedesignStrip[]; cuts: CoverageCut[] }> {
  const out: RedesignStrip[] = [];
  const cuts: CoverageCut[] = [];
  let 자르려던조각 = 0;
  let 통째로건너뛴파일 = 0;

  for (const file of files) {
    if (out.length >= MAX_STRIPS_TOTAL) {
      // 조각 상한에 이미 닿았다. 이 파일은 한 조각도 안 읽는다.
      통째로건너뛴파일 += 1;
      continue;
    }
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      const pdf = await splitPdf(file, out);
      자르려던조각 += pdf.wantedStrips;
      /*
        **쪽수 상한과 조각 상한은 다른 이유로 끊는다.** 20쪽에서 멈춘 것과
        40조각에서 멈춘 것을 한 수로 뭉뚱그리면 거짓말이 된다. 실제로 조각이
        나온 쪽수를 센다.
      */
      if (pdf.usedPages < pdf.totalPages) {
        cuts.push({
          what: "transcribe-pdf-pages",
          used: pdf.usedPages,
          total: pdf.totalPages,
          label: file.name,
        });
      }
    } else if (file.type.startsWith("image/")) {
      자르려던조각 += await splitImage(file, out);
    }
  }

  // 세는 일은 `coverage.ts` 가 한다. 여기서 세면 돌려 볼 수 없다.
  cuts.push(...stripCuts({ used: out.length, wanted: 자르려던조각, skippedFiles: 통째로건너뛴파일 }));

  return { strips: out, cuts };
}

async function splitImage(file: File, out: RedesignStrip[]): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    return sliceRegionToStrips(img, img.naturalWidth, img.naturalHeight, 0, 1, out);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * PDF 를 조각으로 자른다.
 *
 * **세 가지를 돌려준다.** 원래 쪽수, 실제로 조각이 나온 쪽수, 자르려던 조각 수.
 * 쪽수 상한(20)과 조각 상한(40)은 다른 이유로 끊으므로 따로 세야 한다.
 */
async function splitPdf(
  file: File,
  out: RedesignStrip[],
): Promise<{ totalPages: number; usedPages: number; wantedStrips: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // 로컬 번들
  // pdfjs 6 부터 문서 자체에는 destroy 가 없다. 정리는 로딩 작업이 맡는다.
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pages = Math.min(totalPages, MAX_PDF_PAGES);
  let usedPages = 0;
  let wantedStrips = 0;
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
    const before = out.length;
    wantedStrips += sliceRegionToStrips(canvas, canvas.width, canvas.height, (n - 1) / pages, n / pages, out);
    if (out.length > before) usedPages += 1;
  }
  await loadingTask.destroy();
  return { totalPages, usedPages, wantedStrips };
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
): Promise<{ transcript: string | null; failedBatches: number; complete: boolean }> {
  const batches = planTranscribeBatches(strips);
  if (batches.length === 0) return { transcript: null, failedBatches: 0, complete: true };
  const parts: { transcript: string | null; batchIndex: number }[] = [];
  let done = 0, failed = 0, prevHint: string | undefined;
  for (let i = 0; i < batches.length; i += 1) {
    if (opts.signal?.aborted) break;
    try {
      const res = await fetch("/api/redesign/transcribe-strips", {
        method: "POST",
        /*
          **배치마다 새 열쇠를 준다**(F-7-9).

          전사도 예약을 거친다 — 없으면 400 이고, 이 길의 실패는 조용하다
          (아래 catch 가 자리표시로 바꾼다). 같은 값을 돌려 쓰면 두 번째부터
          `duplicate_request` 로 거절된다.
        */
        headers: { "Content-Type": "application/json", "x-idempotency-key": randomId() },
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
  /**
   * **끝까지 갔는지 알려 준다.**
   *
   * 중단은 예외를 던지지 않고 `break` 로 빠져나가므로, 부르는 쪽이 보기에는
   * 성공한 것과 구별되지 않았다. 그 값을 캐시에 넣으면 잘린 전사가 새로고침
   * 전까지 영구히 재사용된다 — 5배치짜리를 2/5 에서 취소하고 설정만 바꿔 다시
   * 만들면, 하단의 수치·인증번호·후기가 통째로 빠진 결과가 계속 나온다.
   */
  return {
    transcript: failed === batches.length ? null : stitched,
    failedBatches: failed,
    complete: done === batches.length,
  };
}
