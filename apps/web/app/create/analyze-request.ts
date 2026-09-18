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
}

export function buildAnalyzeRequest(input: AnalyzeRequestInputs): PdpAnalyzeRequest {
  /*
    구성안을 짤 때부터 레퍼런스를 본다. 안 주면 기획이 `style_guide` 를 상상으로
    채우고, 그 값이 그대로 이미지 프롬프트의 `design_system` 이 된다.

    시나리오 화면에서 **나중에** 붙인 레퍼런스는 여기 못 온다 — 그때는 구성안이
    이미 만들어진 뒤다. 그 경우 레퍼런스는 이미지에만 반영된다.
  */
  const usesStyleReference = Boolean(input.styleReferenceEnabled && input.styleReference);

  return {
    strategyDirective: input.strategyDirective?.trim() || undefined,
    imageBase64: input.preparedImage.base64,
    mimeType: input.preparedImage.mimeType,
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
