import type {
  AttachmentIntents,
  ImageGenOptions,
  ImageGenOptionsInput,
  ImageModelId,
  PdpOutputMode,
  ReferenceModelUsage,
  SectionBlueprint,
} from "./types";

/**
 * 섹션 이미지 옵션을 만드는 **한 곳**.
 *
 * 전에는 라우트마다 각자 손으로 지었다. 그림을 만드는 함수(`generateSectionImage`)는
 * 하나인데 무엇을 먹일지는 두 곳에서 따로 적은 것이다. 그래서 이런 일이 있었다.
 *
 *   단건 라우트   인물 사진을 넘긴다
 *   일괄 라우트   인물 사진을 받는 자리조차 없고 `withModel: false` 가 박혀 있다
 *
 * 사용자에게는 「처음 만들면 사람이 안 나오는데 다시 만들면 나온다」로 보였다.
 * 갈라진 것이 아니라 **애초에 합쳐진 적이 없었다.**
 *
 * 이 파일은 아무것도 부르지 않는다 — 값을 넣으면 값이 나온다. 그래야 시험이
 * 「같은 함수를 쓴다」가 아니라 **무엇이 나오는지**를 잴 수 있다.
 */

/** 페이지 전체가 공유하는 것. 섹션마다 달라지지 않는다. */
export interface PageImageInputs {
  imageModel?: ImageModelId;
  outputMode?: PdpOutputMode;
  /** 그림의 결. 안 고르면 pdp.service 가 photoreal 로 되돌린다. */
  look?: string;
  /** 사용자가 직접 친 지시. 프롬프트 양끝에 놓여 다른 모든 지시보다 앞선다. */
  userInstruction?: string;
  /** 페이지 전체의 배경 설명(채널·시즌). 지시가 아니라 배경이다. */
  pageContext?: string;
  /** 첨부마다 「이 그림을 어떻게 쓸까요」에 적은 말. 페이지 전체가 공유한다. */
  attachmentIntents?: AttachmentIntents;
  /** 제품 이미지를 지킬 것인가. */
  preserveProduct?: boolean;
  /** 페이지의 디자인 언어를 정하는 참조. 모든 섹션이 같은 한 장을 쓴다. */
  styleReference?: { base64: string; mimeType: string; description?: string };
  /** 업로드한 인물 사진. 각도 개념이 없어 모든 섹션이 같은 한 장을 쓴다. */
  referenceModel?: { base64: string; mimeType: string; fileName?: string };
  /** 그 사진을 첫 섹션에만 쓸지 전 섹션에 쓸지. */
  referenceModelUsage?: ReferenceModelUsage | null;
}

/** 섹션 하나에 대한 것. */
export interface SectionImageTarget {
  section: SectionBlueprint;
  /** 페이지 안에서의 자리. 0 이면 히어로. */
  index: number;
  /** 사용자가 이 섹션에 대해 고른 값. 빠진 칸은 아래에서 채운다. */
  options?: ImageGenOptionsInput;
  /** 이 섹션 제목에서 강조할 단어. */
  emphasisWords?: string[];
  /** 이 섹션 각도에 맞춰 이미 고른 캐릭터 한 장. */
  characterReference?: { base64: string; mimeType: string; identityPrompt: string };
}

/**
 * 이 섹션에 업로드한 인물 사진을 쓰는가.
 *
 * 사용자가 섹션마다 켜고 끌 수 있고, 안 건드렸으면 「첫 섹션만」인지
 * 「전 섹션」인지로 정한다.
 */
export function usesUploadedPerson(page: PageImageInputs, target: SectionImageTarget): boolean {
  if (!page.referenceModel) return false;
  const wants =
    target.options?.withModel ?? (page.referenceModelUsage === "all-sections" || target.index === 0);
  return wants;
}

/**
 * 섹션 하나에 넣을 옵션을 만든다.
 *
 * **`withModel` 은 「이 섹션에 사람이 필요하다」는 뜻이다.** 인물 참조가 실제로
 * 붙었을 때만 참이어야 한다 — 붙여 놓고 거짓이면 장면 지시가 「사람은 선택」이라고
 * 말하고, 얼굴을 지키라는 사진이 첨부됐는데 정작 사람이 안 나온다.
 */
export function buildSectionImageOptions(
  page: PageImageInputs,
  target: SectionImageTarget,
): ImageGenOptions {
  const usedPerson = usesUploadedPerson(page, target);

  return {
    // 받은 것을 먼저 펼친다. 하나씩 나열하면 새 옵션이 늘 때 조용히 사라진다.
    ...target.options,

    // ── 섹션이 정하는 것 ────────────────────────────────
    style: target.options?.style ?? "studio",
    withModel: usedPerson || Boolean(target.characterReference),
    headline: target.section.headline,
    subheadline: target.section.subheadline,
    emphasisWords: target.emphasisWords?.length ? target.emphasisWords : undefined,
    characterReference: target.characterReference,

    // 이 섹션에 안 쓰는 사진은 아예 넘기지 않는다. 넘기면 pdp.service 가
    // 「업로드 사진이 캐릭터보다 우선」이라 캐릭터를 밀어낸다.
    referenceModelImageBase64: usedPerson ? page.referenceModel?.base64 : undefined,
    referenceModelImageMimeType: usedPerson ? page.referenceModel?.mimeType : undefined,
    referenceModelImageFileName: usedPerson ? page.referenceModel?.fileName : undefined,

    // ── 페이지가 정하는 것 ──────────────────────────────
    imageModel: page.imageModel,
    outputMode: page.outputMode,
    look: page.look,
    userInstruction: page.userInstruction,
    pageContext: page.pageContext,
    attachmentIntents: page.attachmentIntents,
    preserveProductImage: page.preserveProduct ?? true,
    styleReferenceImages: page.styleReference ? [page.styleReference] : undefined,
  };
}

/**
 * 그물 너머로 오는 페이지 값. **두 라우트가 같은 모양을 받는다.**
 *
 * 이미지 필드 이름이 `imageBase64` 인 것은 화면이 이미 그 이름으로 들고 있어서다.
 * 안에서 쓰는 이름(`base64`)과는 `pageInputsFromWire` 한 곳에서만 만난다.
 */
export interface PageImageWire {
  imageModel?: ImageModelId;
  outputMode?: PdpOutputMode;
  look?: string;
  userInstruction?: string;
  preserveProduct?: boolean;
  styleReference?: { imageBase64: string; mimeType: string; description?: string };
  referenceModel?: { imageBase64: string; mimeType: string; fileName?: string };
  referenceModelUsage?: ReferenceModelUsage | null;
  /** 페이지 전체의 배경 설명(채널·시즌). */
  pageContext?: string;
  /** 첨부마다 「이 그림을 어떻게 쓸까요」에 적은 말. */
  attachmentIntents?: AttachmentIntents;
}

export function pageInputsFromWire(wire?: PageImageWire): PageImageInputs {
  if (!wire) return {};
  return {
    imageModel: wire.imageModel,
    outputMode: wire.outputMode,
    look: wire.look,
    userInstruction: wire.userInstruction,
    preserveProduct: wire.preserveProduct,
    pageContext: wire.pageContext,
    attachmentIntents: wire.attachmentIntents,
    styleReference: wire.styleReference
      ? {
          base64: wire.styleReference.imageBase64,
          mimeType: wire.styleReference.mimeType,
          description: wire.styleReference.description,
        }
      : undefined,
    referenceModel: wire.referenceModel
      ? {
          base64: wire.referenceModel.imageBase64,
          mimeType: wire.referenceModel.mimeType,
          fileName: wire.referenceModel.fileName,
        }
      : undefined,
    referenceModelUsage: wire.referenceModelUsage,
  };
}
