import type { FidelityGroup, ProductFacts } from "./pdp.product-fidelity";
import { IMAGE_MODELS, type ImageModelId, type ReferenceImage } from "./types";

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

/**
 * 섹션 제품 사진을 참조 상한에 맞춘다(설계 §6.2). 인물·캐릭터·레퍼런스 자리(`others`)를 먼저
 * 빼고 남는 만큼만 싣는다 — 정체성 기준인 인물을 제품 사진 때문에 잃으면 안 된다. 그래도
 * 넘치면 거절은 지금처럼 `assertReferenceBudget`(모르는 모델은 7장)이 한다.
 */
export function fitSectionProducts(
  products: readonly PageProduct[] | undefined,
  model: ImageModelId,
  others: number,
): { products: PageProduct[]; dropped: number } {
  const usable = (products ?? []).filter((product) => product.imageUrls.length > 0);
  const limit = IMAGE_MODELS.find((entry) => entry.id === model)?.maxReferenceImages ?? 7;
  return fitProductPhotos(usable, limit - others);
}

/**
 * 제품마다 사진을 차례대로 `anchor` 참조로 만든다(설계 §6.1). 제품 차례, 제품 안에서는 사진 차례.
 *
 * **제품 하나·사진 하나면 `product` 를 안 붙인다** — 이름표가 `[Image 1 — PRODUCT]` 그대로여야
 * 1·2단계와 프롬프트가 같다(회귀 고정). 사용자가 제품 자리에 적은 말은 첫 사진에만 — 사진마다
 * 되풀이하면 같은 문장이 규칙처럼 쌓인다.
 */
export function anchorsFromProducts(products: readonly PageProduct[], intent?: string): ReferenceImage[] {
  const single = products.length === 1 && products[0]!.imageUrls.length === 1;
  return products.flatMap((product, productIndex) => {
    // 서버가 30자로 묶지만 코어도 자른다(보안 리뷰 L3 — 이중 잠금). 이모지가 반으로 갈리지 않게 코드 포인트로.
    const name = Array.from(product.name?.trim() ?? "").slice(0, PRODUCT_LIMITS.nameChars).join("");
    // 이름은 따옴표로 감싼다(JSON) — 줄바꿈·따옴표가 섞여도 이름표 밖으로 새지 않는다.
    const label = `PRODUCT ${productIndex + 1}${name ? ` ${JSON.stringify(name)}` : ""}`;
    return product.imageUrls.map((url, viewIndex): ReferenceImage => ({
      kind: "anchor",
      base64: "",
      mimeType: "image/jpeg",
      url,
      intent: productIndex === 0 && viewIndex === 0 ? intent : undefined,
      ...(single ? {} : { product: { id: product.id, label, view: viewIndex + 1, views: product.imageUrls.length } }),
    }));
  });
}

/**
 * 첨부 배열에서 제품 블록의 묶음을 만든다 — 번호를 따로 세면 이름표와 어긋난다.
 * 사실은 그 제품의 것. `products` 가 없을 때(1·2단계 호출)만 옛 `productFacts` 를 쓴다.
 */
export function fidelityGroups(
  references: readonly ReferenceImage[],
  products: readonly PageProduct[],
  legacyFacts?: ProductFacts,
): FidelityGroup[] {
  return references.reduce<Array<FidelityGroup & { id?: ProductId }>>((groups, reference, index) => {
    if (reference.kind !== "anchor") return groups;
    const id = reference.product?.id;
    const last = groups[groups.length - 1];
    if (last && last.id === id) {
      return [...groups.slice(0, -1), { ...last, imageNumbers: [...last.imageNumbers, index + 1] }];
    }
    const facts = products.length ? products.find((product) => !id || product.id === id)?.facts : legacyFacts;
    return [
      ...groups,
      { id, ...(reference.product ? { label: reference.product.label } : {}), imageNumbers: [index + 1], ...(facts ? { facts } : {}) },
    ];
  }, []);
}
