import type { ProductFacts } from "./pdp.product-fidelity";

export const PRODUCT_IDS = ["p1", "p2", "p3"] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];
export const PRODUCT_LIMITS = { products: 3, photos: 4, nameChars: 30 } as const;

/** 생성 요청이 싣는 제품 하나. 주소는 2단계의 fal 저장소 주소다. */
export interface PageProduct {
  id: ProductId;
  name?: string;
  /** 1..4장, 대표가 먼저. */
  imageUrls: string[];
  facts?: ProductFacts;
}

/** 이름이 비면 「제품 N」. id 는 화면이 매기므로 숫자 꼬리를 그대로 쓴다. */
export function productLabel(product: { id: ProductId; name?: string }): string {
  const name = product.name?.trim();
  return name ? name : `제품 ${product.id.slice(1)}`;
}

/**
 * 섹션 배정 다듬기: 아는 id 만, 겹침 없이, 제품 차례대로. 비면 모든 제품.
 * 제품 사진 없이 그리는 섹션은 없어야 하므로 빈 배정을 허용하지 않는다.
 */
export function normalizeProductIds(ids: unknown, known: readonly ProductId[]): ProductId[] {
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  const picked = known.filter((id) => wanted.has(id));
  return picked.length > 0 ? picked : [...known];
}

/** 섹션에 실을 제품만 고른다(차례는 페이지의 제품 차례). 배정이 없거나 안 맞으면 모두. */
export function productsForSection<T extends { id: ProductId }>(
  products: readonly T[],
  ids: readonly string[] | undefined,
): T[] {
  if (!ids || ids.length === 0) return [...products];
  const wanted = new Set(ids);
  const picked = products.filter((product) => wanted.has(product.id));
  return picked.length > 0 ? picked : [...products];
}

/**
 * 참조 상한에 맞춘다. 제품마다 첫 사진은 남기고 뒤에서부터, 제품끼리 번갈아 뺀다.
 * 「사진이 가장 많은 제품의 마지막 사진(동률이면 뒤 제품)」을 하나씩 빼면 번갈아가 된다.
 * `budget` 이 제품 수보다 작으면 대표만 남긴다(거절은 부르는 쪽 assertReferenceBudget 이 한다).
 */
export function fitProductPhotos<T extends { imageUrls: string[] }>(
  products: readonly T[],
  budget: number,
): { products: T[]; dropped: number } {
  const counts = products.map((product) => product.imageUrls.length);
  let total = counts.reduce((sum, n) => sum + n, 0);
  const original = total;
  while (total > budget) {
    let target = -1;
    counts.forEach((n, i) => {
      if (n > 1 && (target < 0 || n >= counts[target]!)) target = i;
    });
    if (target < 0) break;
    counts[target] = counts[target]! - 1;
    total -= 1;
  }
  if (total === original) return { products: [...products], dropped: 0 };
  return {
    products: products.map((product, i) => ({ ...product, imageUrls: product.imageUrls.slice(0, counts[i]) })),
    dropped: original - total,
  };
}
