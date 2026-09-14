import type { AspectRatio } from "@fixup/pdp-core";
import { randomId } from "../../lib/browser-safe";

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

export const TONE_OPTIONS = [
  "AI 자동 추천",
  "프리미엄",
  "모던",
  "테크",
  "미니멀",
  "팝아트",
  "인스타감성",
  "레트로",
];

/**
 * Studio API wrapper. Billable POSTs receive a unique request id so the server
 * can reserve credits exactly once.
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if ((init?.method || "GET").toUpperCase() === "POST") headers.set("x-generation-protocol", "2");

  if ((init?.method || "GET").toUpperCase() === "POST" && !headers.has("x-idempotency-key")) {
    headers.set("x-idempotency-key", randomId());
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const data = await response.json() as T & { usage?: unknown };
  if (data && typeof data === "object" && data.usage) {
    window.dispatchEvent(new CustomEvent("studio-usage-updated", { detail: data.usage }));
  }
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

export async function prepareImageFile(file: File) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const sourceImage = await loadImage(sourceDataUrl);
  const previewUrl = toAnchorJpegDataUrl(sourceImage);
  const base64 = previewUrl.split(",")[1] ?? "";

  if (!base64) {
    throw new Error("이미지 변환 결과가 비어 있습니다.");
  }

  return {
    base64,
    mimeType: "image/jpeg" as const,
    previewUrl,
    fileName: file.name,
  };
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
