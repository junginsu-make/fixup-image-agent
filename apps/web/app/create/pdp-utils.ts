import { observeAccountResponse } from "../../lib/membership/account-events";
import type { AspectRatio } from "@fixup/pdp-core";
import { randomId } from "../../lib/browser-safe";
import { IMAGE_TONES, TONE_AUTO_LABEL } from "@fixup/pdp-core";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export const RATIO_OPTIONS: Array<{
  value: AspectRatio;
  label: string;
  description: string;
  icon: "square" | "portrait" | "phone" | "landscape" | "wide";
}> = [
  { value: "1:1", label: "정방형(1:1)", description: "썸네일, 마켓 대표 이미지", icon: "square" },
  { value: "3:4", label: "일반 세로(3:4)", description: "상세페이지 기본형", icon: "portrait" },
  { value: "9:16", label: "모바일 세로(9:16)", description: "모바일 집중형 상세페이지", icon: "phone" },
  { value: "4:3", label: "일반 가로(4:3)", description: "배너, 중간 섹션 컷", icon: "landscape" },
  { value: "16:9", label: "와이드(16:9)", description: "히어로 배너형", icon: "wide" },
];

/**
 * 칩 목록. **값은 코어에 한 벌**이다(D-8).
 *
 * 전에는 여기에만 있었고 서버는 아무 글자나 받았다. 목록을 두 벌로 두면
 * 화면이 보여 주는 값을 서버가 거절하는 날이 온다.
 */
export const TONE_OPTIONS = [TONE_AUTO_LABEL, ...IMAGE_TONES] as const;

/**
 * Studio API wrapper. Billable POSTs receive a unique request id so the server
 * can reserve credits exactly once.
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");

  if ((init?.method || "GET").toUpperCase() === "POST" && !headers.has("x-idempotency-key")) {
    headers.set("x-idempotency-key", randomId());
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const data = await response.json() as T & { usage?: unknown };
  observeAccountResponse(data);
  return data;
}

export function toDataUrl(mimeType: string, base64: string) {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * 섹션 생성 앵커 규격.
 *
 * 앵커 이미지는 결과물이 아니라 모델에 매번 함께 보내는 참조다. PdpEditor 가
 * 섹션마다 originalImageBase64 로 다시 올리므로(PdpEditor.tsx:1308) 원본 해상도로
 * 두면 요청 하나하나가 수 MB가 된다.
 */
const ANCHOR_MAX_DIMENSION = 1024;
const ANCHOR_JPEG_QUALITY = 0.84;

function toAnchorJpegDataUrl(sourceImage: HTMLImageElement) {
  let width = sourceImage.width;
  let height = sourceImage.height;

  if (width > ANCHOR_MAX_DIMENSION || height > ANCHOR_MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * ANCHOR_MAX_DIMENSION) / width);
      width = ANCHOR_MAX_DIMENSION;
    } else {
      width = Math.round((width * ANCHOR_MAX_DIMENSION) / height);
      height = ANCHOR_MAX_DIMENSION;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 캔버스를 초기화하지 못했습니다.");
  }

  context.drawImage(sourceImage, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", ANCHOR_JPEG_QUALITY);
}

/** 그림 모델이 그대로 받는 형식. 다른 형식(HEIC 등)은 브라우저가 열 수 있으면 JPEG 로 바꾼다. */
const ORIGINAL_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** 서버(`lib/pdp/product-photo.ts`)가 받는 상한과 같은 값. 넘으면 서버가 413 으로 돌려보낸다. */
const ORIGINAL_MAX_BYTES = 20 * 1024 * 1024;
const ORIGINAL_MAX_PIXELS = 40_000_000;
/** 모델이 받는 최대 긴 변. 상한을 넘는 원본만 여기에 맞춘다. */
export const ORIGINAL_FIT_EDGE = 3840;

export type OriginalFit = { mode: "as-is" } | { mode: "fit"; width: number; height: number };

/**
 * **상한을 넘는 원본은 거절하지 않고 긴 변 3840 에 맞춘다**(최종 리뷰 A3, 판정 R3).
 *
 * 전에는 화면이 20MB 를 바로 거절했고, 40백만 화소는 분석(돈이 드는 단계)을 다 마친 뒤
 * 올리기에서야 막혔다. 상한 안이면 그대로 — 원본을 줄이지 않는다(설계 D1).
 * 긴 변이 이미 3840 아래인데 용량만 크면 크기는 두고 JPEG 로 다시 굽기만 한다.
 */
export function originalFitFor(input: { width: number; height: number; bytes: number }): OriginalFit {
  const within = input.bytes <= ORIGINAL_MAX_BYTES && input.width * input.height <= ORIGINAL_MAX_PIXELS;
  if (within) return { mode: "as-is" };
  const scale = Math.min(1, ORIGINAL_FIT_EDGE / Math.max(input.width, input.height));
  return {
    mode: "fit",
    width: Math.max(1, Math.round(input.width * scale)),
    height: Math.max(1, Math.round(input.height * scale)),
  };
}

/**
 * 캔버스 결과를 원본 칸에 담을 수 있는가(최종 리뷰 C3).
 *
 * 브라우저는 캔버스가 제 한도를 넘으면 오류 없이 `"data:,"` 를 준다. 그것을 그대로 두면
 * 빈 원본(`base64: ""`)이 임시저장에 남는다 — 차라리 원본을 버리고 1024 사본 길로 간다.
 */
export function usableOriginal(dataUrl: string): { base64: string; mimeType: string } | undefined {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  return match ? { base64: match[2]!, mimeType: match[1]! } : undefined;
}

function drawJpegDataUrl(sourceImage: HTMLImageElement, size: { width: number; height: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 캔버스를 초기화하지 못했습니다.");
  context.drawImage(sourceImage, 0, 0, size.width, size.height);
  return canvas.toDataURL("image/jpeg", 0.95);
}

const base64Bytes = (dataUrl: string) => Math.floor(((dataUrl.split(",")[1] ?? "").length * 3) / 4);

/** 모델에 넘길 원본. 못 만들면 없다고 답한다 — 편집기가 1024 사본을 올려 쓴다. */
function originalOf(file: File, sourceDataUrl: string, sourceImage: HTMLImageElement) {
  const size = { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight };
  if (ORIGINAL_TYPES.includes(file.type)) {
    const fit = originalFitFor({ ...size, bytes: file.size });
    return usableOriginal(fit.mode === "as-is" ? sourceDataUrl : drawJpegDataUrl(sourceImage, fit));
  }
  // HEIC 등: 같은 크기 JPEG 를 먼저 굽고, 그 결과가 상한을 넘을 때만 맞춘다.
  const byPixels = originalFitFor({ ...size, bytes: 0 });
  if (byPixels.mode === "fit") return usableOriginal(drawJpegDataUrl(sourceImage, byPixels));
  const fullSize = drawJpegDataUrl(sourceImage, size);
  const byBytes = originalFitFor({ ...size, bytes: base64Bytes(fullSize) });
  return usableOriginal(byBytes.mode === "as-is" ? fullSize : drawJpegDataUrl(sourceImage, byBytes));
}

async function readWithPreview(file: File) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const sourceImage = await loadImage(sourceDataUrl);
  const previewUrl = toAnchorJpegDataUrl(sourceImage);
  const base64 = previewUrl.split(",")[1] ?? "";

  if (!base64) {
    throw new Error("이미지 변환 결과가 비어 있습니다.");
  }

  return {
    prepared: {
      base64,
      mimeType: "image/jpeg" as const,
      previewUrl,
      fileName: file.name,
    },
    sourceDataUrl,
    sourceImage,
  };
}

/**
 * 1024 사본(미리보기·분석용). 인물 사진은 이것만 쓴다 — 원본을 만들지도, 원본 상한을
 * 걸지도 않는다(최종 리뷰 C1). 이번 변경 전과 같은 모양이다.
 */
export async function prepareImageFile(file: File) {
  return (await readWithPreview(file)).prepared;
}

/** 제품 사진: 1024 사본과 **원본을 함께** 쥔다(설계 2026-10-08 D1·§4.6). */
export async function prepareProductImageFile(file: File) {
  const { prepared, sourceDataUrl, sourceImage } = await readWithPreview(file);
  const original = originalOf(file, sourceDataUrl, sourceImage);
  return { ...prepared, ...(original ? { original } : {}) };
}

/**
 * 생성된 이미지를 앵커로 쓰기 전에 업로드본과 같은 규격으로 맞춘다.
 * 텍스트 경로의 대표 이미지는 2K로 생성되므로 이 단계를 거치지 않으면
 * 섹션 생성 요청마다 수 MB를 다시 올리게 된다.
 */
export async function toAnchorImage(base64: string, mimeType: string) {
  const sourceImage = await loadImage(toDataUrl(mimeType, base64));
  const previewUrl = toAnchorJpegDataUrl(sourceImage);
  const next = previewUrl.split(",")[1] ?? "";

  if (!next) {
    throw new Error("대표 이미지 변환 결과가 비어 있습니다.");
  }

  return { base64: next, mimeType: "image/jpeg" as const };
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}
