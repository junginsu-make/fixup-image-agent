import type { AttachmentIntents, ImageModelId, PageImageWire, PdpOutputMode, ReferenceModelUsage } from "@fixup/pdp-core";

/**
 * 페이지 전체가 공유하는 값을 **한 번만** 짓는다.
 *
 * 한 장을 만들 때와 여러 장을 만들 때가 같은 몸통을 보내야 한다. 전에는 두
 * 호출이 각자 지었고, 그래서 「배치와 같은 값을 보내야 한다」는 주석이 네 군데
 * 붙어 있었다.
 *
 * **화면 파일이 아니라 여기 둔다.** `.tsx` 안에 두면 시험이 값으로 못 잰다 —
 * 한 줄을 지워도 1,300건이 전부 통과한다. 독립 리뷰가 그렇게 재서 잡아냈다.
 */
export interface PageWireInputs {
  imageModel: ImageModelId;
  /** 화면이 안 정했으면 pdp-core 가 editable 로 되돌린다. */
  outputMode?: PdpOutputMode;
  look?: string;
  userInstruction: string;
  preserveProduct?: boolean;
  styleReference?: { imageBase64: string; mimeType: string; description?: string };
  referenceModel?: { base64: string; mimeType: string; fileName?: string } | null;
  referenceModelUsage?: ReferenceModelUsage | null;
  attachmentIntents?: AttachmentIntents;
  /** 페이지 전체의 배경 설명(채널·시즌). 화면의 「그 밖에」다. */
  pageContext?: string;
}

export function buildPageWire(input: PageWireInputs): PageImageWire {
  return {
    imageModel: input.imageModel,
    outputMode: input.outputMode,
    look: input.look,
    // 공백만 적은 것은 안 적은 것이다. 빈 문자열을 실으면 「지시가 있다」로 읽혀
    // 우선순위 줄이 없는 블록을 가리킨다.
    userInstruction: input.userInstruction.trim() || undefined,
    preserveProduct: input.preserveProduct,
    styleReference: input.styleReference,
    referenceModel: input.referenceModel
      ? {
          imageBase64: input.referenceModel.base64,
          mimeType: input.referenceModel.mimeType,
          fileName: input.referenceModel.fileName,
        }
      : undefined,
    referenceModelUsage: input.referenceModelUsage,
    attachmentIntents: input.attachmentIntents,
    // 공백만 적은 것은 안 적은 것이다.
    pageContext: input.pageContext?.trim() || undefined,
  };
}
