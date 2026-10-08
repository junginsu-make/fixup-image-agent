import "server-only";
import sharp from "sharp";
import { inspectUploadedImage } from "./image-gate";

/**
 * **제품 원본을 그대로 넘기되, 모델이 못 쓰는 것만 손본다**(설계 2026-10-08 §4.3).
 *
 * 전에는 화면이 1024px·JPEG 84% 로 줄였다. 라벨 글자가 흐려져 모델이 짐작해 채웠다.
 * 이제 원본이다. 손보는 것은 둘뿐이다.
 *
 * 1. **회전 정보** — 휴대폰 사진은 픽셀을 누인 채 「세워 보라」는 표만 단다. 1024 사본은
 *    캔버스가 세워 줬는데 원본을 그대로 보내면 모델이 누운 사진으로 읽는다.
 * 2. **모델이 받는 최대(긴 변 3840px)를 넘는 것** — 0단계 실측으로 정한 `FIT_TO_MODEL_EDGE`
 *    가 켜졌을 때만.
 */
export const PRODUCT_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const PRODUCT_PHOTO_MAX_EDGE = 3840;
/** 설계 §9.1 「0단계 결과」로 정한다. */
export const FIT_TO_MODEL_EDGE = true;

export type PreparedProductPhoto =
  | { ok: true; bytes: Buffer; mimeType: string; width: number; height: number }
  | { ok: false; status: 400 | 413; message: string };

const FORMAT: Record<string, "jpeg" | "png" | "webp"> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function prepareProductPhoto(
  bytes: Buffer,
  fitToModelEdge = FIT_TO_MODEL_EDGE,
): Promise<PreparedProductPhoto> {
  if (bytes.length === 0) return { ok: false, status: 400, message: "이미지가 없습니다." };
  if (bytes.length > PRODUCT_PHOTO_MAX_BYTES) {
    return { ok: false, status: 413, message: "이미지 용량이 너무 큽니다. 20MB 이하로 올려 주세요." };
  }
  const inspected = await inspectUploadedImage(bytes);
  if (!inspected.ok) {
    return { ok: false, status: inspected.reason === "too_many_pixels" ? 413 : 400, message: inspected.message };
  }

  const orientation = (await sharp(bytes, { limitInputPixels: false }).metadata()).orientation ?? 1;
  const tooLarge = fitToModelEdge && Math.max(inspected.width, inspected.height) > PRODUCT_PHOTO_MAX_EDGE;
  if (orientation === 1 && !tooLarge) {
    return { ok: true, bytes, mimeType: inspected.mimeType, width: inspected.width, height: inspected.height };
  }

  const format = FORMAT[inspected.mimeType] ?? "jpeg";
  let pipeline = sharp(bytes, { limitInputPixels: false }).rotate();
  if (tooLarge) {
    pipeline = pipeline.resize({ width: PRODUCT_PHOTO_MAX_EDGE, height: PRODUCT_PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true });
  }
  const { data, info } = await pipeline
    .toFormat(format, format === "png" ? {} : { quality: 95 })
    .toBuffer({ resolveWithObject: true });
  return { ok: true, bytes: data, mimeType: inspected.mimeType, width: info.width, height: info.height };
}
