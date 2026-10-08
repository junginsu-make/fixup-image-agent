import { API_BASE_URL } from "./pdp-utils";
import { randomId } from "../../lib/browser-safe";
import type { CreateMode } from "./create-steps";

/**
 * **제품 원본은 한 번 올리고 주소로 쓴다**(설계 2026-10-08 §4).
 *
 * 섹션마다 원본을 몸통에 실으면 서버가 큰 그림을 30~90초씩 쥐고 있다. 사진 한 장을
 * 한 번 올리고, fal 이 지우기(1시간) 10분 전까지 같은 주소를 쓴다.
 */
export type ProductPhotoSource = { base64: string; mimeType: string };
type PostResult = { ok: true; url: string; expiresAt: number } | { ok: false; message: string };
export type PostProductPhoto = (bytes: Uint8Array, mimeType: string) => Promise<PostResult>;

export class ProductPhotoUploadError extends Error {}

/** 사용자에게 보일 문구. 서버가 준 문구는 그대로, 내부 오류(atob·crypto 등)는 고정 문구로 가린다. */
export const productPhotoErrorMessage = (error: unknown): string =>
  error instanceof ProductPhotoUploadError ? error.message : PRODUCT_PHOTO_UPLOAD_FAILED;

/**
 * 옛 작업은 원본 칸에 `data:<mime>;base64,…` 통째가 들어 있다(미리보기 주소에서 채운다).
 * 서버는 접두를 받아 주었으므로 여기서도 떼고 그 mime 을 쓴다.
 */
function withoutDataUrl(source: ProductPhotoSource): ProductPhotoSource {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(source.base64);
  return match ? { base64: match[2]!, mimeType: match[1]! } : source;
}

const RENEW_BEFORE_MS = 10 * 60 * 1000;
export const PRODUCT_PHOTO_UPLOAD_FAILED = "제품 사진을 올리지 못했습니다. 다시 시도해 주세요.";
const FALLBACK_MESSAGE = PRODUCT_PHOTO_UPLOAD_FAILED;

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const postProductPhoto: PostProductPhoto = async (bytes, mimeType) => {
  try {
    // 주소를 따옴표 문자열로 둔다 — 식별자 배선 검사(billable-key-wiring)가 이 글자로 부르는 자리를 찾는다.
    const response = await fetch(API_BASE_URL + "/pdp/product-photo", {
      method: "POST",
      headers: { "content-type": mimeType, "x-idempotency-key": randomId() },
      body: bytes as BodyInit,
    });
    const body = (await response.json()) as Partial<PostResult> & { message?: string };
    return response.ok && body.ok && typeof body.url === "string" && typeof body.expiresAt === "number"
      ? { ok: true, url: body.url, expiresAt: body.expiresAt }
      : { ok: false, message: body.message || FALLBACK_MESSAGE };
  } catch {
    return { ok: false, message: FALLBACK_MESSAGE };
  }
};

async function keyOf(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createProductPhotoUploader(deps: { post?: PostProductPhoto; now?: () => number } = {}) {
  const post = deps.post ?? postProductPhoto;
  const now = deps.now ?? Date.now;
  let cache: ReadonlyMap<string, { url: string; expiresAt: number }> = new Map();

  return {
    async urlFor(source: ProductPhotoSource): Promise<string> {
      const bytes = bytesOf(source.base64);
      const key = `${source.mimeType}:${await keyOf(bytes)}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt - now() > RENEW_BEFORE_MS) return cached.url;
      const result = await post(bytes, source.mimeType);
      if (!result.ok) throw new ProductPhotoUploadError(result.message);
      cache = new Map([...cache, [key, { url: result.url, expiresAt: result.expiresAt }]]);
      return result.url;
    },
  };
}

/**
 * 생성 요청에 싣는 제품 사진 칸.
 *
 * - 사진 경로: 원본(없으면 옛 작업의 1024 사본)을 올린 **주소**
 * - 글 경로: 앵커가 우리가 만든 대표 이미지라 지금처럼 그림을 싣는다(설계 §4.2)
 */
export async function productImageFields(input: {
  startMode?: CreateMode;
  productPhoto?: ProductPhotoSource;
  fallbackBase64: string;
  uploader: { urlFor(source: ProductPhotoSource): Promise<string> };
}): Promise<{ productImageUrl: string } | { originalImageBase64: string }> {
  if (input.startMode === "text") return { originalImageBase64: input.fallbackBase64 };
  const source = withoutDataUrl(input.productPhoto ?? { base64: input.fallbackBase64, mimeType: "image/jpeg" });
  return { productImageUrl: await input.uploader.urlFor(source) };
}
