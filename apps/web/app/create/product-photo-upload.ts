import { API_BASE_URL } from "./pdp-utils";
import { randomId } from "../../lib/browser-safe";
import type { CreateMode } from "./create-steps";
import { productFactsFrom, type LandingPageBlueprint, type PageProduct } from "@fixup/pdp-core";
import { keyDescribesSeveral, productsKey, type PdpProductDraft } from "./products";

/**
 * **제품 원본은 한 번 올리고 주소로 쓴다**(설계 2026-10-08 §4).
 *
 * 섹션마다 원본을 몸통에 실으면 서버가 큰 그림을 30~90초씩 쥐고 있다. 사진 한 장을
 * 한 번 올리고, fal 이 지우기(1시간) 10분 전까지 같은 주소를 쓴다.
 */
export type ProductPhotoSource = { base64: string; mimeType: string };
/**
 * `expiresInMs` 는 남은 시간이다. 화면은 받은 순간 **제 시계로** 만료를 잰다 — 서버 시계로 잰
 * `expiresAt` 을 사용자 시계와 비교하면 둘이 어긋난 만큼 너무 일찍(또는 늦게) 다시 올린다.
 * 옛 서버 답에는 `expiresAt` 만 있다.
 */
type PostResult =
  | { ok: true; url: string; expiresAt?: number; expiresInMs?: number }
  | { ok: false; message: string };
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
    // 바깥에서 온 값이라 칸마다 종류를 다시 본다.
    const body = (await response.json()) as {
      ok?: unknown; url?: unknown; expiresAt?: unknown; expiresInMs?: unknown; message?: string;
    };
    const expiresAt = typeof body.expiresAt === "number" ? body.expiresAt : undefined;
    const expiresInMs = typeof body.expiresInMs === "number" ? body.expiresInMs : undefined;
    return response.ok && body.ok === true && typeof body.url === "string" && (expiresAt !== undefined || expiresInMs !== undefined)
      ? { ok: true, url: body.url, expiresAt, expiresInMs }
      : { ok: false, message: body.message || FALLBACK_MESSAGE };
  } catch {
    return { ok: false, message: FALLBACK_MESSAGE };
  }
};

async function keyOf(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

/*
  **도는 올리기를 나눈다**(최종 리뷰 I5). 캐시는 끝난 것만 안다 — 단건 생성을 거듭 누르거나
  두 길이 겹치면 같은 사진이 동시에 두 번 올라갔다. 같은 열쇠는 도는 약속을 함께 기다린다.
  실패한 약속은 끝나면 바로 빼므로 다음 물음이 다시 올린다.
*/
export function createProductPhotoUploader(deps: { post?: PostProductPhoto; now?: () => number } = {}) {
  const post = deps.post ?? postProductPhoto;
  const now = deps.now ?? Date.now;
  let cache: ReadonlyMap<string, { url: string; expiresAt: number }> = new Map();
  let pending: ReadonlyMap<string, Promise<string>> = new Map();

  const upload = async (key: string, bytes: Uint8Array, mimeType: string): Promise<string> => {
    const result = await post(bytes, mimeType);
    if (!result.ok) throw new ProductPhotoUploadError(result.message);
    const expiresAt = result.expiresInMs !== undefined ? now() + result.expiresInMs : (result.expiresAt ?? now());
    cache = new Map([...cache, [key, { url: result.url, expiresAt }]]);
    return result.url;
  };

  return {
    async urlFor(source: ProductPhotoSource): Promise<string> {
      const bytes = bytesOf(source.base64);
      const key = `${source.mimeType}:${await keyOf(bytes)}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt - now() > RENEW_BEFORE_MS) return cached.url;
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;
      const started = upload(key, bytes, source.mimeType).finally(() => {
        pending = new Map([...pending].filter(([each]) => each !== key));
      });
      pending = new Map([...pending, [key, started]]);
      return started;
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

/**
 * 일괄 생성의 **묶음마다** 부른다(최종 리뷰 A1). 한 묶음이 5분쯤 걸려, 처음에 받은 주소가
 * 뒤 묶음 도중에 만료될 수 있다. 같은 사진은 캐시가 주소를 돌려주므로 만료가 가까울 때만
 * 다시 올린다. 실패하면 사용자용 문구로 바꿔 던진다 — 그 묶음 요청은 나가지 않는다.
 */
export async function productImageFieldsOrThrow(
  input: Parameters<typeof productImageFields>[0],
): ReturnType<typeof productImageFields> {
  try {
    return await productImageFields(input);
  } catch (error) {
    throw new Error(productPhotoErrorMessage(error));
  }
}

/**
 * 편집기에 원본을 넘길지(최종 리뷰 A2).
 *
 * 분석한 뒤 사진만 바꾸고 다시 분석하지 않으면, 구성안·판독은 옛 사진의 것이다. 그때 새
 * 원본을 넘기면 새 사진과 옛 사실이 섞인다. 분석 결과의 사진(`result.originalImage`)이
 * 지금 1024 사본과 같을 때만 넘긴다. 분석은 같은 base64 를 돌려주지만 data URL 일 수 있다.
 */
export function photoForEditor(
  prepared: { base64: string; original?: ProductPhotoSource } | null | undefined,
  resultOriginal: string,
): ProductPhotoSource | undefined {
  if (!prepared?.original) return undefined;
  const analysed = resultOriginal.replace(/^data:[^;,]+;base64,/, "");
  return analysed === prepared.base64 ? prepared.original : undefined;
}

export const PRODUCTS_CHANGED_MESSAGE = "제품 사진이 구성안을 만든 뒤에 바뀌었습니다. 구성안을 다시 만들어 주세요.";

type Uploader = { urlFor(source: ProductPhotoSource): Promise<string> };
/** `products` 는 한쪽에만 있지만 부르는 쪽이 꺼내 `page` 에 합칠 수 있게 두 모양 다 이름을 둔다. */
export type ProductRequestFields =
  | { originalImageBase64: string; products?: undefined }
  | { productImageUrl: string; products?: PageProduct[] };

type ProductRequestInput = {
  startMode?: CreateMode;
  products: readonly PdpProductDraft[];
  /** 분석이 본 제품 목록의 열쇠(`productsKey`). 옛 작업에는 없다. */
  analyzedProductsKey?: string;
  readings?: LandingPageBlueprint["productReadings"];
  /** 분석한 1024 사본(`result.originalImage`). 글 경로에서는 대표 이미지다. */
  fallbackBase64: string;
  uploader: Uploader;
};

/** 분석 요청이 `products` 를 싣는 기준과 같다(`analyze-request.ts`) — 제품 하나·사진 하나면 아니다. */
const isSingle = (filled: readonly PdpProductDraft[]) =>
  filled.length < 2 && !filled.some((product) => product.photos.length > 1);

/** 사진 한 장의 주소. 원본이 있으면 원본, 없으면(옛 초안) 1024 사본. */
const photoUrl = (photo: PdpProductDraft["photos"][number], uploader: Uploader) =>
  uploader.urlFor(withoutDataUrl(photo.original ?? { base64: photo.base64, mimeType: photo.mimeType }));

/** 사진은 차례대로 올린다 — 같은 사진이 두 번 동시에 올라가지 않게(캐시는 끝난 것만 안다). */
async function pageProductsFor(
  filled: readonly PdpProductDraft[],
  readings: ProductRequestInput["readings"],
  uploader: Uploader,
): Promise<PageProduct[]> {
  const result: PageProduct[] = [];
  for (const product of filled) {
    const imageUrls: string[] = [];
    for (const photo of product.photos) imageUrls.push(await photoUrl(photo, uploader));
    const name = product.name.trim();
    const facts = productFactsFrom(readings?.find((reading) => reading.productId === product.id));
    result.push({ id: product.id, ...(name ? { name } : {}), imageUrls, ...(facts ? { facts } : {}) });
  }
  return result;
}

/**
 * 생성 요청의 제품 칸(설계 §6.1). 분석한 제품 그대로일 때만 원본을 올린다.
 * - 글 경로: { originalImageBase64 } (지금 그대로)
 * - 제품 하나·사진 하나: 2단계와 같은 { productImageUrl } (R4 대체 포함)
 * - 그 밖: { productImageUrl: 제품 1 대표 주소, products: PageProduct[] } — 옛 서버도 대표로는 만든다
 * - 분석 뒤 제품이 바뀌었고 사진이 여럿이면 ProductPhotoUploadError(PRODUCTS_CHANGED_MESSAGE)
 *
 * 묶음마다 불러도 된다 — 같은 사진은 캐시가 주소를 돌려준다.
 */
export async function productRequestFields(input: ProductRequestInput): Promise<ProductRequestFields> {
  const { startMode, fallbackBase64, uploader } = input;
  if (startMode === "text") return { originalImageBase64: fallbackBase64 };
  const filled = input.products.filter((product) => product.photos.length > 0);
  const known = input.analyzedProductsKey;
  /*
    분석이 여럿을 봤으면 지금 하나·한 장이어도 한 장 길로 가지 않는다(최종 리뷰 I1). 구성안의
    섹션 배정이 뺀 제품을 가리키는데 남은 사진으로 그리게 된다 — 아래에서 멈춘다.
  */
  if (isSingle(filled) && !(known !== undefined && keyDescribesSeveral(known))) {
    /*
      2단계 몸통 그대로. 분석한 사진(1024 사본)과 지금 사진을 직접 견준다(`photoForEditor`) —
      같으면 원본, 바뀌었으면 원본을 넘기지 않아 분석한 1024 사본으로 만든다(R4). 열쇠 모양과
      상관없이 견주므로 이름만 고쳤거나 열쇠 모양이 바뀐 옛 작업도 원본을 잃지 않는다(I2).
    */
    const productPhoto = photoForEditor(filled[0]?.photos[0], fallbackBase64);
    return productImageFields({ startMode, productPhoto, fallbackBase64, uploader });
  }
  /*
    새 사진과 옛 구성안·판독이 섞이면 안 된다. 열쇠가 없으면 분석이 이 제품들을 못 봤다(옛 작업에
    사진을 더한 경우). 생성 전이라 크레딧은 안 나간다.
  */
  if (known === undefined || known !== productsKey(input.products)) throw new ProductPhotoUploadError(PRODUCTS_CHANGED_MESSAGE);
  const products = await pageProductsFor(filled, input.readings, uploader);
  const primary = products.find((product) => product.id === "p1") ?? products[0]!;
  return { productImageUrl: primary.imageUrls[0]!, products };
}

/** 일괄 생성의 묶음마다 부른다(`productImageFieldsOrThrow` 와 같은 까닭). */
export async function productRequestFieldsOrThrow(input: ProductRequestInput): Promise<ProductRequestFields> {
  try {
    return await productRequestFields(input);
  } catch (error) {
    throw new Error(productPhotoErrorMessage(error));
  }
}
