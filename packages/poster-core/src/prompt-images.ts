import type { OrderedAttachment } from "@fixup/shared";
import type { PosterPromptImage } from "./prompt";

/**
 * 첨부 목록 → 프롬프트가 쓸 그림 목록.
 *
 * **`submitPoster` 안에 있던 것을 뽑아냈다.** 04 기획 확인에서 「모델에 보낼
 * 프롬프트」를 미리 보여 주려면 제출 때와 **똑같이** 조립해야 한다. 두 벌로
 * 두면 미리보기가 거짓말을 하고, 그건 안 보여 주느니만 못하다.
 *
 * **차례가 곧 `Image N` 이다.** 받은 차례를 그대로 지킨다 — 여기서 뒤집으면
 * 화면의 「①번을」이 프롬프트에서 다른 그림을 가리킨다(`generate.ts` 의
 * 「사용자가 「①번을」이라고 쓰면 반대로 알아들었다」).
 */
export function promptImagesFrom(attachments: OrderedAttachment[]): PosterPromptImage[] {
  return attachments.map((attachment): PosterPromptImage => {
    if (attachment.role === "style") return { kind: "style_reference" };
    // 그림 느낌만 바꾸는 사람도 **사람**이다. 물건으로 보면 얼굴을 안 지킨다.
    const person = attachment.role === "preserve_person"
      || attachment.role === "preserve_person_restyled";
    return {
      kind: "preserved",
      subject: person ? "person" : "object",
      restyle: attachment.role === "preserve_person_restyled",
    };
  });
}
