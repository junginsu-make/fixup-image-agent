import type { AnchorKind, AttachmentIntents, ImageModelId, PageImageWire, PdpOutputMode, PersonSource, ReferenceModelUsage } from "@fixup/pdp-core";
import { conceptOnlyNotice } from "@fixup/pdp-core";

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
  /**
   * 앵커가 실물 사진인가, 우리가 만든 대표 이미지인가(U-03).
   *
   * 글 경로의 앵커는 `TextModeFlow` 가 만든 대표 이미지다. 그것을 「판매 중인
   * 제품, 라벨 글자까지 지켜라」로 선언하면 그 안의 헤드라인 글자가 페이지
   * 전체에 되풀이된다.
   */
  anchorKind?: AnchorKind;
  /**
   * 파는 것이 무엇인가. **개념 시안 판단에 쓴다**(N-2, 설계 §9.1).
   *
   * 글 경로에서 사용자가 고른다. 사진 경로에는 아직 이 칸이 없다 — 사진이
   * 곧 실물 증거라 개념 시안일 수 없다.
   */
  productKind?: string;
  /**
   * 인물 사진과 저장 캐릭터를 **둘 다 골랐을 때** 누구를 쓸 것인가(U-04).
   *
   * 전에는 서버가 말없이 업로드 쪽을 썼다. 사용자는 이미지가 나온 뒤에야
   * 자기 선택이 무시된 것을 안다.
   */
  personSource?: PersonSource;
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
    anchorKind: input.anchorKind,
    /*
      **사진 없이 실물을 팔 때**(N-2, 설계 §9.1).

      글로만 「나무 도마를 팝니다」라고 적으면 우리는 나무 도마를 **지어낸다.**
      그 그림에는 실제로 파는 물건과 다른 결·색·모양이 그려지고, 사용자는
      그것을 상세페이지에 올린다.

      **판단은 여기 한 곳에서 한다.** 화면에 두면 한 장 만들 때와 여러 장
      만들 때가 갈린다 — 이 파일이 존재하는 까닭이 그것이다.

      앵커가 우리가 만든 대표 이미지(`key-visual`)라는 것이 곧 **실제 제품
      사진이 없다**는 뜻이다.
    */
    conceptOnly: conceptOnlyNotice({
      productKind: input.productKind as never,
      hasProductPhoto: input.anchorKind !== "key-visual",
    }).conceptOnly || undefined,
    personSource: input.personSource,
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
