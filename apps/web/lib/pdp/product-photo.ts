import "server-only";
import sharp from "sharp";
import { inspectUploadedImage } from "./image-gate";
import { STYLE_REFERENCE_MAX_PIXELS } from "./reference-limits";

/**
 * **제품 원본을 그대로 넘기되, 모델이 못 쓰는 것만 손본다**(설계 2026-10-08 §4.3).
 *
 * 전에는 화면이 1024px·JPEG 84% 로 줄였다. 라벨 글자가 흐려져 모델이 짐작해 채웠다.
 * 이제 원본이다. 손보는 것은 둘뿐이다.
 *
 * 1. **회전 정보** — 휴대폰 사진은 픽셀을 누인 채 「세워 보라」는 표만 단다. 1024 사본은
 *    캔버스가 세워 줬는데 원본을 그대로 보내면 모델이 누운 사진으로 읽는다.
 * 2. **모델이 받는 최대(긴 변 3840px)를 넘는 것** — `FIT_TO_MODEL_EDGE` 가 켜졌을 때만.
 *
 * 두 걸음으로 나눈다(보안 리뷰 M-1). 머리말만 보는 **문지기**(`inspectProductPhoto`)는
 * 예약 전에, 화소를 펼치는 **손질**(`normalizeProductPhoto`)은 시간당 칸을 예약한 뒤에
 * 돈다 — 예약 전에 펼치면 칸이 다 찬 사람도 서버 메모리를 쓸 수 있다.
 */
export const PRODUCT_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const PRODUCT_PHOTO_MAX_EDGE = 3840;
/**
 * **끈다** — 0단계 실측(2026-10-08, 설계 §9.1)에서 GPT Image 2.5·Nano Banana Pro 편집이
 * 4032px 참조를 둘 다 그대로 받아 만들었다. 원본을 그대로 넘긴다(사용자 결정 D1).
 * 화면은 40백만 화소·20MB 를 넘는 사진만 고를 때 3840 으로 맞춘다(Ruling R3).
 */
export const FIT_TO_MODEL_EDGE = false;
/**
 * 한 번에 펼치는 원본 수. 40백만 화소 한 장을 펼치면 수백 MB 다 — 운영 램 911MB 에서
 * 둘을 넘기면 돌고 있는 서비스가 밀린다. 넘는 요청은 차례를 기다린다.
 */
export const HEAVY_STEP_CONCURRENCY = 2;

export type InspectedProductPhoto =
  | { ok: true; mimeType: string; width: number; height: number }
  | { ok: false; status: 400 | 413; message: string };

export type PreparedProductPhoto =
  | { ok: true; bytes: Buffer; mimeType: string; width: number; height: number }
  | { ok: false; status: 400 | 413; message: string };

const FORMAT: Record<string, "jpeg" | "png" | "webp"> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
const UNREADABLE = "이미지를 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.";

/** 크기와 머리말만 본다 — 화소를 펼치지 않는다(`image-gate.ts`). */
export async function inspectProductPhoto(bytes: Buffer): Promise<InspectedProductPhoto> {
  if (bytes.length === 0) return { ok: false, status: 400, message: "이미지가 없습니다." };
  if (bytes.length > PRODUCT_PHOTO_MAX_BYTES) {
    return { ok: false, status: 413, message: "이미지 용량이 너무 큽니다. 20MB 이하로 올려 주세요." };
  }
  const inspected = await inspectUploadedImage(bytes);
  if (!inspected.ok) {
    return { ok: false, status: inspected.reason === "too_many_pixels" ? 413 : 400, message: inspected.message };
  }
  return { ok: true, mimeType: inspected.mimeType, width: inspected.width, height: inspected.height };
}

/**
 * 동시에 도는 일을 `limit` 개로 묶는다. 자리가 나면 기다리던 다음 일에 바로 넘긴다.
 * 실패한 일도 자리를 돌려준다 — 안 그러면 뒤의 요청이 영영 기다린다.
 */
export function limitConcurrency(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = (): Promise<void> => {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiting.push(resolve));
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}

const heavySlot = limitConcurrency(HEAVY_STEP_CONCURRENCY);
/** 문지기와 같은 화소 상한. 손질에서도 걸어 둔다 — 머리말과 실제 화소가 다른 파일을 펼치지 않게. */
const SHARP_INPUT = { limitInputPixels: STYLE_REFERENCE_MAX_PIXELS, sequentialRead: true } as const;

async function rotateAndFit(
  bytes: Buffer,
  inspected: Extract<InspectedProductPhoto, { ok: true }>,
  fitToModelEdge: boolean,
): Promise<PreparedProductPhoto> {
  const orientation = (await sharp(bytes, SHARP_INPUT).metadata()).orientation ?? 1;
  const tooLarge = fitToModelEdge && Math.max(inspected.width, inspected.height) > PRODUCT_PHOTO_MAX_EDGE;
  if (orientation === 1 && !tooLarge) {
    return { ok: true, bytes, mimeType: inspected.mimeType, width: inspected.width, height: inspected.height };
  }

  const format = FORMAT[inspected.mimeType] ?? "jpeg";
  const rotated = sharp(bytes, SHARP_INPUT).rotate();
  const pipeline = tooLarge
    ? rotated.resize({ width: PRODUCT_PHOTO_MAX_EDGE, height: PRODUCT_PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    : rotated;
  const { data, info } = await pipeline
    .toFormat(format, format === "png" ? {} : { quality: 95 })
    .toBuffer({ resolveWithObject: true });
  return { ok: true, bytes: data, mimeType: inspected.mimeType, width: info.width, height: info.height };
}

/** 회전을 굽고 필요하면 3840 에 맞춘다. 펼치다 실패하면 던지지 않고 400 으로 답한다. */
export async function normalizeProductPhoto(
  bytes: Buffer,
  inspected: Extract<InspectedProductPhoto, { ok: true }>,
  fitToModelEdge = FIT_TO_MODEL_EDGE,
): Promise<PreparedProductPhoto> {
  return heavySlot(async () => {
    try {
      return await rotateAndFit(bytes, inspected, fitToModelEdge);
    } catch {
      return { ok: false, status: 400, message: UNREADABLE };
    }
  });
}
