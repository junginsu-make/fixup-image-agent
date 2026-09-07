import type { AttachmentRole } from "@fixup/shared";

/**
 * 첨부한 그림을 **화면에 놓인 순서 그대로** 다룬다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────
 *
 * 그림이 서버로 두 갈래로 나뉘어 온다 — 따라 만들 것과 지킬 것. 그리고
 * 프롬프트를 만들 때 따라 만들 것을 먼저 이어 붙였다. 그래서 화면 왼쪽에 있는
 * 「인물 지키기」 그림이 프롬프트에서는 `Image 2` 가 됐다. **정확히 반대다.**
 *
 * 사용자가 「①번 사람들을 ②번 느낌으로」라고 쓰면 모델은 반대로 알아듣는다.
 * 번호를 화면에 찍는 것만으로는 안 되고, 넘기는 순서를 화면과 맞춰야 한다.
 *
 * 설계: docs/superpowers/specs/2026-09-07-attachment-intent-design.md §2-2
 */

/** 화면에 놓인 그대로의 첨부 한 장. */
export interface OrderedAttachment {
  /** 이미 fal 에 올려 둔 주소. */
  url: string;
  role: AttachmentRole;
}

/**
 * 옛 작업에는 화면 순서가 **없다.**
 *
 * `referenceIds` 와 `preservedIds` 두 목록만 저장돼 있고, 사용자가 어떤 순서로
 * 넣었는지는 기록이 없다. 그러니 이어 붙이는 것 말고 방법이 없다 — 그리고 그것이
 * 지금까지의 동작과 같다. 옛 작업을 다시 만들어도 결과가 안 바뀐다.
 *
 * **새 작업은 이 함수를 안 탄다.** 화면이 순서대로 만들어 보낸다.
 */
export function orderFromLegacyLists(
  referenceUrls: readonly string[],
  preservedUrls: readonly string[],
  personUrls: readonly string[] = [],
): OrderedAttachment[] {
  return [
    ...referenceUrls.map((url): OrderedAttachment => ({ url, role: "style" })),
    ...preservedUrls.map((url): OrderedAttachment => ({
      url,
      // 표시가 없으면 물건으로 다룬다. 사람으로 보면 없는 얼굴을 지키려 든다.
      role: personUrls.includes(url) ? "preserve_person" : "preserve_product",
    })),
  ];
}

/**
 * 프롬프트와 fal 이 **같은 순서**를 보게 한다.
 *
 * 둘이 갈리면 `Image 2` 라고 적힌 지시가 다른 그림에 붙는다. 한 배열에서 뽑아
 * 쓰는 것이 갈리지 않는 가장 단순한 방법이다.
 */
export function attachmentUrls(attachments: readonly OrderedAttachment[]): string[] {
  return attachments.map((attachment) => attachment.url);
}

/**
 * 화면 번호(1부터)로 부르기 위한 자리표.
 *
 * 프롬프트의 `Image N`, 화면 카드의 ①②③, 기획 AI 에게 넘기는 목록이 모두
 * 이 번호를 쓴다. 세 곳이 각자 세면 어긋난다.
 */
export function attachmentNumber(index: number): number {
  return index + 1;
}
