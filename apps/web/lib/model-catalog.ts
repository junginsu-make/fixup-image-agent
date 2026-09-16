import { IMAGE_MODELS, type ImageModel } from "@fixup/sns-core";

/**
 * **화면 이름 뒤에 실제로 무엇이 있는가.**
 *
 * 사이트는 모델 이름을 일부러 가린다. 회원에게는 「표준형」·「속도형」이고,
 * 진짜 정체는 `id` 에만 있다(`sns-core/models.ts` 의 `label` 머리말: *우리가 붙인
 * 이름이지 모델 이름이 아니다*).
 *
 * 가리는 것은 회원 화면까지다. **운영하는 사람은 알아야 한다** — 값이 왜 그런지,
 * 왜 어떤 비율에서 모델이 바뀌는지, 한 번에 몇 장까지 되는지가 전부 그 뒤에
 * 있다. 지금은 코드를 열어야만 알 수 있다(2026-09-16 사용자 요청).
 *
 * **표를 따로 만들지 않는다.** `IMAGE_MODELS` 를 그대로 읽는다. 손으로 옮겨
 * 적으면 모델이 늘거나 값이 바뀔 때 한쪽만 바뀌고, 그러면 가장 믿어야 할 화면이
 * 거짓말을 한다 — 설명서에서 이미 한 번 겪었다(`guide/image/page.tsx`).
 *
 * **화면 밖에서 만든다.** `.tsx` 안에 두면 「한 모델이 빠졌다」를 값으로 못 잰다.
 */

export interface ModelCatalogRow {
  /** 서버에 실제로 보내는 값. 이것이 진짜 정체다. */
  id: string;
  /** 회원에게 보이는 이름. */
  label: string;
  isDefault: boolean;
  /** 종점 이름 앞부분. 그 이상은 코드가 모른다 — `vendorOf` 참조. */
  vendor: string;
  t2iEndpoint: string;
  i2iEndpoint: string;
  /** 고정값이면 달러, 크기별 표면 `undefined`. */
  flatUsd?: number;
  maxReferenceImages: number;
  batchMax: number;
  /** 열거로만 받는 모델의 비율 목록. 픽셀 지정 모델은 비어 있다. */
  supportedRatios?: string[];
  fixedResolution?: string;
  /** fal 에 보낼 품질. 안 정한 모델도 있다. */
  quality?: string;
}

/**
 * 제공자 — **종점 이름 앞부분만** 읽는다.
 *
 * 코드는 어디에서도 「Google」이라고 말하지 않는다. `fal-ai/nano-banana` 로만
 * 알고 있을 뿐이다. 우리가 아는 것 이상을 적으면 관리자 화면이 근거 없는 말을
 * 하게 된다 — 가장 믿어야 할 화면에서.
 *
 * 모양이 아니면 물음표를 준다. 빈 칸으로 두면 「없다」로 읽히는데, 실제로는
 * 「우리가 모른다」다.
 */
export function vendorOf(endpoint: string): string {
  const head = endpoint.split("/")[0];
  return head && endpoint.includes("/") ? head : "?";
}

export function modelCatalog(models: ImageModel[] = IMAGE_MODELS): ModelCatalogRow[] {
  return models.map((model) => ({
    id: model.id,
    label: model.label,
    isDefault: Boolean(model.isDefault),
    vendor: vendorOf(model.t2i.endpoint),
    t2iEndpoint: model.t2i.endpoint,
    i2iEndpoint: model.i2i.endpoint,
    flatUsd: model.t2i.flatUsd,
    maxReferenceImages: model.maxReferenceImages,
    batchMax: model.batchMax,
    supportedRatios: model.supportedRatios,
    fixedResolution: model.fixedResolution,
    quality: model.quality,
  }));
}

/**
 * 값 한 줄.
 *
 * **크기별 표를 쓰는 모델을 하나의 숫자로 적으면 거짓말이 된다.** 비율만 바꿔도
 * 값이 달라진다 — 이 표는 픽셀에 비례하지도 않는다(정사각형이 비싸다,
 * `sns-core/models.ts` 의 `pickRow`). 그래서 숫자 대신 무엇에 따라 달라지는지를
 * 적는다.
 */
export function priceText(row: ModelCatalogRow): string {
  if (row.flatUsd !== undefined) return `$${row.flatUsd} 고정`;
  return "크기별 표에서 뽑음";
}

/**
 * 비율 한 줄.
 *
 * **여기가 「A4 를 고르면 모델이 왜 바뀌나」의 답이다.** 열거로만 받는 모델은
 * 목록에 없는 비율을 아예 못 만든다.
 */
export function ratiosText(row: ModelCatalogRow): string {
  if (!row.supportedRatios?.length) return "자유 (픽셀 제한 안에서)";
  return row.supportedRatios.join(" · ");
}
