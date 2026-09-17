import { MATCH_SOURCE, modelById, resolvePosterSize, type ImageLook } from "@fixup/sns-core";
import type { OrderedAttachment } from "@fixup/shared";
import { buildPosterPrompt } from "./prompt";
import { promptImagesFrom } from "./prompt-images";
import type { PosterSlots } from "./schemas";

/**
 * 04 기획 확인에서 보여 줄 **「모델에 보낼 프롬프트」.**
 *
 * 지금은 최종 프롬프트가 무엇이었는지 아무도 못 본다. 그래서 「AI 가 과하게
 * 부풀렸나, 모자라나」를 판단할 근거가 화면에 없다(2026-09-16 설계 §4.2).
 *
 * **여기서 프롬프트를 새로 짓지 않는다.** 제출 때 쓰는 `buildPosterPrompt` 와
 * `promptImagesFrom` 을 그대로 부른다. 조립을 두 벌로 두면 미리보기가 거짓말을
 * 하고, 그건 안 보여 주느니만 못하다.
 *
 * **브라우저에서 돈다.** 이 꾸러미는 서버 전용 의존이 없어서 04 화면이 직접
 * 부를 수 있다 — 프롬프트 하나 보자고 왕복을 만들지 않는다.
 */
export interface PosterPromptPreviewInput {
  slots: PosterSlots;
  /** 화면에 놓인 그대로. 이 차례가 프롬프트의 `Image N` 이 된다. */
  attachments: OrderedAttachment[];
  ratioId: string;
  modelId: string;
  look?: ImageLook;
  userInstruction?: string;
  attachmentIntent?: string;
  /**
   * 기획이 근거 없이 채웠다고 밝힌 칸들.
   *
   * **미리보기도 받아야 한다.** 안 넘기면 실제로 갈 프롬프트에는 「글자를 넣지
   * 말라」가 붙는데 미리보기에는 안 붙는다 — 04 의 「모델에 보낼 프롬프트
   * 보기」가 거짓말을 한다.
   */
  invented?: string[];
  /** 붙인 그림에 글자가 있나. 안 넘기면 미리보기가 실제와 달라진다. */
  referenceHasText?: boolean;
}

export function previewPosterPrompt(input: PosterPromptPreviewInput): string {
  /*
   * **모르는 모델이어도 죽지 않는다.** `modelById` 는 모르는 id 에 예외를
   * 던진다. 여기서 터지면 04 화면 전체가 멎는데, 미리보기 하나 때문에 고칠
   * 것을 못 고치게 되는 것이 더 나쁘다. 크기 없이 보여 준다.
   */
  let pixel: { width: number; height: number } | undefined;
  if (input.ratioId !== MATCH_SOURCE) {
    try {
      const resolved = resolvePosterSize(input.ratioId, modelById(input.modelId));
      pixel = resolved.pixel;
    } catch {
      pixel = undefined;
    }
  }

  return buildPosterPrompt({
    slots: input.slots,
    images: promptImagesFrom(input.attachments),
    /*
     * **첨부한 그림을 따라가는 비율은 크기를 미리 알 수 없다.** 실제 그림에서
     * 뽑기 때문이다(`generate.ts` 의 `sizeFromSource`). 없는 숫자를 지어내면
     * 미리보기가 거짓말을 한다 — 차라리 그 줄을 안 보여 준다.
     */
    size: pixel,
    userInstruction: input.userInstruction,
    attachmentIntent: input.attachmentIntent,
    look: input.look,
    invented: input.invented,
    referenceHasText: input.referenceHasText,
  });
}
