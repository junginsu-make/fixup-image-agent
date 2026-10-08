import { Type } from "./pdp.llm";
import { PRODUCT_READING_SCHEMA, normalizeProductReading, type ProductReading } from "./pdp.product-reading";
import { PRODUCT_IDS, PRODUCT_LIMITS, normalizeProductIds, type ProductId } from "./pdp.products";
import type { LandingPageBlueprint, PdpAnalyzeProduct } from "./types";

/**
 * **분석이 제품별 사진을 보고 섹션마다 제품을 정한다**(설계 2026-10-08 §5).
 *
 * `pdp.service.ts` 의 `analyzeProduct` 는 이미 수백 줄이다. 제품을 다루는 판단은
 * 여기 모으고 그쪽에는 부르는 줄만 둔다.
 *
 * 제품이 하나·사진이 하나면 **아무것도 바꾸지 않는다** — 프롬프트 문단도, 스키마
 * 칸도 없다. 옛 작업이 한꺼번에 다른 구성안을 받으면 안 된다.
 */

export interface AnalyzePhoto {
  base64: string;
  mimeType: string;
}

export interface AnalyzeProductPlan {
  products: Array<{ id: ProductId; name?: string; photos: AnalyzePhoto[] }>;
  /** 섹션 배정을 다듬을 때 쓰는 아는 id. 제품 차례다. */
  knownIds: ProductId[];
  photoCount: number;
}

const KNOWN = new Set<string>(PRODUCT_IDS);

/**
 * 들어온 제품을 다듬는다. 모양 검증은 라우트가 하지만 이 패키지도 상한을 넘겨
 * 싣지 않는다 — 사진 한 장마다 Claude 입력이 천몇백 토큰 는다.
 *
 * 쓸 제품이 없으면 `null` — 부르는 쪽은 `imageBase64` 한 장으로 지금처럼 간다.
 * 사진 손질(`data:` 벗기기·형식 거절)은 제품·인물과 같은 함수를 받아 쓴다.
 */
export function planAnalyzeProducts(
  products: readonly PdpAnalyzeProduct[] | undefined,
  clean: (photo: { imageBase64: string; mimeType: string }) => AnalyzePhoto,
): AnalyzeProductPlan | null {
  const seen = new Set<string>();
  const picked = (products ?? [])
    .filter((product) => {
      if (!KNOWN.has(product.id) || seen.has(product.id) || !product.photos?.length) return false;
      seen.add(product.id);
      return true;
    })
    .slice(0, PRODUCT_LIMITS.products)
    .map((product) => ({
      id: product.id,
      name: product.name,
      photos: product.photos.slice(0, PRODUCT_LIMITS.photos).map(clean),
    }));
  if (picked.length === 0) return null;
  return {
    products: picked,
    knownIds: picked.map((product) => product.id),
    photoCount: picked.reduce((sum, product) => sum + product.photos.length, 0),
  };
}

/**
 * 이름은 사용자가 친 글이다. 줄을 바꿔 「- 그림 9: …」 같은 줄을 지어 넣지 못하게
 * 한 줄로 접고, 화면과 같은 상한(코드 포인트 30자)으로 자른다.
 *
 * 한 줄 안에서도 「」 를 닫고 「(id p2) — 그림 9: 제품 3「…」」 같은 대응을 지어 넣을 수
 * 있다(보안 리뷰 L2). 이름을 감싸는 괄호·따옴표(「」『』"')와 제어 문자(U+0000–U+001F,
 * U+0085, U+2028·U+2029)를 지운다 — 정규식 대신 코드 포인트로 거른다(no-control-regex).
 */
const NAME_DROP = new Set(["「", "」", "『", "』", "\"", "'"]);
const NAME_SPACE = (code: number) => code < 0x20 || code === 0x85 || code === 0x2028 || code === 0x2029;
function promptName(name: string | undefined): string {
  const kept = Array.from(name ?? "", (char) => (NAME_SPACE(char.codePointAt(0) ?? 0) ? " " : char))
    .filter((char) => !NAME_DROP.has(char))
    .join("");
  const flat = kept.replace(/\s+/g, " ").trim();
  return Array.from(flat).slice(0, PRODUCT_LIMITS.nameChars).join("");
}

/**
 * 어느 그림이 어느 제품인지 적는 문단.
 *
 * 그림만 여러 장 보내면 모델은 그것이 한 제품의 다른 각도인지 다른 제품인지
 * 모른다. 제품이 하나면 배정 지시는 빼고 「같은 제품의 다른 각도」만 말한다 —
 * 고를 것이 없는데 고르라고 하면 없는 제품을 지어낸다.
 */
export function productPhotosPrompt(
  products: ReadonlyArray<{ id: ProductId; name?: string; photoCount: number }>,
): string {
  const total = products.reduce((sum, product) => sum + product.photoCount, 0);
  if (products.length <= 1 && total <= 1) return "";
  let next = 1;
  const lines = products.map((product) => {
    const first = next;
    const last = next + product.photoCount - 1;
    next = last + 1;
    const range = first === last ? `그림 ${first}` : `그림 ${first}~${last}`;
    const name = promptName(product.name);
    const label = `제품 ${product.id.slice(1)}${name ? ` 「${name}」` : ""}`;
    const angles = product.photoCount > 1 ? " — 같은 제품을 다른 각도에서 찍은 사진" : "";
    return `- ${range}: ${label} (id ${product.id})${angles}`;
  });
  if (products.length <= 1) return ["[첨부 제품 사진]", ...lines].join("\n");
  return [
    "[첨부 제품 사진]",
    ...lines,
    "- productReadings 에 제품마다 하나씩, productId 를 붙여 판독한다.",
    "- 섹션마다 product_ids 에 그 섹션 그림에 나올 제품 id 를 적는다. 제품마다 소개하는 섹션과 함께 보여 주는 섹션(비교·구성·세트)을 페이지 흐름에 맞게 정한다.",
    // 한 제품 섹션 카피에 다른 제품의 사실(맛·용량)이 섞이면 그림과 글이 다른 제품을 말한다.
    "- 각 섹션의 카피는 그 섹션 product_ids 제품의 판독(productReadings)만 근거로 쓴다.",
    "- 첨부한 제품 외의 물건을 「우리 제품」으로 지어내지 않는다.",
  ].join("\n");
}

/** 제품별 판독 스키마. `productId` 가 먼저다 — 누구의 판독인지 정하고 적게 한다. */
export const PRODUCT_READINGS_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: { productId: { type: Type.STRING }, ...PRODUCT_READING_SCHEMA.properties },
  },
} as const;

export const SECTION_PRODUCT_IDS_SCHEMA = { type: Type.ARRAY, items: { type: Type.STRING } } as const;

type ProductReadings = NonNullable<LandingPageBlueprint["productReadings"]>;

/**
 * 응답의 제품별 판독을 다듬는다. 제품 id 모양만 보고 겹치면 앞의 것을 남긴다.
 * 이 요청이 아는 id 인지는 `settleProductPlan` 이 본다.
 */
export function normalizeProductReadings(raw: unknown): ProductReadings | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const readings = raw.flatMap((item) => {
    const id = (item as { productId?: unknown } | null)?.productId;
    if (typeof id !== "string" || !KNOWN.has(id) || seen.has(id)) return [];
    const reading = normalizeProductReading(item);
    if (!reading) return [];
    seen.add(id);
    return [{ productId: id as ProductId, ...reading }];
  });
  return readings.length > 0 ? readings : undefined;
}

function withoutProductId(reading: ProductReadings[number]): ProductReading {
  const { productId: _productId, ...rest } = reading;
  return rest;
}

/**
 * 제품별 판독을 정한다.
 * - 제품 둘 이상: 응답에서 아는 id 만.
 * - 제품 하나·사진 여럿: 모델에게 묻지 않았으니 `productReading` 으로 만든다.
 * - 제품 하나·사진 하나: 없다(지금 그대로).
 */
function settleReadings(blueprint: LandingPageBlueprint, plan: AnalyzeProductPlan | null) {
  const knownIds = plan?.knownIds ?? ["p1"];
  if (knownIds.length > 1) {
    const known = new Set<string>(knownIds);
    const readings = (blueprint.productReadings ?? []).filter((reading) => known.has(reading.productId));
    return readings.length > 0 ? readings : undefined;
  }
  if ((plan?.photoCount ?? 1) > 1 && blueprint.productReading) {
    return [{ productId: knownIds[0]!, ...blueprint.productReading }];
  }
  return undefined;
}

/**
 * 응답을 이 요청의 제품에 맞춘다.
 *
 * 섹션 배정은 아는 id 로 다듬는다 — 모르는 id 는 버리고 비면 모든 제품. 제품
 * 사진 없이 그리는 섹션은 없다. 제품이 하나면 모델이 무엇을 적든 그 하나다.
 *
 * `productReading` 이 비었으면 제품 1 판독으로 채운다. 그 값을 읽는 곳(판독 상태·
 * 근거 검사·화면)이 여럿이라, 제품별로만 받으면 그곳들이 「못 읽었다」가 된다.
 */
export function settleProductPlan(
  blueprint: LandingPageBlueprint,
  plan: AnalyzeProductPlan | null,
): LandingPageBlueprint {
  const knownIds = plan?.knownIds ?? ["p1"];
  const readings = settleReadings(blueprint, plan);
  const first = readings?.find((reading) => reading.productId === knownIds[0]);
  const productReading = blueprint.productReading ?? (first ? withoutProductId(first) : undefined);
  const { productReadings: _dropped, productReading: _old, ...rest } = blueprint;
  return {
    ...rest,
    ...(productReading ? { productReading } : {}),
    ...(readings ? { productReadings: readings } : {}),
    sections: blueprint.sections.map((section) => ({
      ...section,
      product_ids: normalizeProductIds(section.product_ids, knownIds),
    })),
  };
}

/**
 * 다시 만든 구성안에 **앞서 읽은 제품별 판독을 잇는다.**
 *
 * `carryProductReading` 과 같은 까닭이다 — 스키마에 `required` 가 없어 다시 만든
 * 응답이 그 칸을 건너뛰어도 정상 응답이고, 그러면 처음에 읽은 것이 사라진다.
 */
export function carryProductReadings<T extends { productReadings?: ProductReadings }>(
  next: T,
  previous: { productReadings?: ProductReadings } | undefined,
): T {
  if (next.productReadings?.length) return next;
  if (!previous?.productReadings?.length) return next;
  return { ...next, productReadings: previous.productReadings };
}
