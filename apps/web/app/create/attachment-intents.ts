import type { AttachmentIntents } from "@fixup/pdp-core";

/**
 * 첨부 자리별 지시를 **붙어 있는 자리만** 남긴다.
 *
 * 레퍼런스에 「색만 가져와」라고 적어 두고 레퍼런스를 지우면, 적은 말은 화면에서
 * 사라지지만 상태에는 남는다. 그대로 보내면 붙어 있지도 않은 그림에 대한 지시가
 * 프롬프트에 실린다 — 사용자는 왜 이상한 말이 반영되는지 알 수 없다.
 *
 * 카드뉴스에서 같은 자리를 겪었다(`slot-rows.ts` 의 `visibleIntents`).
 *
 * 제품 사진은 1단계에서 받으므로 **항상 붙어 있다.**
 */
export interface AttachedSlots {
  /** 인물 사진 또는 캐릭터 중 하나라도 골랐는가. */
  person: boolean;
  /** 디자인 레퍼런스를 골랐는가. */
  style: boolean;
}

export function visibleIntents(
  intents: AttachmentIntents,
  attached: AttachedSlots,
): AttachmentIntents {
  const kept: AttachmentIntents = {};
  const put = (key: keyof AttachmentIntents, present: boolean) => {
    const text = intents[key]?.trim();
    if (present && text) kept[key] = text;
  };

  // 제품은 1단계 필수 업로드다. 자리가 비는 경우가 없다.
  put("anchor", true);
  put("person", attached.person);
  put("style", attached.style);
  return kept;
}

/** 보낼 것이 하나도 없으면 아예 안 보낸다. 빈 객체를 실으면 「적었다」로 읽힌다. */
export function intentsOrUndefined(
  intents: AttachmentIntents,
  attached: AttachedSlots,
): AttachmentIntents | undefined {
  const kept = visibleIntents(intents, attached);
  return Object.keys(kept).length > 0 ? kept : undefined;
}
