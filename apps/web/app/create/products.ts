import { PRODUCT_IDS, PRODUCT_LIMITS, normalizeProductIds, productLabel, type ProductId } from "@fixup/pdp-core";
import type { PreparedImageDraft } from "./pdp-drafts";

/**
 * **화면의 제품 칸**(설계 2026-10-08 §3). 제품 3개까지, 제품마다 사진 1~4장, 첫 장이 대표.
 *
 * 화면 파일이 이미 크다 — 칸을 고치는 판단은 전부 여기 순수 함수로 두고 화면은 부르기만 한다.
 * 모든 함수는 받은 목록을 고치지 않고 새 목록을 돌려준다(초안·문서가 같은 목록을 쥐고 있다).
 *
 * id 는 화면이 매긴다(`p1`~`p3`). `p1` 은 지울 수 없다 — 대표 사진(`preparedImage`)이
 * 늘 제품 1 첫 사진이라, 옛 코드·옛 서버가 읽는 한 장이 사라지면 안 된다.
 */
export interface PdpProductDraft {
  id: ProductId;
  /** 비면 화면이 「제품 1」처럼 부른다. 코드 포인트 30자까지. */
  name: string;
  /** 대표가 먼저. 최대 4장. */
  photos: PreparedImageDraft[];
}

const emptyProduct = (id: ProductId): PdpProductDraft => ({ id, name: "", photos: [] });

/** 옛 작업(사진 한 장)은 「제품 1, 사진 1장」으로 읽는다(§3.2). */
export function productsFromLegacy(prepared: PreparedImageDraft | null): PdpProductDraft[] {
  return prepared ? [{ id: "p1", name: "", photos: [prepared] }] : [];
}

/** 제품 1 의 첫 사진. 분석 요청의 `imageBase64` 와 옛 `preparedImage` 가 이것이다. */
export function primaryPhoto(products: readonly PdpProductDraft[]): PreparedImageDraft | null {
  return products.find((product) => product.id === "p1")?.photos[0] ?? null;
}

/** 빈 칸을 다음 빈 id 로 끝에 더한다. 이미 3개면 그대로. */
export function addProduct(products: readonly PdpProductDraft[]): PdpProductDraft[] {
  const used = new Set(products.map((product) => product.id));
  const next = PRODUCT_IDS.find((id) => !used.has(id));
  if (products.length >= PRODUCT_LIMITS.products || !next) return [...products];
  return [...products, emptyProduct(next)];
}

/** 제품 1 은 못 지운다. */
export function removeProduct(products: readonly PdpProductDraft[], id: ProductId): PdpProductDraft[] {
  if (id === "p1") return [...products];
  return products.filter((product) => product.id !== id);
}

const updateProduct = (
  products: readonly PdpProductDraft[],
  id: ProductId,
  change: (product: PdpProductDraft) => PdpProductDraft,
): PdpProductDraft[] => products.map((product) => (product.id === id ? change(product) : product));

/**
 * 이모지 하나가 두 칸으로 잘리지 않게 코드 포인트로 자른다(분석 프롬프트와 같은 상한).
 * 저장본에서 읽은 값은 글자가 아닐 수 있다 — 그때는 빈 이름(「제품 N」으로 불린다).
 */
export function clipProductName(name: unknown): string {
  return typeof name === "string" ? Array.from(name).slice(0, PRODUCT_LIMITS.nameChars).join("") : "";
}

export function renameProduct(products: readonly PdpProductDraft[], id: ProductId, name: string): PdpProductDraft[] {
  const cut = clipProductName(name);
  return updateProduct(products, id, (product) => ({ ...product, name: cut }));
}

/** 제품 1 을 맨 앞에 둔다. 없으면 빈 칸으로 만든다 — 대표 사진 자리라 늘 있어야 한다. */
export function withFirstProduct(products: readonly PdpProductDraft[]): PdpProductDraft[] {
  const first = products.find((product) => product.id === "p1") ?? emptyProduct("p1");
  return [first, ...products.filter((product) => product.id !== "p1")].slice(0, PRODUCT_LIMITS.products);
}

type SavedEntry = { id: ProductId; name?: unknown; photos?: unknown };

/** 저장본에서 읽은 칸: 아는 id 만, 겹침 없이, 3개까지. 깨진 칸은 버린다. */
function knownEntries(raw: unknown): SavedEntry[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.map((entry) => (entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined));
  return raw
    .filter((_, index) => PRODUCT_IDS.includes(ids[index] as ProductId) && ids.indexOf(ids[index]) === index)
    .slice(0, PRODUCT_LIMITS.products) as SavedEntry[];
}

/** 서버 문서에 둔 칸 목록(`{ id, name }`)을 다듬는다. 사진은 참조에서 따로 채운다. */
export function normalizeProductSlots(raw: unknown): Array<{ id: ProductId; name: string }> {
  return knownEntries(raw).map((entry) => ({ id: entry.id, name: clipProductName(entry.name) }));
}

/**
 * 로컬 초안에 둔 제품 칸을 다듬는다(상한: 제품 3·사진 4·이름 30자). 사진 다듬기는 초안 쪽 함수를
 * 받아 쓴다 — 여기서 초안 파일을 부르면 서로 부르는 고리가 생긴다.
 * 제품 1 이 없거나 칸이 아예 없으면 `null` — 부르는 쪽은 옛 한 장으로 읽는다.
 */
export function normalizeProducts(
  raw: unknown,
  normalizePhoto: (photo: PreparedImageDraft) => PreparedImageDraft | null,
): PdpProductDraft[] | null {
  if (!Array.isArray(raw)) return null;
  const products = knownEntries(raw).map((entry) => ({
    id: entry.id,
    name: clipProductName(entry.name),
    photos: (Array.isArray(entry.photos) ? (entry.photos as PreparedImageDraft[]) : [])
      .map(normalizePhoto)
      .filter((photo): photo is PreparedImageDraft => photo !== null)
      .slice(0, PRODUCT_LIMITS.photos),
  }));
  return products.some((product) => product.id === "p1") ? products : null;
}

/**
 * 사진을 뒤에 붙인다. 4장을 넘는 것은 받지 않고 그 장수를 `skipped` 로 돌려준다(화면이 알린다).
 * 빈 목록에 제품 1 사진을 넣으면 제품 1 을 만든다 — 처음 올리는 사진이 그 길이다.
 * 없는 제품에는 넣지 않는다.
 */
export function addPhotos(
  products: readonly PdpProductDraft[],
  id: ProductId,
  photos: readonly PreparedImageDraft[],
): { products: PdpProductDraft[]; skipped: number } {
  const base = products.length === 0 && id === "p1" ? [emptyProduct("p1")] : products;
  const target = base.find((product) => product.id === id);
  if (!target) return { products: [...products], skipped: photos.length };
  const accepted = photos.slice(0, Math.max(0, PRODUCT_LIMITS.photos - target.photos.length));
  return {
    products: updateProduct(base, id, (product) => ({ ...product, photos: [...product.photos, ...accepted] })),
    skipped: photos.length - accepted.length,
  };
}

export function removePhoto(products: readonly PdpProductDraft[], id: ProductId, index: number): PdpProductDraft[] {
  return updateProduct(products, id, (product) => ({ ...product, photos: product.photos.filter((_, i) => i !== index) }));
}

/** 그 사진을 맨 앞(대표)으로. 나머지 차례는 그대로. 없는 차례면 그대로. */
export function makePrimary(products: readonly PdpProductDraft[], id: ProductId, index: number): PdpProductDraft[] {
  return updateProduct(products, id, (product) => {
    const chosen = product.photos[index];
    if (!chosen || index === 0) return product;
    return { ...product, photos: [chosen, ...product.photos.filter((_, i) => i !== index)] };
  });
}

/** 만들 수 있는가: 제품 1 이 있고, 모든 칸에 사진이 1장 이상(§3.1 「사진 없는 칸은 막는다」). */
export function productsReady(products: readonly PdpProductDraft[]): boolean {
  return products.some((product) => product.id === "p1") && products.every((product) => product.photos.length > 0);
}

/**
 * 분석이 본 제품 목록과 지금 목록이 같은지 재는 열쇠.
 *
 * 사진마다 1024 사본 base64 의 길이와 끝 32자만 본다 — 만들 때마다 부르므로 해시를 돌리지
 * 않는다. 같은 크기로 다시 줄인 다른 사진이 끝 32자까지 같을 일은 사실상 없다.
 *
 * **사진이 있는 칸의 id 와 사진만 넣는다**(최종 리뷰 I2). 이름을 넣었더니 분석 뒤 이름만 고쳐도
 * 「사진이 바뀌었습니다」로 생성이 막혔고, 사진 없는 칸을 더하기만 해도 그랬다. 이름은 생성 요청에
 * 지금 값으로 실린다(`pageProductsFor`). 모양: `[[id, [[길이, 끝32자], …]], …]`.
 */
export function productsKey(products: readonly PdpProductDraft[]): string {
  return JSON.stringify(
    products
      .filter((product) => product.photos.length > 0)
      .map((product) => [product.id, product.photos.map((photo) => [photo.base64.length, photo.base64.slice(-32)])]),
  );
}

/**
 * 분석이 본 것이 **제품 둘 이상이거나 사진 둘 이상**이었는가 — 열쇠에서 읽는다(최종 리뷰 I1).
 * 그랬다면 지금 목록이 하나·한 장이어도 한 장 길(R4)로 내려가면 안 된다. 섹션 배정이
 * 사라진 제품을 가리키는데 남은 사진으로 그린다.
 *
 * 칸마다 사진 목록은 맨 끝 칸이다 — 이름을 넣던 옛 열쇠(`[id, 이름, 사진]`)도 같이 읽는다.
 * 읽을 수 없는 열쇠는 「아니다」 — 그때는 한 장 길이 분석한 사진과 직접 견준다(`photoForEditor`).
 */
export function keyDescribesSeveral(key: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  const photoCounts = parsed.map((entry) => {
    const photos = Array.isArray(entry) ? entry[entry.length - 1] : undefined;
    return Array.isArray(photos) ? photos.length : 0;
  });
  return photoCounts.filter((count) => count > 0).length > 1 || photoCounts.some((count) => count > 1);
}

/**
 * 작업에 손댄 것이 있는가 — 사진이 한 장이라도 있거나 이름을 적은 칸이 있으면 그렇다.
 * 제품 1 첫 사진(`preparedImage`)만 보면 제품 2 에만 사진을 넣거나 이름만 적은 작업이
 * 「빈 작업」으로 보여, 임시저장도 「처음부터 다시」도 안 뜬다.
 */
export function hasProductContent(products: readonly PdpProductDraft[]): boolean {
  return products.some((product) => product.photos.length > 0 || product.name.trim() !== "");
}

/** 구성안의 제품 칩. 사진이 있는 제품만 — 분석이 본 것도 그것뿐이다(`analyze-request.ts`). */
export function productChips(products: readonly PdpProductDraft[]): Array<{ id: ProductId; label: string }> {
  return products
    .filter((product) => product.photos.length > 0)
    .map((product) => ({ id: product.id, label: productLabel(product) }));
}

/**
 * 섹션에서 켜진 제품. 배정이 없거나 모르는 id 뿐이면 모두 — 서버가 섹션 제품을 고르는 규칙과 같다
 * (`normalizeProductIds`). 화면이 다르게 보이면 꺼 둔 줄 알았던 제품이 그림에 나온다.
 */
export function sectionProductsOn(all: readonly ProductId[], selected: readonly string[] | undefined): ProductId[] {
  return normalizeProductIds(selected, all);
}

/**
 * 칩 하나를 눌렀을 때의 새 배정(제품 차례). 마지막 하나는 끄지 않는다 — 제품 사진 없이
 * 그리는 섹션은 없다(설계 §5).
 */
export function toggleSectionProduct(
  all: readonly ProductId[],
  selected: readonly string[] | undefined,
  id: ProductId,
): ProductId[] {
  const on = sectionProductsOn(all, selected);
  if (!on.includes(id)) return all.filter((each) => each === id || on.includes(each));
  return on.length > 1 ? on.filter((each) => each !== id) : on;
}
