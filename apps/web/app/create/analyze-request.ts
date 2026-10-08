import type { ImageLook } from "@fixup/shared";
import type {
  AspectRatio,
  AttachmentIntents,
  CopyIntensity,
  GapPolicy,
  PdpAnalyzeRequest,
  PdpOutputMode,
  SellerBrief,
} from "@fixup/pdp-core";
import type { StyleReferenceView } from "./StyleReferenceCard";
import type { PreparedImageDraft } from "./pdp-drafts";
import { primaryPhoto, type PdpProductDraft } from "./products";

/**
 * 기획(구성안 짜기) 요청 몸통을 짓는다.
 *
 * **화면 파일이 아니라 여기 둔다.** `apiJson` 은 몸통을 이미 문자열로 받으므로
 * (`pdp-utils.ts` 의 `body: JSON.stringify(...)`) 타입 검사가 요청 모양을 전혀
 * 안 본다. 라우트도 `as PdpAnalyzeRequest` 캐스트뿐이다.
 *
 * 그래서 `styleReference:` 블록을 통째로 지우거나 `styleRef` 로 오타를 내도
 * 타입 0건 · 시험 전부 통과 · 기능만 죽는다. 독립 리뷰가 그렇게 재서 잡았다.
 * 값으로 재려면 화면 밖에 있어야 한다.
 */
export interface AnalyzeRequestInputs {
  preparedImage: PreparedImageDraft;
  modelImage?: PreparedImageDraft | null;
  additionalInfo: string;
  sellerBrief: SellerBrief;
  copyIntensity: CopyIntensity;
  gapPolicy: GapPolicy;
  desiredTone: string;
  aspectRatio: AspectRatio;
  outputMode: PdpOutputMode;
  styleReference?: StyleReferenceView;
  /** 시나리오 화면의 「디자인 레퍼런스 쓰기」 토글. 끄면 기획도 안 본다. */
  styleReferenceEnabled: boolean;
  attachmentIntents: AttachmentIntents;
  /**
   * 사용자가 고친 전체 전략. **「이 전략으로 구성 다시 만들기」를 눌렀을 때만**
   * 온다(U-11).
   *
   * 전략 칸을 고치기만 한 것으로는 안 보낸다 — 그건 요약 수정이지 재기획이
   * 아니다(설계 §4.2).
   */
  strategyDirective?: string;
  /**
   * 사용자가 적은 **구성·문구 요청**(U-06). 장면 지시와 다른 물건이라 기획이
   * 본다.
   */
  planInstruction?: string;
  /** 그림체. 설계 §6.3 이 「기획과 생성 양쪽 전달」이라 적은 값이다. */
  look?: ImageLook;
  /** 화면의 제품 칸(설계 2026-10-08 §3). 없으면 `preparedImage` 한 장 — 지금 그대로다. */
  products?: readonly PdpProductDraft[];
}

/**
 * 제품이 둘 이상이거나 사진이 둘 이상일 때만 `products` 를 싣는다.
 *
 * 제품 하나·사진 하나면 몸통이 1·2단계와 **같아야** 한다(칸 자체가 없다) — 서버는 그때
 * `imageBase64` 한 장으로 지금처럼 가고, 옛 작업이 한꺼번에 다른 구성안을 받지 않는다.
 */
function analyzeProducts(products: readonly PdpProductDraft[] | undefined): PdpAnalyzeRequest["products"] {
  const filled = (products ?? []).filter((product) => product.photos.length > 0);
  if (filled.length < 2 && !filled.some((product) => product.photos.length > 1)) return undefined;
  return filled.map((product) => ({
    id: product.id,
    ...(product.name.trim() ? { name: product.name.trim() } : {}),
    photos: product.photos.map((photo) => ({ imageBase64: photo.base64, mimeType: photo.mimeType })),
  }));
}

export function buildAnalyzeRequest(input: AnalyzeRequestInputs): PdpAnalyzeRequest {
  /*
    구성안을 짤 때부터 레퍼런스를 본다. 안 주면 기획이 `style_guide` 를 상상으로
    채우고, 그 값이 그대로 이미지 프롬프트의 `design_system` 이 된다.

    시나리오 화면에서 **나중에** 붙인 레퍼런스는 여기 못 온다 — 그때는 구성안이
    이미 만들어진 뒤다. 그 경우 레퍼런스는 이미지에만 반영된다.
  */
  const usesStyleReference = Boolean(input.styleReferenceEnabled && input.styleReference);
  // 대표는 늘 제품 1 첫 사진이다. 제품 칸을 안 주면 지금처럼 `preparedImage`.
  const primary = (input.products && primaryPhoto(input.products)) || input.preparedImage;
  const products = analyzeProducts(input.products);

  return {
    strategyDirective: input.strategyDirective?.trim() || undefined,
    planInstruction: input.planInstruction?.trim() || undefined,
    look: input.look,
    imageBase64: primary.base64,
    mimeType: primary.mimeType,
    ...(products ? { products } : {}),
    modelImageBase64: input.modelImage?.base64,
    modelImageMimeType: input.modelImage?.mimeType,
    modelImageFileName: input.modelImage?.fileName,
    additionalInfo: input.additionalInfo.trim() || undefined,
    sellerBrief: input.sellerBrief,
    copyIntensity: input.copyIntensity,
    gapPolicy: input.gapPolicy,
    desiredTone: input.desiredTone.trim() || undefined,
    aspectRatio: input.aspectRatio,
    outputMode: input.outputMode,
    styleReference:
      usesStyleReference && input.styleReference
        ? {
            imageBase64: input.styleReference.imageBase64,
            mimeType: input.styleReference.mimeType,
            description: input.styleReference.description,
            // 그 그림에 대해 적은 말만 온다. 안 쓰는 그림의 말은 함께 사라진다.
            intent: input.attachmentIntents.style?.trim() || undefined,
          }
        : undefined,
  };
}
